// Cabeceras de seguridad HTTP para todas las respuestas.
// La política de contenido solo permite los scripts y estilos propios y los CDN
// usados por la interfaz (Bootstrap y jQuery), con integridad (SRI) en index.html.
// Google Identity Services necesita accounts.google.com para el script de One
// Tap, su iframe y la carga del botón/prompt.
const POLITICA_CONTENIDO = [
    "default-src 'self'",
    "script-src 'self' https://cdn.jsdelivr.net https://code.jquery.com https://accounts.google.com",
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "img-src 'self' data: https://*.googleusercontent.com https://www.gstatic.com",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' ws: wss: https://accounts.google.com",
    "frame-src https://accounts.google.com",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
].join("; ");

function cabecerasSeguridad(req, res, next){
    res.set({
        "Content-Security-Policy": POLITICA_CONTENIDO,
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "same-origin"
    });
    next();
}

module.exports = { cabecerasSeguridad, POLITICA_CONTENIDO };
