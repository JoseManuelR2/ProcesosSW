// Capa de comunicación del cliente.
// Único punto que habla con la API REST del servidor mediante AJAX.
function ClienteRest(cw){
    this.cw = cw;

    // Realiza una petición JSON. En caso de error delega en la vista.
    this.peticion = function(metodo, url, datos, ok, err){
        $.ajax({
            type: metodo,
            url: url,
            data: (datos != null) ? JSON.stringify(datos) : undefined,
            contentType: "application/json",
            dataType: "json"
        }).done(function(data){
            if (ok){
                ok(data);
            }
        }).fail(function(xhr){
            let mensaje = "Error de comunicación con el servidor";
            if (xhr.responseJSON && xhr.responseJSON.error){
                mensaje = xhr.responseJSON.error;
            }
            if (err){
                err(mensaje);
            }
            else if (cw && cw.mostrarMensaje){
                cw.mostrarMensaje(mensaje, "danger");
            }
        });
    };

    // --- Autenticación y sesión ---
    this.sesion = function(ok, err){
        this.peticion("GET", "/api/sesion", null, ok, err);
    };

    this.registrar = function(email, password, ok, err){
        this.peticion("POST", "/api/registro", { email: email, password: password }, ok, err);
    };

    this.confirmarCuenta = function(email, ok, err){
        this.peticion("POST", "/api/confirmarCuenta", { email: email }, ok, err);
    };

    this.login = function(email, password, ok, err){
        this.peticion("POST", "/api/login", { email: email, password: password }, ok, err);
    };

    this.logout = function(ok, err){
        this.peticion("POST", "/api/logout", null, ok, err);
    };

    // --- Consultas sobre usuarios ---
    this.listarUsuarios = function(ok, err){
        this.peticion("GET", "/api/usuarios", null, ok, err);
    };

    this.usuarioActivo = function(email, ok, err){
        this.peticion("GET", "/api/usuarioActivo/" + encodeURIComponent(email), null, ok, err);
    };

    this.eliminarUsuario = function(email, ok, err){
        this.peticion("DELETE", "/api/usuario/" + encodeURIComponent(email), null, ok, err);
    };
}
