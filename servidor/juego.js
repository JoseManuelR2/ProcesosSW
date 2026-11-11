// Juego del sprint 2: "Maze Duel" (Duelo de laberintos).
// Dos jugadores programan una secuencia de movimientos (arriba, abajo, izquierda,
// derecha) para resolver un laberinto. Se ejecutan simultáneamente y el primero
// en llegar a la salida gana. Si ambos llegan al mismo tiempo, gana el que use
// menos comandos. Si ninguno llega, gana el que esté más cerca de la salida.
//
// La lógica vive aquí (servidor) y se expone a los clientes por Socket.IO.
// Los clientes solo envían comandos y reciben el estado.

// Laberinto fijo de 10x10. 1 = pared, 0 = pasillo.
// S = salida (se marca como 0 en la matriz y se guarda por separado).
const MAZE = [
    [1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,1,0,0,0,0,1],
    [1,0,1,0,1,0,1,1,0,1],
    [1,0,1,0,0,0,0,1,0,1],
    [1,0,1,1,1,1,0,1,0,1],
    [1,0,0,0,0,1,0,0,0,1],
    [1,1,1,1,0,1,1,1,0,1],
    [1,0,0,0,0,0,0,1,0,1],
    [1,0,1,1,1,1,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1]
];

const STARTS = [[1,1], [8,8]];
const EXIT = [8,1];

const DIRECTIONS = {
    up:    { dr: -1, dc: 0 },
    down:  { dr: 1,  dc: 0 },
    left:  { dr: 0,  dc: -1 },
    right: { dr: 0,  dc: 1 }
};

function esPared(r, c){
    if (r < 0 || r >= MAZE.length || c < 0 || c >= MAZE[0].length){
        return true;
    }
    return MAZE[r][c] === 1;
}

function mismaPos(a, b){
    return a[0] === b[0] && a[1] === b[1];
}

function distancia(a, b){
    return Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]);
}

// Una partida.
function Partida(id, creador){
    this.id = id;
    this.creador = creador;       // email del creador
    this.jugadores = [creador];   // emails
    this.programas = {};          // email -> array de comandos
    this.estado = "esperando";    // esperando | programando | ejecutando | terminada
    this.resultado = null;
    this.posiciones = {};         // email -> [r,c]
    this.ronda = 0;
    this.maxPasos = 50;
}

Partida.prototype.agregarJugador = function(email){
    if (this.jugadores.length >= 2){
        return { error: "La partida ya tiene dos jugadores" };
    }
    if (this.jugadores.indexOf(email) !== -1){
        return { error: "Ya estás en esta partida" };
    }
    this.jugadores.push(email);
    this.estado = "programando";
    this.posiciones[email] = STARTS[1].slice();
    return { ok: true };
};

Partida.prototype.programar = function(email, comandos){
    if (this.jugadores.indexOf(email) === -1){
        return { error: "No estás en esta partida" };
    }
    if (!Array.isArray(comandos)){
        return { error: "Los comandos deben ser una lista" };
    }
    for (let i = 0; i < comandos.length; i++){
        if (!DIRECTIONS[comandos[i]]){
            return { error: "Comando no válido: " + comandos[i] };
        }
    }
    if (comandos.length > this.maxPasos){
        return { error: "Máximo " + this.maxPasos + " comandos" };
    }
    this.programas[email] = comandos.slice();
    return { ok: true };
};

Partida.prototype.ambosProgramados = function(){
    return this.jugadores.length === 2 &&
        this.programas[this.jugadores[0]] &&
        this.programas[this.jugadores[1]];
};

