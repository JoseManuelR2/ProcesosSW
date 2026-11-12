const { Modelo, evaluarBloqueo } = require("./modelo.js");
const { CadMemoria } = require("./cadMemoria.js");

// Las pruebas unitarias de la capa lógica usan la CAD en memoria:
// no necesitan una base de datos real ni conexión de red.
function crearModelo(){
    return new Modelo(new CadMemoria());
}

// El token de confirmación lo genera la capa lógica y solo llega al usuario por
// correo; en las pruebas lo leemos directamente de la CAD.
async function tokenDe(modelo, email){
    return (await modelo.cad.obtenerUsuario(email)).tokenConfirmacion;
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

    it("un email ya confirmado no revela que existe y no cambia su contraseña", async function(){
        await modelo.registrarUsuario("ana@test.com", "contrasena1");
        await modelo.confirmarCuenta(await tokenDe(modelo, "ana@test.com"));
        let res = await modelo.registrarUsuario("ana@test.com", "otra12345");
        expect(res.error).toBeUndefined();
        expect(res.estado).toBe("pendiente");
        expect((await modelo.autenticar("ana@test.com", "contrasena1")).error).toBeUndefined();
    });

    it("volver a registrarse con una cuenta pendiente reemplaza el enlace caducado", async function(){
        await modelo.registrarUsuario("ana@test.com", "contrasena1");
        await modelo.cad.actualizarUsuario("ana@test.com", { expiraConfirmacion: Date.now() - 1000 });
        let res = await modelo.registrarUsuario("ana@test.com", "contrasena2");
        expect(res.error).toBeUndefined();
        let guardado = await modelo.cad.obtenerUsuario("ana@test.com");
        expect(guardado.expiraConfirmacion).toBeGreaterThan(Date.now());
        await modelo.confirmarCuenta(await tokenDe(modelo, "ana@test.com"));
        expect((await modelo.autenticar("ana@test.com", "contrasena2")).error).toBeUndefined();
    });

    it("usuarioVigente solo devuelve cuentas confirmadas", async function(){
        await modelo.registrarUsuario("ana@test.com", "contrasena1");
        expect(await modelo.usuarioVigente("ana@test.com")).toBeNull();
        await modelo.confirmarCuenta(await tokenDe(modelo, "ana@test.com"));
        expect(await modelo.usuarioVigente("ana@test.com")).toEqual({ email: "ana@test.com", rol: "usuario" });
        await modelo.eliminarUsuario(ADMIN, "ana@test.com");
        expect(await modelo.usuarioVigente("ana@test.com")).toBeNull();
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
        await modelo.confirmarCuenta(await tokenDe(modelo, "ana@test.com"));
        let res = await modelo.autenticar("ana@test.com", "contrasena1");
        expect(res.error).toBeUndefined();
        expect(res.email).toBe("ana@test.com");
        expect(res.rol).toBe("usuario");
    });

    it("no permite iniciar sesión con la contraseña incorrecta (caso de error)", async function(){
        await modelo.registrarUsuario("ana@test.com", "contrasena1");
        await modelo.confirmarCuenta(await tokenDe(modelo, "ana@test.com"));
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
        await modelo.confirmarCuenta(await tokenDe(modelo, "ana@test.com"));
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
        expect((await modelo.cad.obtenerUsuario("ana@test.com")).estado).toBe("eliminado");
    });

    it("el administrador puede eliminar a cualquier usuario", async function(){
        await modelo.registrarUsuario("ana@test.com", "contrasena1");
        let res = await modelo.eliminarUsuario(ADMIN, "ana@test.com");
        expect(res.error).toBeUndefined();
        expect((await modelo.cad.obtenerUsuario("ana@test.com")).estado).toBe("eliminado");
    });

    it("un usuario eliminado no puede volver a iniciar sesión (caso de error)", async function(){
        await modelo.registrarUsuario("ana@test.com", "contrasena1");
        await modelo.confirmarCuenta(await tokenDe(modelo, "ana@test.com"));
        await modelo.eliminarUsuario(ADMIN, "ana@test.com");
        let res = await modelo.autenticar("ana@test.com", "contrasena1");
        expect(res.error).toBeDefined();
        expect(res.codigo).toBe(401);
    });
});

describe("Bloqueo real en el inicio de sesión (variante 4)", function(){
    let modelo;

    beforeEach(async function(){
        modelo = crearModelo();
        await modelo.registrarUsuario("ana@test.com", "contrasena1");
        await modelo.confirmarCuenta(await tokenDe(modelo, "ana@test.com"));
    });

    it("tras 5 contraseñas incorrectas la cuenta se bloquea, aunque la contraseña sea la buena", async function(){
        for (let i = 0; i < 5; i++){
            await modelo.autenticar("ana@test.com", "incorrecta");
        }
        let res = await modelo.autenticar("ana@test.com", "contrasena1");
        expect(res.codigo).toBe(429);
    });

    it("un inicio correcto antes del bloqueo borra los fallos anteriores", async function(){
        for (let i = 0; i < 4; i++){
            await modelo.autenticar("ana@test.com", "incorrecta");
        }
        expect((await modelo.autenticar("ana@test.com", "contrasena1")).error).toBeUndefined();
        expect((await modelo.cad.obtenerUsuario("ana@test.com")).fallos).toEqual([]);
    });

    it("un email inexistente responde igual que una contraseña incorrecta", async function(){
        let inexistente = await modelo.autenticar("nadie@test.com", "contrasena1");
        let incorrecta = await modelo.autenticar("ana@test.com", "incorrecta");
        expect(inexistente.codigo).toBe(401);
        expect(incorrecta.codigo).toBe(401);
        expect(inexistente.error).toBe(incorrecta.error);
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
