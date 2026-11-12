// Núcleo de Maze Duel compartido por el cliente (vista previa) y el servidor
// (resolución autoritativa de las partidas). Es un módulo UMD: en Node se
// carga con require() y en el navegador queda como la variable global Laberinto.
//
// Casillas del mapa:
//   "0" pasillo          "1" pared
//   "H" hielo            el robot resbala en la misma dirección hasta la siguiente casilla libre o la salida
//   "T" trampa           el robot vuelve a su salida
//   "P" teletransporte   el robot pasa a la casilla emparejada
//   "^" "v" "<" ">"      flecha de un solo sentido: solo se puede entrar en esa dirección
//
// Un programa es un árbol JSON de bloques, por ejemplo:
//   [ {tipo:"mv", dir:"right"},
//     {tipo:"repeat", n:3, cuerpo:[ {tipo:"mv", dir:"down"} ]},
//     {tipo:"while", cond:"exit visible", negada:true, cuerpo:[ {tipo:"mv", dir:"right"} ]},
//     {tipo:"if", cond:"wall up", cuerpo:[...], otro:[...]} ]
(function(raiz, fabrica){
    if (typeof module === "object" && module.exports){
        module.exports = fabrica();
    } else {
        raiz.Laberinto = fabrica();
    }
}(typeof self !== "undefined" ? self : this, function(){

    // Dificultad = tamaño del laberinto y cantidad de casillas especiales.
    const DIFICULTADES = {
        pequeno: { id: "pequeno", nombre: "Small", filas: 11, columnas: 11, especiales: 3, teleports: 0 },
        mediano: { id: "mediano", nombre: "Medium", filas: 15, columnas: 15, especiales: 7, teleports: 1 },
        grande:  { id: "grande",  nombre: "Large",  filas: 19, columnas: 19, especiales: 12, teleports: 2 }
    };

    const DIRECCIONES = {
        up:    [-1, 0],
        down:  [1, 0],
        left:  [0, -1],
        right: [0, 1]
    };

    // Condiciones positivas; el bloque puede negarlas con "negada" y muchas usan
    // una dirección ("dir") para mirar la casilla de al lado o una dirección de la salida.
    const CONDICIONES = ["wall", "exit visible", "ice", "trap", "teleport", "arrow"];
    const TIPOS = ["mv", "repeat", "while", "if"];
    const FLECHAS = { "^": "up", "v": "down", "<": "left", ">": "right" };

    const LIMITES = {
        comandos: 50,        // movimientos por defecto (cada nivel puede subirlo)
        bloques: 60,         // nodos en el programa escrito
        profundidad: 4,      // anidamiento máximo
        repeticiones: 10,    // valor máximo de repeat
        pasosBucle: 2000     // nodos visitados en la ejecución (corta bucles infinitos)
    };

    // --- Azar reproducible ---

    function crearAzar(semilla){
        let estado = semilla >>> 0;
        return function(){
            estado = estado + 0x6D2B79F5 | 0;
            let t = Math.imul(estado ^ estado >>> 15, 1 | estado);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    function entero(rnd, minimo, maximo){
        return minimo + Math.floor(rnd() * (maximo - minimo + 1));
    }

    function mezclar(lista, rnd){
        for (let i = lista.length - 1; i > 0; i--){
            let j = Math.floor(rnd() * (i + 1));
            let aux = lista[i];
            lista[i] = lista[j];
            lista[j] = aux;
        }
        return lista;
    }

    // --- Consultas del laberinto ---

    function esPared(nivel, r, c){
        if (r < 0 || r >= nivel.mapa.length || c < 0 || c >= nivel.mapa[0].length){
            return true;
        }
        return nivel.mapa[r][c] === "1";
    }

    function tipoEn(nivel, pos){
        return nivel.mapa[pos[0]][pos[1]];
    }

    function esSalida(nivel, pos){
        return pos[0] === nivel.salida[0] && pos[1] === nivel.salida[1];
    }

    function mismaPos(a, b){
        return a[0] === b[0] && a[1] === b[1];
    }

    function parejaTeleport(nivel, pos){
        let parejas = nivel.teleports || [];
        for (let i = 0; i < parejas.length; i++){
            if (parejaIgual(parejas[i][0], pos)){ return parejas[i][1]; }
            if (parejaIgual(parejas[i][1], pos)){ return parejas[i][0]; }
        }
        return null;
    }

    function parejaIgual(a, b){
        return a[0] === b[0] && a[1] === b[1];
    }

    // Avance de una casilla. Aplica paredes y flechas de un solo sentido.
    function pasoSencillo(nivel, pos, dir){
        let d = DIRECCIONES[dir];
        let destino = [pos[0] + d[0], pos[1] + d[1]];
        if (esPared(nivel, destino[0], destino[1])){
            return pos.slice();
        }
        let flecha = FLECHAS[tipoEn(nivel, destino)];
        if (flecha && flecha !== dir){
            return pos.slice();
        }
        return destino;
    }

    // Única regla de movimiento: la usan la simulación y la búsqueda de rutas del bot.
    function moverDesde(nivel, pos, dir, inicio){
        let destino = pasoSencillo(nivel, pos, dir);
        if (mismaPos(destino, pos)){
            return pos.slice();
        }
        // Hielo: seguir deslizando en la misma dirección.
        let guardas = 0;
        while (tipoEn(nivel, destino) === "H" && !esSalida(nivel, destino) && guardas++ < 200){
            let siguiente = pasoSencillo(nivel, destino, dir);
            if (mismaPos(siguiente, destino)){ break; }
            destino = siguiente;
        }
        if (tipoEn(nivel, destino) === "T"){
            return inicio.slice();
        }
        let pareja = tipoEn(nivel, destino) === "P" ? parejaTeleport(nivel, destino) : null;
        return pareja ? pareja.slice() : destino;
    }

    function posicionEn(pos, dir){
        let d = DIRECCIONES[dir];
        return [pos[0] + d[0], pos[1] + d[1]];
    }

    function tipoEnSeguro(nivel, r, c){
        if (r < 0 || r >= nivel.mapa.length || c < 0 || c >= nivel.mapa[0].length){
            return "1";
        }
        return nivel.mapa[r][c];
    }

    // ¿La salida está en esa dirección, en línea recta y sin paredes entre medias?
    function salidaEnDireccion(nivel, pos, dir){
        let salida = nivel.salida;
        let d = DIRECCIONES[dir];
        if (d[0] !== 0 && pos[1] !== salida[1]){ return false; }
        if (d[1] !== 0 && pos[0] !== salida[0]){ return false; }
        let r = pos[0] + d[0];
        let c = pos[1] + d[1];
        while (r >= 0 && r < nivel.mapa.length && c >= 0 && c < nivel.mapa[0].length){
            if (r === salida[0] && c === salida[1]){ return true; }
            if (esPared(nivel, r, c)){ return false; }
            r += d[0];
            c += d[1];
        }
        return false;
    }

    function veSalida(nivel, pos){
        return Object.keys(DIRECCIONES).some(function(dir){
            return salidaEnDireccion(nivel, pos, dir);
        });
    }

    function evaluarCondicion(nivel, cond, pos, dir){
        if (dir && !DIRECCIONES.hasOwnProperty(dir)){ return false; }
        if (cond === "wall"){
            if (!dir){ return false; }
            let pared = posicionEn(pos, dir);
            return esPared(nivel, pared[0], pared[1]);
        }
        if (cond === "exit visible"){
            return dir ? salidaEnDireccion(nivel, pos, dir) : veSalida(nivel, pos);
        }
        let objetivo = dir ? posicionEn(pos, dir) : pos;
        let tipo = tipoEnSeguro(nivel, objetivo[0], objetivo[1]);
        if (cond === "ice"){ return tipo === "H"; }
        if (cond === "trap"){ return tipo === "T"; }
        if (cond === "teleport"){ return tipo === "P"; }
        if (cond === "arrow"){ return !!FLECHAS[tipo]; }
        return false;
    }

    function cumple(nivel, cond, pos, negada, dir){
        let resultado = evaluarCondicion(nivel, cond, pos, dir);
        return negada ? !resultado : resultado;
    }

    // --- Validación ---

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
                if (nodo.negada !== undefined && typeof nodo.negada !== "boolean"){
                    return "El modificador de negación no es válido";
                }
                if (nodo.tipo === "repeat"){
                    if (!Number.isInteger(nodo.n) || nodo.n < 1 || nodo.n > LIMITES.repeticiones){
                        return "El número de repeticiones debe estar entre 1 y " + LIMITES.repeticiones;
                    }
                } else {
                    if (CONDICIONES.indexOf(nodo.cond) === -1){
                        return "Condición no válida: " + nodo.cond;
                    }
                    if (nodo.dir !== undefined && !DIRECCIONES.hasOwnProperty(nodo.dir)){
                        return "Dirección no válida: " + nodo.dir;
                    }
                    if (nodo.cond === "wall" && !DIRECCIONES.hasOwnProperty(nodo.dir)){
                        return "La condición wall necesita una dirección";
                    }
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

    // --- Ejecución ---

    function maximoPasos(nivel){
        return nivel.maxPasos || LIMITES.comandos;
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
        let maximo = maximoPasos(nivel);

        function ejecutar(lista){
            for (let nodo of lista){
                if (parado){ return; }
                if (++visitas > LIMITES.pasosBucle){ parado = true; return; }
                if (nodo.tipo === "mv"){
                    pos = moverDesde(nivel, pos, nodo.dir, inicio);
                    camino.push([pos[0], pos[1]]);
                    if (esSalida(nivel, pos)){
                        llega = true;
                        parado = true;
                        return;
                    }
                    if (camino.length >= maximo){
                        parado = true;
                        return;
                    }
                } else if (nodo.tipo === "repeat"){
                    for (let i = 0; i < nodo.n && !parado; i++){
                        ejecutar(nodo.cuerpo);
                    }
                } else if (nodo.tipo === "while"){
                    while (!parado && cumple(nivel, nodo.cond, pos, nodo.negada, nodo.dir)){
                        if (++visitas > LIMITES.pasosBucle){ parado = true; return; }
                        ejecutar(nodo.cuerpo);
                    }
                } else if (nodo.tipo === "if"){
                    if (cumple(nivel, nodo.cond, pos, nodo.negada, nodo.dir)){
                        ejecutar(nodo.cuerpo);
                    } else if (nodo.otro){
                        ejecutar(nodo.otro);
                    }
                }
            }
        }

        ejecutar(programa);
        return { camino: camino, llega: llega, final: pos, inicio: inicio.slice() };
    }

    // --- Rutas ---

    // Distancia mínima por caminos hasta la salida. Infinity si no hay ruta.
    function distanciaSalida(nivel, origen, inicio){
        let ruta = rutaHasta(nivel, origen, inicio);
        return ruta === null ? Infinity : ruta.length;
    }

    // Direcciones de la ruta más corta desde origen hasta la salida.
    // "inicio" es la salida del robot (a donde vuelve al pisar una trampa).
    function rutaHasta(nivel, origen, inicio){
        inicio = inicio || origen;
        let padre = {};
        let clave = function(pos){ return pos[0] + "," + pos[1]; };
        let cola = [[origen[0], origen[1]]];
        padre[clave(origen)] = null;
        let indice = 0;
        while (indice < cola.length){
            let actual = cola[indice++];
            if (esSalida(nivel, actual)){
                let dirs = [];
                let nodo = actual;
                while (padre[clave(nodo)]){
                    let previo = padre[clave(nodo)];
                    dirs.unshift(previo.dir);
                    nodo = previo.pos;
                }
                return dirs;
            }
            for (let dir of Object.keys(DIRECCIONES)){
                let siguiente = moverDesde(nivel, actual, dir, inicio);
                if (mismaPos(siguiente, actual) || padre.hasOwnProperty(clave(siguiente))){ continue; }
                padre[clave(siguiente)] = { pos: actual, dir: dir };
                cola.push(siguiente);
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
            let d0 = distanciaSalida(nivel, trazas[0].final, trazas[0].inicio);
            let d1 = distanciaSalida(nivel, trazas[1].final, trazas[1].inicio);
            if (d0 < d1){ ganador = 0; razon = "más cerca de la salida"; }
            else if (d1 < d0){ ganador = 1; razon = "más cerca de la salida"; }
            else { razon = "empate: igual de cerca de la salida"; }
        }
        return { indiceGanador: ganador, razon: razon };
    }

    // Fotogramas de la carrera: posiciones de ambos robots en cada instante.
    // El paso 0 es la situación inicial (cada robot en su casilla de salida).
    function lineaTemporal(nivel, inicios, trazas){
        let total = Math.max(trazas[0].camino.length, trazas[1].camino.length);
        let pasos = [];
        for (let t = 0; t <= total; t++){
            let posiciones = trazas.map(function(traza, j){
                let camino = traza.camino;
                if (t === 0 || camino.length === 0){ return inicios[j].slice(); }
                return camino[Math.min(t, camino.length) - 1].slice();
            });
            pasos.push({ paso: t, posiciones: posiciones });
        }
        return pasos;
    }

    // Programa automático: sigue la ruta más corta. Lo usa el bot de las partidas
    // en solitario.
    function programaBot(nivel, inicio){
        let ruta = rutaHasta(nivel, inicio, inicio) || [];
        return ruta.slice(0, maximoPasos(nivel)).map(function(dir){
            return { tipo: "mv", dir: dir };
        });
    }

    // --- Generación procedural ---

    function laberintoBase(filas, columnas, rnd){
        let mapa = [];
        for (let r = 0; r < filas; r++){
            mapa.push(new Array(columnas).fill("1"));
        }
        let pila = [[1, 1]];
        let visitadas = { "1,1": true };
        mapa[1][1] = "0";
        while (pila.length > 0){
            let actual = pila[pila.length - 1];
            let r = actual[0];
            let c = actual[1];
            let vecinos = [[r - 2, c], [r + 2, c], [r, c - 2], [r, c + 2]].filter(function(v){
                return v[0] > 0 && v[0] < filas - 1 && v[1] > 0 && v[1] < columnas - 1 && !visitadas[v[0] + "," + v[1]];
            });
            if (vecinos.length === 0){
                pila.pop();
                continue;
            }
            let siguiente = vecinos[entero(rnd, 0, vecinos.length - 1)];
            mapa[(r + siguiente[0]) / 2][(c + siguiente[1]) / 2] = "0";
            mapa[siguiente[0]][siguiente[1]] = "0";
            visitadas[siguiente[0] + "," + siguiente[1]] = true;
            pila.push(siguiente);
        }
        // Abrir algunos muros para crear rutas alternativas (laberinto con bucles).
        for (let r = 1; r < filas - 1; r++){
            for (let c = 1; c < columnas - 1; c++){
                if (mapa[r][c] !== "1" || rnd() > 0.10){ continue; }
                let horizontal = mapa[r][c - 1] === "0" && mapa[r][c + 1] === "0";
                let vertical = mapa[r - 1][c] === "0" && mapa[r + 1][c] === "0";
                if (horizontal !== vertical){ mapa[r][c] = "0"; }
            }
        }
        return mapa;
    }

    // Distancias por pasillos (sin casillas especiales) desde un origen.
    function distanciasBase(mapa, origen){
        let filas = mapa.length;
        let columnas = mapa[0].length;
        let distancias = mapa.map(function(fila){ return fila.map(function(){ return Infinity; }); });
        let cola = [origen.slice()];
        distancias[origen[0]][origen[1]] = 0;
        let indice = 0;
        while (indice < cola.length){
            let actual = cola[indice++];
            for (let dir of Object.keys(DIRECCIONES)){
                let nr = actual[0] + DIRECCIONES[dir][0];
                let nc = actual[1] + DIRECCIONES[dir][1];
                if (nr < 0 || nr >= filas || nc < 0 || nc >= columnas || mapa[nr][nc] !== "0"){ continue; }
                if (distancias[nr][nc] !== Infinity){ continue; }
                distancias[nr][nc] = distancias[actual[0]][actual[1]] + 1;
                cola.push([nr, nc]);
            }
        }
        return distancias;
    }

    function solucionable(nivel){
        return nivel.inicios.every(function(inicio){
            let distancia = distanciaSalida(nivel, inicio, inicio);
            return distancia !== Infinity && distancia <= maximoPasos(nivel) - 2;
        });
    }

    function mapaEnTexto(nivel){
        return nivel.mapa.map(function(fila){
            return Array.isArray(fila) ? fila.join("") : fila;
        });
    }

    // Coloca casillas especiales comprobando que el nivel sigue siendo resoluble.
    function colocarEspeciales(nivel, dificultad, rnd){
        let filas = nivel.filas;
        let columnas = nivel.columnas;
        let ocupadas = {};

        function disponibles(){
            let lista = [];
            for (let r = 1; r < filas - 1; r++){
                for (let c = 1; c < columnas - 1; c++){
                    if (nivel.mapa[r][c] !== "0"){ continue; }
                    if (parejaIgual([r, c], nivel.salida)){ continue; }
                    if (nivel.inicios.some(function(i){ return parejaIgual(i, [r, c]); })){ continue; }
                    if (ocupadas[r + "," + c]){ continue; }
                    lista.push([r, c]);
                }
            }
            return mezclar(lista, rnd);
        }

        function intentar(valor, celdas){
            let previos = celdas.map(function(celda){ return nivel.mapa[celda[0]][celda[1]]; });
            celdas.forEach(function(celda, i){ nivel.mapa[celda[0]][celda[1]] = valor[i]; });
            if (solucionable(nivel)){
                celdas.forEach(function(celda){ ocupadas[celda[0] + "," + celda[1]] = true; });
                return true;
            }
            celdas.forEach(function(celda, i){ nivel.mapa[celda[0]][celda[1]] = previos[i]; });
            return false;
        }

        function colocarSimples(valor, cantidad){
            let puestas = 0;
            for (let intento = 0; intento < 60 && puestas < cantidad; intento++){
                let candidatas = disponibles();
                if (candidatas.length === 0){ return puestas; }
                if (intentar([valor], [candidatas[0]])){ puestas++; }
            }
            return puestas;
        }

        let total = dificultad.especiales;
        let hielo = Math.round(total * 0.40);
        let trampas = Math.round(total * 0.20);
        colocarSimples("H", hielo);
        colocarSimples("T", trampas);

        // Reparte las flechas entre las cuatro direcciones. En los mapas medianos
        // y grandes hay al menos una de cada tipo; en el pequeño caben menos.
        let flechas = total >= 6 ? 4 : Math.max(1, Math.round(total * 0.25));
        let porDireccion = Math.floor(flechas / 4);
        let resto = flechas % 4;
        // El orden se baraja para que, cuando sobra alguna, no recaiga siempre en
        // las mismas direcciones (en Small solo cabe una flecha).
        mezclar(["^", "v", "<", ">"], rnd).forEach(function(valor, i){
            colocarSimples(valor, porDireccion + (i < resto ? 1 : 0));
        });

        for (let i = 0; i < dificultad.teleports; i++){
            let colocada = false;
            for (let intento = 0; intento < 40 && !colocada; intento++){
                let candidatas = disponibles();
                if (candidatas.length < 2){ break; }
                let a = candidatas[0];
                let b = candidatas[1];
                if (intentar(["P", "P"], [a, b])){
                    nivel.teleports.push([a, b]);
                    colocada = true;
                }
            }
        }
        return nivel;
    }

    function construirNivel(dificultad, rnd, semilla, sinEspeciales){
        let filas = dificultad.filas;
        let columnas = dificultad.columnas;
        let inicios = [[1, 1], [filas - 2, columnas - 2]];
        let mapa = laberintoBase(filas, columnas, rnd);
        let d0 = distanciasBase(mapa, inicios[0]);
        let d1 = distanciasBase(mapa, inicios[1]);
        let minimo = Math.max(4, Math.floor((filas + columnas) / 6));
        let candidatas = [];
        for (let r = 1; r < filas - 1; r++){
            for (let c = 1; c < columnas - 1; c++){
                if (mapa[r][c] !== "0" || minimo > d0[r][c] || minimo > d1[r][c]){ continue; }
                if (parejaIgual([r, c], inicios[0]) || parejaIgual([r, c], inicios[1])){ continue; }
                candidatas.push([r, c]);
            }
        }
        if (candidatas.length === 0){ return null; }

        let nivel = {
            id: "N" + semilla,
            nombre: "Random " + filas + "×" + columnas,
            semilla: semilla,
            dificultad: dificultad.id,
            filas: filas,
            columnas: columnas,
            maxPasos: Math.min(150, Math.max(60, Math.floor(filas * columnas * 0.5))),
            mapa: mapa,
            salida: candidatas[entero(rnd, 0, candidatas.length - 1)].slice(),
            inicios: inicios,
            teleports: []
        };
        if (!sinEspeciales){
            colocarEspeciales(nivel, dificultad, rnd);
            if (!solucionable(nivel)){ return null; }
        }

        nivel.mapa = mapaEnTexto(nivel);
        return nivel;
    }

    // Genera un nivel nuevo. La semilla hace que el resultado sea reproducible.
    function generarNivel(opciones){
        opciones = opciones || {};
        let dificultad = DIFICULTADES[opciones.dificultad] || DIFICULTADES.mediano;
        let semilla = (Number.isInteger(opciones.semilla) ? opciones.semilla : entero(crearAzar(Date.now()), 1, 2147483646)) >>> 0;
        let rnd = crearAzar(semilla);
        for (let intento = 0; intento < 12; intento++){
            let nivel = construirNivel(dificultad, rnd, semilla);
            if (nivel){ return nivel; }
        }
        // Respaldo: un laberinto sin casillas especiales siempre es resoluble.
        return construirNivel(dificultad, crearAzar(semilla), semilla, true);
    }

    return {
        DIFICULTADES: DIFICULTADES,
        DIRECCIONES: DIRECCIONES,
        CONDICIONES: CONDICIONES,
        LIMITES: LIMITES,
        esPared: esPared,
        esSalida: esSalida,
        validar: validar,
        trazar: trazar,
        distanciaSalida: distanciaSalida,
        rutaHasta: rutaHasta,
        resolver: resolver,
        lineaTemporal: lineaTemporal,
        programaBot: programaBot,
        generarNivel: generarNivel,
        solucionable: solucionable,
        maximoPasos: maximoPasos
    };
}));
