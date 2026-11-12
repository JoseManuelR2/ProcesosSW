// Cabeceras de seguridad HTTP para todas las respuestas.
// La política de contenido solo permite los scripts y estilos propios y los CDN
// usados por la interfaz (Bootstrap y jQuery), con integridad (SRI) en index.html.
const POLITICA_CONTENIDO = [
    "default-src 'self'",
    "script-src 'self' https://cdn.jsdelivr.net https://code.jquery.com",
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "img-src 'self' data:",
    "connect-src 'self' ws: wss:",
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
