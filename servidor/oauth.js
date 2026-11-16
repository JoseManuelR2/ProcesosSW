// Autorización de terceros (OAuth 2.0) con Google, mediante Passport.js.
// Passport solo verifica la identidad con Google; la sesión la abre nuestra
// aplicación igual que en el inicio local, así que las rutas protegidas no
// distinguen cómo entró el usuario.
//
// Google One Tap usa la API JavaScript de Google Identity Services: el navegador
// obtiene un ID token (JWT) y lo envía aquí. Se verifica con google-auth-library
// y se abre la misma sesión que en el callback OAuth.
const passport = require("passport");
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");
const { OAuth2Client } = require("google-auth-library");
const { limitarPeticiones } = require("./limitador.js");

const QUINCE_MINUTOS = 15 * 60 * 1000;

function crearVerificador(clientID){
    const cliente = new OAuth2Client(clientID);
    return async function(credential){
        const ticket = await cliente.verifyIdToken({
            idToken: credential,
            audience: clientID
        });
        return ticket.getPayload();
    };
}

function montarOAuth(app, modelo, config){
    const verificar = config.verificarIdToken ||
        (config.clientID ? crearVerificador(config.clientID) : null);

    // El client ID es público: el navegador lo necesita para inicializar One Tap.
    app.get("/api/oauth/config", function(req, res){
        res.send({ googleClientId: config.clientID || null });
    });

    // One Tap solo necesita el client ID. Se registra antes del aviso de OAuth
    // para que funcione aunque no haya client secret (el botón OAuth sí lo necesita).
    if (verificar){
        app.post("/api/oneTap",
            limitarPeticiones({ nombre: "oneTap", maximo: 20, ventanaMs: QUINCE_MINUTOS }),
            async function(req, res){
                let credential = req.body && req.body.credential;
                if (!credential){
                    return res.status(400).send({ error: "Falta el token de Google" });
                }
                try{
                    let payload = await verificar(credential);
                    if (!payload || !payload.email || payload.email_verified === false){
                        return res.status(401).send({ error: "La cuenta de Google no tiene un email verificado" });
                    }
                    let resultado = await modelo.iniciarConOAuth(payload.email, "google");
                    if (resultado.error){
                        return res.status(resultado.codigo || 401).send({ error: resultado.error });
                    }
                    req.session.usuario = { email: resultado.email, rol: resultado.rol };
                    res.send({ email: resultado.email, rol: resultado.rol });
                }
                catch(e){
                    res.status(401).send({ error: "El token de Google no es válido" });
                }
            }
        );
    }

    if (!config.clientID || !config.clientSecret){
        console.log("Aviso: inicio con Google no configurado (faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET).");
        app.get("/auth/google", function(req, res){
            res.redirect("/?error=google_no_configurado");
        });
        return;
    }

    passport.use(new GoogleStrategy({
        clientID: config.clientID,
        clientSecret: config.clientSecret,
        callbackURL: config.callbackURL
    }, async function(accessToken, refreshToken, profile, done){
        try{
            let correoVerificado = !(profile._json && profile._json.email_verified === false);
            let email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
            if (!email || !correoVerificado){
                return done(null, false);
            }
            let resultado = await modelo.iniciarConOAuth(email, "google");
            if (resultado.error){
                return done(null, false);
            }
            return done(null, resultado);
        }
        catch(e){
            return done(e);
        }
    }));

    app.get("/auth/google", passport.authenticate("google", {
        scope: ["profile", "email"],
        session: false
    }));

    app.get("/auth/google/callback",
        passport.authenticate("google", { session: false, failureRedirect: "/?error=google" }),
        function(req, res){
            req.session.usuario = { email: req.user.email, rol: req.user.rol };
            res.redirect("/");
        }
    );
}

module.exports = { montarOAuth, crearVerificador };
