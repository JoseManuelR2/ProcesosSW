// Pruebas de integración del juego en tiempo real: servidor HTTP + Socket.IO reales
// en un puerto libre, con sesiones de verdad (login por HTTP y cookie en el socket).
const { io: crearCliente } = require("socket.io-client");
const { crearServidor } = require("../index.js");
const { CadMemoria } = require("./cadMemoria.js");
const seguridad = require("./seguridad.js");
const L = require("../compartido/laberinto.js");

const PASSWORD = "contrasena1";
const ANA = "ana@test.com";
const LUIS = "luis@test.com";
const ADMIN = "admin@test.com";

async function crearUsuario(cad, email, rol){
    await cad.agregarUsuario({
        email: email,
        password: await seguridad.hashear(PASSWORD),
        rol: rol || "usuario",
        estado: "confirmado",
        fallos: []
    });
}

// Inicia sesión por HTTP y devuelve la cookie de sesión.
async function cookieDe(url, email){
    let res = await fetch(url + "/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email, password: PASSWORD })
    });
    if (res.status !== 200){ throw new Error("Login fallido para " + email + ": " + res.status); }
    return res.headers.get("set-cookie").split(";")[0];
}

function crearSocket(url, cookie){
    return crearCliente(url, {
        transports: ["websocket"],
        forceNew: true,
        reconnection: false,
        extraHeaders: cookie ? { cookie: cookie } : {}
    });
}

function conectado(s){
    return new Promise(function(resolver, rechazar){
        s.on("connect", function(){ resolver(s); });
        s.on("connect_error", function(err){ rechazar(err); });
    });
}

function conectar(url, cookie){
    return conectado(crearSocket(url, cookie));
}

// Espera al siguiente evento que cumpla el filtro (por defecto, cualquiera).
function esperar(socket, evento, filtro){
    return new Promise(function(resolver, rechazar){
        let tiempo = setTimeout(function(){
            rechazar(new Error("Tiempo agotado esperando " + evento));
        }, 4000);
        function manejador(datos){
            if (filtro && !filtro(datos)){ return; }
            clearTimeout(tiempo);
            socket.off(evento, manejador);
            resolver(datos);
        }
        socket.on(evento, manejador);
    });
}