Partida.prototype.ejecutar = function(){
    if (!this.ambosProgramados()){
        return { error: "Faltan programas" };
    }
    this.estado = "ejecutando";
    // Reiniciar posiciones.
    this.posiciones[this.jugadores[0]] = STARTS[0].slice();
    this.posiciones[this.jugadores[1]] = STARTS[1].slice();

    let pasos = [];
    let maxLen = Math.max(
        this.programas[this.jugadores[0]].length,
        this.programas[this.jugadores[1]].length
    );

    let ganador = null;
    let razon = null;

    for (let i = 0; i < maxLen; i++){
        let snapshot = {
            paso: i + 1,
            posiciones: {}
        };
        for (let j = 0; j < this.jugadores.length; j++){
            let email = this.jugadores[j];
            let cmds = this.programas[email];
            if (i < cmds.length){
                let dir = DIRECTIONS[cmds[i]];
                let pos = this.posiciones[email];
                let nr = pos[0] + dir.dr;
                let nc = pos[1] + dir.dc;
                if (!esPared(nr, nc)){
                    pos[0] = nr;
                    pos[1] = nc;
                }
            }
            snapshot.posiciones[email] = this.posiciones[email].slice();
        }
        pasos.push(snapshot);

        // Comprobar si alguien llegó a la salida.
        for (let j = 0; j < this.jugadores.length; j++){
            let email = this.jugadores[j];
            if (mismaPos(this.posiciones[email], EXIT)){
                if (ganador === null){
                    ganador = email;
                }
            }
        }
        if (ganador !== null){
            break;
        }
    }

    // Si ambos llegaron al mismo paso, gana el que tenga menos comandos.
    if (ganador){
        let llegoAmbos = this.jugadores.every(function(e){
            return mismaPos(this.posiciones[e], EXIT);
        }, this);
        if (llegoAmbos){
            let c0 = this.programas[this.jugadores[0]].length;
            let c1 = this.programas[this.jugadores[1]].length;
            if (c0 < c1){
                ganador = this.jugadores[0];
            } else if (c1 < c0){
                ganador = this.jugadores[1];
            }
        }
        razon = "llegó a la salida";
    } else {
        // Nadie llegó: gana el que esté más cerca.
        let d0 = distancia(this.posiciones[this.jugadores[0]], EXIT);
        let d1 = distancia(this.posiciones[this.jugadores[1]], EXIT);
        if (d0 < d1){
            ganador = this.jugadores[0];
            razon = "más cerca de la salida";
        } else if (d1 < d0){
            ganador = this.jugadores[1];
            razon = "más cerca de la salida";
        } else {
            ganador = null;
            razon = "empate";
        }
    }

    this.estado = "terminada";
    this.resultado = {
        ganador: ganador,
        razon: razon,
        pasos: pasos,
        posicionesFinales: {
            [this.jugadores[0]]: this.posiciones[this.jugadores[0]].slice(),
            [this.jugadores[1]]: this.posiciones[this.jugadores[1]].slice()
        },
        comandos: {
            [this.jugadores[0]]: this.programas[this.jugadores[0]].length,
            [this.jugadores[1]]: this.programas[this.jugadores[1]].length
        }
    };
    return this.resultado;
};

// Gestor de partidas.
function GestorPartidas(){
    this.partidas = {};
    this.contador = 0;
}

GestorPartidas.prototype.crear = function(email){
    this.contador++;
    let id = "P" + this.contador;
    let p = new Partida(id, email);
    p.posiciones[email] = STARTS[0].slice();
    this.partidas[id] = p;
    return p;
};

GestorPartidas.prototype.obtener = function(id){
    return this.partidas[id] || null;
};

GestorPartidas.prototype.listar = function(){
    let lista = [];
    for (let id in this.partidas){
        let p = this.partidas[id];
        lista.push({
            id: p.id,
            creador: p.creador,
            jugadores: p.jugadores.slice(),
            estado: p.estado,
            resultado: p.resultado ? p.resultado.ganador : null
        });
    }
    return lista;
};

GestorPartidas.prototype.cancelar = function(id){
    let p = this.partidas[id];
    if (!p){ return { error: "Partida no encontrada" }; }
    p.estado = "cancelada";
    delete this.partidas[id];
    return { ok: true };
};

module.exports = {
    GestorPartidas,
    MAZE,
    STARTS,
    EXIT,
    DIRECTIONS,
    esPared,
    distancia
};
