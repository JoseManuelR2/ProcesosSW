// Arranque de la aplicación en el navegador: crea las capas y comprueba la sesión.
// Está en un archivo propio (y no inline) para que la política CSP no necesite 'unsafe-inline'.
var cw = new ControlWeb();
var rest = new ClienteRest(cw);
// El socket no se conecta hasta que haya sesión: el servidor exige una cuenta válida.
var socket = io({ autoConnect: false });
window.juegoWeb = new JuegoWeb(cw, socket);
configurarSocket(window.juegoWeb);
cw.iniciar();
