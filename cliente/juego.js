// Capa de presentación de Maze Duel: editor de bloques, laberinto, partidas en
// tiempo real y pantalla de resultado. Las reglas del laberinto vienen de
// /compartido/laberinto.js (global Laberinto), la misma librería que usa el servidor.

const L = window.Laberinto;

const BLOQUES = [
    { tipo: "mv", etiqueta: "move", color: "#4C97FF", param: "right" },
    { tipo: "repeat", etiqueta: "repeat", color: "#FFAB19", contenedor: true, param: 3 },
    { tipo: "while", etiqueta: "while", color: "#FFAB19", contenedor: true, param: "not exit" },
    { tipo: "if", etiqueta: "if", color: "#FF8C1A", contenedor: true, param: "wall right" },
    { tipo: "ifelse", etiqueta: "if/else", color: "#FF8C1A", contenedor: true, param: "wall right", conElse: true }
];

const DIRECCIONES = Object.keys(L.DIRECCIONES);
const RAIZ = "raiz";
const MS_PASO_ANIMACION = 350;

function buscarPaleta(tipo){
    return BLOQUES.find(function(b){ return b.tipo === tipo; }) || null;
}

function escapar(texto){
    return String(texto).replace(/[&<>"']/g, function(c){
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
}

function JuegoWeb(cw, socket){
    this.cw = cw;
    this.socket = socket;
    this.usuario = null;
    this.esAdmin = false;
    this.partidaActual = null;
    this.vista = "ninguna";
    this.contadorBloques = 0;
    this.workspace = { id: RAIZ, tipo: "raiz", children: [] };
    this.animacion = null;
    this.registrarEventos();
}

JuegoWeb.prototype.registrarEventos = function(){
    let self = this;

    // Eventos de la vista (el contenido se redibuja, por eso se delegan en #contenido).
    $("#contenido")
        .on("click", "#btnCrearPartida", function(){ self.crearPartida(); })
        .on("click", "#btnRefrescar", function(){ self.socket.emit("solicitarLista"); })
        .on("click", ".btn-unirse, .btn-jugar", function(){ self.socket.emit("unirsePartida", { id: $(this).data("id") }); })
        .on("click", ".btn-cancelar", function(){ self.socket.emit("cancelarPartida", { id: $(this).data("id") }); })
        .on("click", "#btnProbar", function(){ self.probarPrograma(); })
        .on("click", "#btnEnviar", function(){ self.enviarPrograma(); })
        .on("click", "#btnLimpiar", function(){ self.workspace.children = []; self.renderWorkspace(); $("#previewLaberinto").empty(); })
        .on("click", "#btnVolverLobby", function(){ self.mostrarLobby(); self.socket.emit("solicitarLista"); })
        .on("click", ".block-del", function(e){
            e.stopPropagation();
            self.quitarBloque($(this).data("id"));
            self.renderWorkspace();
        })
        .on("click", ".block-palette", function(){
            self.workspace.children.push(self.crearBloque($(this).data("tipo")));
            self.renderWorkspace();
        })
        .on("change", ".block-param", function(){
            let blk = self.buscarBloque($(this).data("id"));
            if (!blk){ return; }
            if (blk.tipo === "repeat"){
                let n = parseInt($(this).val(), 10);
                blk.param = isNaN(n) ? 1 : Math.min(Math.max(n, 1), L.LIMITES.repeticiones);
                $(this).val(blk.param);
            } else {
                blk.param = $(this).val();
            }
        });

    // Arrastrar y soltar. Los manejadores están en document una sola vez.
    $(document)
        .on("dragstart", ".block-palette", function(e){
            self.iniciarArrastre(e, "nuevo:" + $(this).data("tipo"));
        })
        .on("dragstart", ".block", function(e){
            e.stopPropagation();
            self.iniciarArrastre(e, "mover:" + $(this).data("id"));
        })
        .on("dragover", ".drop-zone", function(e){
            e.preventDefault();
            e.stopPropagation();
            e.originalEvent.dataTransfer.dropEffect = "move";
            $(this).addClass("drop-zone-activa");
        })
        .on("dragleave", ".drop-zone", function(){
            $(this).removeClass("drop-zone-activa");
        })
        .on("drop", ".drop-zone", function(e){
            e.preventDefault();
            e.stopPropagation();
            $(this).removeClass("drop-zone-activa");
            let datos = e.originalEvent.dataTransfer.getData("text/plain");
            self.soltar(datos, $(this).data("padre"), $(this).data("lista"));
        });
};

JuegoWeb.prototype.iniciarArrastre = function(e, datos){
    e.originalEvent.dataTransfer.setData("text/plain", datos);
    e.originalEvent.dataTransfer.effectAllowed = "move";
};

// Se llama al iniciar sesión o cerrarla: el socket solo está conectado con sesión.
JuegoWeb.prototype.iniciar = function(usuario){
    this.usuario = usuario;
    this.esAdmin = !!(usuario && usuario.rol === "administrador");
    if (usuario){
        if (!this.socket.connected){ this.socket.connect(); }
    } else {
        this.socket.disconnect();
        this.partidaActual = null;
        this.vista = "ninguna";
        this.detenerAnimacion();
    }
};

JuegoWeb.prototype.detenerAnimacion = function(){
    if (this.animacion){
        clearInterval(this.animacion);
        this.animacion = null;
    }
};

// --- Lobby ---

JuegoWeb.prototype.mostrarLobby = function(){
    this.detenerAnimacion();
    this.vista = "lobby";
    this.partidaActual = null;
    this.cw.limpiarMensaje();
    let opciones = L.NIVELES.map(function(n){
        return '<option value="' + n.id + '">' + escapar(n.nombre) + '</option>';
    }).join("");
    let html = '<div class="card p-4 mt-3"><h4>Maze Duel</h4>';
    html += '<p class="text-muted">Program your robot with blocks. First to reach the exit wins.</p>';
    html += '<ul class="small text-muted">';
    html += '<li>Ice (❄) slides your robot until the next free square. A trap (✖) sends it back to your start.</li>';
    html += '<li>Max 50 moves per program and 60 blocks.</li>';
    html += '<li>The fastest robot to the exit wins. If nobody arrives, the closest one by path wins.</li>';
    html += '<li>Same number of moves and arrival: draw.</li>';
    html += '<li>After the first program is sent, the other player has 15 seconds. Otherwise their robot stays still.</li>';
    html += '<li>If nobody joins your game within 30 seconds, a bot plays against you.</li>';
    html += '</ul>';
    html += '<div class="form-inline mb-2"><label class="mr-2" for="nivel">Level:</label>';
    html += '<select id="nivel" class="form-control mr-2">' + opciones + '</select>';
    html += '<button id="btnCrearPartida" class="btn btn-primary mr-2">Create game</button>';
    html += '<button id="btnRefrescar" class="btn btn-secondary">Refresh list</button></div>';
    html += '<div id="listaPartidas" class="mt-3"></div>';
    html += '</div>';
    $("#contenido").html(html);
};

JuegoWeb.prototype.crearPartida = function(){
    if (!this.usuario){
        this.cw.mostrarMensaje("You must log in to create a game", "warning");
        return;
    }
    this.socket.emit("crearPartida", { nivel: $("#nivel").val() });
};

JuegoWeb.prototype.actualizarListaPartidas = function(lista){
    if (this.vista !== "lobby" || !this.usuario){ return; }
    let self = this;
    let html = '<table class="table table-sm"><thead><tr><th>ID</th><th>Level</th><th>Creator</th><th>Players</th><th>Status</th><th></th></tr></thead><tbody>';
    if (!lista || lista.length === 0){
        html += '<tr><td colspan="6" class="text-muted">No games. Create one.</td></tr>';
    }
    (lista || []).forEach(function(p){
        let nivel = L.obtenerNivel(p.nivel);
        let soyParticipante = p.jugadores.indexOf(self.usuario.email) !== -1;
        html += '<tr>';
        html += '<td>' + escapar(p.id) + '</td>';
        html += '<td>' + escapar(nivel ? nivel.nombre : p.nivel) + '</td>';
        html += '<td>' + escapar(p.creador) + '</td>';
        html += '<td>' + p.jugadores.map(escapar).join(", ") + '</td>';
        html += '<td>' + escapar(p.estado) + '</td>';
        html += '<td>';
        if (p.estado === "esperando" && !soyParticipante){
            html += '<button class="btn btn-sm btn-success btn-unirse" data-id="' + escapar(p.id) + '">Join</button> ';
        }
        if (p.estado === "programando" && soyParticipante){
            html += '<button class="btn btn-sm btn-primary btn-jugar" data-id="' + escapar(p.id) + '">Play</button> ';
        }
        if (self.esAdmin){
            html += '<button class="btn btn-sm btn-danger btn-cancelar" data-id="' + escapar(p.id) + '">Cancel</button>';
        }
        html += '</td></tr>';
    });
    html += '</tbody></table>';
    $("#listaPartidas").html(html);
};

// --- Editor de bloques ---

JuegoWeb.prototype.abrirEditor = function(partida){
    this.detenerAnimacion();
    this.partidaActual = partida;
    this.vista = "editor";
    this.cw.limpiarMensaje();
    let nivel = L.obtenerNivel(partida.nivel);
    let html = '<div class="card p-4 mt-3"><h4>Game ' + escapar(partida.id) + ' · ' + escapar(nivel.nombre) + '</h4>';
    html += '<p class="mb-1">' + this.textoIdentidad() + '</p>';
    html += '<p id="estadoPartida" class="mb-2"></p>';
    html += '<div class="row"><div class="col-md-3"><h6>Block palette (drag or click)</h6>';
    html += '<div id="paleta" style="display:flex;flex-direction:column;gap:4px;">';
    BLOQUES.forEach(function(b){
        html += '<div class="block-palette" draggable="true" data-tipo="' + b.tipo + '" style="background:' + b.color + ';">' + escapar(b.etiqueta) + '</div>';
    });
    html += '</div></div>';
    html += '<div class="col-md-5"><h6>Your program</h6>';
    html += '<div id="workspace" class="drop-zone" data-padre="' + RAIZ + '" data-lista="hijos" style="min-height:200px;border:2px dashed #ccc;padding:10px;background:#f8f9fa;border-radius:6px;"></div>';
    html += '<div class="mt-2">';
    html += '<button id="btnProbar" class="btn btn-info btn-sm">Test</button> ';
    html += '<button id="btnEnviar" class="btn btn-success btn-sm ml-1">Send program</button> ';
    html += '<button id="btnLimpiar" class="btn btn-danger btn-sm ml-1">Clear</button></div>';
    html += '<p id="estadoPrograma" class="mt-2 small text-muted"></p>';
    html += '<div id="timerDisplay" class="mt-1 text-warning font-weight-bold" style="display:none;"></div>';
    html += '<div id="previewLaberinto" class="mt-2"></div></div>';
    html += '<div class="col-md-4">' + this.renderizarLaberinto(nivel, { inicios: [this.miIndice()] }) + '</div>';
    html += '</div></div>';
    $("#contenido").html(html);
    this.renderWorkspace();
    this.actualizarEstadoEditor();
};

JuegoWeb.prototype.actualizarEstadoEditor = function(){
    let p = this.partidaActual;
    if (!p || this.vista !== "editor"){ return; }
    let texto = p.estado === "esperando"
        ? "Waiting for an opponent. If nobody joins within 30 seconds, a bot plays against you."
        : "Program your robot and send it. The game ends when both programs are in (or when the 15 s timer ends).";
    $("#estadoPartida").text(texto);
    $("#btnEnviar").prop("disabled", p.estado !== "programando");
};

JuegoWeb.prototype.crearBloque = function(tipo){
    let pal = buscarPaleta(tipo);
    let blk = { id: "b" + (++this.contadorBloques), tipo: tipo, param: pal.param, children: [] };
    if (pal.conElse){ blk.elseChildren = []; }
    return blk;
};

JuegoWeb.prototype.renderWorkspace = function(){
    $("#workspace").html(this.renderLista(this.workspace.children, RAIZ, "hijos"));
    $("#workspace").attr("data-padre", RAIZ).attr("data-lista", "hijos");
};

JuegoWeb.prototype.renderLista = function(lista, padreId, nombreLista){
    let self = this;
    let html = "";
    lista.forEach(function(blk){ html += self.renderBloque(blk); });
    if (lista.length === 0 && padreId === RAIZ){
        html += '<div class="text-muted small">Drag or click a block from the palette.</div>';
    } else if (lista.length === 0){
        html += '<div class="block-placeholder">drop here</div>';
    }
    return html;
};

// Renderiza un bloque y, si es contenedor, las zonas donde se sueltan bloques dentro.
JuegoWeb.prototype.renderBloque = function(blk){
    let pal = buscarPaleta(blk.tipo);
    let html = '<div class="block-wrap" style="margin-left:0;">';
    html += '<div class="block" draggable="true" data-id="' + blk.id + '" style="background:' + pal.color + ';">';
    html += '<span class="block-label">' + escapar(pal.etiqueta) + '</span> ';
    html += this.renderParametro(blk);
    html += ' <button class="block-del" data-id="' + blk.id + '">&times;</button></div>';
    if (pal.contenedor){
        html += '<div class="drop-zone block-children" data-padre="' + blk.id + '" data-lista="hijos" style="margin-left:20px;border-left:2px dashed #ccc;padding-left:8px;">';
        html += this.renderLista(blk.children, blk.id, "hijos") + '</div>';
    }
    if (pal.conElse){
        html += '<div class="block-else-label" style="margin-left:20px;font-size:0.8rem;color:#666;">else:</div>';
        html += '<div class="drop-zone block-children" data-padre="' + blk.id + '" data-lista="otro" style="margin-left:20px;border-left:2px dashed #999;padding-left:8px;">';
        html += this.renderLista(blk.elseChildren || [], blk.id, "otro") + '</div>';
    }
    return html + '</div>';
};

JuegoWeb.prototype.renderParametro = function(blk){
    if (blk.tipo === "repeat"){
        return '<input type="number" class="block-param" data-id="' + blk.id + '" value="' + escapar(blk.param) + '" min="1" max="' + L.LIMITES.repeticiones + '" style="width:60px;">';
    }
    let opciones = blk.tipo === "mv" ? DIRECCIONES : L.CONDICIONES;
    let html = '<select class="block-param" data-id="' + blk.id + '">';
    opciones.forEach(function(o){
        html += '<option value="' + o + '"' + (blk.param === o ? ' selected' : '') + '>' + o + '</option>';
    });
    return html + '</select>';
};

JuegoWeb.prototype.buscarBloque = function(id, lista){
    lista = lista || this.workspace.children;
    for (let blk of lista){
        if (blk.id === id){ return blk; }
        let dentro = this.buscarBloque(id, blk.children) || this.buscarBloque(id, blk.elseChildren || []);
        if (dentro){ return dentro; }
    }
    return null;
};

JuegoWeb.prototype.contieneBloque = function(blk, id){
    return blk.children.some(function(h){ return h.id === id || this.contieneBloque(h, id); }, this) ||
        (blk.elseChildren || []).some(function(h){ return h.id === id || this.contieneBloque(h, id); }, this);
};

JuegoWeb.prototype.quitarBloque = function(id, lista){
    lista = lista || this.workspace.children;
    for (let i = 0; i < lista.length; i++){
        if (lista[i].id === id){
            lista.splice(i, 1);
            return true;
        }
        if (this.quitarBloque(id, lista[i].children) || this.quitarBloque(id, lista[i].elseChildren || [])){
            return true;
        }
    }
    return false;
};

// Coloca el bloque (nuevo o existente) en la zona donde se ha soltado.
JuegoWeb.prototype.soltar = function(datos, padreId, lista){
    let separador = datos.indexOf(":");
    if (separador === -1){ return; }
    let accion = datos.slice(0, separador);
    let valor = datos.slice(separador + 1);
    let nodo;

    if (accion === "nuevo"){
        if (!buscarPaleta(valor)){ return; }
        nodo = this.crearBloque(valor);
    } else if (accion === "mover"){
        let existente = this.buscarBloque(valor);
        if (!existente || padreId === valor || this.contieneBloque(existente, padreId)){ return; }
        this.quitarBloque(valor);
        nodo = existente;
    } else {
        return;
    }

    let destino = this.zonaDe(padreId, lista);
    if (!destino){ return; }
    destino.push(nodo);
    this.renderWorkspace();
};

JuegoWeb.prototype.zonaDe = function(padreId, lista){
    if (padreId === RAIZ){ return this.workspace.children; }
    let padre = this.buscarBloque(padreId);
    if (!padre){ return null; }
    if (lista === "otro"){
        padre.elseChildren = padre.elseChildren || [];
        return padre.elseChildren;
    }
    return padre.children;
};

// Convierte los bloques en el árbol JSON que entiende el servidor.
JuegoWeb.prototype.programa = function(lista){
    let self = this;
    lista = lista || this.workspace.children;
    return lista.map(function(blk){
        if (blk.tipo === "mv"){
            return { tipo: "mv", dir: blk.param };
        }
        if (blk.tipo === "repeat"){
            return { tipo: "repeat", n: Number(blk.param), cuerpo: self.programa(blk.children) };
        }
        if (blk.tipo === "while"){
            return { tipo: "while", cond: blk.param, cuerpo: self.programa(blk.children) };
        }
        let nodo = { tipo: "if", cond: blk.param, cuerpo: self.programa(blk.children) };
        if (blk.tipo === "ifelse"){
            nodo.otro = self.programa(blk.elseChildren || []);
        }
        return nodo;
    });
};

JuegoWeb.prototype.probarPrograma = function(){
    this.detenerAnimacion();
    let nivel = L.obtenerNivel(this.partidaActual.nivel);
    let programa = this.programa();
    let error = L.validar(programa);
    if (error){
        $("#previewLaberinto").html('<p class="text-danger small">' + escapar(error) + '</p>');
        return;
    }
    let indice = this.miIndice();
    let traza = L.trazar(nivel, L.INICIOS[indice], programa);
    if (traza.camino.length === 0){
        $("#previewLaberinto").html('<p class="text-warning small">Your program does not move the robot.</p>');
        return;
    }
    let self = this;
    let paso = 0;
    this.animacion = setInterval(function(){
        paso++;
        let recorrido = traza.camino.slice(0, paso);
        let actual = recorrido[recorrido.length - 1];
        let html = self.renderizarLaberinto(nivel, {
            robots: [{ pos: actual, indice: indice }],
            inicios: [indice],
            camino: recorrido,
            actual: actual
        });
        html += '<p class="small mt-1">Step ' + paso + '/' + traza.camino.length + '</p>';
        if (paso >= traza.camino.length){
            self.detenerAnimacion();
            html += traza.llega
                ? '<p class="text-success small">Reaches the exit!</p>'
                : '<p class="text-warning small">Does not reach the exit.</p>';
        }
        $("#previewLaberinto").html(html);
    }, MS_PASO_ANIMACION);
};

JuegoWeb.prototype.enviarPrograma = function(){
    if (!this.usuario){
        this.cw.mostrarMensaje("You must log in to send a program", "warning");
        return;
    }
    let programa = this.programa();
    let error = L.validar(programa);
    if (error){
        this.cw.mostrarMensaje(error, "warning");
        return;
    }
    this.socket.emit("programar", { id: this.partidaActual.id, programa: programa });
};

// --- Temporizador y estado (el servidor es quien controla el tiempo) ---

JuegoWeb.prototype.mostrarTemporizador = function(segundos){
    if (this.vista !== "editor"){ return; }
    $("#timerDisplay").show().text("Time remaining: " + segundos + "s");
};

// --- Partidas en tiempo real ---

JuegoWeb.prototype.recibirPartida = function(partida){
    if (!this.usuario){ return; }
    this.partidaActual = partida;
    if (partida.estado === "terminada" && partida.resultado){
        return this.mostrarResultado(partida.resultado);
    }
    if (partida.estado === "programando" || partida.estado === "esperando"){
        if (this.vista === "editor" && this.partidaActual.id === partida.id){
            this.actualizarEstadoEditor();
        } else {
            this.abrirEditor(partida);
        }
    }
};

JuegoWeb.prototype.mostrarProgramaAceptado = function(comandos){
    if (this.vista !== "editor"){ return; }
    $("#estadoPrograma").text("Program accepted: the robot makes " + comandos + " moves. Waiting for the other player...");
};

// --- Resultado ---

JuegoWeb.prototype.mostrarResultado = function(resultado){
    this.detenerAnimacion();
    this.vista = "resultado";
    this.cw.limpiarMensaje();
    let self = this;
    let nivel = L.obtenerNivel(resultado.nivel);
    let jugadores = resultado.jugadores;
    let miIndice = this.miIndice();
    let html = '<div class="card p-4 mt-3"><h4>Result · ' + escapar(nivel.nombre) + '</h4>';

    if (!resultado.ganador){
        html += '<p class="text-warning font-weight-bold">Draw</p>';
    } else if (this.usuario && resultado.ganador === this.usuario.email){
        html += '<p class="text-success font-weight-bold">You win!</p>';
    } else {
        html += '<p class="text-danger font-weight-bold">Winner: ' + escapar(resultado.ganador) + '</p>';
    }
    html += '<p>Reason: ' + escapar(resultado.razon) + '</p>';
    html += '<p class="mb-1">Moves used:</p><ul>';
    jugadores.forEach(function(email, i){
        let color = i === 0 ? "blue" : "red";
        let tu = i === miIndice ? " (you)" : "";
        html += '<li><span style="color:' + color + ';font-weight:bold;">Player ' + (i + 1) + ' (' + color + ')</span>' +
            escapar(tu) + ': ' + escapar(email) + ' · ' + resultado.comandos[email] + ' moves</li>';
    });
    html += '</ul>';
    html += '<div id="tableroResultado">' + this.renderizarLaberinto(nivel, { inicios: [miIndice] }) + '</div>';
    html += '<p class="small text-muted">Green = exit. Your start square is shown in ' + (miIndice === 0 ? "blue" : "red") + '.</p>';
    html += '<button id="btnVolverLobby" class="btn btn-primary mt-2">Back to lobby</button>';
    html += '</div>';
    $("#contenido").html(html);

    let pasos = resultado.pasos || [];
    let indice = 0;
    let dibujar = function(frame){
        $("#tableroResultado").html(self.renderizarLaberinto(nivel, {
            robots: [{ pos: frame.posiciones[0], indice: 0 }, { pos: frame.posiciones[1], indice: 1 }],
            inicios: [miIndice]
        }));
    };
    if (pasos.length === 0){
        return dibujar({ posiciones: [resultado.posicionesFinales[jugadores[0]], resultado.posicionesFinales[jugadores[1]]] });
    }
    dibujar(pasos[0]);
    this.animacion = setInterval(function(){
        indice++;
        if (indice >= pasos.length){
            self.detenerAnimacion();
            return dibujar(pasos[pasos.length - 1]);
        }
        dibujar(pasos[indice]);
    }, MS_PASO_ANIMACION);
};

// --- Dibujo del laberinto ---

// Índice del jugador (0 = jugador 1, 1 = jugador 2) en la partida actual.
JuegoWeb.prototype.miIndice = function(){
    let indice = this.partidaActual && this.usuario ? this.partidaActual.jugadores.indexOf(this.usuario.email) : -1;
    return indice === -1 ? 0 : indice;
};

// opciones:
//   robots:  [{ pos: [r, c], indice: 0|1 }]  robots a dibujar (azul = jugador 1, rojo = jugador 2)
//   inicios: [indice]                        solo se marca la salida de estos jugadores
//   camino:  [[r, c]]                        ruta a resaltar
//   actual:  [r, c]                          posición del paso actual
JuegoWeb.prototype.renderizarLaberinto = function(nivel, opciones){
    let robots = opciones.robots || [];
    let inicios = opciones.inicios || [];
    let igual = function(a, b){ return !!a && !!b && a[0] === b[0] && a[1] === b[1]; };
    let robotEn = function(celda){
        return robots.find(function(robot){ return igual(robot.pos, celda); }) || null;
    };
    let html = '<div class="maze-grid">';
    for (let r = 0; r < nivel.mapa.length; r++){
        for (let c = 0; c < nivel.mapa[r].length; c++){
            let celda = [r, c];
            let robot = robotEn(celda);
            let tipo = nivel.mapa[r][c];
            let cls = "maze-cell";
            let simbolo = "";
            if (tipo === "1"){ cls += " maze-wall"; }
            else if (igual(celda, nivel.salida)){ cls += " maze-exit"; }
            else {
                inicios.forEach(function(indice){
                    if (igual(celda, L.INICIOS[indice])){
                        cls += indice === 0 ? " maze-start" : " maze-start2";
                    }
                });
                if (tipo === "H"){ cls += " maze-hielo"; simbolo = "❄"; }
                if (tipo === "T"){ cls += " maze-trampa"; simbolo = "✖"; }
            }
            if (opciones.camino && !robot && opciones.camino.some(function(p){ return igual(p, celda); })){
                cls += " maze-path";
            }
            if (igual(celda, opciones.actual)){ cls += " maze-current"; }
            if (robot){ cls += robot.indice === 0 ? " maze-p1" : " maze-p2"; simbolo = robot.indice === 0 ? "1" : "2"; }
            html += '<div class="' + cls + '">' + simbolo + '</div>';
        }
    }
    return html + '</div>';
};

// Texto que explica a cada jugador quién es y de dónde sale.
JuegoWeb.prototype.textoIdentidad = function(){
    let indice = this.miIndice();
    let color = indice === 0 ? "blue" : "red";
    let rival = indice === 0 ? "red" : "blue";
    let esquina = indice === 0 ? "top-left" : "bottom-right";
    return '<span style="color:' + color + ';font-weight:bold;">You are Player ' + (indice + 1) + ' (' + color + ').</span> ' +
        'Your robot starts in the ' + esquina + ' corner, on the ' + color + ' square. ' +
        'The ' + rival + ' square is your opponent\'s start and is not shown.';
};

// --- Socket ---

function configurarSocket(juego){
    let s = juego.socket;
    s.on("connect", function(){
        s.emit("solicitarLista");
    });
    s.on("connect_error", function(err){
        if (juego.usuario){
            juego.cw.mostrarMensaje("No se pudo conectar con el juego: " + err.message, "danger");
        }
    });
    s.on("partidaCreada", function(data){
        juego.abrirEditor(data.partida);
    });
    s.on("partidaActualizada", function(partida){
        juego.recibirPartida(partida);
    });
    s.on("programado", function(data){
        juego.mostrarProgramaAceptado(data.comandos);
    });
    s.on("timerInicio", function(data){
        juego.mostrarTemporizador(data.segundos);
    });
    s.on("timerTick", function(data){
        juego.mostrarTemporizador(data.segundos);
    });
    s.on("resultado", function(resultado){
        juego.mostrarResultado(resultado);
    });
    s.on("listaPartidas", function(lista){
        juego.actualizarListaPartidas(lista);
    });
    s.on("partidaCancelada", function(data){
        juego.cw.mostrarMensaje("Game " + data.id + " cancelled", "warning");
        if (juego.partidaActual && juego.partidaActual.id === data.id){
            juego.mostrarLobby();
            juego.socket.emit("solicitarLista");
        }
    });
    s.on("error", function(msg){
        juego.cw.mostrarMensaje(msg, "danger");
    });
}
