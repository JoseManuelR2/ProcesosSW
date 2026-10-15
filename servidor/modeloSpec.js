const { Modelo, evaluarBloqueo } = require("./modelo.js");
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

// Variante 4: bloqueo por intentos fallidos.
// Prueban la función propia evaluarBloqueo de la capa lógica: es pura, no toca
// la CAD y no usa el reloj del sistema (el instante actual llega como parámetro),
// así que no necesitan base de datos ni conexión de red.
describe("Variante 4: bloqueo por intentos fallidos (capa lógica)", function(){

    const CINCO_FALLOS = [
        "2026-03-02T10:00:00Z",
        "2026-03-02T10:01:00Z",
        "2026-03-02T10:02:00Z",
        "2026-03-02T10:03:00Z",
        "2026-03-02T10:04:00Z"
    ];

    it("variante4: bloquea la cuenta tras 5 fallos seguidos y fija el fin del bloqueo", function(){
        let res = evaluarBloqueo(CINCO_FALLOS, "2026-03-02T10:10:00Z");
        expect(res.error).toBeUndefined();
        expect(res.bloqueado).toBeTrue();
        expect(res.hasta).toBe("2026-03-02T10:19:00Z");  // 10:04 + 15 minutos
    });

    it("variante4: usa solo los 5 fallos más recientes aunque la lista venga desordenada", function(){
        let res = evaluarBloqueo([
            "2026-03-02T10:04:00Z",
            "2026-03-02T08:00:00Z",     // antiguo: no cuenta
            "2026-03-02T10:02:00Z",
            "2026-03-02T06:30:00Z",     // antiguo: no cuenta
            "2026-03-02T10:00:00Z",
            "2026-03-02T10:03:00Z",
            "2026-03-02T10:01:00Z"
        ], "2026-03-02T10:10:00Z");
        expect(res.bloqueado).toBeTrue();
        expect(res.hasta).toBe("2026-03-02T10:19:00Z");
    });

    it("variante4: no bloquea si los 5 fallos se reparten en más de 15 minutos", function(){
        let res = evaluarBloqueo([
            "2026-03-02T10:00:00Z",
            "2026-03-02T10:04:00Z",
            "2026-03-02T10:08:00Z",
            "2026-03-02T10:12:00Z",
            "2026-03-02T10:16:00Z"
        ], "2026-03-02T10:20:00Z");
        expect(res.bloqueado).toBeFalse();
        expect(res.hasta).toBeNull();
    });

    it("variante4: no bloquea cuando hay menos de 5 fallos", function(){
        let res = evaluarBloqueo(CINCO_FALLOS.slice(0, 4), "2026-03-02T10:10:00Z");
        expect(res.bloqueado).toBeFalse();
        expect(res.hasta).toBeNull();
    });

    it("variante4: responde como no bloqueado cuando el bloqueo ya ha expirado", function(){
        let res = evaluarBloqueo(CINCO_FALLOS, "2026-03-02T10:30:00Z");  // pasadas las 10:19
        expect(res.bloqueado).toBeFalse();
        expect(res.hasta).toBeNull();
    });

    it("variante4: rechaza una fecha no válida con error 400 (caso de error)", function(){
        let res = evaluarBloqueo(["2026-03-02T10:00:00Z", "ayer", "2026-13-45T99:00:00Z"], "2026-03-02T10:10:00Z");
        expect(res.error).toBeDefined();
        expect(res.codigo).toBe(400);
    });

    it("variante4: rechaza datos ausentes o de tipo incorrecto con error 400 (caso de error)", function(){
        let sinAhora = evaluarBloqueo(CINCO_FALLOS, undefined);
        expect(sinAhora.error).toBeDefined();
        expect(sinAhora.codigo).toBe(400);

        let ahoraInvalida = evaluarBloqueo(CINCO_FALLOS, 1772455800000);
        expect(ahoraInvalida.error).toBeDefined();
        expect(ahoraInvalida.codigo).toBe(400);

        let fallosNoLista = evaluarBloqueo("2026-03-02T10:00:00Z", "2026-03-02T10:10:00Z");
        expect(fallosNoLista.error).toBeDefined();
        expect(fallosNoLista.codigo).toBe(400);
    });
});
