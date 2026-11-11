// Capa de presentación del juego "Maze Duel" (sprint 2).
// Renderiza el laberinto, el editor de código y la lista de partidas.
// Se comunica con el servidor por Socket.IO.

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

const EXIT = [8, 1];

function JuegoWeb(cw, socket){
    this.cw = cw;
    this.socket = socket;
    this.partidaActual = null;
    this.esAdmin = false;
    this.usuario = null;
}

JuegoWeb.prototype.iniciar = function(usuario){
    this.usuario = usuario;
    this.esAdmin = usuario && usuario.rol === "administrador";
    this.socket.emit("identificar", usuario ? usuario.email : null);
    this.socket.emit("solicitarLista");
};

JuegoWeb.prototype.renderizarLaberinto = function(pos1, pos2){
    let html = '<div class="maze-grid">';
    for (let r = 0; r < MAZE.length; r++){
        for (let c = 0; c < MAZE[r].length; c++){
            let cls = "maze-cell";
            if (MAZE[r][c] === 1){ cls += " maze-wall"; }
            else if (r === EXIT[0] && c === EXIT[1]){ cls += " maze-exit"; }
            if (pos1 && pos1[0] === r && pos1[1] === c){ cls += " maze-p1"; }
            if (pos2 && pos2[0] === r && pos2[1] === c){ cls += " maze-p2"; }
            html += '<div class="' + cls + '"></div>';
        }
    }
    html += '</div>';
    return html;
};

JuegoWeb.prototype.mostrarLobby = function(){
    this.cw.limpiarMensaje();
    let self = this;
    let cadena = '<div class="card p-4 mt-3"><h4>Maze Duel</h4>';
    cadena += '<p class="text-muted">Programa una secuencia de movimientos y compite contra otro jugador. El primero en llegar a la salida gana.</p>';
    cadena += '<p class="small text-muted">Comandos: <code>mv up/down/left/right</code>, <code>repeat N ... end</code>, <code>for N ... end</code>, <code>while true ... end</code>. Usa <code>#</code> para comentarios.</p>';
    cadena += '<button id="btnCrearPartida" class="btn btn-primary mr-2">Crear partida</button>';
    cadena += '<button id="btnRefrescar" class="btn btn-secondary">Refrescar lista</button>';
    cadena += '<div id="listaPartidas" class="mt-3"></div>';
    cadena += '</div>';
    $("#contenido").html(cadena);

    // Identificar y solicitar lista al entrar al lobby.
    if (self.usuario){
        if (!self.socket.connected){ self.socket.connect(); }
        self.socket.emit("identificar", self.usuario.email);
        self.socket.emit("solicitarLista");
    }

    $("#btnCrearPartida").on("click", function(){
        if (!self.usuario){
            self.cw.mostrarMensaje("Debes iniciar sesión para crear una partida", "warning");
            return;
        }
        if (!self.socket.connected){
            self.cw.mostrarMensaje("Conectando...", "info");
            self.socket.connect();
        }
        self.socket.emit("identificar", self.usuario.email);
        self.socket.emit("crearPartida");
    });
    $("#btnRefrescar").on("click", function(){
        if (self.usuario && !self.socket.connected){
            self.socket.connect();
        }
        if (self.usuario){
            self.socket.emit("identificar", self.usuario.email);
        }
        self.socket.emit("solicitarLista");
    });
};

JuegoWeb.prototype.mostrarEditor = function(partida){
    this.partidaActual = partida;
    let self = this;
    let cadena = '<div class="card p-4 mt-3"><h4>Partida ' + partida.id + '</h4>';
    cadena += '<p>Jugadores: ' + partida.jugadores.join(" vs ") + '</p>';
    cadena += '<div class="row"><div class="col-md-6">';
    cadena += this.renderizarLaberinto(null, null);
    cadena += '<p class="text-muted mt-2"><small>Leyenda: azul = jugador 1, rojo = jugador 2, verde = salida</small></p>';
    cadena += '</div><div class="col-md-6">';
    cadena += '<h5>Escribe tu programa</h5>';
    cadena += '<p class="text-muted small">Comandos: <code>mv up/down/left/right</code>, <code>repeat N ... end</code>, <code>for N ... end</code>, <code>while true ... end</code>. Usa <code>#</code> para comentarios.</p>';
    cadena += '<textarea id="codigoEditor" class="form-control" rows="10" style="font-family:monospace;" placeholder="mv right\nmv down\nrepeat 3\n  mv right\nend"></textarea>';
    cadena += '<div class="mt-2">';
    cadena += '<button id="btnEnviar" class="btn btn-success btn-sm">Enviar programa</button>';
    cadena += '<button id="btnLimpiar" class="btn btn-danger btn-sm ml-1">Limpiar</button>';
    cadena += '</div>';
    cadena += '<p id="estadoPrograma" class="mt-2 text-muted"></p>';
    cadena += '</div></div></div>';
    $("#contenido").html(cadena);

    $("#btnLimpiar").on("click", function(){
        $("#codigoEditor").val("");
    });

    $("#btnEnviar").on("click", function(){
        let codigo = $("#codigoEditor").val();
        if (!self.usuario){
            self.cw.mostrarMensaje("Debes iniciar sesión para enviar un programa", "warning");
            return;
        }
        if (!self.socket.connected){
            self.cw.mostrarMensaje("Conectando...", "info");
            self.socket.connect();
        }
        self.socket.emit("identificar", self.usuario.email);
        self.socket.emit("programar", { id: partida.id, codigo: codigo });
    });
};

