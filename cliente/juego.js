// Capa de presentación del juego "Maze Duel" (sprint 2).
// Editor de bloques estilo Scratch + laberinto + partidas en tiempo real.

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

// Block types: { type, color, label, hasChildren, condition, count }
const BLOCK_PALETTE = [
    { type: "mv", label: "mover", color: "#4C97FF", hasChildren: false, param: "right" },
    { type: "repeat", label: "repetir", color: "#FFAB19", hasChildren: true, param: 3 },
    { type: "for", label: "para", color: "#FFAB19", hasChildren: true, param: 3 },
    { type: "while", label: "mientras", color: "#FFAB19", hasChildren: true, param: "no salida" },
    { type: "if", label: "si", color: "#FF8C1A", hasChildren: true, param: "pared adelante" },
    { type: "ifelse", label: "si/sino", color: "#FF8C1A", hasChildren: true, param: "pared adelante", hasElse: true }
];

const DIRS = ["up", "down", "left", "right"];
const CONDS = ["pared adelante", "salida visible", "no salida"];

function JuegoWeb(cw, socket){
    this.cw = cw;
    this.socket = socket;
    this.partidaActual = null;
    this.esAdmin = false;
    this.usuario = null;
    this.blockIdCounter = 0;
    this.workspace = []; // array of block objects
}

JuegoWeb.prototype.iniciar = function(usuario){
    this.usuario = usuario;
    this.esAdmin = usuario && usuario.rol === "administrador";
    this.socket.emit("identificar", usuario ? usuario.email : null);
    this.socket.emit("solicitarLista");
};

JuegoWeb.prototype.nuevoId = function(){ return "b" + (++this.blockIdCounter); };

// Create a block object from palette type
JuegoWeb.prototype.crearBloque = function(type){
    let pal = BLOCK_PALETTE.find(function(b){ return b.type === type; });
    let blk = { id: this.nuevoId(), type: type, param: pal.param, children: [], elseChildren: [] };
    if (type === "mv"){ blk.param = "right"; }
    return blk;
};

