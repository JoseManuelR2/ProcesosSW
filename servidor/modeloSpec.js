const { Modelo } = require("./modelo.js");
const { CadMemoria } = require("./cadMemoria.js");

// Las pruebas unitarias de la capa lógica usan la CAD en memoria:
// no necesitan una base de datos real ni conexión de red.
function crearModelo(){
    return new Modelo(new CadMemoria());
}

const ADMIN = { email: "admin@test.com", rol: "administrador" };
const USUARIO = { email: "ana@test.com", rol: "usuario" };

describe("Gestión de usuarios (capa lógica)", function(){
    let modelo;

    beforeEach(function(){
        modelo = crearModelo();
    });

    it("registra un usuario nuevo en estado pendiente", async function(){
        let res = await modelo.registrarUsuario("ana@test.com", "contrasena1");
        expect(res.error).toBeUndefined();
        expect(res.email).toBe("ana@test.com");
        expect(res.estado).toBe("pendiente");
    });

    it("no registra un email ya existente (caso de error)", async function(){
        await modelo.registrarUsuario("ana@test.com", "contrasena1");
        let res = await modelo.registrarUsuario("ana@test.com", "otra12345");
        expect(res.error).toBeDefined();
        expect(res.codigo).toBe(409);
    });

    it("no registra una contraseña demasiado corta (caso de error)", async function(){
        let res = await modelo.registrarUsuario("ana@test.com", "123");
        expect(res.error).toBeDefined();
        expect(res.codigo).toBe(400);
    });

    it("no registra un email con formato inválido (caso de error)", async function(){
        let res = await modelo.registrarUsuario("no-es-un-email", "contrasena1");
        expect(res.error).toBeDefined();
        expect(res.codigo).toBe(400);
    });

    it("almacena la contraseña con hash, nunca en texto plano", async function(){
        await modelo.registrarUsuario("ana@test.com", "contrasena1");
        let guardado = await modelo.cad.obtenerUsuario("ana@test.com");
        expect(guardado.password).not.toBe("contrasena1");
        expect(guardado.password.startsWith("$2")).toBeTrue();
    });

    it("no permite iniciar sesión con una cuenta pendiente (caso de error)", async function(){
        await modelo.registrarUsuario("ana@test.com", "contrasena1");
        let res = await modelo.autenticar("ana@test.com", "contrasena1");
        expect(res.error).toBeDefined();
        expect(res.codigo).toBe(403);
    });

    it("permite iniciar sesión tras confirmar la cuenta", async function(){
        await modelo.registrarUsuario("ana@test.com", "contrasena1");
        await modelo.confirmarCuenta("ana@test.com");
        let res = await modelo.autenticar("ana@test.com", "contrasena1");
        expect(res.error).toBeUndefined();
        expect(res.email).toBe("ana@test.com");
        expect(res.rol).toBe("usuario");
    });

    it("no permite iniciar sesión con la contraseña incorrecta (caso de error)", async function(){
        await modelo.registrarUsuario("ana@test.com", "contrasena1");
        await modelo.confirmarCuenta("ana@test.com");
        let res = await modelo.autenticar("ana@test.com", "incorrecta");
        expect(res.error).toBeDefined();
        expect(res.codigo).toBe(401);
    });

    it("solo el administrador puede listar usuarios (caso de error)", async function(){
        await modelo.registrarUsuario("ana@test.com", "contrasena1");
        let res = await modelo.listarUsuarios(USUARIO);
        expect(res.error).toBeDefined();
        expect(res.codigo).toBe(403);
    });

    it("el administrador obtiene email, rol y estado de cada usuario", async function(){
        await modelo.registrarUsuario("ana@test.com", "contrasena1");
        let res = await modelo.listarUsuarios(ADMIN);
        expect(res.usuarios.length).toBe(1);
        expect(res.usuarios[0].email).toBe("ana@test.com");
        expect(res.usuarios[0].rol).toBe("usuario");
        expect(res.usuarios[0].estado).toBe("pendiente");
    });

    it("usuarioActivo es verdadero solo si la cuenta está confirmada", async function(){
        await modelo.registrarUsuario("ana@test.com", "contrasena1");
        let antes = await modelo.usuarioActivo(ADMIN, "ana@test.com");
        await modelo.confirmarCuenta("ana@test.com");
        let despues = await modelo.usuarioActivo(ADMIN, "ana@test.com");
        expect(antes.activo).toBeFalse();
        expect(despues.activo).toBeTrue();
    });

    it("un usuario normal no puede eliminar a otro usuario (caso de error)", async function(){
        await modelo.registrarUsuario("ana@test.com", "contrasena1");
        await modelo.registrarUsuario("luis@test.com", "contrasena1");
        let res = await modelo.eliminarUsuario(USUARIO, "luis@test.com");
        expect(res.error).toBeDefined();
        expect(res.codigo).toBe(403);
    });

    it("un usuario normal puede eliminar su propia cuenta", async function(){
        await modelo.registrarUsuario("ana@test.com", "contrasena1");
        let res = await modelo.eliminarUsuario(USUARIO, "ana@test.com");
        expect(res.error).toBeUndefined();
        expect(await modelo.cad.obtenerUsuario("ana@test.com")).toBeNull();
    });

    it("el administrador puede eliminar a cualquier usuario", async function(){
        await modelo.registrarUsuario("ana@test.com", "contrasena1");
        let res = await modelo.eliminarUsuario(ADMIN, "ana@test.com");
        expect(res.error).toBeUndefined();
        expect(await modelo.cad.obtenerUsuario("ana@test.com")).toBeNull();
    });

    it("un usuario eliminado no puede volver a iniciar sesión (caso de error)", async function(){
        await modelo.registrarUsuario("ana@test.com", "contrasena1");
        await modelo.confirmarCuenta("ana@test.com");
        await modelo.eliminarUsuario(ADMIN, "ana@test.com");
        let res = await modelo.autenticar("ana@test.com", "contrasena1");
        expect(res.error).toBeDefined();
        expect(res.codigo).toBe(401);
    });
});
