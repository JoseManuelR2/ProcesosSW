// Capa de presentación de Maze Duel: editor de bloques, laberinto, partidas en
// tiempo real y pantalla de resultado. Las reglas del laberinto vienen de
// /compartido/laberinto.js (global Laberinto), la misma librería que usa el servidor.

const L = window.Laberinto;
const UIJ = window.UI;

const BLOQUES = [
    { tipo: "mv", etiqueta: "move", color: "#4C97FF", param: "right", icono: "arrow-right" },
    { tipo: "repeat", etiqueta: "repeat", color: "#FFAB19", contenedor: true, param: 3, icono: "repeat" },
    { tipo: "while", etiqueta: "while", color: "#FFAB19", contenedor: true, param: "exit visible", icono: "refresh" },
    { tipo: "if", etiqueta: "if", color: "#FF8C1A", contenedor: true, param: "wall", icono: "branch" },
    { tipo: "ifelse", etiqueta: "if/else", color: "#FF8C1A", contenedor: true, param: "wall", conElse: true, icono: "split" }
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

function iconoSVG(nombre, clase){
    return UIJ ? UIJ.icono(nombre, clase) : "";
}

function avatarSVG(email, clase){
    return UIJ ? UIJ.avatar(email, clase) : "";
}

// El servidor devuelve el motivo en español; las pantallas del juego están en inglés.
function traducirRazon(razon){
    let texto = String(razon || "");
    if (texto.indexOf("empate") !== -1){ return "Both robots tied"; }
    if (texto.indexOf("más cerca") !== -1){ return "Closest robot to the exit"; }
    if (texto.indexOf("llegó") !== -1){ return "First robot to reach the exit"; }
    return texto;
}

// Los niveles se generan con un nombre tipo "Random 15×15"; en la interfaz
// preferimos la dificultad ("Small", "Medium", "Large").
function nombreNivel(nivel){
    let d = nivel && L.DIFICULTADES[nivel.dificultad];
    return d ? d.nombre : ((nivel && nivel.nombre) || "Maze");
}

function leyendaTablero(){
    return '<div class="maze-legend">' +
        '<span class="legend-item"><span class="legend-swatch" style="background:#2563eb;"></span>You</span>' +
        '<span class="legend-item"><span class="legend-swatch" style="background:#dc2626;"></span>Rival</span>' +
        '<span class="legend-item"><span class="legend-swatch" style="background:#059669;"></span>Exit</span>' +
        '<span class="legend-item"><span class="legend-swatch" style="background:#101827;"></span>Wall</span>' +
        '<span class="legend-item"><span class="legend-swatch" style="background:#dbeafe;"></span>Ice</span>' +
        '<span class="legend-item"><span class="legend-swatch" style="background:#fee2e2;"></span>Trap</span>' +
        '<span class="legend-item"><span class="legend-swatch" style="background:#ede9fe;"></span>Teleport</span>' +
        '<span class="legend-item"><span class="legend-swatch" style="background:#dcfce7;"></span>Arrow</span>' +
        '</div>';
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
        .on("click", "#btnLimpiar", function(){
            self.workspace.children = [];
            self.renderWorkspace();
            $("#previewLaberinto").empty();
            $("#estadoPrograma").removeClass("success").empty();
        })
        .on("click", "#btnVolverLobby", function(){ self.mostrarLobby(); self.socket.emit("solicitarLista"); })
        .on("change", "#dificultad", function(){
            let d = L.DIFICULTADES[$(this).val()] || L.DIFICULTADES.mediano;
            $("#mapPreviewName").text(d.nombre + " maze");
            $("#mapPreviewMeta").text(d.filas + "×" + d.columnas + " tiles · special tiles included");
            $("#mapPreviewSize").text(d.filas + "×" + d.columnas);
        })
        .on("click", ".block-del", function(e){
            e.stopPropagation();
            self.quitarBloque($(this).data("id"));
            self.renderWorkspace();
        })
        .on("click", ".block-palette", function(){
            self.workspace.children.push(self.crearBloque($(this).data("tipo")));
            self.renderWorkspace();
        })
        .on("click", ".block-not", function(e){
            e.stopPropagation();
            let blk = self.buscarBloque($(this).data("id"));
            if (!blk){ return; }
            blk.negada = !blk.negada;
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
        })
        .on("change", ".block-dir", function(){
            let blk = self.buscarBloque($(this).data("id"));
            if (blk){ blk.dir = $(this).val(); }
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
    if (this.cw.marcarNav){ this.cw.marcarNav("navJuego"); }

    let opciones = Object.keys(L.DIFICULTADES).map(function(clave){
        let d = L.DIFICULTADES[clave];
        return '<option value="' + d.id + '"' + (d.id === "mediano" ? " selected" : "") + '>' +
            escapar(d.nombre) + ' (' + d.filas + '×' + d.columnas + ')</option>';
    }).join("");

    let html = '<div class="lobby">' +
        '<header class="page-head lobby-head">' +
        '<div>' +
        '<h1>Game lobby</h1>' +
        '<p>Create a room or join an open game.</p>' +
        '</div></header>' +

        '<div class="lobby-grid">' +
        '<section class="panel create-panel">' +
        '<div class="panel-head"><div><h2>Create a game</h2></div></div>' +
        '<div class="form-group"><label for="dificultad">Map size</label>' +
        '<select id="dificultad" class="form-control">' + opciones + '</select></div>' +
        '<div class="map-preview" id="mapPreview">' +
        '<span class="map-preview-icon">' + iconoSVG("grid") + '</span>' +
        '<div><strong id="mapPreviewName">Medium maze</strong><span id="mapPreviewMeta">15×15 tiles · special tiles included</span></div>' +
        '<span class="count-pill" id="mapPreviewSize">15×15</span></div>' +
        '<div class="create-actions">' +
        '<button id="btnCrearPartida" class="btn btn-primary btn-lg" type="button">' + iconoSVG("plus") + ' Create game</button>' +
        '<button id="btnRefrescar" class="btn btn-secondary" type="button">' + iconoSVG("refresh") + ' Refresh</button>' +
        '</div></section>' +
        '<section class="panel">' +
        '<div class="panel-head"><div><h2>Open games</h2></div>' +
        '<span class="count-pill" id="contadorPartidas">—</span></div>' +
        '<div id="listaPartidas" class="game-list"></div>' +
        '</section></div></div>';

    $("#contenido").html(html);
};

JuegoWeb.prototype.crearPartida = function(){
    if (!this.usuario){
        this.cw.mostrarMensaje("You must log in to create a game", "warning");
        return;
    }
    this.socket.emit("crearPartida", { dificultad: $("#dificultad").val() });
};

JuegoWeb.prototype.actualizarListaPartidas = function(lista){
    if (this.vista !== "lobby" || !this.usuario){ return; }
    let self = this;
    let juegos = lista || [];

    if ($("#contadorPartidas").length){
        $("#contadorPartidas").text(juegos.length + (juegos.length === 1 ? " game" : " games"));
    }

    if (juegos.length === 0){
        $("#listaPartidas").html('<div class="empty-state">' + iconoSVG("gamepad") +
            '<strong>No open games yet</strong><span>Create the first room and invite a rival — or wait for the bot.</span></div>');
        return;
    }

    let html = "";
    juegos.forEach(function(p){
        let nivel = p.nivel || {};
        let estado = String(p.estado || "");
        let soyParticipante = p.jugadores.indexOf(self.usuario.email) !== -1;
        let estadoTexto = { esperando: "waiting", programando: "programming", terminada: "finished" }[estado] || estado;
        let estadoIcono = { esperando: "clock", programando: "robot", terminada: "flag" }[estado] || "info";

        html += '<article class="game-card">';
        html += '<div class="game-card-head"><span class="game-id">#' + escapar(p.id) + '</span>' +
            '<span class="status-pill status-' + escapar(estado) + '">' + iconoSVG(estadoIcono) + ' ' + escapar(estadoTexto) + '</span></div>';
        html += '<h3>' + escapar(nombreNivel(nivel)) + ' maze</h3>';
        html += '<div class="game-meta"><strong>' + (nivel.filas || "?") + '×' + (nivel.columnas || "?") + '</strong></div>';

        html += '<div class="game-players">';
        p.jugadores.forEach(function(email, i){
            let tu = email === self.usuario.email;
            let bot = email === "bot@maze.local";
            let claseAvatar = bot ? "avatar-bot" : (i === 0 ? "avatar-p1" : "avatar-p2");
            html += '<span class="player-chip' + (tu ? " you" : "") + '">' +
                avatarSVG(email, "avatar-sm " + claseAvatar) +
                '<span class="player-email">' + escapar(bot ? "Bot" : email) + (tu ? " (you)" : "") + '</span></span>';
        });
        if (p.jugadores.length < 2 && estado === "esperando"){
            html += '<span class="player-chip empty">' + avatarSVG("?", "avatar-sm") +
                '<span class="player-email">Waiting for rival</span></span>';
        }
        html += '</div>';

        html += '<div class="game-actions">';
        if (estado === "esperando" && !soyParticipante){
            html += '<button class="btn btn-success btn-unirse" type="button" data-id="' + escapar(p.id) + '">' +
                iconoSVG("arrow-right") + ' Join game</button>';
        }
        if (estado === "programando" && soyParticipante){
            html += '<button class="btn btn-primary btn-jugar" type="button" data-id="' + escapar(p.id) + '">' +
                iconoSVG("play") + ' Play</button>';
        }
        if (self.esAdmin){
            html += '<button class="btn btn-ghost-danger btn-cancelar" type="button" data-id="' + escapar(p.id) + '">' +
                iconoSVG("x") + ' Cancel</button>';
        }
        html += '</div></article>';
    });
    $("#listaPartidas").html(html);
};

// --- Editor de bloques ---

JuegoWeb.prototype.abrirEditor = function(partida){
    this.detenerAnimacion();
    // Cada partida empieza con el programa vacío (no se arrastra el de la anterior).
    this.workspace.children = [];
    this.partidaActual = partida;
    this.vista = "editor";
    this.cw.limpiarMensaje();
    if (this.cw.marcarNav){ this.cw.marcarNav("navJuego"); }

    let nivel = partida.nivel || {};
    let indice = this.miIndice();
    let paleta = "";
    BLOQUES.forEach(function(b){
        paleta += '<div class="block-palette" draggable="true" data-tipo="' + b.tipo + '" style="background:' + b.color + ';" title="' + escapar(b.etiqueta) + '">' +
            iconoSVG(b.icono || "grid") + '<span>' + escapar(b.etiqueta) + '</span></div>';
    });

    let html = '<div class="game-editor">' +
        '<div class="game-topbar">' +
        '<button id="btnVolverLobby" class="btn btn-ghost btn-icon" type="button">' + iconoSVG("arrow-left") + '<span>Lobby</span></button>' +
        '<div class="game-title"><span class="eyebrow">' + iconoSVG("gamepad") + ' Maze Duel</span>' +
        '<h1>Game <span class="game-id">#' + escapar(partida.id) + '</span></h1></div>' +
        '<div class="game-chips">' +
        '<span class="chip">' + iconoSVG("map") + ' ' + escapar(nombreNivel(nivel)) + '</span>' +
        '<span class="chip">' + iconoSVG("grid") + ' ' + (nivel.filas || "?") + '×' + (nivel.columnas || "?") + '</span>' +
        '</div></div>' +

        '<div id="identityBanner" class="identity-banner ' + (indice === 0 ? "identity-blue" : "identity-red") + '">' +
        this.textoIdentidad() + '</div>' +
        '<p id="estadoPartida" class="status-note" role="status"></p>' +

        '<div class="editor-grid">' +
        '<section class="panel">' +
        '<div class="panel-head"><h2>Blocks</h2><span class="chip" id="contadorBloques">0 / ' + L.LIMITES.bloques + '</span></div>' +
        '<div id="paleta" class="palette">' + paleta + '</div>' +
        '' +
        '</section>' +

        '<section class="panel">' +
        '<div class="panel-head"><div><h2>Your program</h2><p>Build the route, test it, then send it.</p></div>' +
        '<span class="chip" id="contadorPrograma">0 / ' + L.LIMITES.bloques + '</span></div>' +
        '<div id="workspace" class="workspace drop-zone" data-padre="' + RAIZ + '" data-lista="hijos"></div>' +
        '<div class="editor-actions">' +
        '<button id="btnProbar" class="btn btn-info" type="button">' + iconoSVG("play") + ' Test</button>' +
        '<button id="btnEnviar" class="btn btn-success" type="button">' + iconoSVG("send") + ' Send program</button>' +
        '<button id="btnLimpiar" class="btn btn-ghost-danger" type="button">' + iconoSVG("trash") + ' Clear</button>' +
        '</div>' +
        '<p id="estadoPrograma" class="status-note" role="status"></p>' +
        '<div id="timerDisplay" class="timer-pill" style="display:none;"></div>' +
        '<div id="previewLaberinto" class="preview-panel"></div>' +
        '</section>' +

        '<section class="panel maze-panel">' +
        '<div class="panel-head"><h2>Maze</h2><span class="chip">' + iconoSVG("flag") + ' Exit</span></div>' +
        '<div class="maze-wrap">' + this.renderizarLaberinto(nivel, { inicios: [indice] }) + '</div>' +
        leyendaTablero() +
        '</section></div></div>';

    $("#contenido").html(html);
    this.renderWorkspace();
    this.actualizarEstadoEditor();
};

JuegoWeb.prototype.actualizarEstadoEditor = function(){
    let p = this.partidaActual;
    if (!p || this.vista !== "editor"){ return; }
    let esperando = p.estado === "esperando";
    $("#estadoPartida").html(iconoSVG(esperando ? "clock" : "info") + ' ' + (esperando
        ? "Waiting for an opponent… A bot will join in 30 s."
        : "Send your program when ready. The round ends when both players send theirs."));
    $("#btnEnviar").prop("disabled", p.estado !== "programando");
};

JuegoWeb.prototype.crearBloque = function(tipo){
    let pal = buscarPaleta(tipo);
    let blk = { id: "b" + (++this.contadorBloques), tipo: tipo, param: pal.param, children: [] };
    // Las condiciones llevan una dirección aparte para mirar la casilla vecina.
    if (tipo === "while" || tipo === "if" || tipo === "ifelse"){ blk.dir = "right"; }
    if (pal.conElse){ blk.elseChildren = []; }
    return blk;
};

JuegoWeb.prototype.renderWorkspace = function(){
    $("#workspace").html(this.renderLista(this.workspace.children, RAIZ, "hijos"));
    $("#workspace").attr("data-padre", RAIZ).attr("data-lista", "hijos");
    this.actualizarContadores();
};

JuegoWeb.prototype.contarBloques = function(lista){
    let self = this;
    return (lista || []).reduce(function(total, blk){
        return total + 1 + self.contarBloques(blk.children) + self.contarBloques(blk.elseChildren || []);
    }, 0);
};

JuegoWeb.prototype.actualizarContadores = function(){
    let texto = this.contarBloques(this.workspace.children) + " / " + L.LIMITES.bloques;
    if ($("#contadorPrograma").length){ $("#contadorPrograma").text(texto); }
    if ($("#contadorBloques").length){ $("#contadorBloques").text(texto); }
};

JuegoWeb.prototype.renderLista = function(lista, padreId, nombreLista){
    let self = this;
    let html = "";
    lista.forEach(function(blk){ html += self.renderBloque(blk); });
    if (lista.length === 0 && padreId === RAIZ){
        html += '<div class="workspace-empty">' + iconoSVG("grid") +
            '<strong>Drop blocks here</strong><span>Drag from the palette or click a block to append it.</span></div>';
    } else if (lista.length === 0){
        html += '<div class="block-placeholder">drop blocks here</div>';
    }
    return html;
};

// Renderiza un bloque y, si es contenedor, las zonas donde se sueltan bloques dentro.
JuegoWeb.prototype.renderBloque = function(blk){
    let pal = buscarPaleta(blk.tipo);
    let html = '<div class="block-wrap">';
    html += '<div class="block" draggable="true" data-id="' + blk.id + '" style="background:' + pal.color + ';">';
    html += iconoSVG(pal.icono || "grid");
    html += '<span class="block-label">' + escapar(pal.etiqueta) + '</span>';
    html += this.renderParametro(blk);
    html += '<button type="button" class="block-del" data-id="' + blk.id + '" title="Delete block" aria-label="Delete block">&times;</button></div>';
    if (pal.contenedor){
        html += '<div class="drop-zone block-children" data-padre="' + blk.id + '" data-lista="hijos">';
        html += this.renderLista(blk.children, blk.id, "hijos") + '</div>';
    }
    if (pal.conElse){
        html += '<div class="block-else-label">else</div>';
        html += '<div class="drop-zone block-children" data-padre="' + blk.id + '" data-lista="otro">';
        html += this.renderLista(blk.elseChildren || [], blk.id, "otro") + '</div>';
    }
    return html + '</div>';
};

JuegoWeb.prototype.renderParametro = function(blk){
    if (blk.tipo === "repeat"){
        return '<input type="number" class="block-param" data-id="' + blk.id + '" value="' + escapar(blk.param) + '" min="1" max="' + L.LIMITES.repeticiones + '" style="width:60px;">';
    }
    let opciones = blk.tipo === "mv" ? DIRECCIONES : L.CONDICIONES;
    // Condición negada: botón "!" a la izquierda del desplegable.
    let html = '';
    if (blk.tipo !== "mv"){
        html += '<button type="button" class="block-not' + (blk.negada ? " active" : "") + '" data-id="' + blk.id +
            '" title="Negate condition (not)">!</button> ';
    }
    html += '<select class="block-param" data-id="' + blk.id + '">';
    opciones.forEach(function(o){
        html += '<option value="' + o + '"' + (blk.param === o ? ' selected' : '') + '>' + o + '</option>';
    });
    html += '</select>';
    if (blk.tipo !== "mv"){
        // Segundo desplegable, al final: hacia dónde mira la condición.
        html += ' <select class="block-dir" data-id="' + blk.id + '">';
        DIRECCIONES.forEach(function(d){
            html += '<option value="' + d + '"' + (blk.dir === d ? ' selected' : '') + '>' + d + '</option>';
        });
        html += '</select>';
    }
    return html;
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
            return { tipo: "while", cond: blk.param, dir: blk.dir, negada: !!blk.negada, cuerpo: self.programa(blk.children) };
        }
        let nodo = { tipo: "if", cond: blk.param, dir: blk.dir, negada: !!blk.negada, cuerpo: self.programa(blk.children) };
        if (blk.tipo === "ifelse"){
            nodo.otro = self.programa(blk.elseChildren || []);
        }
        return nodo;
    });
};

