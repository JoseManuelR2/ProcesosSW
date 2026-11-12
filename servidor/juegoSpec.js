const { GestorPartidas, EMAIL_BOT } = require("./juego.js");

const ANA = "ana@test.com";
const LUIS = "luis@test.com";

// Programas de ejemplo (árbol de bloques).
const SUBIR_Y_DERECHA = [
    { tipo: "mv", dir: "down" }, { tipo: "mv", dir: "down" }, { tipo: "mv", dir: "down" }, { tipo: "mv", dir: "down" },
    { tipo: "mv", dir: "right" }, { tipo: "mv", dir: "right" }, { tipo: "mv", dir: "right" },
    { tipo: "mv", dir: "down" }, { tipo: "mv", dir: "down" },
    { tipo: "mv", dir: "left" }, { tipo: "mv", dir: "left" }, { tipo: "mv", dir: "left" },
    { tipo: "mv", dir: "down" }
];

describe("Maze Duel (capa lógica de partidas)", function(){
    let gestor;

    beforeEach(function(){
        gestor = new GestorPartidas();
    });

    it("crea una partida en espera con el nivel elegido", function(){
        let p = gestor.crear(ANA, "cruce");
        expect(p.estado).toBe("esperando");
        expect(p.jugadores).toEqual([ANA]);
        expect(p.nivel.id).toBe("cruce");
    });

    it("rechaza un nivel que no existe", function(){
        expect(gestor.crear(ANA, "inventado").error).toBeDefined();
    });

    it("un segundo jugador se une y la partida pasa a programando", function(){
        let p = gestor.crear(ANA);
        let res = p.agregarJugador(LUIS);
        expect(res.error).toBeUndefined();
        expect(p.estado).toBe("programando");
    });

    it("unirse otra vez no es un error: devuelve yaEsta (botón Jugar)", function(){
        let p = gestor.crear(ANA);
        p.agregarJugador(LUIS);
        let res = p.agregarJugador(LUIS);
        expect(res.error).toBeUndefined();
        expect(res.yaEsta).toBeTrue();
    });

    it("no se puede unir un tercer jugador", function(){
        let p = gestor.crear(ANA);
        p.agregarJugador(LUIS);
        expect(p.agregarJugador("pedro@test.com").error).toBeDefined();
    });

    it("programa válido en fase programando", function(){
        let p = gestor.crear(ANA);
        p.agregarJugador(LUIS);
        let res = p.programar(ANA, [{ tipo: "mv", dir: "right" }]);
        expect(res.ok).toBeTrue();
        expect(res.comandos).toBe(1);
    });

    it("no admite programas mientras la partida espera rival (fase incorrecta)", function(){
        let p = gestor.crear(ANA);
        expect(p.programar(ANA, [{ tipo: "mv", dir: "right" }]).error).toBeDefined();
    });

    it("rechaza un programa con bloques no válidos", function(){
        let p = gestor.crear(ANA);
        p.agregarJugador(LUIS);
        expect(p.programar(ANA, [{ tipo: "mv", dir: "diagonal" }]).error).toBeDefined();
    });

    it("rechaza un programa que no mueve al robot", function(){
        let p = gestor.crear(ANA);
        p.agregarJugador(LUIS);
        expect(p.programar(ANA, [{ tipo: "if", cond: "wall right", cuerpo: [{ tipo: "mv", dir: "up" }] }]).error).toBeDefined();
    });

    it("un jugador que no está en la partida no puede programar", function(){
        let p = gestor.crear(ANA);
        p.agregarJugador(LUIS);
        expect(p.programar("pedro@test.com", [{ tipo: "mv", dir: "right" }]).error).toBeDefined();
    });

    it("gana quien llega primero a la salida", function(){
        let p = gestor.crear(ANA);
        p.agregarJugador(LUIS);
        p.programar(ANA, SUBIR_Y_DERECHA);
        p.programar(LUIS, [{ tipo: "mv", dir: "right" }]);
        let res = p.ejecutar();
        expect(res.error).toBeUndefined();
        expect(res.ganador).toBe(ANA);
        expect(res.razon).toBe("llegó a la salida");
        expect(p.estado).toBe("terminada");
    });

    it("ejecutar dos veces no cambia una partida terminada", function(){
        let p = gestor.crear(ANA);
        p.agregarJugador(LUIS);
        p.programar(ANA, SUBIR_Y_DERECHA);
        p.programar(LUIS, [{ tipo: "mv", dir: "right" }]);
        p.ejecutar();
        expect(p.ejecutar().error).toBeDefined();
    });

    it("no se puede reprogramar después de terminar", function(){
        let p = gestor.crear(ANA);
        p.agregarJugador(LUIS);
        p.programar(ANA, SUBIR_Y_DERECHA);
        p.programar(LUIS, [{ tipo: "mv", dir: "right" }]);
        p.ejecutar();
        expect(p.programar(ANA, [{ tipo: "mv", dir: "right" }]).error).toBeDefined();
    });

    it("el temporizador arranca solo una vez y se puede cerrar el programa de quien no ha enviado", function(){
        let p = gestor.crear(ANA);
        p.agregarJugador(LUIS);
        p.programar(ANA, SUBIR_Y_DERECHA);
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
        let p = gestor.crear(ANA);
        expect(p.agregarBot()).toBeTrue();
        expect(p.jugadores).toEqual([ANA, EMAIL_BOT]);
        expect(p.estado).toBe("programando");
        p.programar(ANA, [{ tipo: "mv", dir: "right" }]);
        expect(p.ambosProgramados()).toBeTrue();
        let res = p.ejecutar();
        expect(res.error).toBeUndefined();
    });

    it("enCursoDe devuelve la partida en programando del usuario (reconexión)", function(){
        let p = gestor.crear(ANA);
        expect(gestor.enCursoDe(ANA)).toBeNull();
        p.agregarJugador(LUIS);
        expect(gestor.enCursoDe(LUIS)).toBe(p);
    });

    it("listar devuelve todas las partidas con su nivel", function(){
        gestor.crear(ANA, "clasico");
        gestor.crear(LUIS, "zigzag");
        let lista = gestor.listar();
        expect(lista.length).toBe(2);
        expect(lista.map(function(x){ return x.nivel; }).sort()).toEqual(["clasico", "zigzag"]);
    });

    it("cancelar elimina la partida y da error si no existe", function(){
        let p = gestor.crear(ANA);
        expect(gestor.cancelar(p.id).ok).toBeTrue();
        expect(gestor.obtener(p.id)).toBeNull();
        expect(gestor.cancelar("P999").error).toBeDefined();
    });

    it("limpiar borra terminadas antiguas y esperando abandonadas, no las recientes", function(){
        let vieja = gestor.crear(ANA);
        vieja.creada = Date.now() - 11 * 60 * 1000;
        let reciente = gestor.crear(LUIS);
        let ahora = Date.now();
        expect(gestor.limpiar(ahora)).toBe(1);
        expect(gestor.obtener(vieja.id)).toBeNull();
        expect(gestor.obtener(reciente.id)).not.toBeNull();
    });

    it("los identificadores de partida no son secuenciales", function(){
        let a = gestor.crear(ANA);
        let b = gestor.crear(LUIS);
        expect(a.id).not.toBe(b.id);
        expect(a.id).toMatch(/^P[0-9a-f]{6}$/);
    });
});
