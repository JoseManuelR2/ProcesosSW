// Límite de peticiones por clave (IP, usuario, evento...) en ventanas de tiempo.
// Se usa en memoria: suficiente para una sola instancia del servidor.
function crearLimitador(){
    let cubos = {};

    function permitir(clave, maximo, ventanaMs, ahora){
        ahora = ahora || Date.now();
        let cubo = cubos[clave];
        if (!cubo || ahora - cubo.inicio >= ventanaMs){
            cubo = { inicio: ahora, n: 0 };
            cubos[clave] = cubo;
        }
        cubo.n++;
        if (Object.keys(cubos).length > 10000){
            limpiarCaducados(ahora);
        }
        return cubo.n <= maximo;
    }

    function limpiarCaducados(ahora){
        for (let clave in cubos){
            if (ahora - cubos[clave].inicio >= 60 * 60 * 1000){
                delete cubos[clave];
            }
        }
    }

    return { permitir: permitir };
}

// Middleware de Express: responde 429 cuando una IP supera el máximo en la ventana.
function limitarPeticiones(opciones){
    let limitador = crearLimitador();
    return function(req, res, next){
        let clave = opciones.nombre + ":" + req.ip;
        if (limitador.permitir(clave, opciones.maximo, opciones.ventanaMs)){
            return next();
        }
        res.status(429).send({ error: "Demasiadas peticiones. Inténtalo más tarde." });
    };
}

module.exports = { crearLimitador, limitarPeticiones };
