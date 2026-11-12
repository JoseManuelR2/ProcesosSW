// Capa de presentación: API REST.
// Traduce peticiones HTTP en llamadas a la capa lógica y devuelve JSON.
// Aplica la sesión y las restricciones de rol en el servidor, revalidando la
// cuenta en cada petición (una cuenta eliminada o degradada pierde el acceso al momento).
const { limitarPeticiones } = require("./limitador.js");

const UNA_HORA = 60 * 60 * 1000;
const QUINCE_MINUTOS = 15 * 60 * 1000;

function enviar(res, resultado){
    if (resultado && resultado.error){
        res.status(resultado.codigo || 400).send({ error: resultado.error });
    }
    else{
        res.send(resultado);
    }
}

function montarApi(app, modelo){

    // Carga los datos vigentes del usuario de la sesión. Si la cuenta ya no es válida,
    // destruye la sesión.
    async function cargarUsuario(req){
        let email = req.session && req.session.usuario && req.session.usuario.email;
        if (!email){ return null; }
        let vigente = await modelo.usuarioVigente(email);
        if (!vigente){
            await new Promise(function(resolver){ req.session.destroy(resolver); });
            return null;
        }
        req.session.usuario = vigente;
        return vigente;
    }

    async function requiereSesion(req, res, next){
        let usuario = await cargarUsuario(req);
        if (!usuario){
            return res.status(401).send({ error: "Se requiere iniciar sesión" });
        }
        req.usuarioActual = usuario;
        next();
    }

    function requiereAdmin(req, res, next){
        if (req.usuarioActual && req.usuarioActual.rol === "administrador"){
            return next();
        }
        res.status(403).send({ error: "Se requiere rol de administrador" });
    }

    // --- Autenticación ---

    app.post("/api/registro", limitarPeticiones({ nombre: "registro", maximo: 5, ventanaMs: UNA_HORA }), async function(req, res){
        let { email, password } = req.body || {};
        enviar(res, await modelo.registrarUsuario(email, password));
    });

    // Enlace del correo de confirmación. Responde con una redirección a la
    // página principal, que muestra el resultado.
    app.get("/api/confirmarCuenta", async function(req, res){
        let resultado = await modelo.confirmarCuenta(req.query.token);
        if (resultado.error){
            return res.redirect("/?confirmacion=error&motivo=" + encodeURIComponent(resultado.error));
        }
        res.redirect("/?confirmacion=ok");
    });

    app.post("/api/login", limitarPeticiones({ nombre: "login", maximo: 20, ventanaMs: QUINCE_MINUTOS }), async function(req, res){
        let { email, password } = req.body || {};
        let resultado = await modelo.autenticar(email, password);
        if (resultado.error){
            return enviar(res, resultado);
        }
        req.session.usuario = { email: resultado.email, rol: resultado.rol };
        res.send({ email: resultado.email, rol: resultado.rol });
    });

    app.post("/api/logout", function(req, res){
        req.session.destroy(function(){
            res.send({ resultado: "sesión cerrada" });
        });
    });

    // Mantener la sesión entre recargas: el cliente pregunta quién es al cargar.
    app.get("/api/sesion", async function(req, res){
        let usuario = await cargarUsuario(req);
        if (!usuario){
            return res.status(401).send({ error: "No hay ninguna sesión iniciada" });
        }
        res.send(usuario);
    });

    // --- Consultas sobre usuarios ---

    app.get("/api/usuarios", requiereSesion, requiereAdmin, async function(req, res){
        enviar(res, await modelo.listarUsuarios(req.usuarioActual));
    });

    app.get("/api/usuarioActivo/:email", requiereSesion, requiereAdmin, async function(req, res){
        enviar(res, await modelo.usuarioActivo(req.usuarioActual, req.params.email));
    });

    app.delete("/api/usuario/:email", requiereSesion, async function(req, res){
        let email = req.params.email;
        let resultado = await modelo.eliminarUsuario(req.usuarioActual, email);
        if (resultado.error || req.usuarioActual.email !== email){
            return enviar(res, resultado);
        }
        req.session.destroy(function(){
            res.send(resultado);
        });
    });

    // --- Variante 4: bloqueo por intentos fallidos ---
    // Ruta de prueba para comprobar la regla con instantes concretos. No existe en
    // producción. Solo lee la petición, llama a la capa lógica y devuelve su respuesta.
    app.post("/api/prueba/bloqueo", function(req, res){
        if (process.env.NODE_ENV === "production"){
            return res.status(404).send({ error: "No encontrado" });
        }
        let { fallos, ahora } = req.body || {};
        enviar(res, modelo.evaluarBloqueo(fallos, ahora));
    });
}

module.exports = { montarApi };
