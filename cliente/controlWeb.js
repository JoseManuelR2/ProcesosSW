// Capa de presentación del cliente (componente de visualización).
// Construye el HTML, lo inyecta y captura los eventos. No habla con el servidor:
// para eso usa el objeto global `rest` (ClienteRest).
function ControlWeb(){
    this.usuario = null;

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

    // --- Arranque: comprueba la sesión y decide qué mostrar ---
    this.iniciar = function(){
        let self = this;
        rest.sesion(
            function(usuario){ self.usuario = usuario; self.mostrarInicio(); },
            function(){ self.usuario = null; self.mostrarLogin(); }
        );
    };

    this.mostrarInicio = function(){
        this.limpiarMensaje();
        this.mostrarBarra(this.usuario);
        let cadena = '<div class="jumbotron py-4 mt-3">';
        cadena += '<h3>Bienvenido, ' + this.usuario.email + '</h3>';
        cadena += '<p>Rol: <span class="badge badge-secondary">' + this.usuario.rol + '</span></p>';
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
                self.mostrarMensaje("Cuenta creada. Confírmala para poder iniciar sesión.", "success");
                self.mostrarConfirmacion(email);
            });
        });
        $("#btnIrLogin").on("click", function(){ self.mostrarLogin(); });
    };

    // Confirmación de cuenta. En el Hito 4 la dispara el enlace del correo;
    // mientras tanto, se ofrece un botón para poder probar el flujo completo.
    this.mostrarConfirmacion = function(email){
        let cadena = '<div class="card p-4 mt-3"><h5>Confirmación de cuenta</h5>';
        cadena += '<p class="text-muted">El correo de confirmación llega en el Hito 4. Mientras tanto, confirma aquí para probar el flujo.</p>';
        cadena += '<button id="btnConfirmar" type="button" class="btn btn-success">Confirmar la cuenta ' + email + '</button>';
        cadena += '</div>';
        $("#contenido").append(cadena);

        let self = this;
        $("#btnConfirmar").on("click", function(){
            rest.confirmarCuenta(email, function(){
                self.mostrarMensaje("Cuenta confirmada. Ya puedes iniciar sesión.", "success");
                self.mostrarLogin();
            });
        });
    };

    // --- Listado de usuarios (solo administrador) ---
    this.mostrarListarUsuarios = function(){
        this.limpiarMensaje();
        let cadena = '<div class="card p-4 mt-3"><h5>Usuarios</h5><div id="lista"></div></div>';
        $("#contenido").html(cadena);
        rest.listarUsuarios(function(data){
            let filas = "";
            data.usuarios.forEach(function(u){
                filas += "<tr><td>" + u.email + "</td><td>" + u.rol + "</td><td>" + u.estado + "</td></tr>";
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
        cadena += '<input type="email" class="form-control" id="emailEliminar" value="' + (this.usuario ? this.usuario.email : "") + '"></div>';
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
