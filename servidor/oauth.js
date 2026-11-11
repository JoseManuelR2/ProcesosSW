// Autorización de terceros (OAuth 2.0) con Google, mediante Passport.js.
// Passport solo verifica la identidad con Google; la sesión la abre nuestra
// aplicación igual que en el inicio local, así que las rutas protegidas no
// distinguen cómo entró el usuario.
const passport = require("passport");
const { Strategy: GoogleStrategy } = require("passport-google-oauth20");

function montarOAuth(app, modelo, config){

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
            let resultado = await modelo.iniciarConGoogle(email);
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

module.exports = { montarOAuth };
