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
const START = [1, 1];

const BLOCK_PALETTE = [
    { type: "mv", label: "move", color: "#4C97FF", hasChildren: false, param: "right" },
    { type: "repeat", label: "repeat", color: "#FFAB19", hasChildren: true, param: 3 },
    { type: "for", label: "for", color: "#FFAB19", hasChildren: true, param: 3 },
    { type: "while", label: "while", color: "#FFAB19", hasChildren: true, param: "not exit" },
    { type: "if", label: "if", color: "#FF8C1A", hasChildren: true, param: "wall ahead" },
    { type: "ifelse", label: "if/else", color: "#FF8C1A", hasChildren: true, param: "wall ahead", hasElse: true }
];

const DIRS = ["up", "down", "left", "right"];
const CONDS = ["wall ahead", "exit visible", "not exit"];

function JuegoWeb(cw, socket){
    this.cw = cw;
    this.socket = socket;
    this.partidaActual = null;
    this.esAdmin = false;
    this.usuario = null;
    this.blockIdCounter = 0;
    this.workspace = [];
    this.animTimer = null;
}

JuegoWeb.prototype.iniciar = function(usuario){
    this.usuario = usuario;
    this.esAdmin = usuario && usuario.rol === "administrador";
    this.socket.emit("identificar", usuario ? usuario.email : null);
    this.socket.emit("solicitarLista");
};

JuegoWeb.prototype.nuevoId = function(){ return "b" + (++this.blockIdCounter); };

JuegoWeb.prototype.crearBloque = function(type){
    let pal = BLOCK_PALETTE.find(function(b){ return b.type === type; });
    let blk = { id: this.nuevoId(), type: type, param: pal.param, children: [], elseChildren: [] };
    if (type === "mv"){ blk.param = "right"; }
    return blk;
};

JuegoWeb.prototype.renderBloque = function(blk, depth){
    depth = depth || 0;
    let pal = BLOCK_PALETTE.find(function(b){ return b.type === type; });
    let html = '<div class="block" draggable="true" data-id="' + blk.id + '" style="background:' + pal.color + ';margin-left:' + (depth*20) + 'px;">';
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
            html += '<div class="block-placeholder">drop here</div>';
        }
        html += '</div>';
    }
    if (blk.hasElse || pal.hasElse){
        html += '<div class="block-else-label" style="margin-left:' + ((depth+1)*20) + 'px;font-size:0.8rem;color:#666;">else:</div>';
        html += '<div class="block-else-children" data-parent="' + blk.id + '" data-else="1" style="margin-left:' + ((depth+1)*20) + 'px;min-height:20px;border-left:2px dashed #999;padding-left:8px;">';
        (blk.elseChildren || []).forEach(function(child){
            html += this.renderBloque(child, depth + 1);
        }, this);
        if (!blk.elseChildren || blk.elseChildren.length === 0){
            html += '<div class="block-placeholder">drop here</div>';
        }
        html += '</div>';
    }
    return html;
};