JuegoWeb.prototype.mostrarResultado = function(resultado){
    let self = this;
    let cadena = '<div class="card p-4 mt-3"><h4>Resultado</h4>';
    if (resultado.ganador){
        cadena += '<p class="text-success font-weight-bold">Ganador: ' + this.escapar(resultado.ganador) + '</p>';
        cadena += '<p>Motivo: ' + this.escapar(resultado.razon) + '</p>';
    } else {
        cadena += '<p class="text-warning">Empate</p>';
    }
    cadena += '<p>Comandos usados:</p><ul>';
    for (let email in resultado.comandos){
        cadena += '<li>' + this.escapar(email) + ': ' + resultado.comandos[email] + '</li>';
    }
    cadena += '</ul>';
    cadena += this.renderizarLaberinto(
        resultado.posicionesFinales[self.partidaActual.jugadores[0]],
        resultado.posicionesFinales[self.partidaActual.jugadores[1]]
    );
    cadena += '<button id="btnVolverLobby" class="btn btn-primary mt-2">Volver al lobby</button>';
    cadena += '</div>';
    $("#contenido").html(cadena);
    $("#btnVolverLobby").on("click", function(){ self.mostrarLobby(); self.socket.emit("solicitarLista"); });
};

JuegoWeb.prototype.actualizarListaPartidas = function(lista){
    let self = this;
    if (!self.usuario){
        console.log("actualizarListaPartidas: usuario no identificado");
        return;
    }
    let html = '<table class="table table-sm"><thead><tr><th>ID</th><th>Creador</th><th>Jugadores</th><th>Estado</th><th></th></tr></thead><tbody>';
    if (!lista || lista.length === 0){
        html += '<tr><td colspan="5" class="text-muted">No hay partidas. Crea una.</td></tr>';
    }
    lista.forEach(function(p){
        html += '<tr>';
        html += '<td>' + p.id + '</td>';
        html += '<td>' + p.creador + '</td>';
        html += '<td>' + p.jugadores.join(", ") + '</td>';
        html += '<td>' + p.estado + '</td>';
        html += '<td>';
        if (p.estado === "esperando" && p.creador !== self.usuario.email){
            html += '<button class="btn btn-sm btn-success btn-unirse" data-id="' + p.id + '">Unirse</button> ';
        }
        if (p.estado === "programando" && p.jugadores.indexOf(self.usuario.email) !== -1){
            html += '<button class="btn btn-sm btn-primary btn-jugar" data-id="' + p.id + '">Jugar</button> ';
        }
        if (self.esAdmin){
            html += '<button class="btn btn-sm btn-danger btn-cancelar" data-id="' + p.id + '">Cancelar</button>';
        }
        html += '</td>';
        html += '</tr>';
    });
    html += '</tbody></table>';
    $("#listaPartidas").html(html);

    $(".btn-unirse").on("click", function(){ self.socket.emit("unirsePartida", $(this).data("id")); });
    $(".btn-jugar").on("click", function(){ self.socket.emit("unirsePartida", $(this).data("id")); });
    $(".btn-cancelar").on("click", function(){ self.socket.emit("cancelarPartida", $(this).data("id")); });
};

JuegoWeb.prototype.escapar = function(texto){
    return String(texto).replace(/[&<>"']/g, function(c){
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
};

function configurarSocket(juego){
    juego.socket.on("connect", function(){
        if (juego.usuario){
            juego.socket.emit("identificar", juego.usuario.email);
            juego.socket.emit("solicitarLista");
        }
    });
    juego.socket.on("partidaCreada", function(data){
        juego.partidaActual = data.partida;
        juego.mostrarEditor(data.partida);
    });
    juego.socket.on("partidaActualizada", function(partida){
        juego.partidaActual = partida;
        if (partida.estado === "programando" && partida.jugadores.indexOf(juego.usuario.email) !== -1){
            juego.mostrarEditor(partida);
        }
    });
    juego.socket.on("resultado", function(resultado){
        juego.mostrarResultado(resultado);
    });
    juego.socket.on("listaPartidas", function(lista){
        if ($("#listaPartidas").length){
            juego.actualizarListaPartidas(lista);
        }
    });
    juego.socket.on("partidaCancelada", function(data){
        juego.cw.mostrarMensaje("Partida " + data.id + " cancelada", "warning");
        juego.mostrarLobby();
    });
    juego.socket.on("error", function(msg){
        juego.cw.mostrarMensaje(msg, "danger");
    });
}