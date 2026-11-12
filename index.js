// Punto de entrada del backend.
// Arranca Express, conecta la capa de acceso a datos, monta la API y el juego en
// tiempo real, y siembra el primer administrador.
// crearServidor() se exporta para las pruebas de integración.
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
const { montarSockets } = require("./servidor/sockets.js");
const { cabecerasSeguridad } = require("./servidor/cabeceras.js");

const CARPETA_CLIENTE = path.join(__dirname, "cliente");
const CARPETA_COMPARTIDO = path.join(__dirname, "compartido");
const ESPERA_BOT_MS = 30 * 1000;
const SEGUNDOS_TEMPORIZADOR = 15;

async function crearServidor(config){
    const log = new Log(config.cad);
    const modelo = new Modelo(config.cad, log, config.correo);

    if (config.adminEmail && config.adminPassword){
        let res = await modelo.crearAdmin(config.adminEmail, config.adminPassword);
        if (res.creado){
            console.log("Administrador creado: " + res.email);
        }
    }

    const gestor = new GestorPartidas();

    const app = express();
    app.set("trust proxy", 1);
    app.use(cabecerasSeguridad);
    app.use(express.json());

    // Sesión. Con MongoDB se persiste en el almacén; sin él, en memoria.
    // Sin SESSION_SECRET (solo en local) se genera uno aleatorio al arrancar.
    let opcionesSesion = {
        secret: config.sessionSecret || crypto.randomBytes(32).toString("hex"),
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: !!config.produccion
        }
    };
    if (config.mongoUri){
        opcionesSesion.store = MongoStore.create({ mongoUrl: config.mongoUri });
    }
    const sesion = session(opcionesSesion);
    app.use(sesion);

    app.get("/health", function(req, res){
        res.send({ estado: "ok" });
    });

    // Frontend y capa lógica compartida: solo se sirven estas dos carpetas.
    // Sin caché para que siempre se sirva la versión más reciente.
    app.use("/compartido", express.static(CARPETA_COMPARTIDO, { maxAge: 0, etag: false }));
    app.use(express.static(CARPETA_CLIENTE, { maxAge: 0, etag: false }));

    api.montarApi(app, modelo);
    montarOAuth(app, modelo, config.oauth || {});

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

    const server = http.createServer(app);
    const io = new Server(server);
    const sockets = montarSockets(io, {
        gestor: gestor,
        modelo: modelo,
        sesion: sesion,
        esperaBotMs: config.esperaBotMs || ESPERA_BOT_MS,
        segundosTemporizador: config.segundosTemporizador || SEGUNDOS_TEMPORIZADOR
    });

    return {
        app: app,
        server: server,
        io: io,
        modelo: modelo,
        gestor: gestor,
        cerrar: function(){
            sockets.cerrar();
            return new Promise(function(resolver){ io.close(function(){ resolver(); }); });
        }
    };
}

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

    const cad = cadFactory.crearCad(process.env.MONGODB_URI);
    if (cad.conectar){
        await cad.conectar(process.env.MONGODB_URI);
        console.log("Conectado a MongoDB");
    }

    const correo = crearCorreo({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
        from: process.env.MAIL_FROM,
        baseUrl: BASE_URL
    });

    const servidor = await crearServidor({
        cad: cad,
        correo: correo,
        baseUrl: BASE_URL,
        mongoUri: process.env.MONGODB_URI,
        sessionSecret: process.env.SESSION_SECRET,
        produccion: EN_PRODUCCION,
        adminEmail: process.env.ADMIN_EMAIL,
        adminPassword: process.env.ADMIN_PASSWORD,
        oauth: {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: BASE_URL + "/auth/google/callback"
        }
    });

    servidor.server.listen(PORT, function(){
        console.log("App está escuchando en el puerto " + PORT);
        console.log("Ctrl+C para salir");
    });
}

if (require.main === module){
    main().catch(function(e){
        console.error("No se pudo arrancar la aplicación:", e);
        process.exit(1);
    });
}

module.exports = { crearServidor };