describe("Maze Duel por sockets (integración)", function(){
    let servidor, url, cad, sockets;

    async function arrancar(opciones){
        cad = new CadMemoria();
        servidor = await crearServidor(Object.assign({
            cad: cad,
            correo: null,
            esperaBotMs: 60000,
            segundosTemporizador: 15
        }, opciones || {}));
        await new Promise(function(resolver){ servidor.server.listen(0, resolver); });
        url = "http://localhost:" + servidor.server.address().port;
        sockets = [];
    }

    async function socketDe(email){
        let s = await conectar(url, await cookieDe(url, email));
        sockets.push(s);
        return s;
    }

    beforeEach(function(){
        spyOn(console, "log");
    });

    afterEach(async function(){
        sockets.forEach(function(s){ s.close(); });
        await servidor.cerrar();
    });

    describe("autenticación del socket", function(){
        beforeEach(async function(){
            await arrancar();
            await crearUsuario(cad, ANA);
        });

        it("rechaza la conexión sin sesión", async function(){
            let error = null;
            try{ await conectar(url, null); }
            catch(e){ error = e; }
            expect(error).not.toBeNull();
            expect(error.message).toBe("No autenticado");
        });

        it("ya no acepta el email que manda el cliente: la identidad es la de la sesión", async function(){
            let ana = await socketDe(ANA);
            ana.emit("identificar", ADMIN);
            ana.emit("crearPartida", { dificultad: "pequeno", semilla: 2024 });
            let partida = await esperar(ana, "partidaCreada");
            expect(partida.partida.creador).toBe(ANA);
        });

        it("una cuenta eliminada pierde el acceso en su siguiente acción", async function(){
            let ana = await socketDe(ANA);
            await servidor.modelo.eliminarUsuario({ email: ADMIN, rol: "administrador" }, ANA);
            ana.emit("crearPartida", { dificultad: "pequeno", semilla: 2024 });
            let error = await esperar(ana, "error");
            expect(error).toContain("sesión");
        });
    });

    describe("partida completa", function(){
        beforeEach(async function(){
            await arrancar();
            await crearUsuario(cad, ANA);
            await crearUsuario(cad, LUIS);
        });

        it("dos jugadores crean, se unen, programan y reciben el resultado", async function(){
            let ana = await socketDe(ANA);
            let luis = await socketDe(LUIS);

            ana.emit("crearPartida", { dificultad: "pequeno", semilla: 2024 });
            let creada = await esperar(ana, "partidaCreada");
            expect(creada.partida.estado).toBe("esperando");

            let unido = esperar(ana, "partidaActualizada", function(p){ return p.estado === "programando"; });
            luis.emit("unirsePartida", { id: creada.id });
            await unido;

            let resultado = esperar(ana, "resultado");
            ana.emit("programar", { id: creada.id, programa: L.programaBot(creada.partida.nivel, creada.partida.nivel.inicios[0]) });
            luis.emit("programar", { id: creada.id, programa: [{ tipo: "mv", dir: "right" }] });
            let r = await resultado;
            expect(r.ganador).toBe(ANA);
            expect(r.razon).toBe("llegó a la salida");
            expect(r.pasos[0].posiciones).toEqual(creada.partida.nivel.inicios);
        });

        it("unirse otra vez a una partida en la que ya estás devuelve la partida (botón Jugar)", async function(){
            let ana = await socketDe(ANA);
            let luis = await socketDe(LUIS);
            ana.emit("crearPartida", { dificultad: "mediano", semilla: 3030 });
            let creada = await esperar(ana, "partidaCreada");
            luis.emit("unirsePartida", { id: creada.id });
            await esperar(luis, "partidaActualizada");
            luis.emit("unirsePartida", { id: creada.id });
            let p = await esperar(luis, "partidaActualizada");
            expect(p.estado).toBe("programando");
        });

        it("tras recargar la página el jugador recupera su partida en curso", async function(){
            let ana = await socketDe(ANA);
            let luis = await socketDe(LUIS);
            ana.emit("crearPartida", { dificultad: "pequeno", semilla: 2024 });
            let creada = await esperar(ana, "partidaCreada");
            luis.emit("unirsePartida", { id: creada.id });
            await esperar(luis, "partidaActualizada");

            let recargada = crearSocket(url, await cookieDe(url, LUIS));
            sockets.push(recargada);
            let p = esperar(recargada, "partidaActualizada");
            await conectado(recargada);
            expect((await p).id).toBe(creada.id);
        });

        it("no se puede programar en una partida en la que no estás", async function(){
            let ana = await socketDe(ANA);
            ana.emit("crearPartida", { dificultad: "pequeno", semilla: 2024 });
            let creada = await esperar(ana, "partidaCreada");
            ana.emit("programar", { id: creada.id, programa: [{ tipo: "mv", dir: "right" }] });
            let error = await esperar(ana, "error");
            expect(error).toContain("no admite");
        });

        it("un programa no válido se rechaza con un mensaje claro", async function(){
            let ana = await socketDe(ANA);
            let luis = await socketDe(LUIS);
            ana.emit("crearPartida", { dificultad: "pequeno", semilla: 2024 });
            let creada = await esperar(ana, "partidaCreada");
            luis.emit("unirsePartida", { id: creada.id });
            await esperar(luis, "partidaActualizada");
            luis.emit("programar", { id: creada.id, programa: [{ tipo: "mv", dir: "volar" }] });
            let error = await esperar(luis, "error");
            expect(error).toContain("Dirección no válida");
        });
    });

    describe("temporizador", function(){
        beforeEach(async function(){
            await arrancar({ segundosTemporizador: 1 });
            await crearUsuario(cad, ANA);
            await crearUsuario(cad, LUIS);
        });

        it("cuando el otro jugador no envía a tiempo, el servidor cierra la partida", async function(){
            let ana = await socketDe(ANA);
            let luis = await socketDe(LUIS);
            ana.emit("crearPartida", { dificultad: "pequeno", semilla: 2024 });
            let creada = await esperar(ana, "partidaCreada");
            luis.emit("unirsePartida", { id: creada.id });
            await esperar(luis, "partidaActualizada");

            let resultado = esperar(ana, "resultado");
            ana.emit("programar", { id: creada.id, programa: L.programaBot(creada.partida.nivel, creada.partida.nivel.inicios[0]) });
            let r = await resultado;
            expect(r.ganador).toBe(ANA);
            expect(r.comandos[LUIS]).toBe(0);
        });
    });

    describe("bot y administración", function(){
        beforeEach(async function(){
            await arrancar({ esperaBotMs: 100 });
            await crearUsuario(cad, ANA);
            await crearUsuario(cad, ADMIN, "administrador");
        });

        it("si nadie se une, la partida se completa con un bot", async function(){
            let ana = await socketDe(ANA);
            ana.emit("crearPartida", { dificultad: "pequeno", semilla: 4040 });
            let p = await esperar(ana, "partidaActualizada", function(x){ return x.jugadores.length === 2; });
            expect(p.jugadores[1]).toBe("bot@maze.local");
            expect(p.estado).toBe("programando");
        });

        it("solo el administrador puede cancelar partidas", async function(){
            let ana = await socketDe(ANA);
            ana.emit("crearPartida", { dificultad: "pequeno", semilla: 2024 });
            let creada = await esperar(ana, "partidaCreada");
            ana.emit("cancelarPartida", { id: creada.id });
            let error = await esperar(ana, "error");
            expect(error).toContain("administrador");
        });

        it("el administrador cancela una partida y los jugadores lo saben", async function(){
            let ana = await socketDe(ANA);
            let admin = await socketDe(ADMIN);
            ana.emit("crearPartida", { dificultad: "pequeno", semilla: 2024 });
            let creada = await esperar(ana, "partidaCreada");
            let cancelada = esperar(ana, "partidaCancelada");
            admin.emit("cancelarPartida", { id: creada.id });
            expect((await cancelada).id).toBe(creada.id);
        });
    });
});
