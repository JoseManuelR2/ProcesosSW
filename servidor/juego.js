// Partidas de Maze Duel: estado de cada partida y gestor de partidas.
// Las reglas del laberinto y la ejecución viven en compartido/laberinto.js; aquí
// solo se gestionan jugadores, fases, temporizador y limpieza.
const crypto = require("crypto");
const L = require("../compartido/laberinto.js");

const EMAIL_BOT = "bot@maze.local";
const MINUTOS_TERMINADA = 5;
const MINUTOS_ESPERANDO = 10;

function Partida(id, creador, nivel){
    this.id = id;
    this.nivel = nivel;
    this.creador = creador;
    this.jugadores = [creador];   // el índice define el inicio (0 = jugador 1, 1 = jugador 2)
    this.programas = {};          // email -> programa (árbol de bloques)
    this.estado = "esperando";    // esperando | programando | terminada
    this.resultado = null;
    this.primeroEnProgramar = null;
    this.timer = null;
    this.tiempoRestante = 0;
    this.creada = Date.now();
    this.finalizada = null;
}

Partida.prototype.inicioDe = function(email){
    return L.INICIOS[this.jugadores.indexOf(email)];
};

Partida.prototype.agregarJugador = function(email){
    if (this.jugadores.indexOf(email) !== -1){
        return { ok: true, yaEsta: true };
    }
    if (this.estado !== "esperando" || this.jugadores.length >= 2){
        return { error: "La partida ya tiene dos jugadores" };
    }
    this.jugadores.push(email);
    this.estado = "programando";
    return { ok: true, yaEsta: false };
};

// Un bot ocupa la segunda plaza y programa la ruta óptima de inmediato.
Partida.prototype.agregarBot = function(){
    if (this.jugadores.length !== 1){ return false; }
    this.jugadores.push(EMAIL_BOT);
    this.programas[EMAIL_BOT] = L.programaBot(this.nivel, this.inicioDe(EMAIL_BOT));
    this.estado = "programando";
    return true;
};

Partida.prototype.esBot = function(email){
    return email === EMAIL_BOT;
};

Partida.prototype.programar = function(email, programa){
    if (this.estado !== "programando"){
        return { error: "La partida no admite programas en este momento" };
    }
    if (this.jugadores.indexOf(email) === -1){
        return { error: "No estás en esta partida" };
    }
    let error = L.validar(programa);
    if (error){
        return { error: error };
    }
    let traza = L.trazar(this.nivel, this.inicioDe(email), programa);
    if (traza.camino.length === 0){
        return { error: "El programa no mueve al robot" };
    }
    this.programas[email] = programa;
    if (this.primeroEnProgramar === null){
        this.primeroEnProgramar = email;
    }
    return { ok: true, comandos: traza.camino.length };
};

Partida.prototype.ambosProgramados = function(){
    return this.jugadores.length === 2 &&
        this.jugadores.every(function(e){ return this.programas[e] !== undefined; }, this);
};

// Quien no haya programado a tiempo ejecuta un programa vacío (el robot no se mueve).
Partida.prototype.cerrarProgramasPendientes = function(){
    this.jugadores.forEach(function(e){
        if (this.programas[e] === undefined){ this.programas[e] = []; }
    }, this);
};

Partida.prototype.arrancarTemporizador = function(segundos, onTick, onFin){
    if (this.timer){ return false; }
    this.tiempoRestante = segundos;
    let self = this;
    this.timer = setInterval(function(){
        self.tiempoRestante--;
        onTick(self.tiempoRestante);
        if (self.tiempoRestante <= 0){
            self.pararTemporizador();
            onFin();
        }
    }, 1000);
    return true;
};

Partida.prototype.pararTemporizador = function(){
    if (this.timer){
        clearInterval(this.timer);
        this.timer = null;
    }
};

Partida.prototype.ejecutar = function(){
    if (this.estado !== "programando" || !this.ambosProgramados()){
        return { error: "Faltan programas" };
    }
    this.pararTemporizador();
    let trazas = this.jugadores.map(function(e){
        return L.trazar(this.nivel, this.inicioDe(e), this.programas[e]);
    }, this);
    let decision = L.resolver(this.nivel, trazas);
    let ganador = decision.indiceGanador === null ? null : this.jugadores[decision.indiceGanador];

    this.estado = "terminada";
    this.finalizada = Date.now();
    this.resultado = {
        id: this.id,
        nivel: this.nivel.id,
        jugadores: this.jugadores.slice(),
        ganador: ganador,
        razon: decision.razon,
        pasos: L.lineaTemporal(this.nivel, this.jugadores.map(function(e){ return this.inicioDe(e); }, this), trazas),
        posicionesFinales: {
            [this.jugadores[0]]: trazas[0].final.slice(),
            [this.jugadores[1]]: trazas[1].final.slice()
        },
        comandos: {
            [this.jugadores[0]]: trazas[0].camino.length,
            [this.jugadores[1]]: trazas[1].camino.length
        }
    };
    return this.resultado;
};

Partida.prototype.resumen = function(){
    return {
        id: this.id,
        creador: this.creador,
        jugadores: this.jugadores.slice(),
        estado: this.estado,
        nivel: this.nivel.id,
        resultado: this.resultado
    };
};

function GestorPartidas(){
    this.partidas = {};
}

GestorPartidas.prototype.crear = function(email, idNivel){
    let nivel = L.obtenerNivel(idNivel || "clasico");
    if (!nivel){
        return { error: "Nivel no válido" };
    }
    let id;
    do {
        id = "P" + crypto.randomBytes(3).toString("hex");
    } while (this.partidas[id]);
    let partida = new Partida(id, email, nivel);
    this.partidas[id] = partida;
    return partida;
};

GestorPartidas.prototype.obtener = function(id){
    return this.partidas[id] || null;
};

// Partida en curso en la que participa el usuario (para reconectar tras recargar).
GestorPartidas.prototype.enCursoDe = function(email){
    let encontrada = null;
    for (let id in this.partidas){
        let p = this.partidas[id];
        if (p.estado === "programando" && p.jugadores.indexOf(email) !== -1){
            encontrada = p;
        }
    }
    return encontrada;
};

GestorPartidas.prototype.listar = function(){
    let self = this;
    return Object.keys(this.partidas).map(function(id){
        let p = self.partidas[id];
        return {
            id: p.id,
            creador: p.creador,
            jugadores: p.jugadores.slice(),
            estado: p.estado,
            nivel: p.nivel.id,
            resultado: p.resultado ? p.resultado.ganador : null
        };
    });
};

GestorPartidas.prototype.cancelar = function(id){
    let p = this.partidas[id];
    if (!p){ return { error: "Partida no encontrada" }; }
    p.pararTemporizador();
    delete this.partidas[id];
    return { ok: true };
};

// Borra partidas terminadas hace tiempo y partidas sin rival abandonadas.
GestorPartidas.prototype.limpiar = function(ahora){
    let self = this;
    let borradas = 0;
    Object.keys(this.partidas).forEach(function(id){
        let p = self.partidas[id];
        let terminada = p.estado === "terminada" && ahora - p.finalizada > MINUTOS_TERMINADA * 60000;
        let abandonada = p.estado === "esperando" && ahora - p.creada > MINUTOS_ESPERANDO * 60000;
        if (terminada || abandonada){
            self.cancelar(id);
            borradas++;
        }
    });
    return borradas;
};

module.exports = {
    GestorPartidas,
    Partida,
    EMAIL_BOT
};
