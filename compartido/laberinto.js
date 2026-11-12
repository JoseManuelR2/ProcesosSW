// Núcleo de Maze Duel compartido por el cliente (vista previa) y el servidor
// (resolución autoritativa de las partidas). Es un módulo UMD: en Node se
// carga con require() y en el navegador queda como la variable global Laberinto.
//
// Un programa es un árbol JSON de bloques, por ejemplo:
//   [ {tipo:"mv", dir:"right"},
//     {tipo:"repeat", n:3, cuerpo:[ {tipo:"mv", dir:"down"} ]},
//     {tipo:"while", cond:"not exit", cuerpo:[ {tipo:"mv", dir:"right"} ]},
//     {tipo:"if", cond:"wall up", cuerpo:[...], otro:[...] } ]
(function(raiz, fabrica){
    if (typeof module === "object" && module.exports){
        module.exports = fabrica();
    } else {
        raiz.Laberinto = fabrica();
    }
}(typeof self !== "undefined" ? self : this, function(){

    // 1 = pared, 0 = pasillo. Todos los niveles son de 10x10 y comparten inicios.
    const INICIOS = [[1, 1], [8, 8]];

    const NIVELES = [
        {
            id: "clasico",
            nombre: "Clásico",
            salida: [8, 1],
            mapa: [
                "1111111111",
                "1000100001",
                "1010101101",
                "1010000101",
                "1011110101",
                "1000010001",
                "1111011101",
                "1000000101",
                "1011110001",
                "1111111111"
            ]
        },
        {
            id: "cruce",
            nombre: "Cruce",
            salida: [2, 8],
            mapa: [
                "1111111111",
                "1001000001",
                "1000010101",
                "1000001101",
                "1001001001",
                "1011001011",
                "1000000111",
                "1000000101",
                "1000000001",
                "1111111111"
            ]
        },
        {
            id: "zigzag",
            nombre: "Zigzag",
            salida: [1, 8],
            mapa: [
                "1111111111",
                "1000001101",
                "1010001001",
                "1101000011",
                "1001101011",
                "1000000101",
                "1000001001",
                "1000001111",
                "1010000001",
                "1111111111"
            ]
        }
    ];

    const DIRECCIONES = {
        up:    [-1, 0],
        down:  [1, 0],
        left:  [0, -1],
        right: [0, 1]
    };

    const CONDICIONES = ["wall up", "wall down", "wall left", "wall right", "not exit"];
    const TIPOS = ["mv", "repeat", "while", "if"];

    const LIMITES = {
        comandos: 50,        // movimientos ejecutados por el robot
        bloques: 60,         // nodos en el programa escrito
        profundidad: 4,      // anidamiento máximo
        repeticiones: 10,    // valor máximo de repeat
        pasosBucle: 2000     // nodos visitados en la ejecución (corta bucles infinitos)
    };

    function obtenerNivel(id){
        return NIVELES.find(function(n){ return n.id === id; }) || null;
    }

    function esPared(nivel, r, c){
        if (r < 0 || r >= nivel.mapa.length || c < 0 || c >= nivel.mapa[0].length){
            return true;
        }
        return nivel.mapa[r][c] === "1";
    }

    function esSalida(nivel, pos){
        return pos[0] === nivel.salida[0] && pos[1] === nivel.salida[1];
    }

    function cumple(nivel, cond, pos){
        if (cond === "not exit"){
            return !esSalida(nivel, pos);
        }
        let dir = DIRECCIONES[cond.slice("wall ".length)];
        return esPared(nivel, pos[0] + dir[0], pos[1] + dir[1]);
    }

    // Devuelve null si el programa es válido, o un mensaje de error.
    function validar(programa){
        if (!Array.isArray(programa)){
            return "El programa debe ser una lista de bloques";
        }
        let total = 0;
        let error = null;

        function revisarLista(lista, profundidad){
            if (profundidad > LIMITES.profundidad){
                return "Demasiado anidamiento (máximo " + LIMITES.profundidad + " niveles)";
            }
            if (!Array.isArray(lista)){
                return "Un bloque no contiene una lista válida";
            }
            for (let nodo of lista){
                total++;
                if (total > LIMITES.bloques){
                    return "Demasiados bloques (máximo " + LIMITES.bloques + ")";
                }
                if (!nodo || typeof nodo !== "object" || TIPOS.indexOf(nodo.tipo) === -1){
                    return "Bloque desconocido";
                }
                if (nodo.tipo === "mv"){
                    if (!DIRECCIONES.hasOwnProperty(nodo.dir)){
                        return "Dirección no válida: " + nodo.dir;
                    }
                    continue;
                }
                if (nodo.tipo === "repeat"){
                    if (!Number.isInteger(nodo.n) || nodo.n < 1 || nodo.n > LIMITES.repeticiones){
                        return "El número de repeticiones debe estar entre 1 y " + LIMITES.repeticiones;
                    }
                } else if (CONDICIONES.indexOf(nodo.cond) === -1){
                    return "Condición no válida: " + nodo.cond;
                }
                error = revisarLista(nodo.cuerpo, profundidad + 1);
                if (error){ return error; }
                if (nodo.tipo === "if" && nodo.otro !== undefined && nodo.otro !== null){
                    error = revisarLista(nodo.otro, profundidad + 1);
                    if (error){ return error; }
                }
            }
            return null;
        }

        return revisarLista(programa, 1);
    }

    // Ejecuta el programa para un robot que parte de "inicio".
    // Devuelve la posición tras cada movimiento (camino), si llegó a la salida y
    // la posición final. El robot se detiene al llegar a la salida.
    function trazar(nivel, inicio, programa){
        let pos = [inicio[0], inicio[1]];
        let camino = [];
        let visitas = 0;
        let llega = false;
        let parado = false;

        function ejecutar(lista){
            for (let nodo of lista){
                if (parado){ return; }
                if (++visitas > LIMITES.pasosBucle){ parado = true; return; }
                if (nodo.tipo === "mv"){
                    let dir = DIRECCIONES[nodo.dir];
                    let nr = pos[0] + dir[0];
                    let nc = pos[1] + dir[1];
                    if (!esPared(nivel, nr, nc)){
                        pos = [nr, nc];
                    }
                    camino.push([pos[0], pos[1]]);
                    if (esSalida(nivel, pos)){
                        llega = true;
                        parado = true;
                        return;
                    }
                    if (camino.length >= LIMITES.comandos){
                        parado = true;
                        return;
                    }
                } else if (nodo.tipo === "repeat"){
                    for (let i = 0; i < nodo.n && !parado; i++){
                        ejecutar(nodo.cuerpo);
                    }
                } else if (nodo.tipo === "while"){
                    while (!parado && cumple(nivel, nodo.cond, pos)){
                        if (++visitas > LIMITES.pasosBucle){ parado = true; return; }
                        ejecutar(nodo.cuerpo);
                    }
                } else if (nodo.tipo === "if"){
                    if (cumple(nivel, nodo.cond, pos)){
                        ejecutar(nodo.cuerpo);
                    } else if (nodo.otro){
                        ejecutar(nodo.otro);
                    }
                }
            }
        }

        ejecutar(programa);
        return { camino: camino, llega: llega, final: pos };
    }

    // Distancia mínima por caminos hasta la salida (BFS). Infinity si no hay ruta.
    function distanciaSalida(nivel, origen){
        let ruta = rutaHasta(nivel, origen);
        return ruta === null ? Infinity : ruta.length;
    }

    // Lista de direcciones de la ruta más corta desde origen hasta la salida.
    function rutaHasta(nivel, origen){
        let filas = nivel.mapa.length;
        let cols = nivel.mapa[0].length;
        let padre = {};
        let clave = function(r, c){ return r + "," + c; };
        let cola = [[origen[0], origen[1]]];
        padre[clave(origen[0], origen[1])] = null;
        let indice = 0;
        while (indice < cola.length){
            let [r, c] = cola[indice++];
            if (esSalida(nivel, [r, c])){
                let dirs = [];
                let actual = [r, c];
                while (padre[clave(actual[0], actual[1])]){
                    let previo = padre[clave(actual[0], actual[1])];
                    dirs.unshift(previo.dir);
                    actual = previo.pos;
                }
                return dirs;
            }
            for (let dir of Object.keys(DIRECCIONES)){
                let nr = r + DIRECCIONES[dir][0];
                let nc = c + DIRECCIONES[dir][1];
                if (nr < 0 || nr >= filas || nc < 0 || nc >= cols || esPared(nivel, nr, nc)){ continue; }
                if (padre.hasOwnProperty(clave(nr, nc))){ continue; }
                padre[clave(nr, nc)] = { pos: [r, c], dir: dir };
                cola.push([nr, nc]);
            }
        }
        return null;
    }

    // Decide la partida a partir de las dos trazas (una por jugador).
    // - Gana quien llega antes a la salida (menos movimientos).
    // - Si ninguno llega, gana quien está más cerca por caminos.
    // - Con igualdad en ambos criterios hay empate.
    function resolver(nivel, trazas){
        let llegan = trazas.map(function(t){ return t.llega; });
        let ganador = null;
        let razon;

        if (llegan[0] || llegan[1]){
            if (llegan[0] && llegan[1]){
                let c0 = trazas[0].camino.length;
                let c1 = trazas[1].camino.length;
                if (c0 < c1){ ganador = 0; }
                else if (c1 < c0){ ganador = 1; }
                else { razon = "empate: llegaron a la vez"; }
            } else {
                ganador = llegan[0] ? 0 : 1;
            }
            if (ganador !== null){ razon = "llegó a la salida"; }
        } else {
            let d0 = distanciaSalida(nivel, trazas[0].final);
            let d1 = distanciaSalida(nivel, trazas[1].final);
            if (d0 < d1){ ganador = 0; razon = "más cerca de la salida"; }
            else if (d1 < d0){ ganador = 1; razon = "más cerca de la salida"; }
            else { razon = "empate: igual de cerca de la salida"; }
        }
        return { indiceGanador: ganador, razon: razon };
    }

    // Fotogramas de la carrera: posiciones de ambos robots en cada instante.
    function lineaTemporal(nivel, inicios, trazas){
        let total = Math.max(trazas[0].camino.length, trazas[1].camino.length);
        let pasos = [];
        for (let t = 0; t < total; t++){
            let posiciones = trazas.map(function(traza, j){
                let camino = traza.camino;
                if (camino.length === 0){ return inicios[j].slice(); }
                return camino[Math.min(t, camino.length - 1)].slice();
            });
            pasos.push({ paso: t + 1, posiciones: posiciones });
        }
        return pasos;
    }

    // Programa automático: sigue la ruta más corta. Lo usa el bot de las partidas
    // en solitario.
    function programaBot(nivel, inicio){
        let ruta = rutaHasta(nivel, inicio) || [];
        return ruta.slice(0, LIMITES.comandos).map(function(dir){
            return { tipo: "mv", dir: dir };
        });
    }

    return {
        INICIOS: INICIOS,
        NIVELES: NIVELES,
        DIRECCIONES: DIRECCIONES,
        CONDICIONES: CONDICIONES,
        LIMITES: LIMITES,
        obtenerNivel: obtenerNivel,
        esPared: esPared,
        validar: validar,
        trazar: trazar,
        distanciaSalida: distanciaSalida,
        rutaHasta: rutaHasta,
        resolver: resolver,
        lineaTemporal: lineaTemporal,
        programaBot: programaBot
    };
}));
