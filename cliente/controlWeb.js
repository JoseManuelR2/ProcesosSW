// Capa de presentación del cliente (componente de visualización).
// Construye el HTML, lo inyecta y captura los eventos. No habla con el servidor:
// para eso usa el objeto global `rest` (ClienteRest).
const UI = window.UI;

function ControlWeb(){
    this.usuario = null;

    // El aviso se puede cerrar desde cualquier pantalla.
    let self = this;
    $(document).on("click", ".app-alert-close", function(){ self.limpiarMensaje(); });

    // Evita inyectar HTML cuando se muestran datos del usuario (p. ej. un email).
    this.escapar = function(texto){
        return String(texto).replace(/[&<>"']/g, function(c){
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    };

    this.limpiarMensaje = function(){
        $("#mensaje").addClass("d-none").empty();
    };

    this.mostrarMensaje = function(texto, tipo){
        console.log(texto);
        let clase = tipo || "info";
        let icono = { success: "check", danger: "alert-triangle", warning: "alert-circle", info: "info" }[clase] || "info";
        $("#mensaje")
            .attr("class", "app-alert app-alert-" + clase)
            .html('<span class="app-alert-icon">' + UI.icono(icono) + '</span>' +
                '<span class="app-alert-text">' + this.escapar(texto) + '</span>' +
                '<button type="button" class="app-alert-close" aria-label="Cerrar aviso">&times;</button>')
            .removeClass("d-none");
    };

    this.cerrarMenu = function(){
        let $menu = $("#navPrincipal");
        if ($menu.hasClass("show")){ $menu.collapse("hide"); }
    };

    this.marcarNav = function(id){
        $("#barra .nav-link").removeClass("active");
        if (id){ $("#" + id).addClass("active"); }
    };

    // --- Barra de navegación (según la sesión y el rol) ---
    this.mostrarBarra = function(usuario){
        let self = this;
        let html = '<a class="navbar-brand" href="#" id="navInicio">' +
            '<span class="brand-mark">' + UI.icono("route") + '</span>' +
            '<span class="brand-name">Procesos<span>SW</span></span></a>' +
            '<button class="navbar-toggler" type="button" data-toggle="collapse" data-target="#navPrincipal" ' +
            'aria-controls="navPrincipal" aria-expanded="false" aria-label="Abrir menú">' +
            '<span class="navbar-toggler-icon"></span></button>' +
            '<div class="collapse navbar-collapse" id="navPrincipal">' +
            '<ul class="navbar-nav mr-auto">';

        if (usuario){
            if (usuario.rol === "administrador"){
                html += '<li class="nav-item"><a class="nav-link" href="#" id="navUsuarios">' + UI.icono("users") + ' Usuarios</a></li>';
            }
            html += '<li class="nav-item"><a class="nav-link" href="#" id="navJuego">' + UI.icono("gamepad") + ' Lobby</a></li>';
            html += '<li class="nav-item"><a class="nav-link" href="#" id="navEliminar">' + UI.icono("trash") + ' Eliminar cuenta</a></li>';
        }

        html += '</ul>';

        if (usuario){
            html += '<div class="nav-user">' + UI.avatar(usuario.email) +
                '<span class="nav-user-meta">' +
                '<span class="nav-user-email">' + this.escapar(usuario.email) + '</span>' +
                '<span class="nav-user-role">' + this.escapar(usuario.rol) + '</span></span>' +
                '<button class="btn btn-ghost btn-icon" id="navSalir" type="button" title="Cerrar sesión">' +
                UI.icono("logout") + '<span class="d-none d-xl-inline">Salir</span></button></div>';
        }

        html += '</div>';
        $("#barra").html(html);

        $("#navInicio").on("click", function(e){
            e.preventDefault();
            self.cerrarMenu();
            if (self.usuario){ self.mostrarInicio(); } else { self.mostrarLogin(); }
        });
        $("#navUsuarios").on("click", function(e){ e.preventDefault(); self.cerrarMenu(); self.mostrarListarUsuarios(); });
        $(document).off("click.navJuego").on("click.navJuego", "#navJuego", function(e){
            e.preventDefault();
            self.cerrarMenu();
            if (window.juegoWeb){
                window.juegoWeb.mostrarLobby();
                window.juegoWeb.socket.emit("solicitarLista");
            }
        });
        $("#navEliminar").on("click", function(e){ e.preventDefault(); self.cerrarMenu(); self.mostrarEliminarUsuario(); });
        $("#navSalir").on("click", function(e){ e.preventDefault(); self.cerrarMenu(); self.cerrarSesion(); });
    };

    // --- Estructura común de las pantallas de acceso ---
    this.layoutAuth = function(opciones){
        return '<div class="auth-layout">' +
            '<section class="auth-panel">' + opciones.contenido + '</section>' +
            '</div>';
    };

    // --- Avisos que llegan en la URL tras confirmar el correo o al volver de Google ---
    this.avisoDesdeUrl = function(params){
        if (params.get("confirmacion") === "ok"){
            return { texto: "Cuenta confirmada. Ya puedes iniciar sesión.", tipo: "success" };
        }
        if (params.get("confirmacion") === "error"){
            return { texto: params.get("motivo") || "No se pudo confirmar la cuenta", tipo: "danger" };
        }
        if (params.get("error") === "google"){
            return { texto: "No se pudo iniciar sesión con Google", tipo: "danger" };
        }
        if (params.get("error") === "google_no_configurado"){
            return { texto: "El inicio con Google no está configurado en el servidor", tipo: "warning" };
        }
        return null;
    };

    // --- Arranque: comprueba la sesión y decide qué mostrar ---
    this.iniciar = function(){
        let self = this;
        let aviso = this.avisoDesdeUrl(new URLSearchParams(window.location.search));
        if (window.history && window.history.replaceState){
            window.history.replaceState(null, "", "/");
        }
        rest.sesion(
            function(usuario){
                self.usuario = usuario;
                self.mostrarInicio();
                self.notificarSesion(usuario);
                if (aviso){ self.mostrarMensaje(aviso.texto, aviso.tipo); }
            },
            function(){
                self.usuario = null;
                self.mostrarLogin();
                self.notificarSesion(null);
                if (aviso){ self.mostrarMensaje(aviso.texto, aviso.tipo); }
            }
        );
    };

    // --- Inicio: se entra directamente al lobby ---
    this.mostrarInicio = function(){
        this.limpiarMensaje();
        this.mostrarBarra(this.usuario);
        this.marcarNav("navJuego");
        if (window.juegoWeb){ window.juegoWeb.mostrarLobby(); }
    };

    // --- Inicio de sesión ---
    this.mostrarLogin = function(){
        this.limpiarMensaje();
        this.mostrarBarra(null);

        let contenido = '<div class="auth-card">' +
            '<div class="auth-card-head"><span class="auth-icon">' + UI.icono("lock") + '</span>' +
            '<div><h2>Iniciar sesión</h2></div></div>' +
            '<form id="formLogin" class="auth-form">' +
            '<div class="field"><label for="email">Email</label>' +
            '<div class="field-control"><span class="field-icon">' + UI.icono("mail") + '</span>' +
            '<input type="email" class="form-control" id="email" placeholder="tu@email.com" autocomplete="email" required></div></div>' +
            '<div class="field"><label for="password">Contraseña</label>' +
            '<div class="field-control"><span class="field-icon">' + UI.icono("lock") + '</span>' +
            '<input type="password" class="form-control" id="password" placeholder="Tu contraseña" autocomplete="current-password" required></div></div>' +
            '<button id="btnLogin" type="submit" class="btn btn-primary btn-lg btn-block">Entrar ' + UI.icono("arrow-right") + '</button>' +
            '</form>' +
            '<div class="divider">o continúa con</div>' +
            '<a id="btnGoogle" href="/auth/google" class="btn btn-google btn-block">' + UI.google() + ' Entrar con Google</a>' +
            '<p class="auth-switch">¿No tienes cuenta? <button type="button" id="btnIrRegistro" class="link-button">Crear una cuenta</button></p>' +
            '</div>';

        $("#contenido").html(this.layoutAuth({ contenido: contenido }));

        let self = this;
        $("#formLogin").on("submit", function(e){
            e.preventDefault();
            let email = String($("#email").val() || "").trim();
            let password = String($("#password").val() || "");
            if (!email || !password){
                self.mostrarMensaje("Introduce tu email y tu contraseña", "warning");
                return;
            }
            rest.login(email, password, function(usuario){
                self.usuario = usuario;
                self.mostrarInicio();
                self.mostrarMensaje("Sesión iniciada como " + usuario.email, "success");
                self.notificarSesion(usuario);
            });
        });
        $("#btnIrRegistro").on("click", function(){ self.mostrarRegistro(); });

        // One Tap es opcional: si falla o no está configurado, el formulario y el
        // botón "Entrar con Google" siguen funcionando.
        rest.configuracionOAuth(function(config){
            if (config && config.googleClientId){
                self.iniciarOneTap(config.googleClientId);
            }
        });
    };

    // --- Google One Tap ---

    this.iniciarOneTap = function(clientId){
        let self = this;

        function iniciar(){
            if (!window.google || !google.accounts || !google.accounts.id){ return; }
            google.accounts.id.initialize({
                client_id: clientId,
                callback: function(respuesta){
                    if (respuesta && respuesta.credential){
                        self.entrarConOneTap(respuesta.credential);
                    }
                },
                auto_select: false,
                cancel_on_tap_outside: true,
                use_fedcm_for_prompt: true
            });
            try{
                google.accounts.id.prompt();
            }
            catch(e){
                console.warn("One Tap no disponible", e);
            }
        }

        if (window.google && google.accounts && google.accounts.id){
            return iniciar();
        }
        if (document.querySelector('script[data-google-gsi]')){
            return;
        }

        // Se carga aquí y no en index.html para no bloquear el arranque de la SPA.
        let script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.setAttribute("data-google-gsi", "1");
        script.onload = iniciar;
        document.head.appendChild(script);
    };

    this.entrarConOneTap = function(credential){
        let self = this;
        rest.oneTap(credential, function(usuario){
            self.usuario = usuario;
            self.mostrarInicio();
            self.mostrarMensaje("Sesión iniciada como " + usuario.email, "success");
            self.notificarSesion(usuario);
        });
    };

    // --- Registro ---
    this.mostrarRegistro = function(){
        this.limpiarMensaje();
        this.mostrarBarra(null);

        let contenido = '<div class="auth-card">' +
            '<div class="auth-card-head"><span class="auth-icon">' + UI.icono("sparkles") + '</span>' +
            '<div><h2>Crear cuenta</h2></div></div>' +
            '<form id="formRegistro" class="auth-form">' +
            '<div class="field"><label for="email">Email</label>' +
            '<div class="field-control"><span class="field-icon">' + UI.icono("mail") + '</span>' +
            '<input type="email" class="form-control" id="email" placeholder="tu@email.com" autocomplete="email" required></div></div>' +
            '<div class="field"><label for="password">Contraseña</label>' +
            '<div class="field-control"><span class="field-icon">' + UI.icono("lock") + '</span>' +
            '<input type="password" class="form-control" id="password" placeholder="Mínimo 8 caracteres" autocomplete="new-password" minlength="8" required></div>' +
            '<div id="passwordMeter" class="password-meter"><span></span><span></span><span></span><span></span></div>' +
            '<small id="passwordHint" class="field-hint">Mínimo 8 caracteres.</small></div>' +
            '<div class="field"><label for="password2">Repite la contraseña</label>' +
            '<div class="field-control"><span class="field-icon">' + UI.icono("lock") + '</span>' +
            '<input type="password" class="form-control" id="password2" placeholder="Repite tu contraseña" autocomplete="new-password" minlength="8" required></div></div>' +
            '<button id="btnRegistrar" type="submit" class="btn btn-primary btn-lg btn-block">Crear cuenta ' + UI.icono("arrow-right") + '</button>' +
            '</form>' +
            '<p class="auth-switch">¿Ya tienes cuenta? <button type="button" id="btnIrLogin" class="link-button">Iniciar sesión</button></p>' +
            '</div>';

        $("#contenido").html(this.layoutAuth({ contenido: contenido }));

        let self = this;
        $("#password").on("input", function(){
            let valor = String($(this).val() || "");
            let score = 0;
            if (valor.length >= 8){ score++; }
            if (/[a-z]/.test(valor) && /[A-Z]/.test(valor)){ score++; }
            if (/\d/.test(valor)){ score++; }
            if (/[^A-Za-z0-9]/.test(valor)){ score++; }
            if (valor.length > 0){ score = Math.max(1, score); }
            $("#passwordMeter").attr("class", "password-meter" + (score ? " score-" + score : ""));
            $("#passwordHint").text(["Mínimo 8 caracteres.", "Contraseña débil.", "Contraseña aceptable.", "Contraseña buena.", "Contraseña excelente."][score]);
        });

        $("#formRegistro").on("submit", function(e){
            e.preventDefault();
            let email = String($("#email").val() || "").trim();
            let p1 = String($("#password").val() || "");
            let p2 = String($("#password2").val() || "");
            if (p1 !== p2){
                self.mostrarMensaje("Las contraseñas no coinciden", "danger");
                return;
            }
            rest.registrar(email, p1, function(){
                self.mostrarConfirmacion(email);
            });
        });
        $("#btnIrLogin").on("click", function(){ self.mostrarLogin(); });
    };

    // Tras registrarse, la cuenta queda pendiente hasta que se pulse el enlace del correo.
    this.mostrarConfirmacion = function(email){
        this.limpiarMensaje();
        this.mostrarBarra(null);

        let contenido = '<div class="auth-card">' +
            '<div class="confirm-illustration">' + UI.icono("mail") + '</div>' +
            '<h2 class="text-center" style="font-size:1.4rem;font-weight:800;margin-bottom:7px;">Revisa tu correo</h2>' +
            '<p class="text-center" style="color:var(--muted);font-size:.88rem;line-height:1.55;margin-bottom:6px;">' +
            'Hemos enviado un enlace de confirmación a <strong style="color:var(--text);">' + this.escapar(email) + '</strong>.</p>' +
            '<div class="confirm-steps">' +
            '<div class="confirm-step"><span class="confirm-step-number">1</span><span>Abre el correo y pulsa el enlace de confirmación.</span></div>' +
            '<div class="confirm-step"><span class="confirm-step-number">2</span><span>Vuelve aquí e inicia sesión con tu email y contraseña.</span></div>' +
            '<div class="confirm-step"><span class="confirm-step-number">3</span><span>Si no lo ves, revisa la carpeta de spam o correo no deseado.</span></div>' +
            '</div>' +
            '<button id="btnIrLoginTrasRegistro" type="button" class="btn btn-primary btn-block">Ir a iniciar sesión ' + UI.icono("arrow-right") + '</button>' +
            '</div>';

        $("#contenido").html(this.layoutAuth({ contenido: contenido }));

        let self = this;
        $("#btnIrLoginTrasRegistro").on("click", function(){ self.mostrarLogin(); });
    };

    // --- Listado de usuarios (solo administrador) ---
    this.mostrarListarUsuarios = function(){
        this.limpiarMensaje();
        this.marcarNav("navUsuarios");

        let html = '<div class="page">' +
            '<header class="page-head"><div><span class="eyebrow">' + UI.icono("users") + ' Administración</span>' +
            '<h1>Usuarios</h1><p>Cuentas registradas, su rol y su estado.</p></div>' +
            '<div class="page-head-actions"><span class="count-pill" id="contadorUsuarios">—</span>' +
            '<button type="button" id="btnRefrescarUsuarios" class="btn btn-secondary btn-sm">' + UI.icono("refresh") + ' Actualizar</button></div></header>' +
            '<section class="panel"><div class="panel-toolbar">' +
            '<div class="search-box">' + UI.icono("users") + '<input type="search" id="filtroUsuarios" class="form-control" placeholder="Buscar por email, rol o estado..."></div>' +
            '</div>' +
            '<div id="lista"></div></section></div>';

        $("#contenido").html(html);

        let self = this;
        let cargar = function(){
            rest.listarUsuarios(function(data){
                let usuarios = data.usuarios || [];
                $("#contadorUsuarios").text(usuarios.length + (usuarios.length === 1 ? " cuenta" : " cuentas"));
                if (!usuarios.length){
                    $("#lista").html('<div class="empty-state">' + UI.icono("users") +
                        '<strong>No hay usuarios registrados</strong><span>Cuando alguien cree una cuenta aparecerá aquí.</span></div>');
                    return;
                }
                let filas = "";
                usuarios.forEach(function(u){
                    let rolClase = u.rol === "administrador" ? "role-admin" : "role-user";
                    let estadoClase = "status-" + String(u.estado || "").toLowerCase();
                    let estadoCuenta = { confirmado: "Cuenta confirmada", pendiente: "Cuenta pendiente", eliminado: "Cuenta eliminada" }[u.estado] || ("Cuenta " + u.estado);
                    let busqueda = (u.email + " " + u.rol + " " + u.estado).toLowerCase();
                    filas += '<tr class="user-row" data-search="' + self.escapar(busqueda) + '">' +
                        '<td><div class="user-cell">' + UI.avatar(u.email) +
                        '<div><strong>' + self.escapar(u.email) + '</strong><small>' + self.escapar(estadoCuenta) + '</small></div></div></td>' +
                        '<td><span class="role-chip ' + rolClase + '">' + self.escapar(u.rol) + '</span></td>' +
                        '<td><span class="status-pill ' + estadoClase + '">' + self.escapar(u.estado) + '</span></td>' +
                        '</tr>';
                });
                $("#lista").html('<div class="table-responsive"><table class="table data-table">' +
                    '<thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th></tr></thead><tbody>' + filas + '</tbody></table></div>');
            }, function(mensaje){
                $("#lista").html('<div class="empty-state">' + UI.icono("alert-triangle") +
                    '<strong>No se pudo cargar la lista</strong><span>' + self.escapar(mensaje) + '</span></div>');
            });
        };

        $("#btnRefrescarUsuarios").on("click", cargar);
        $("#filtroUsuarios").on("input", function(){
            let q = String($(this).val() || "").toLowerCase().trim();
            $(".user-row").each(function(){
                $(this).toggle($(this).data("search").indexOf(q) !== -1);
            });
        });
        cargar();
    };

    // --- Eliminar usuario (administrador a cualquiera; usuario, su propia cuenta) ---
    this.mostrarEliminarUsuario = function(){
        this.limpiarMensaje();
        this.marcarNav("navEliminar");

        let propio = this.usuario ? this.usuario.email : "";
        let html = '<div class="form-page"><header class="page-head"><div>' +
            '<span class="eyebrow">' + UI.icono("trash") + ' Cuenta</span>' +
            '<h1>Eliminar usuario</h1><p>La cuenta dejará de poder iniciar sesión.</p>' +
            '</div></header><section class="panel danger-zone">' +
            '<div class="panel-head"><h2>Confirmar eliminación</h2><span class="status-pill status-eliminado">Irreversible desde la interfaz</span></div>' +
            '<div class="danger-note">' + UI.icono("alert-triangle") +
            '<span>Si eliminas tu propia cuenta se cerrará la sesión. Un administrador puede eliminar la cuenta de otro usuario.</span></div>' +
            '<form id="formEliminar" class="auth-form">' +
            '<div class="field"><label for="emailEliminar">Email de la cuenta</label>' +
            '<div class="field-control"><span class="field-icon">' + UI.icono("mail") + '</span>' +
            '<input type="email" class="form-control" id="emailEliminar" value="' + this.escapar(propio) + '" required></div></div>' +
            '<div class="confirm-check"><input type="checkbox" id="confirmarEliminar">' +
            '<label for="confirmarEliminar">Entiendo que esta cuenta dejará de poder iniciar sesión con contraseña.</label></div>' +
            '<button id="btnEliminar" type="submit" class="btn btn-danger" disabled>' + UI.icono("trash") + ' Eliminar cuenta</button>' +
            '</form></section></div>';

        $("#contenido").html(html);

        let self = this;
        $("#confirmarEliminar").on("change", function(){
            $("#btnEliminar").prop("disabled", !this.checked);
        });
        $("#formEliminar").on("submit", function(e){
            e.preventDefault();
            let email = String($("#emailEliminar").val() || "").trim();
            if (!email){ self.mostrarMensaje("Introduce el email de la cuenta", "warning"); return; }
            rest.eliminarUsuario(email, function(){
                self.mostrarMensaje("Usuario " + email + " eliminado", "success");
                if (self.usuario && self.usuario.email === email){
                    self.usuario = null;
                    self.mostrarLogin();
                    self.notificarSesion(null);
                }
                else{
                    self.mostrarInicio();
                }
            }, function(mensaje){
                self.mostrarMensaje(mensaje, "danger");
            });
        });
    };

    // --- Cierre de sesión ---
    this.cerrarSesion = function(){
        let self = this;
        rest.logout(function(){
            self.usuario = null;
            self.mostrarLogin();
            self.notificarSesion(null);
            self.mostrarMensaje("Sesión cerrada", "info");
        });
    };

    // Avisa al juego de quién está conectado (o de que nadie lo está).
    this.notificarSesion = function(usuario){
        if (window.juegoWeb){ window.juegoWeb.iniciar(usuario); }
    };
}
