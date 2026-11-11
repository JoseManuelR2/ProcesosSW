const { Modelo } = require("./modelo.js");
const { CadMemoria } = require("./cadMemoria.js");

// Pruebas de la confirmación por correo, la caducidad del enlace y el inicio con
// OAuth (Google). Como en el resto de la capa lógica, usan la CAD en memoria y un correo
// simulado: no necesitan red ni base de datos.

const ADMIN = { email: "admin@test.com", rol: "administrador" };

function crearModelo(){
    let enviados = [];
    let correo = {
        enviarConfirmacion: async function(email, token){
            enviados.push({ email: email, token: token });
        }
    };
    let modelo = new Modelo(new CadMemoria(), null, correo);
    modelo.enviados = enviados;
    return modelo;
}

describe("Confirmación de cuenta por correo (capa lógica)", function(){
    let modelo;

    beforeEach(function(){
        modelo = crearModelo();
    });

    it("envía el correo de confirmación con un token al registrarse", async function(){
        await modelo.registrarUsuario("ana@test.com", "contrasena1");
        expect(modelo.enviados.length).toBe(1);
        expect(modelo.enviados[0].email).toBe("ana@test.com");
        expect(modelo.enviados[0].token.length).toBeGreaterThan(20);
    });

    it("guarda el token con caducidad, nunca en claro como contraseña", async function(){
        await modelo.registrarUsuario("ana@test.com", "contrasena1");
        let guardado = await modelo.cad.obtenerUsuario("ana@test.com");
        expect(guardado.tokenConfirmacion).toBe(modelo.enviados[0].token);
        expect(guardado.expiraConfirmacion).toBeGreaterThan(Date.now());
    });

    it("confirma la cuenta con el token del correo", async function(){
        await modelo.registrarUsuario("ana@test.com", "contrasena1");
        let res = await modelo.confirmarCuenta(modelo.enviados[0].token);
        expect(res.error).toBeUndefined();
        expect(res.estado).toBe("confirmado");
        let guardado = await modelo.cad.obtenerUsuario("ana@test.com");
        expect(guardado.tokenConfirmacion).toBeNull();
    });

    it("un token no se puede reutilizar (caso de error)", async function(){
        await modelo.registrarUsuario("ana@test.com", "contrasena1");
        await modelo.confirmarCuenta(modelo.enviados[0].token);
        let res = await modelo.confirmarCuenta(modelo.enviados[0].token);
        expect(res.error).toBeDefined();
        expect(res.codigo).toBe(404);
    });

    it("un token inventado no confirma ninguna cuenta (caso de error)", async function(){
        await modelo.registrarUsuario("ana@test.com", "contrasena1");
        let res = await modelo.confirmarCuenta("token-inventado");
        expect(res.error).toBeDefined();
        let guardado = await modelo.cad.obtenerUsuario("ana@test.com");
        expect(guardado.estado).toBe("pendiente");
    });

    it("no acepta una petición sin token (caso de error)", async function(){
        let res = await modelo.confirmarCuenta(undefined);
        expect(res.error).toBeDefined();
        expect(res.codigo).toBe(400);
    });

    it("un enlace caducado no confirma la cuenta (caso de error)", async function(){
        await modelo.registrarUsuario("ana@test.com", "contrasena1");
        await modelo.cad.actualizarUsuario("ana@test.com", { expiraConfirmacion: Date.now() - 1000 });
        let res = await modelo.confirmarCuenta(modelo.enviados[0].token);
        expect(res.error).toBeDefined();
        expect(res.codigo).toBe(410);
        let guardado = await modelo.cad.obtenerUsuario("ana@test.com");
        expect(guardado.estado).toBe("pendiente");
    });

    it("si el correo no se puede enviar, no deja la cuenta creada (caso de error)", async function(){
        modelo.correo = { enviarConfirmacion: async function(){ throw new Error("SMTP caído"); } };
        let res = await modelo.registrarUsuario("ana@test.com", "contrasena1");
        expect(res.error).toBeDefined();
        expect(res.codigo).toBe(503);
        expect(await modelo.cad.obtenerUsuario("ana@test.com")).toBeNull();
    });
});

describe("Inicio de sesión con Google (capa lógica)", function(){
    let modelo;

    beforeEach(function(){
        modelo = crearModelo();
    });

    it("crea la cuenta confirmada en el primer inicio con Google", async function(){
        let res = await modelo.iniciarConOAuth("luis@gmail.com", "google");
        expect(res.error).toBeUndefined();
        expect(res.email).toBe("luis@gmail.com");
        expect(res.rol).toBe("usuario");
        let guardado = await modelo.cad.obtenerUsuario("luis@gmail.com");
        expect(guardado.estado).toBe("confirmado");
        expect(guardado.origen).toBe("google");
    });

    it("una cuenta solo de Google no puede entrar con contraseña (caso de error)", async function(){
        await modelo.iniciarConOAuth("luis@gmail.com", "google");
        let res = await modelo.autenticar("luis@gmail.com", "cualquiera");
        expect(res.error).toBeDefined();
        expect(res.codigo).toBe(401);
    });

    it("una cuenta local pendiente queda confirmada al entrar con Google", async function(){
        await modelo.registrarUsuario("ana@test.com", "contrasena1");
        await modelo.iniciarConOAuth("ana@test.com", "google");
        let guardado = await modelo.cad.obtenerUsuario("ana@test.com");
        expect(guardado.estado).toBe("confirmado");
    });

    it("una cuenta eliminada se reactiva al entrar de nuevo con OAuth", async function(){
        await modelo.iniciarConOAuth("luis@gmail.com", "google");
        await modelo.eliminarUsuario({ email: "luis@gmail.com", rol: "usuario" }, "luis@gmail.com");
        let res = await modelo.iniciarConOAuth("luis@gmail.com", "google");
        expect(res.error).toBeUndefined();
        expect(res.email).toBe("luis@gmail.com");
        let guardado = await modelo.cad.obtenerUsuario("luis@gmail.com");
        expect(guardado.estado).toBe("confirmado");
    });

    it("un usuario eliminado no aparece en el listado del administrador", async function(){
        await modelo.iniciarConOAuth("luis@gmail.com", "google");
        await modelo.iniciarConOAuth("ana@gmail.com", "google");
        await modelo.eliminarUsuario(ADMIN, "luis@gmail.com");
        let res = await modelo.listarUsuarios(ADMIN);
        expect(res.usuarios.length).toBe(1);
        expect(res.usuarios[0].email).toBe("ana@gmail.com");
    });
});