// Render a block as HTML
JuegoWeb.prototype.renderBloque = function(blk, depth){
    depth = depth || 0;
    let pal = BLOCK_PALETTE.find(function(b){ return b.type === blk.type; });
    let html = '<div class="block" data-id="' + blk.id + '" style="background:' + pal.color + ';margin-left:' + (depth*20) + 'px;">';
    html += '<span class="block-label">' + pal.label + '</span> ';
    if (blk.type === "mv"){
        html += '<select class="block-param" data-id="' + blk.id + '">';
        DIRS.forEach(function(d){
            html += '<option value="' + d + '"' + (blk.param === d ? ' selected' : '') + '>' + d + '</option>';
        });
        html += '</select>';
    } else if (blk.type === "repeat" || blk.type === "for"){
        html += '<input type="number" class="block-param block-count" data-id="' + blk.id + '" value="' + blk.param + '" min="1" max="10" style="width:50px;">';
    } else if (blk.type === "while" || blk.type === "if" || blk.type === "ifelse"){
        html += '<select class="block-param" data-id="' + blk.id + '">';
        CONDS.forEach(function(c){
            html += '<option value="' + c + '"' + (blk.param === c ? ' selected' : '') + '>' + c + '</option>';
        });
        html += '</select>';
    }
    html += ' <button class="block-del" data-id="' + blk.id + '">&times;</button>';
    html += '</div>';
    if (blk.hasChildren || pal.hasChildren){
        html += '<div class="block-children" data-parent="' + blk.id + '" style="margin-left:' + ((depth+1)*20) + 'px;min-height:20px;border-left:2px dashed #ccc;padding-left:8px;">';
        blk.children.forEach(function(child){
            html += this.renderBloque(child, depth + 1);
        }, this);
        if (blk.children.length === 0){
            html += '<div class="block-placeholder">soltar aquí</div>';
        }
        html += '</div>';
    }
    if (blk.hasElse || pal.hasElse){
        html += '<div class="block-else-label" style="margin-left:' + ((depth+1)*20) + 'px;font-size:0.8rem;color:#666;">sino:</div>';
        html += '<div class="block-else-children" data-parent="' + blk.id + '" data-else="1" style="margin-left:' + ((depth+1)*20) + 'px;min-height:20px;border-left:2px dashed #999;padding-left:8px;">';
        (blk.elseChildren || []).forEach(function(child){
            html += this.renderBloque(child, depth + 1);
        }, this);
        if (!blk.elseChildren || blk.elseChildren.length === 0){
            html += '<div class="block-placeholder">soltar aquí</div>';
        }
        html += '</div>';
    }
    return html;
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
    cadena += '<p class="text-muted">Arrastra bloques para programar tu robot. El primero en llegar a la salida gana.</p>';
    cadena += '<button id="btnCrearPartida" class="btn btn-primary mr-2">Crear partida</button>';
    cadena += '<button id="btnRefrescar" class="btn btn-secondary">Refrescar lista</button>';
    cadena += '<div id="listaPartidas" class="mt-3"></div>';
    cadena += '</div>';
    $("#contenido").html(cadena);

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
    this.workspace = [];
    let self = this;
    let cadena = '<div class="card p-4 mt-3"><h4>Partida ' + partida.id + '</h4>';
    cadena += '<p>Jugadores: ' + partida.jugadores.join(" vs ") + '</p>';
    cadena += '<div class="row"><div class="col-md-4">';
    // Paleta de bloques
    cadena += '<h6>Paleta de bloques</h6>';
    cadena += '<div id="paleta">';
    BLOCK_PALETTE.forEach(function(b){
        cadena += '<div class="block-palette" data-type="' + b.type + '" style="background:' + b.color + ';">' + b.label + '</div>';
    });
    cadena += '</div>';
    cadena += '</div><div class="col-md-4">';
    // Workspace
    cadena += '<h6>Tu programa</h6>';
    cadena += '<div id="workspace" style="min-height:200px;border:2px dashed #ccc;padding:10px;background:#f8f9fa;"></div>';
    cadena += '<div class="mt-2">';
    cadena += '<button id="btnProbar" class="btn btn-info btn-sm">Probar</button>';
    cadena += '<button id="btnEnviar" class="btn btn-success btn-sm ml-1">Enviar programa</button>';
    cadena += '<button id="btnLimpiar" class="btn btn-danger btn-sm ml-1">Limpiar</button>';
    cadena += '</div>';
    cadena += '<p id="estadoPrograma" class="mt-2 text-muted small"></p>';
    cadena += '<div id="timerDisplay" class="mt-1 text-warning font-weight-bold" style="display:none;"></div>';
    cadena += '</div><div class="col-md-4">';
    cadena += this.renderizarLaberinto(null, null);
    cadena += '<p class="text-muted mt-2 small">Leyenda: azul = jugador 1, rojo = jugador 2, verde = salida, amarillo = camino de prueba</p>';
    cadena += '<div id="previewLaberinto" class="mt-2"></div>';
    cadena += '</div></div></div>';
    $("#contenido").html(cadena);

    // Render workspace
    this.renderWorkspace();

    // Paleta: click para agregar bloque al workspace
    $(".block-palette").on("click", function(){
        let type = $(this).data("type");
        let blk = self.crearBloque(type);
        self.workspace.push(blk);
        self.renderWorkspace();
    });

    $("#btnLimpiar").on("click", function(){
        self.workspace = [];
        self.renderWorkspace();
    });

    $("#btnProbar").on("click", function(){
        self.probarBloques();
    });

    $("#btnEnviar").on("click", function(){
        let codigo = self.bloquesACodigo(self.workspace);
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

// Renderiza el workspace de bloques
JuegoWeb.prototype.renderWorkspace = function(){
    let self = this;
    let html = "";
    if (this.workspace.length === 0){
        html = '<div class="text-muted small">Haz clic en un bloque de la paleta para agregarlo.</div>';
    } else {
        this.workspace.forEach(function(blk){
            html += self.renderBloque(blk, 0);
        });
    }
    $("#workspace").html(html);

    // Bind param changes
    $(".block-param").on("change", function(){
        let id = $(this).data("id");
        let blk = self.buscarBloque(self.workspace, id);
        if (blk){
            if ($(this).hasClass("block-count")){
                blk.param = parseInt($(this).val()) || 1;
            } else {
                blk.param = $(this).val();
            }
        }
    });

    // Bind delete
    $(".block-del").on("click", function(){
        let id = $(this).data("id");
        self.eliminarBloque(self.workspace, id);
        self.renderWorkspace();
    });
};

// Busca un bloque por id en el árbol
JuegoWeb.prototype.buscarBloque = function(lista, id){
    for (let i = 0; i < lista.length; i++){
        if (lista[i].id === id){ return lista[i]; }
        let found = this.buscarBloque(lista[i].children, id);
        if (found){ return found; }
        if (lista[i].elseChildren){
            found = this.buscarBloque(lista[i].elseChildren, id);
            if (found){ return found; }
        }
    }
    return null;
};

// Elimina un bloque del árbol
JuegoWeb.prototype.eliminarBloque = function(lista, id){
    for (let i = 0; i < lista.length; i++){
        if (lista[i].id === id){
            lista.splice(i, 1);
            return true;
        }
        if (this.eliminarBloque(lista[i].children, id)){ return true; }
        if (lista[i].elseChildren && this.eliminarBloque(lista[i].elseChildren, id)){ return true; }
    }
    return false;
};

// Convierte bloques a código
JuegoWeb.prototype.bloquesACodigo = function(lista, indent){
    indent = indent || "";
    let lineas = [];
    lista.forEach(function(blk){
        if (blk.type === "mv"){
            lineas.push(indent + "mv " + blk.param);
        } else if (blk.type === "repeat" || blk.type === "for"){
            lineas.push(indent + (blk.type === "for" ? "for" : "repeat") + " " + blk.param);
            lineas = lineas.concat(this.bloquesACodigo(blk.children, indent + "  "));
            lineas.push(indent + "end");
        } else if (blk.type === "while"){
            lineas.push(indent + "while " + blk.param);
            lineas = lineas.concat(this.bloquesACodigo(blk.children, indent + "  "));
            lineas.push(indent + "end");
        } else if (blk.type === "if"){
            lineas.push(indent + "if " + blk.param);
            lineas = lineas.concat(this.bloquesACodigo(blk.children, indent + "  "));
            lineas.push(indent + "end");
        } else if (blk.type === "ifelse"){
            lineas.push(indent + "if " + blk.param);
            lineas = lineas.concat(this.bloquesACodigo(blk.children, indent + "  "));
            lineas.push(indent + "else");
            lineas = lineas.concat(this.bloquesACodigo(blk.elseChildren || [], indent + "  "));
            lineas.push(indent + "end");
        }
    }, this);
    return lineas.join("\\n");
};

// Simula la ejecución localmente
JuegoWeb.prototype.probarBloques = function(){
    let codigo = this.bloquesACodigo(this.workspace);
    let comandos = this.parsearCodigoCliente(codigo);
    let pos = [1, 1];
    let path = [pos.slice()];
    for (let i = 0; i < comandos.length; i++){
        let dir = comandos[i];
        let dr = 0, dc = 0;
        if (dir === "up"){ dr = -1; }
        else if (dir === "down"){ dr = 1; }
        else if (dir === "left"){ dc = -1; }
        else if (dir === "right"){ dc = 1; }
        let nr = pos[0] + dr;
        let nc = pos[1] + dc;
        if (nr >= 0 && nr < MAZE.length && nc >= 0 && nc < MAZE[0].length && MAZE[nr][nc] !== 1){
            pos = [nr, nc];
        }
        path.push(pos.slice());
        if (pos[0] === EXIT[0] && pos[1] === EXIT[1]){ break; }
    }
    // Render path
    let html = '<div class="maze-grid">';
    for (let r = 0; r < MAZE.length; r++){
        for (let c = 0; c < MAZE[r].length; c++){
            let cls = "maze-cell";
            if (MAZE[r][c] === 1){ cls += " maze-wall"; }
            else if (r === EXIT[0] && c === EXIT[1]){ cls += " maze-exit"; }
            let inPath = path.some(function(p){ return p[0] === r && p[1] === c; });
            if (inPath){ cls += " maze-path"; }
            if (pos[0] === r && pos[1] === c){ cls += " maze-p1"; }
            html += '<div class="' + cls + '"></div>';
        }
    }
    html += '</div>';
    html += '<p class="small mt-1">Pasos: ' + comandos.length + ' | Posición final: (' + pos[0] + ', ' + pos[1] + ')</p>';
    if (pos[0] === EXIT[0] && pos[1] === EXIT[1]){
        html += '<p class="text-success small">¡Llega a la salida!</p>';
    } else {
        html += '<p class="text-warning small">No llega a la salida.</p>';
    }
    $("#previewLaberinto").html(html);
};

// Parser simplificado en el cliente para el botón Probar
JuegoWeb.prototype.parsearCodigoCliente = function(codigo){
    let lineas = codigo.split("\\n").map(function(l){ return l.trim(); }).filter(function(l){ return l && !l.startsWith("#"); });
    let comandos = [];
    function parsearBloque(inicio, fin){
        let res = [];
        let j = inicio;
        while (j < fin){
            let linea = lineas[j];
            if (linea.startsWith("repeat ") || linea.startsWith("for ")){
                let partes = linea.split(/\\s+/);
                let n = parseInt(partes[1]) || 1;
                if (n > 10){ n = 10; }
                let depth = 1;
                let k = j + 1;
                while (k < fin && depth > 0){
                    if (lineas[k].startsWith("repeat ") || lineas[k].startsWith("for ") || lineas[k].startsWith("while ")){ depth++; }
                    else if (lineas[k] === "end"){ depth--; }
                    if (depth === 0){ break; }
                    k++;
                }
                let bloque = parsearBloque(j + 1, k);
                for (let r = 0; r < n; r++){
                    res = res.concat(bloque);
                    if (res.length >= 50){ break; }
                }
                j = k + 1;
            } else if (linea.startsWith("while ")){
                let depth = 1;
                let k = j + 1;
                while (k < fin && depth > 0){
                    if (lineas[k].startsWith("repeat ") || lineas[k].startsWith("for ") || lineas[k].startsWith("while ")){ depth++; }
                    else if (lineas[k] === "end"){ depth--; }
                    if (depth === 0){ break; }
                    k++;
                }
                let bloque = parsearBloque(j + 1, k);
                for (let r = 0; r < 50; r++){
                    res = res.concat(bloque);
                    if (res.length >= 50){ break; }
                }
                j = k + 1;
            } else if (linea === "end"){
                j++;
            } else if (linea.startsWith("mv ")){
                let dir = linea.split(/\\s+/)[1];
                if (["up","down","left","right"].indexOf(dir) !== -1){
                    res.push(dir);
                }
                j++;
            } else {
                j++;
            }
        }
        return res;
    }
    let flat = parsearBloque(0, lineas.length);
    return flat.slice(0, 50);
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

JuegoWeb.prototype.iniciarTimer = function(segundos){
    let self = this;
    if (this._timerHandle){ clearInterval(this._timerHandle); }
    this._timerHandle = setInterval(function(){
        segundos--;
        if (segundos <= 0){
            clearInterval(self._timerHandle);
            self._timerHandle = null;
            $("#timerDisplay").hide();
            let codigo = $("#codigoEditor").val() || "";
            if (self.usuario && self.partidaActual){
                if (!self.socket.connected){ self.socket.connect(); }
                self.socket.emit("identificar", self.usuario.email);
                self.socket.emit("programar", { id: self.partidaActual.id, codigo: codigo });
                self.cw.mostrarMensaje("Tiempo agotado. Programa enviado automáticamente.", "warning");
            }
        }
    }, 1000);
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
    juego.socket.on("timerInicio", function(data){
        $("#timerDisplay").show().text("Tiempo restante: " + data.segundos + "s (el otro jugador ya envió su programa)");
        juego.iniciarTimer(data.segundos);
    });
    juego.socket.on("timerTick", function(data){
        $("#timerDisplay").text("Tiempo restante: " + data.segundos + "s");
        if (data.segundos <= 0){
            $("#timerDisplay").hide();
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