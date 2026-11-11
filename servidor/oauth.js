// Autorización de terceros (OAuth 2.0) con GitHub, mediante Passport.js.
// Passport solo verifica la identidad con GitHub; la sesión la abre nuestra
// aplicación igual que en el inicio local, así que las rutas protegidas no
// distinguen cómo entró el usuario.
const passport = require("passport");
const { Strategy: GitHubStrategy } = require("passport-github2");

// El perfil público de GitHub puede no traer el email: lo pedimos a su API.
async function emailPrincipal(accessToken){
    let res = await fetch("https://api.github.com/user/emails", {
        headers: {
            "Authorization": "Bearer " + accessToken,
            "Accept": "application/vnd.github+json",
            "User-Agent": "ProcesosSW"
        }
    });
    if (!res.ok){
        return null;
    }
    let emails = await res.json();
    let elegido = emails.find(function(e){ return e.primary && e.verified; })
        || emails.find(function(e){ return e.verified; });
    return elegido ? elegido.email : null;
}

function montarOAuth(app, modelo, config){

    if (!config.clientID || !config.clientSecret){
        console.log("Aviso: inicio con GitHub no configurado (faltan GITHUB_CLIENT_ID y GITHUB_CLIENT_SECRET).");
        app.get("/auth/github", function(req, res){
            res.redirect("/?error=github_no_configurado");
        });
        return;
    }

    passport.use(new GitHubStrategy({
        clientID: config.clientID,
        clientSecret: config.clientSecret,
        callbackURL: config.callbackURL,
        scope: ["user:email"]
    }, async function(accessToken, refreshToken, profile, done){
        try{
            let email = await emailPrincipal(accessToken);
            if (!email){
                return done(null, false);
            }
            let resultado = await modelo.iniciarConOAuth(email, "github");
            if (resultado.error){
                return done(null, false);
            }
            return done(null, resultado);
        }
        catch(e){
            return done(e);
        }
    }));

    app.get("/auth/github", passport.authenticate("github", {
        scope: ["user:email"],
        session: false
    }));

    app.get("/auth/github/callback",
        passport.authenticate("github", { session: false, failureRedirect: "/?error=github" }),
        function(req, res){
            req.session.usuario = { email: req.user.email, rol: req.user.rol };
            res.redirect("/");
        }
    );
}

module.exports = { montarOAuth };
