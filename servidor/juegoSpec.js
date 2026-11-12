const { GestorPartidas, EMAIL_BOT } = require("./juego.js");
const L = require("../compartido/laberinto.js");

const ANA = "ana@test.com";
const LUIS = "luis@test.com";

const OPCIONES = { dificultad: "pequeno", semilla: 1234 };

describe("Maze Duel (capa lógica de partidas)", function(){
    let gestor;

    beforeEach(function(){
        gestor = new GestorPartidas();
    });

    it("crea una partida en espera con un nivel generado para la dificultad elegida", function(){
        let p = gestor.crear(ANA, OPCIONES);
        expect(p.estado).toBe("esperando");
        expect(p.jugadores).toEqual([ANA]);
        expect(p.nivel.dificultad).toBe("pequeno");
        expect(p.nivel.semilla).toBe(1234);
        expect(p.nivel.filas).toBe(L.DIFICULTADES.pequeno.filas);
        expect(p.nivel.columnas).toBe(L.DIFICULTADES.pequeno.columnas);
        expect(L.solucionable(p.nivel)).toBeTrue();
    });

    it("la misma semilla y dificultad generan el mismo nivel", function(){
        let a = gestor.crear(ANA, OPCIONES);
        let b = gestor.crear(LUIS, OPCIONES);
        expect(JSON.stringify(a.nivel)).toBe(JSON.stringify(b.nivel));
    });

    it("rechaza una dificultad que no existe", function(){
        expect(gestor.crear(ANA, { dificultad: "inventada" }).error).toBeDefined();
    });

    it("cada jugador tiene su propia casilla de inicio según el nivel", function(){
        let p = gestor.crear(ANA, OPCIONES);
        p.agregarJugador(LUIS);
        expect(p.inicioDe(ANA)).toEqual(p.nivel.inicios[0]);
        expect(p.inicioDe(LUIS)).toEqual(p.nivel.inicios[1]);
        expect(p.inicioDe(ANA)).not.toEqual(p.inicioDe(LUIS));
    });

    it("un segundo jugador se une y la partida pasa a programando", function(){
        let p = gestor.crear(ANA, OPCIONES);
        let res = p.agregarJugador(LUIS);
        expect(res.error).toBeUndefined();
        expect(p.estado).toBe("programando");
    });

    it("unirse otra vez no es un error: devuelve yaEsta (botón Jugar)", function(){
        let p = gestor.crear(ANA, OPCIONES);
        p.agregarJugador(LUIS);
        let res = p.agregarJugador(LUIS);
        expect(res.error).toBeUndefined();
        expect(res.yaEsta).toBeTrue();
    });

    it("no se puede unir un tercer jugador", function(){
        let p = gestor.crear(ANA, OPCIONES);
        p.agregarJugador(LUIS);
        expect(p.agregarJugador("pedro@test.com").error).toBeDefined();
    });

    it("programa válido en fase programando", function(){
        let p = gestor.crear(ANA, OPCIONES);
        p.agregarJugador(LUIS);
        let res = p.programar(ANA, [{ tipo: "mv", dir: "right" }]);
        expect(res.ok).toBeTrue();
        expect(res.comandos).toBe(1);
    });

    it("no admite programas mientras la partida espera rival (fase incorrecta)", function(){
        let p = gestor.crear(ANA, OPCIONES);
        expect(p.programar(ANA, [{ tipo: "mv", dir: "right" }]).error).toBeDefined();
    });

    it("rechaza un programa con bloques no válidos", function(){
        let p = gestor.crear(ANA, OPCIONES);
        p.agregarJugador(LUIS);
        expect(p.programar(ANA, [{ tipo: "mv", dir: "diagonal" }]).error).toBeDefined();
    });

    it("rechaza un programa que no mueve al robot", function(){
        let p = gestor.crear(ANA, OPCIONES);
        p.agregarJugador(LUIS);
        expect(p.programar(ANA, []).error).toBeDefined();
    });

    it("un jugador que no está en la partida no puede programar", function(){
        let p = gestor.crear(ANA, OPCIONES);
        p.agregarJugador(LUIS);
        expect(p.programar("pedro@test.com", [{ tipo: "mv", dir: "right" }]).error).toBeDefined();
    });

    it("gana quien llega primero a la salida", function(){
        let p = gestor.crear(ANA, OPCIONES);
        p.agregarJugador(LUIS);
        p.programar(ANA, L.programaBot(p.nivel, p.inicioDe(ANA)));
        p.programar(LUIS, [{ tipo: "mv", dir: "right" }]);
        let res = p.ejecutar();
        expect(res.error).toBeUndefined();
        expect(res.ganador).toBe(ANA);
        expect(res.razon).toBe("llegó a la salida");
        expect(p.estado).toBe("terminada");
    });

    it("el resultado incluye el nivel completo y los pasos de la carrera", function(){
        let p = gestor.crear(ANA, OPCIONES);
        p.agregarJugador(LUIS);
        p.programar(ANA, L.programaBot(p.nivel, p.inicioDe(ANA)));
        p.programar(LUIS, [{ tipo: "mv", dir: "right" }]);
        let res = p.ejecutar();
        expect(res.nivel.semilla).toBe(1234);
        expect(res.nivel.mapa.length).toBe(p.nivel.filas);
        expect(res.pasos[0].posiciones).toEqual([p.nivel.inicios[0], p.nivel.inicios[1]]);
    });

    it("ejecutar dos veces no cambia una partida terminada", function(){
        let p = gestor.crear(ANA, OPCIONES);
        p.agregarJugador(LUIS);
        p.programar(ANA, L.programaBot(p.nivel, p.inicioDe(ANA)));
        p.programar(LUIS, [{ tipo: "mv", dir: "right" }]);
        p.ejecutar();
        expect(p.ejecutar().error).toBeDefined();
    });

    it("no se puede reprogramar después de terminar", function(){
        let p = gestor.crear(ANA, OPCIONES);
        p.agregarJugador(LUIS);
        p.programar(ANA, L.programaBot(p.nivel, p.inicioDe(ANA)));
        p.programar(LUIS, [{ tipo: "mv", dir: "right" }]);
        p.ejecutar();
        expect(p.programar(ANA, [{ tipo: "mv", dir: "right" }]).error).toBeDefined();
    });

    it("el temporizador arranca solo una vez y se puede cerrar el programa de quien no ha enviado", function(){
        let p = gestor.crear(ANA, OPCIONES);
        p.agregarJugador(LUIS);
        p.programar(ANA, L.programaBot(p.nivel, p.inicioDe(ANA)));
        let arranco = p.arrancarTemporizador(60, function(){}, function(){});
        let otraVez = p.arrancarTemporizador(60, function(){}, function(){});
        expect(arranco).toBeTrue();
        expect(otraVez).toBeFalse();
        p.cerrarProgramasPendientes();
        expect(p.programas[LUIS]).toEqual([]);
        expect(p.ambosProgramados()).toBeTrue();
        p.pararTemporizador();
    });

    it("con un bot, la partida se puede ejecutar en cuanto el humano programa", function(){
        let p = gestor.crear(ANA, OPCIONES);
        expect(p.agregarBot()).toBeTrue();
        expect(p.jugadores).toEqual([ANA, EMAIL_BOT]);
        expect(p.estado).toBe("programando");
        p.programar(ANA, [{ tipo: "mv", dir: "right" }]);
        expect(p.ambosProgramados()).toBeTrue();
        let res = p.ejecutar();
        expect(res.error).toBeUndefined();
    });

    it("enCursoDe devuelve la partida en programando del usuario (reconexión)", function(){
        let p = gestor.crear(ANA, OPCIONES);
        expect(gestor.enCursoDe(ANA)).toBeNull();
        p.agregarJugador(LUIS);
        expect(gestor.enCursoDe(LUIS)).toBe(p);
    });

    it("listar devuelve todas las partidas con un resumen de su nivel", function(){
        gestor.crear(ANA, { dificultad: "pequeno", semilla: 11 });
        gestor.crear(LUIS, { dificultad: "grande", semilla: 22 });
        let lista = gestor.listar();
        expect(lista.length).toBe(2);
        expect(lista.map(function(x){ return x.nivel.dificultad; }).sort()).toEqual(["grande", "pequeno"]);
        expect(lista.map(function(x){ return x.nivel.semilla; }).sort()).toEqual([11, 22]);
        expect(lista.map(function(x){ return x.nivel.filas; }).sort()).toEqual([11, 19]);
    });

    it("cancelar elimina la partida y da error si no existe", function(){
        let p = gestor.crear(ANA, OPCIONES);
        expect(gestor.cancelar(p.id).ok).toBeTrue();
        expect(gestor.obtener(p.id)).toBeNull();
        expect(gestor.cancelar("P999").error).toBeDefined();
    });

    it("limpiar borra terminadas antiguas y esperando abandonadas, no las recientes", function(){
        let vieja = gestor.crear(ANA, OPCIONES);
        vieja.creada = Date.now() - 11 * 60 * 1000;
        let reciente = gestor.crear(LUIS, OPCIONES);
        let ahora = Date.now();
        expect(gestor.limpiar(ahora)).toBe(1);
        expect(gestor.obtener(vieja.id)).toBeNull();
        expect(gestor.obtener(reciente.id)).not.toBeNull();
    });

    it("los identificadores de partida no son secuenciales", function(){
        let a = gestor.crear(ANA, OPCIONES);
        let b = gestor.crear(LUIS, OPCIONES);
        expect(a.id).not.toBe(b.id);
        expect(a.id).toMatch(/^P[0-9a-f]{6}$/);
    });
});
