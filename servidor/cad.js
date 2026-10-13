// Punto de entrada de la capa de acceso a datos.
// Selecciona la implementación: MongoDB si hay cadena de conexión; en memoria
// en caso contrario (útil para desarrollo local y pruebas).
const { CadMemoria } = require("./cadMemoria.js");
const { CadMongo } = require("./cadMongo.js");

function crearCad(uri){
    if (uri){
        return new CadMongo();
    }
    console.log("Aviso: no hay MONGODB_URI configurada; se usa la CAD en memoria (los datos no persisten).");
    return new CadMemoria();
}

module.exports = { crearCad, CadMemoria, CadMongo };