JuegoWeb.prototype.probarPrograma = function(){
    this.detenerAnimacion();
    let nivel = this.partidaActual.nivel;
    let programa = this.programa();
    let error = L.validar(programa);
    if (error){
        $("#previewLaberinto").html('<p class="preview-note preview-error">' + iconoSVG("alert-triangle") + ' ' + escapar(error) + '</p>');
        return;
    }
    let indice = this.miIndice();
    let traza = L.trazar(nivel, nivel.inicios[indice], programa);
    if (traza.camino.length === 0){
        $("#previewLaberinto").html('<p class="preview-note preview-warning">' + iconoSVG("info") + ' Your program does not move the robot.</p>');
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
        html += '<p class="preview-caption">' + iconoSVG("play") + ' Step ' + paso + ' / ' + traza.camino.length + '</p>';
        if (paso >= traza.camino.length){
            self.detenerAnimacion();
            html += traza.llega
                ? '<p class="preview-note preview-success">' + iconoSVG("check") + ' Reaches the exit!</p>'
                : '<p class="preview-note preview-warning">' + iconoSVG("flag") + ' Does not reach the exit.</p>';
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
    let urgente = Number(segundos) <= 5;
    $("#timerDisplay")
        .show()
        .toggleClass("timer-urgent", urgente)
        .html(iconoSVG("clock") + ' Time remaining: ' + escapar(segundos) + ' s');
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
    $("#estadoPrograma")
        .addClass("success")
        .html(iconoSVG("check") + ' Program accepted: your robot will make ' + escapar(comandos) +
            ' moves. Waiting for the other player…');
};

// --- Resultado ---

JuegoWeb.prototype.mostrarResultado = function(resultado){
    this.detenerAnimacion();
    this.vista = "resultado";
    this.cw.limpiarMensaje();
    if (this.cw.marcarNav){ this.cw.marcarNav("navJuego"); }

    let self = this;
    let nivel = resultado.nivel;
    let jugadores = resultado.jugadores;
    let miIndice = this.usuario ? jugadores.indexOf(this.usuario.email) : -1;
    if (miIndice === -1){ miIndice = 0; }

    let empate = !resultado.ganador;
    let gane = !empate && !!this.usuario && resultado.ganador === this.usuario.email;
    let clase = empate ? "result-draw" : (gane ? "result-win" : "result-lose");
    let iconoResultado = empate ? "flag" : (gane ? "trophy" : "x");
    let titulo = empate ? "Draw" : (gane ? "You win!" : "You lose");
    let subtitulo = empate
        ? "Neither robot claimed the exit this time."
        : (gane ? "Your robot crossed the line first." : "Your rival got there first this time.");

    let html = '<div class="result-page">' +
        '<header class="result-hero ' + clase + '">' +
        '<div class="result-icon">' + iconoSVG(iconoResultado) + '</div>' +
        '<span class="eyebrow">' + iconoSVG("flag") + ' Match result</span>' +
        '<h1>' + titulo + '</h1>' +
        '<p>' + subtitulo + '</p>' +
        '</header>' +

        '<div class="result-grid">' +
        '<section class="panel">' +
        '<div class="panel-head"><div><h2>Players</h2><p>Moves used before the round ended.</p></div>' +
        '<span class="chip">' + iconoSVG("users") + ' ' + jugadores.length + ' players</span></div>' +
        '<div class="score-list">';

    jugadores.forEach(function(email, i){
        let tu = i === miIndice;
        let ganoEste = resultado.ganador === email;
        let movimientos = resultado.comandos && resultado.comandos[email] !== undefined ? resultado.comandos[email] : 0;
        html += '<div class="score-row' + (ganoEste ? " winner" : "") + '">' +
            avatarSVG(email, "avatar-p" + (i + 1)) +
            '<div class="score-main"><strong>' + escapar(email === "bot@maze.local" ? "Bot" : email) + (tu ? " (you)" : "") + '</strong>' +
            '<span>Player ' + (i + 1) + ' · ' + (i === 0 ? "Blue" : "Red") + '</span></div>' +
            '<span class="score-moves">' + iconoSVG("flag") + ' ' + escapar(movimientos) + ' moves</span></div>';
    });

    html += '</div>' +
        '<div class="result-actions"><button id="btnVolverLobby" class="btn btn-primary btn-lg" type="button">' +
        iconoSVG("arrow-left") + ' Back to lobby</button></div>' +
        '</section>' +

        '<section class="panel">' +
        '<div class="panel-head"><div><h2>Final board</h2><p>Both robots at the end of the round.</p></div>' +
        '<span class="chip">' + iconoSVG("flag") + ' Exit</span></div>' +
        '<div id="tableroResultado"></div>' +
        '<div class="maze-legend">' +
        '<span class="legend-item"><span class="legend-swatch" style="background:linear-gradient(135deg,#2563eb,#60a5fa);"></span>You</span>' +
        '<span class="legend-item"><span class="legend-swatch" style="background:linear-gradient(135deg,#e11d48,#fb7185);"></span>Rival</span>' +
        '<span class="legend-item"><span class="legend-swatch" style="background:linear-gradient(135deg,#059669,#34d399);"></span>Exit</span>' +
        '</div>' +
        '</section></div></div>';

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
        let finales = resultado.posicionesFinales || {};
        return dibujar({
            posiciones: [
                finales[jugadores[0]] || nivel.inicios[0],
                finales[jugadores[1]] || nivel.inicios[1]
            ]
        });
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
    let html = '<div class="maze-grid" role="img" aria-label="Maze" style="grid-template-columns:repeat(' + nivel.columnas + ', minmax(0, 1fr));">';
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
                    if (igual(celda, nivel.inicios[indice])){
                        cls += indice === 0 ? " maze-start" : " maze-start2";
                    }
                });
                if (tipo === "H"){ cls += " maze-hielo"; simbolo = "❄"; }
                if (tipo === "T"){ cls += " maze-trampa"; simbolo = "✖"; }
                if (tipo === "P"){ cls += " maze-teleport"; simbolo = "◎"; }
                if (tipo === "^"){ cls += " maze-arrow"; simbolo = "↑"; }
                if (tipo === "v"){ cls += " maze-arrow"; simbolo = "↓"; }
                if (tipo === "<"){ cls += " maze-arrow"; simbolo = "←"; }
                if (tipo === ">"){ cls += " maze-arrow"; simbolo = "→"; }
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
    return '<span class="identity-icon">' + iconoSVG("robot") + '</span>' +
        '<div><strong>You are Player ' + (indice + 1) + ' · ' + (indice === 0 ? "Blue" : "Red") + '</strong>' +
        '<span>Start: ' + esquina + ' (' + color + '). Rival start: ' + rival + ', hidden.</span></div>';
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
