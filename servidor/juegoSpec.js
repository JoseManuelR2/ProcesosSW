const { GestorPartidas, MAZE, STARTS, EXIT, esPared, distancia } = require("./juego.js");

describe("Maze Duel (capa lógica)", function(){
    let gestor;

    beforeEach(function(){
        gestor = new GestorPartidas();
    });

    it("crea una partida con un jugador", function(){
        let p = gestor.crear("ana@test.com");
        expect(p.id).toBeDefined();
        expect(p.jugadores.length).toBe(1);
        expect(p.estado).toBe("esperando");
    });

    it("un segundo jugador se une y la partida pasa a programando", function(){
        let p = gestor.crear("ana@test.com");
        let res = p.agregarJugador("luis@test.com");
        expect(res.error).toBeUndefined();
        expect(p.jugadores.length).toBe(2);
        expect(p.estado).toBe("programando");
    });

    it("no se puede unir un tercer jugador", function(){
        let p = gestor.crear("ana@test.com");
        p.agregarJugador("luis@test.com");
        let res = p.agregarJugador("pedro@test.com");
        expect(res.error).toBeDefined();
    });

    it("no se puede unir el mismo jugador dos veces", function(){
        let p = gestor.crear("ana@test.com");
        let res = p.agregarJugador("ana@test.com");
        expect(res.error).toBeDefined();
    });

    it("programa comandos válidos", function(){
        let p = gestor.crear("ana@test.com");
        p.agregarJugador("luis@test.com");
        let res = p.programar("ana@test.com", ["right", "down", "right"]);
        expect(res.error).toBeUndefined();
        expect(p.programas["ana@test.com"]).toEqual(["right", "down", "right"]);
    });

    it("rechaza comandos inválidos", function(){
        let p = gestor.crear("ana@test.com");
        p.agregarJugador("luis@test.com");
        let res = p.programar("ana@test.com", ["right", "diagonal"]);
        expect(res.error).toBeDefined();
    });

    it("rechaza más de 50 comandos", function(){
        let p = gestor.crear("ana@test.com");
        p.agregarJugador("luis@test.com");
        let cmds = [];
        for (let i = 0; i < 51; i++){ cmds.push("right"); }
        let res = p.programar("ana@test.com", cmds);
        expect(res.error).toBeDefined();
    });

    it("un jugador que no está en la partida no puede programar", function(){
        let p = gestor.crear("ana@test.com");
        p.agregarJugador("luis@test.com");
        let res = p.programar("pedro@test.com", ["right"]);
        expect(res.error).toBeDefined();
    });

    it("ejecuta y detecta al ganador que llega a la salida", function(){
        let p = gestor.crear("ana@test.com");
        p.agregarJugador("luis@test.com");
        // Ana: camino a la salida (8,1) desde (1,1)
        p.programar("ana@test.com", ["down","down","down","down","right","right","right","down","down","left","left","left","down"]);
        p.programar("luis@test.com", ["right","right","right","right","right","right","right"]);
        let res = p.ejecutar();
        expect(res.ganador).toBe("ana@test.com");
        expect(res.razon).toBe("llegó a la salida");
    });

    it("el que llega con menos comandos gana si ambos llegan", function(){
        let p = gestor.crear("ana@test.com");
        p.agregarJugador("luis@test.com");
        p.programar("ana@test.com", ["down","down","down","down","right","right","right","down","down","left","left","left","down"]);
        p.programar("luis@test.com", ["down","down","down","down","right","right","right","down","down","left","left","left","down","right"]);
        let res = p.ejecutar();
        expect(res.ganador).toBe("ana@test.com");
    });

    it("si ninguno llega, gana el que esté más cerca", function(){
        let p = gestor.crear("ana@test.com");
        p.agregarJugador("luis@test.com");
        p.programar("ana@test.com", ["right","right"]);
        p.programar("luis@test.com", ["down","down","down","down"]);
        let res = p.ejecutar();
        expect(res.ganador).toBeDefined();
        expect(res.razon).toBe("más cerca de la salida");
    });

    it("no se puede ejecutar sin programas", function(){
        let p = gestor.crear("ana@test.com");
        p.agregarJugador("luis@test.com");
        let res = p.ejecutar();
        expect(res.error).toBeDefined();
    });

    it("el muro bloquea el movimiento", function(){
        let p = gestor.crear("ana@test.com");
        p.agregarJugador("luis@test.com");
        // Intentar atravesar una pared.
        p.programar("ana@test.com", ["up"]); // (1,1) -> (0,1) que es pared
        p.programar("luis@test.com", ["down","down"]);
        let res = p.ejecutar();
        // Ana no se mueve porque (0,1) es pared.
        expect(res.posicionesFinales["ana@test.com"]).toEqual([1, 1]);
    });

    it("listar devuelve todas las partidas", function(){
        gestor.crear("ana@test.com");
        gestor.crear("luis@test.com");
        let lista = gestor.listar();
        expect(lista.length).toBe(2);
    });

    it("cancelar elimina la partida", function(){
        let p = gestor.crear("ana@test.com");
        let res = gestor.cancelar(p.id);
        expect(res.ok).toBe(true);
        expect(gestor.obtener(p.id)).toBeNull();
    });

    it("cancelar partida inexistente da error", function(){
        let res = gestor.cancelar("P999");
        expect(res.error).toBeDefined();
    });

    it("el laberinto tiene paredes en los bordes", function(){
        expect(esPared(0, 0)).toBe(true);
        expect(esPared(0, 5)).toBe(true);
        expect(esPared(9, 9)).toBe(true);
    });

    it("la salida no es pared", function(){
        expect(esPared(EXIT[0], EXIT[1])).toBe(false);
    });

    it("distancia Manhattan funciona", function(){
        expect(distancia([1,1], [8,1])).toBe(7);
        expect(distancia([1,1], [1,1])).toBe(0);
    });
});
