// Envío de correos (confirmación de cuenta).
// Usa SMTP autenticado (por ejemplo Gmail con contraseña de aplicación, Brevo,
// Mailjet...). Sin SMTP_HOST el correo se simula: el enlace se escribe en la
// consola del servidor, útil para probar en local.
const nodemailer = require("nodemailer");

function crearCorreo(config){
    let baseUrl = config.baseUrl;

    if (!config.host){
        return {
            enviarConfirmacion: async function(email, token){
                console.log("[CORREO SIMULADO] Confirmación para " + email + ": " + baseUrl + "/api/confirmarCuenta?token=" + token);
            }
        };
    }

    let transporte = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.port === 465,
        auth: { user: config.user, pass: config.pass }
    });

    return {
        enviarConfirmacion: async function(email, token){
            let enlace = baseUrl + "/api/confirmarCuenta?token=" + token;
            await transporte.sendMail({
                from: config.from,
                to: email,
                subject: "Confirma tu cuenta en ProcesosSW",
                text: "Bienvenido a ProcesosSW. Confirma tu cuenta abriendo este enlace (caduca en 24 horas): " + enlace,
                html: "<p>Bienvenido a ProcesosSW.</p><p><a href=\"" + enlace + "\">Pulsa aquí para confirmar tu cuenta</a></p><p>El enlace caduca en 24 horas.</p>"
            });
        }
    };
}

module.exports = { crearCorreo };
