// Capa de presentación: API REST.
// Traduce peticiones HTTP en llamadas a la capa lógica y devuelve JSON.
// Aplica la sesión y las restricciones de rol en el servidor.

function requiereSesion(req, res, next){
    if (req.session && req.session.usuario){
        return next();
    }
    res.status(401).send({ error: "Se requiere iniciar sesión" });
}

function requiereAdmin(req, res, next){
    if (req.session && req.session.usuario && req.session.usuario.rol === "administrador"){
        return next();
    }
    res.status(403).send({ error: "Se requiere rol de administrador" });
}

function enviar(res, resultado){
    if (resultado && resultado.error){
        res.status(resultado.codigo || 400).send({ error: resultado.error });
    }
    else{
        res.send(resultado);
    }
}

function montarApi(app, modelo){

    // --- Autenticación ---

    app.post("/api/registro", async function(req, res){
        let { email, password } = req.body || {};
        enviar(res, await modelo.registrarUsuario(email, password));
    });

    // Confirmación de cuenta. Temporalmente vía API; en el Hito 4 la dispara el correo.
    app.post("/api/confirmarCuenta", async function(req, res){
        let { email } = req.body || {};
        enviar(res, await modelo.confirmarCuenta(email));
    });

    app.post("/api/login", async function(req, res){
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
    app.get("/api/sesion", function(req, res){
        if (req.session && req.session.usuario){
            res.send(req.session.usuario);
        }
        else{
            res.status(401).send({ error: "No hay ninguna sesión iniciada" });
        }
    });

    // --- Consultas sobre usuarios ---

    app.get("/api/usuarios", requiereSesion, requiereAdmin, async function(req, res){
        enviar(res, await modelo.listarUsuarios(req.session.usuario));
    });

    app.get("/api/usuarioActivo/:email", requiereSesion, requiereAdmin, async function(req, res){
        enviar(res, await modelo.usuarioActivo(req.session.usuario, req.params.email));
    });

    app.delete("/api/usuario/:email", requiereSesion, async function(req, res){
        enviar(res, await modelo.eliminarUsuario(req.session.usuario, req.params.email));
    });
}

module.exports = { montarApi, requiereSesion, requiereAdmin };
