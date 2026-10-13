// Punto de entrada del backend.
// Arranca Express, conecta la capa de acceso a datos, monta la API y siembra
// el primer administrador.
require("dotenv").config();

const path = require("path");
const express = require("express");
const session = require("express-session");
const { MongoStore } = require("connect-mongo");

const cadFactory = require("./servidor/cad.js");
const { Modelo } = require("./servidor/modelo.js");
const { Log } = require("./servidor/log.js");
const api = require("./servidor/api.js");

async function main(){
    const PORT = process.env.PORT || 3000;

    // Capa de acceso a datos.
    const cad = cadFactory.crearCad(process.env.MONGODB_URI);
    if (cad.conectar){
        await cad.conectar(process.env.MONGODB_URI);
        console.log("Conectado a MongoDB");
    }

    // Capa lógica.
    const log = new Log(cad);
    const modelo = new Modelo(cad, log);

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
    let opcionesSesion = {
        secret: process.env.SESSION_SECRET || "secreto-de-desarrollo",
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

    // API REST (capa de presentación del backend).
    api.montarApi(app, modelo);

    // Manejo de errores no controlados.
    app.use(function(err, req, res, next){
        console.error(err);
        res.status(500).send({ error: "Error interno del servidor" });
    });

    app.listen(PORT, function(){
        console.log("App está escuchando en el puerto " + PORT);
        console.log("Ctrl+C para salir");
    });
}

main().catch(function(e){
    console.error("No se pudo arrancar la aplicación:", e);
    process.exit(1);
});
