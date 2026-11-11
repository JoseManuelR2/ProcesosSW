// Capa de presentación del cliente (componente de visualización).
// Construye el HTML, lo inyecta y captura los eventos. No habla con el servidor:
// para eso usa el objeto global `rest` (ClienteRest).
function ControlWeb(){
    this.usuario = null;

    // Evita inyectar HTML cuando se muestran datos del usuario (p. ej. un email).
    this.escapar = function(texto){
        return String(texto).replace(/[&<>"']/g, function(c){
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
    };

    this.limpiarMensaje = function(){
        $("#mensaje").addClass("d-none").text("");
    };

    this.mostrarMensaje = function(texto, tipo){
        console.log(texto);
        $("#mensaje").attr("class", "alert alert-" + (tipo || "info") + " mt-3").text(texto).removeClass("d-none");
    };

    // --- Barra de navegación (según la sesión y el rol) ---
    this.mostrarBarra = function(usuario){
        let cadena = '<a class="navbar-brand" href="#">ProcesosSW</a><ul class="navbar-nav">';
        if (usuario){
            if (usuario.rol === "administrador"){
                cadena += '<li class="nav-item"><a class="nav-link" href="#" id="navUsuarios">Usuarios</a></li>';
                cadena += '<li class="nav-item"><a class="nav-link" href="#" id="navActivo">¿Activo?</a></li>';
            }
            cadena += '<li class="nav-item"><a class="nav-link" href="#" id="navEliminar">Eliminar cuenta</a></li>';
            cadena += '<li class="nav-item"><a class="nav-link" href="#" id="navSalir">Salir</a></li>';
        }
        cadena += '</ul>';
        $("#barra").html(cadena);

        let self = this;
        $("#navUsuarios").on("click", function(e){ e.preventDefault(); self.mostrarListarUsuarios(); });
        $("#navActivo").on("click", function(e){ e.preventDefault(); self.mostrarUsuarioActivo(); });
        $("#navEliminar").on("click", function(e){ e.preventDefault(); self.mostrarEliminarUsuario(); });
        $("#navSalir").on("click", function(e){ e.preventDefault(); self.cerrarSesion(); });
    };

    // Avisos que llegan en la URL tras confirmar el correo o al volver de Google.
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
                if (aviso){ self.mostrarMensaje(aviso.texto, aviso.tipo); }
            },
            function(){
                self.usuario = null;
                self.mostrarLogin();
                if (aviso){ self.mostrarMensaje(aviso.texto, aviso.tipo); }
            }
        );
    };

    this.mostrarInicio = function(){
        this.limpiarMensaje();
        this.mostrarBarra(this.usuario);
        let cadena = '<div class="jumbotron py-4 mt-3">';
        cadena += '<h3>Bienvenido, ' + this.escapar(this.usuario.email) + '</h3>';
        cadena += '<p>Rol: <span class="badge badge-secondary">' + this.escapar(this.usuario.rol) + '</span></p>';
        cadena += '</div>';
        $("#contenido").html(cadena);
    };

    // --- Inicio de sesión ---
    this.mostrarLogin = function(){
        this.limpiarMensaje();
        this.mostrarBarra(null);
        let cadena = '<div class="row justify-content-center"><div class="col-md-5">';
        cadena += '<div class="card p-4 mt-4"><h4>Iniciar sesión</h4>';
        cadena += '<div class="form-group"><label for="email">Email:</label><input type="email" class="form-control" id="email"></div>';
        cadena += '<div class="form-group"><label for="password">Contraseña:</label><input type="password" class="form-control" id="password"></div>';
        cadena += '<button id="btnLogin" type="button" class="btn btn-primary btn-block">Entrar</button>';
        cadena += '<a id="btnGoogle" href="/auth/google" class="btn btn-outline-danger btn-block mt-2">Entrar con Google</a>';
        cadena += '<button id="btnIrRegistro" type="button" class="btn btn-link btn-block">Crear una cuenta</button>';
        cadena += '</div></div></div>';
        $("#contenido").html(cadena);

        let self = this;
        $("#btnLogin").on("click", function(){
            rest.login($("#email").val(), $("#password").val(), function(usuario){
                self.usuario = usuario;
                self.mostrarInicio();
                self.mostrarMensaje("Sesión iniciada como " + usuario.email, "success");
            });
        });
        $("#btnIrRegistro").on("click", function(){ self.mostrarRegistro(); });
    };

    // --- Registro ---
    this.mostrarRegistro = function(){
        this.limpiarMensaje();
        this.mostrarBarra(null);
        let cadena = '<div class="row justify-content-center"><div class="col-md-5">';
        cadena += '<div class="card p-4 mt-4"><h4>Crear cuenta</h4>';
        cadena += '<div class="form-group"><label for="email">Email:</label><input type="email" class="form-control" id="email"></div>';
        cadena += '<div class="form-group"><label for="password">Contraseña (mínimo 8 caracteres):</label><input type="password" class="form-control" id="password"></div>';
        cadena += '<div class="form-group"><label for="password2">Repite la contraseña:</label><input type="password" class="form-control" id="password2"></div>';
        cadena += '<button id="btnRegistrar" type="button" class="btn btn-primary btn-block">Crear cuenta</button>';
        cadena += '<button id="btnIrLogin" type="button" class="btn btn-link btn-block">Ya tengo cuenta</button>';
        cadena += '</div></div></div>';
        $("#contenido").html(cadena);

        let self = this;
        $("#btnRegistrar").on("click", function(){
            let email = $("#email").val();
            let p1 = $("#password").val();
            let p2 = $("#password2").val();
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
        let cadena = '<div class="row justify-content-center"><div class="col-md-5">';
        cadena += '<div class="card p-4 mt-4"><h4>Revisa tu correo</h4>';
        cadena += '<p>Te hemos enviado un enlace de confirmación a <strong>' + this.escapar(email) + '</strong>.</p>';
        cadena += '<p>Confirma tu cuenta para poder iniciar sesión. Si no lo ves, revisa la carpeta de spam.</p>';
        cadena += '<button id="btnIrLoginTrasRegistro" type="button" class="btn btn-primary btn-block">Ir a iniciar sesión</button>';
        cadena += '</div></div></div>';
        $("#contenido").html(cadena);

        let self = this;
        $("#btnIrLoginTrasRegistro").on("click", function(){ self.mostrarLogin(); });
    };

    // --- Listado de usuarios (solo administrador) ---
    this.mostrarListarUsuarios = function(){
        this.limpiarMensaje();
        let cadena = '<div class="card p-4 mt-3"><h5>Usuarios</h5><div id="lista"></div></div>';
        $("#contenido").html(cadena);
        let self = this;
        rest.listarUsuarios(function(data){
            let filas = "";
            data.usuarios.forEach(function(u){
                filas += "<tr><td>" + self.escapar(u.email) + "</td><td>" + self.escapar(u.rol) + "</td><td>" + self.escapar(u.estado) + "</td></tr>";
            });
            $("#lista").html('<table class="table"><thead><tr><th>Email</th><th>Rol</th><th>Estado</th></tr></thead><tbody>' + filas + '</tbody></table>');
        });
    };

    // --- Comprobar si un usuario está activo (solo administrador) ---
    this.mostrarUsuarioActivo = function(){
        this.limpiarMensaje();
        let cadena = '<div class="card p-4 mt-3"><h5>¿Está activo un usuario?</h5>';
        cadena += '<div class="form-group"><label for="emailActivo">Email:</label><input type="email" class="form-control" id="emailActivo"></div>';
        cadena += '<button id="btnActivo" type="button" class="btn btn-primary">Comprobar</button>';
        cadena += '<p id="resultado" class="mt-3 mb-0"></p></div>';
        $("#contenido").html(cadena);
        $("#btnActivo").on("click", function(){
            rest.usuarioActivo($("#emailActivo").val(), function(data){
                $("#resultado").text("activo: " + data.activo);
            });
        });
    };

    // --- Eliminar usuario (administrador a cualquiera; usuario, su propia cuenta) ---
    this.mostrarEliminarUsuario = function(){
        this.limpiarMensaje();
        let cadena = '<div class="card p-4 mt-3"><h5>Eliminar usuario</h5>';
        cadena += '<div class="form-group"><label for="emailEliminar">Email:</label>';
        cadena += '<input type="email" class="form-control" id="emailEliminar" value="' + this.escapar(this.usuario ? this.usuario.email : "") + '"></div>';
        cadena += '<button id="btnEliminar" type="button" class="btn btn-danger">Eliminar</button></div>';
        $("#contenido").html(cadena);

        let self = this;
        $("#btnEliminar").on("click", function(){
            let email = $("#emailEliminar").val();
            rest.eliminarUsuario(email, function(){
                self.mostrarMensaje("Usuario " + email + " eliminado", "success");
                if (self.usuario && self.usuario.email === email){
                    self.usuario = null;
                    self.mostrarLogin();
                }
                else{
                    self.mostrarInicio();
                }
            });
        });
    };

    // --- Cierre de sesión ---
    this.cerrarSesion = function(){
        let self = this;
        rest.logout(function(){
            self.usuario = null;
            self.mostrarLogin();
            self.mostrarMensaje("Sesión cerrada", "info");
        });
    };
}