JuegoWeb.prototype.renderizarLaberinto = function(pos1, pos2, path, currentStep){
    let html = '<div class="maze-grid">';
    for (let r = 0; r < MAZE.length; r++){
        for (let c = 0; c < MAZE[r].length; c++){
            let cls = "maze-cell";
            if (MAZE[r][c] === 1){ cls += " maze-wall"; }
            else if (r === EXIT[0] && c === EXIT[1]){ cls += " maze-exit"; }
            else if (r === START[0] && c === START[1]){ cls += " maze-start"; }
            if (path){
                let inPath = path.some(function(p){ return p[0] === r && p[1] === c; });
                if (inPath){ cls += " maze-path"; }
            }
            if (currentStep && currentStep[0] === r && currentStep[1] === c){ cls += " maze-current"; }
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
    cadena += '<p class="text-muted">Drag blocks to program your robot. First to reach the exit wins.</p>';
    cadena += '<button id="btnCrearPartida" class="btn btn-primary mr-2">Create game</button>';
    cadena += '<button id="btnRefrescar" class="btn btn-secondary">Refresh list</button>';
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
            self.cw.mostrarMensaje("You must log in to create a game", "warning");
            return;
        }
        if (!self.socket.connected){
            self.cw.mostrarMensaje("Connecting...", "info");
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
    let cadena = '<div class="card p-4 mt-3"><h4>Game ' + partida.id + '</h4>';
    cadena += '<p>Players: ' + partida.jugadores.join(" vs ") + '</p>';
    cadena += '<div class="row"><div class="col-md-3">';
    // Palette
    cadena += '<h6>Block palette (click to add)</h6>';
    cadena += '<div id="paleta">';
    BLOCK_PALETTE.forEach(function(b){
        cadena += '<div class="block-palette" data-type="' + b.type + '" style="background:' + b.color + ';" draggable="true">' + b.label + '</div>';
    });
    cadena += '</div>';
    cadena += '</div><div class="col-md-5">';
    // Workspace
    cadena += '<h6>Your program (click palette to add, X to remove)</h6>';
    cadena += '<div id="workspace" style="min-height:200px;border:2px dashed #ccc;padding:10px;background:#f8f9fa;border-radius:6px;"></div>';
    cadena += '<div class="mt-2">';
    cadena += '<button id="btnProbar" class="btn btn-info btn-sm">Test</button>';
    cadena += '<button id="btnEnviar" class="btn btn-success btn-sm ml-1">Send program</button>';
    cadena += '<button id="btnLimpiar" class="btn btn-danger btn-sm ml-1">Clear</button>';
    cadena += '</div>';
    cadena += '<p id="estadoPrograma" class="mt-2 text-muted small"></p>';
    cadena += '<div id="timerDisplay" class="mt-1 text-warning font-weight-bold" style="display:none;"></div>';
    cadena += '<div id="previewLaberinto" class="mt-2"></div>';
    cadena += '</div><div class="col-md-4">';
    cadena += this.renderizarLaberinto(null, null);
    cadena += '<p class="text-muted mt-2 small">Legend: blue = player 1 start, red = player 2 start, green = exit, yellow = test path</p>';
    cadena += '</div></div></div>';
    $("#contenido").html(cadena);

    this.renderWorkspace();

    // Palette click to add
    $(".block-palette").on("click", function(){
        let type = $(this).data("type");
        let blk = self.crearBloque(type);
        self.workspace.push(blk);
        self.renderWorkspace();
    });

    // Drag and drop from palette to workspace
    $(".block-palette").attr("draggable", "true").on("dragstart", function(e){
        e.originalEvent.dataTransfer.setData("text/plain", $(this).data("type"));
        e.originalEvent.dataTransfer.effectAllowed = "copy";
    });

    $("#workspace").on("dragover", function(e){
        e.preventDefault();
        e.originalEvent.dataTransfer.dropEffect = "copy";
        $(this).css("background", "#e8f4fd");
    }).on("dragleave", function(){
        $(this).css("background", "#f8f9fa");
    }).on("drop", function(e){
        e.preventDefault();
        $(this).css("background", "#f8f9fa");
        let type = e.originalEvent.dataTransfer.getData("text/plain");
        if (type && BLOCK_PALETTE.find(function(b){ return b.type === type; })){
            let blk = self.crearBloque(type);
            self.workspace.push(blk);
            self.renderWorkspace();
        }
    });

    $("#btnLimpiar").on("click", function(){
        self.workspace = [];
        self.renderWorkspace();
        $("#previewLaberinto").html("");
    });

    $("#btnProbar").on("click", function(){
        self.probarBloques();
    });

    $("#btnEnviar").on("click", function(){
        let codigo = self.bloquesACodigo(self.workspace);
        if (!self.usuario){
            self.cw.mostrarMensaje("You must log in to send a program", "warning");
            return;
        }
        if (!self.socket.connected){
            self.cw.mostrarMensaje("Connecting...", "info");
            self.socket.connect();
        }
        self.socket.emit("identificar", self.usuario.email);
        self.socket.emit("programar", { id: partida.id, codigo: codigo });
    });
};

JuegoWeb.prototype.renderWorkspace = function(){
    let self = this;
    let html = "";
    if (this.workspace.length === 0){
        html = '<div class="text-muted small">Click a block from the palette to add it here.</div>';
    } else {
        this.workspace.forEach(function(blk){
            html += self.renderBloque(blk, 0);
        });
    }
    $("#workspace").html(html);

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

    $(".block-del").on("click", function(){
        let id = $(this).data("id");
        self.eliminarBloque(self.workspace, id);
        self.renderWorkspace();
    });
};

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

JuegoWeb.prototype.probarBloques = function(){
    let self = this;
    let codigo = this.bloquesACodigo(this.workspace);
    let comandos = this.parsearCodigoCliente(codigo);
    let pos = [1, 1];
    let path = [pos.slice()];
    let step = 0;

    // Clear any previous animation
    if (this.animTimer){ clearInterval(this.animTimer); }

    // Render initial state
    this.renderizarLaberintoAnimado(pos, path, null);

    if (comandos.length === 0){
        $("#previewLaberinto").html('<p class="text-warning small">No hay movimientos para probar.</p>');
        return;
    }

    let self2 = this;
    this.animTimer = setInterval(function(){
        if (step >= comandos.length){
            clearInterval(self2.animTimer);
            self2.animTimer = null;
            // Final render
            let finalPos = path[path.length - 1];
            let html = self2.renderizarLaberinto(pos, null, path, null);
            html += '<p class="small mt-1">Pasos: ' + comandos.length + ' | Posición final: (' + finalPos[0] + ', ' + finalPos[1] + ')</p>';
            if (finalPos[0] === EXIT[0] && finalPos[1] === EXIT[1]){
                html += '<p class="text-success small">¡Llega a la salida!</p>';
            } else {
                html += '<p class="text-warning small">No llega a la salida.</p>';
            }
            $("#previewLaberinto").html(html);
            return;
        }
        let dir = comandos[step];
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
        step++;

        // Render with current position highlighted
        let html = self2.renderizarLaberinto(pos, null, path, pos);
        html += '<p class="small mt-1">Paso ' + step + '/' + comandos.length + ' | Posición: (' + pos[0] + ', ' + pos[1] + ')</p>';
        $("#previewLaberinto").html(html);
    }, 400);
};

JuegoWeb.prototype.renderizarLaberintoAnimado = function(pos, path, current){
    // Alias for renderizarLaberinto
    return this.renderizarLaberinto(pos, null, path, current);
};

JuegoWeb.prototype.mostrarResultado = function(resultado){
    let self = this;
    let cadena = '<div class="card p-4 mt-3"><h4>Result</h4>';
    if (resultado.ganador){
        cadena += '<p class="text-success font-weight-bold">Winner: ' + this.escapar(resultado.ganador) + '</p>';
        cadena += '<p>Reason: ' + this.escapar(resultado.razon) + '</p>';
    } else {
        cadena += '<p class="text-warning">Draw</p>';
    }
    cadena += '<p>Commands used:</p><ul>';
    for (let email in resultado.comandos){
        cadena += '<li>' + this.escapar(email) + ': ' + resultado.comandos[email] + '</li>';
    }
    cadena += '</ul>';
    cadena += this.renderizarLaberinto(
        resultado.posicionesFinales[self.partidaActual.jugadores[0]],
        resultado.posicionesFinales[self.partidaActual.jugadores[1]]
    );
    cadena += '<button id="btnVolverLobby" class="btn btn-primary mt-2">Back to lobby</button>';
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
    let html = '<table class="table table-sm"><thead><tr><th>ID</th><th>Creator</th><th>Players</th><th>Status</th><th></th></tr></thead><tbody>';
    if (!lista || lista.length === 0){
        html += '<tr><td colspan="5" class="text-muted">No games. Create one.</td></tr>';
    }
    lista.forEach(function(p){
        html += '<tr>';
        html += '<td>' + p.id + '</td>';
        html += '<td>' + p.creador + '</td>';
        html += '<td>' + p.jugadores.join(", ") + '</td>';
        html += '<td>' + p.estado + '</td>';
        html += '<td>';
        if (p.estado === "esperando" && p.creador !== self.usuario.email){
            html += '<button class="btn btn-sm btn-success btn-unirse" data-id="' + p.id + '">Join</button> ';
        }
        if (p.estado === "programando" && p.jugadores.indexOf(self.usuario.email) !== -1){
            html += '<button class="btn btn-sm btn-primary btn-jugar" data-id="' + p.id + '">Play</button> ';
        }
        if (self.esAdmin){
            html += '<button class="btn btn-sm btn-danger btn-cancelar" data-id="' + p.id + '">Cancel</button>';
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
            let codigo = ""; // empty code
            if (self.usuario && self.partidaActual){
                if (!self.socket.connected){ self.socket.connect(); }
                self.socket.emit("identificar", self.usuario.email);
                self.socket.emit("programar", { id: self.partidaActual.id, codigo: codigo });
                self.cw.mostrarMensaje("Time's up. Program sent automatically.", "warning");
            }
        } else {
            $("#timerDisplay").text("Time remaining: " + segundos + "s");
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
        $("#timerDisplay").show().text("Time remaining: " + data.segundos + "s (other player sent their program)");
        juego.iniciarTimer(data.segundos);
    });
    juego.socket.on("timerTick", function(data){
        $("#timerDisplay").text("Time remaining: " + data.segundos + "s");
        if (data.segundos <= 0){
            $("#timerDisplay").hide();
        }
    });
    juego.socket.on("partidaCancelada", function(data){
        juego.cw.mostrarMensaje("Game " + data.id + " cancelled", "warning");
        juego.mostrarLobby();
    });
    juego.socket.on("error", function(msg){
        juego.cw.mostrarMensaje(msg, "danger");
    });
}