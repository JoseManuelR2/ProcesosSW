// Capa lógica de negocio.
// NO sabe si los datos están en memoria o en MongoDB: recibe la CAD por
// inyección de dependencias (patrón que permite cambiar de implementación sin
// tocar la lógica).
const seguridad = require("./seguridad.js");

const ROL_USUARIO = "usuario";
const ROL_ADMIN = "administrador";
const ESTADO_PENDIENTE = "pendiente";
const ESTADO_CONFIRMADO = "confirmado";

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LONGITUD_MINIMA_PASSWORD = 8;

function Modelo(cad, log){
    this.cad = cad;
    this.log = log || { registrar: async function(){} };

    // Registro local: crea la cuenta en estado "pendiente" hasta que se confirme.
    this.registrarUsuario = async function(email, password){
        if (!email || !password){
            return { error: "El email y la contraseña son obligatorios", codigo: 400 };
        }
        if (!RE_EMAIL.test(email)){
            return { error: "El email no tiene un formato válido", codigo: 400 };
        }
        if (password.length < LONGITUD_MINIMA_PASSWORD){
            return { error: "La contraseña debe tener al menos " + LONGITUD_MINIMA_PASSWORD + " caracteres", codigo: 400 };
        }
        let existente = await this.cad.obtenerUsuario(email);
        if (existente){
            return { error: "Ya existe una cuenta con ese email", codigo: 409 };
        }
        let hash = await seguridad.hashear(password);
        await this.cad.agregarUsuario({
            email: email,
            password: hash,
            rol: ROL_USUARIO,
            estado: ESTADO_PENDIENTE
        });
        await this.log.registrar("registro", { email: email });
        return { email: email, estado: ESTADO_PENDIENTE };
    };

    // Crea el administrador inicial si no existe (semilla desde variables de entorno).
    this.crearAdmin = async function(email, password){
        if (!email || !password){
            return { error: "Faltan ADMIN_EMAIL o ADMIN_PASSWORD", codigo: 400 };
        }
        let existente = await this.cad.obtenerUsuario(email);
        if (existente){
            return { email: email, existente: true };
        }
        let hash = await seguridad.hashear(password);
        await this.cad.agregarUsuario({
            email: email,
            password: hash,
            rol: ROL_ADMIN,
            estado: ESTADO_CONFIRMADO
        });
        await this.log.registrar("alta_admin", { email: email });
        return { email: email, creado: true };
    };

    // Confirmación de cuenta. En el Hito 4 se disparará desde el enlace del correo.
    this.confirmarCuenta = async function(email){
        let usuario = await this.cad.obtenerUsuario(email);
        if (!usuario){
            return { error: "No existe ninguna cuenta con ese email", codigo: 404 };
        }
        await this.cad.actualizarUsuario(email, { estado: ESTADO_CONFIRMADO });
        await this.log.registrar("confirmacion_cuenta", { email: email });
        return { email: email, estado: ESTADO_CONFIRMADO };
    };

    // Inicio de sesión local (email + contraseña).
    this.autenticar = async function(email, password){
        let usuario = await this.cad.obtenerUsuario(email);
        if (!usuario){
            await this.log.registrar("login_fallido", { email: email, motivo: "no_existe" });
            return { error: "Credenciales incorrectas", codigo: 401 };
        }
        if (usuario.estado !== ESTADO_CONFIRMADO){
            await this.log.registrar("login_fallido", { email: email, motivo: "pendiente" });
            return { error: "La cuenta todavía no está confirmada", codigo: 403 };
        }
        let correcta = await seguridad.verificar(password, usuario.password);
        if (!correcta){
            await this.log.registrar("login_fallido", { email: email, motivo: "password" });
            return { error: "Credenciales incorrectas", codigo: 401 };
        }
        await this.log.registrar("login", { email: email });
        return { email: usuario.email, rol: usuario.rol };
    };

    // Listado de usuarios: solo el administrador.
    this.listarUsuarios = async function(solicitante){
        if (!solicitante || solicitante.rol !== ROL_ADMIN){
            await this.log.registrar("acceso_denegado", { operacion: "listarUsuarios" });
            return { error: "Se requiere rol de administrador", codigo: 403 };
        }
        let usuarios = await this.cad.obtenerUsuarios();
        let lista = usuarios.map(function(u){
            return { email: u.email, rol: u.rol, estado: u.estado };
        });
        return { usuarios: lista };
    };

    // Comprobar si un usuario está activo: solo el administrador.
    // Activo = cuenta confirmada (en este proyecto no significa "conectado ahora").
    this.usuarioActivo = async function(solicitante, email){
        if (!solicitante || solicitante.rol !== ROL_ADMIN){
            await this.log.registrar("acceso_denegado", { operacion: "usuarioActivo" });
            return { error: "Se requiere rol de administrador", codigo: 403 };
        }
        let usuario = await this.cad.obtenerUsuario(email);
        return { activo: !!usuario && usuario.estado === ESTADO_CONFIRMADO };
    };

    // Eliminar usuario: el administrador a cualquiera; un usuario, solo a sí mismo.
    this.eliminarUsuario = async function(solicitante, email){
        if (!solicitante){
            return { error: "Se requiere iniciar sesión", codigo: 401 };
        }
        let esAdmin = solicitante.rol === ROL_ADMIN;
        let esUnoMismo = solicitante.email === email;
        if (!esAdmin && !esUnoMismo){
            await this.log.registrar("acceso_denegado", { operacion: "eliminarUsuario", email: email });
            return { error: "Solo puedes eliminar tu propia cuenta", codigo: 403 };
        }
        let usuario = await this.cad.obtenerUsuario(email);
        if (!usuario){
            return { error: "No existe ninguna cuenta con ese email", codigo: 404 };
        }
        await this.cad.eliminarUsuario(email);
        await this.log.registrar("eliminar_usuario", { email: email, por: solicitante.email });
        return { email: email };
    };
}

module.exports = {
    Modelo,
    ROL_USUARIO,
    ROL_ADMIN,
    ESTADO_PENDIENTE,
    ESTADO_CONFIRMADO
};
