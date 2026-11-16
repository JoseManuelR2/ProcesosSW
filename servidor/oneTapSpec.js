// Pruebas de integración de Google One Tap: servidor HTTP real en un puerto libre.
// El verificador de Google se inyecta para no depender de la red ni de una cuenta
// de Google: así se prueban los casos válido, inválido y sin email verificado.
const { crearServidor } = require("../index.js");
const { CadMemoria } = require("./cadMemoria.js");

const CLIENT_ID = "cliente-de-prueba.apps.googleusercontent.com";

describe("Google One Tap (API)", function(){
    let servidor, url, cad;

    beforeAll(async function(){
        cad = new CadMemoria();
        servidor = await crearServidor({
            cad: cad,
            correo: { enviarConfirmacion: async function(){} },
            oauth: {
                clientID: CLIENT_ID,
                clientSecret: "secreto-de-prueba",
                callbackURL: "http://localhost/auth/google/callback",
                verificarIdToken: async function(credential){
                    if (credential === "token-valido"){
                        return { email: "ana@test.com", email_verified: true };
                    }
                    if (credential === "token-sin-email"){
                        return { email_verified: true };
                    }
                    if (credential === "token-no-verificado"){
                        return { email: "ana@test.com", email_verified: false };
                    }
                    throw new Error("Token inválido");
                }
            }
        });
        await new Promise(function(resolver){ servidor.server.listen(0, resolver); });
        url = "http://localhost:" + servidor.server.address().port;
    });

    afterAll(async function(){
        await servidor.cerrar();
    });

    function enviarOneTap(cuerpo){
        return fetch(url + "/api/oneTap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(cuerpo)
        });
    }

    it("publica el client ID público para el navegador", async function(){
        let res = await fetch(url + "/api/oauth/config");
        expect(res.status).toBe(200);
        let datos = await res.json();
        expect(datos.googleClientId).toBe(CLIENT_ID);
    });

    it("la CSP permite el script y el iframe de Google", async function(){
        let res = await fetch(url + "/");
        let csp = res.headers.get("content-security-policy");
        expect(csp).toContain("https://accounts.google.com");
        expect(csp).toContain("style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://accounts.google.com");
        expect(csp).toContain("frame-src https://accounts.google.com");
    });

    it("rechaza una petición sin credencial (caso de error)", async function(){
        let res = await enviarOneTap({});
        expect(res.status).toBe(400);
    });

    it("rechaza un token inválido (caso de error)", async function(){
        let res = await enviarOneTap({ credential: "token-invalido" });
        expect(res.status).toBe(401);
    });

    it("rechaza un token sin email verificado (caso de error)", async function(){
        let sinVerificar = await enviarOneTap({ credential: "token-no-verificado" });
        expect(sinVerificar.status).toBe(401);
        let sinEmail = await enviarOneTap({ credential: "token-sin-email" });
        expect(sinEmail.status).toBe(401);
    });

    it("abre sesión con un token válido y crea la cuenta confirmada", async function(){
        let res = await enviarOneTap({ credential: "token-valido" });
        expect(res.status).toBe(200);
        let cookie = res.headers.get("set-cookie");
        expect(cookie).not.toBeNull();
        let datos = await res.json();
        expect(datos.email).toBe("ana@test.com");
        expect(datos.rol).toBe("usuario");

        let sesion = await fetch(url + "/api/sesion", {
            headers: { cookie: cookie.split(";")[0] }
        });
        expect(sesion.status).toBe(200);
        let usuario = await sesion.json();
        expect(usuario.email).toBe("ana@test.com");

        let guardado = await cad.obtenerUsuario("ana@test.com");
        expect(guardado.estado).toBe("confirmado");
        expect(guardado.origen).toBe("google");
    });
});
