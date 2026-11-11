// Punto de entrada del backend.
// Arranca Express, conecta la capa de acceso a datos, monta la API y siembra
// el primer administrador.
require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const http = require("http");
const express = require("express");
const session = require("express-session");
const { MongoStore } = require("connect-mongo");
const { Server } = require("socket.io");

const cadFactory = require("./servidor/cad.js");
const { Modelo } = require("./servidor/modelo.js");
const { Log } = require("./servidor/log.js");
const { crearCorreo } = require("./servidor/correo.js");
const { montarOAuth } = require("./servidor/oauth.js");
const api = require("./servidor/api.js");
const { GestorPartidas } = require("./servidor/juego.js");

async function main(){
    const PORT = process.env.PORT || 3000;
    const BASE_URL = process.env.BASE_URL || ("http://localhost:" + PORT);
    const EN_PRODUCCION = process.env.NODE_ENV === "production";

    if (EN_PRODUCCION && !process.env.SESSION_SECRET){
        throw new Error("Falta la variable SESSION_SECRET en producción");
    }
    if (EN_PRODUCCION && !process.env.SMTP_HOST){
        throw new Error("Falta la configuración de correo (SMTP_HOST) en producción");
    }

    // Capa de acceso a datos.
    const cad = cadFactory.crearCad(process.env.MONGODB_URI);
    if (cad.conectar){
        await cad.conectar(process.env.MONGODB_URI);
        console.log("Conectado a MongoDB");
    }

    // Capa lógica (con el servicio de correo inyectado).
    const log = new Log(cad);
    const correo = crearCorreo({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        from: process.env.MAIL_FROM,
        baseUrl: BASE_URL
    });
    const modelo = new Modelo(cad, log, correo);

    // Gestor de partidas del sprint 2.
    const gestorPartidas = new GestorPartidas();

    // Semilla del primer administrador.
    if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD){
        let res = await modelo.crearAdmin(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
        if (res.creado){
            console.log("Administrador creado: " + res.email);
        }
    }

    const app = express();
    app.set("trust proxy", 1);
    app.use(express.json());

    // Sesión. Con MongoDB se persiste en el almacén; sin él, en memoria.
    // En local, si no hay SESSION_SECRET se genera uno aleatorio al arrancar
    // (las sesiones no sobreviven a un reinicio, pero no hay ningún secreto en el código).
    let opcionesSesion = {
        secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production"
        }
    };
    if (process.env.MONGODB_URI){
        opcionesSesion.store = MongoStore.create({ mongoUrl: process.env.MONGODB_URI });
    }
    app.use(session(opcionesSesion));

    // Frontend: se sirve únicamente la carpeta cliente (nunca el resto del proyecto).
    app.use(express.static(path.join(__dirname, "cliente")));

    // API REST (capa de presentación del backend) y autorización con Google.
    api.montarApi(app, modelo);
    montarOAuth(app, modelo, {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: BASE_URL + "/auth/google/callback"
    });

    // Cuerpo JSON mal formado o demasiado grande: el contrato general pide
    // responder 400 con {"error": "..."} en lugar de un 500 genérico.
    app.use(function(err, req, res, next){
        if (err && (err.type === "entity.parse.failed" || err.type === "entity.too.large")){
            return res.status(400).send({ error: "El cuerpo de la petición no es JSON válido" });
        }
        next(err);
    });

    // Manejo de errores no controlados.
    app.use(function(err, req, res, next){
        console.error(err);
        res.status(500).send({ error: "Error interno del servidor" });
    });

    // Servidor HTTP + Socket.IO para el juego en tiempo real.
    const server = http.createServer(app);
    const io = new Server(server);

    // Mapa de socket.id -> email (para saber quién juega).
    const socketEmail = {};

    io.on("connection", function(socket){
        // El cliente envía su email al conectarse.
        socket.on("identificar", function(email){
            socketEmail[socket.id] = email;
        });

        // Crear partida.
        socket.on("crearPartida", function(){
            let email = socketEmail[socket.id];
            if (!email){ return; }
            let partida = gestorPartidas.crear(email);
            socket.join(partida.id);
            socket.emit("partidaCreada", { id: partida.id, partida: serializar(partida) });
            io.emit("listaPartidas", gestorPartidas.listar());
        });

        // Unirse a partida.
        socket.on("unirsePartida", function(id){
            let email = socketEmail[socket.id];
            if (!email){ return; }
            let partida = gestorPartidas.obtener(id);
            if (!partida){ socket.emit("error", "Partida no encontrada"); return; }
            let res = partida.agregarJugador(email);
            if (res.error){ socket.emit("error", res.error); return; }
            socket.join(id);
            io.to(id).emit("partidaActualizada", serializar(partida));
            io.emit("listaPartidas", gestorPartidas.listar());
        });

        // Programar movimientos.
        socket.on("programar", function(data){
            let email = socketEmail[socket.id];
            if (!email){ return; }
            let partida = gestorPartidas.obtener(data.id);
            if (!partida){ socket.emit("error", "Partida no encontrada"); return; }
            let res = partida.programar(email, data.comandos);
            if (res.error){ socket.emit("error", res.error); return; }
            socket.emit("programado", { ok: true });
            if (partida.ambosProgramados()){
                io.to(data.id).emit("ambosListos", { id: data.id });
            }
        });

        // Ejecutar la partida.
        socket.on("ejecutar", function(id){
            let partida = gestorPartidas.obtener(id);
            if (!partida){ socket.emit("error", "Partida no encontrada"); return; }
            let resultado = partida.ejecutar();
            io.to(id).emit("resultado", resultado);
            io.emit("listaPartidas", gestorPartidas.listar());
        });

        // Cancelar partida (solo admin).
        socket.on("cancelarPartida", function(id){
            let email = socketEmail[socket.id];
            if (email !== process.env.ADMIN_EMAIL){ return; }
            gestorPartidas.cancelar(id);
            io.emit("listaPartidas", gestorPartidas.listar());
            io.to(id).emit("partidaCancelada", { id: id });
        });

        // Solicitar lista de partidas.
        socket.on("solicitarLista", function(){
            socket.emit("listaPartidas", gestorPartidas.listar());
        });

        socket.on("disconnect", function(){
            delete socketEmail[socket.id];
        });
    });

    function serializar(partida){
        return {
            id: partida.id,
            creador: partida.creador,
            jugadores: partida.jugadores.slice(),
            estado: partida.estado,
            resultado: partida.resultado
        };
    }

    server.listen(PORT, function(){
        console.log("App está escuchando en el puerto " + PORT);
        console.log("Ctrl+C para salir");
    });
}

main().catch(function(e){
    console.error("No se pudo arrancar la aplicación:", e);
    process.exit(1);
});
