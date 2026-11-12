const L = require("../compartido/laberinto.js");

const CLASICO = L.obtenerNivel("clasico");
const MOV = function(dir){ return { tipo: "mv", dir: dir }; };

describe("Niveles del laberinto", function(){
    it("todos los niveles son de 10x10 y tienen la salida libre", function(){
        L.NIVELES.forEach(function(n){
            expect(n.mapa.length).toBe(10);
            n.mapa.forEach(function(fila){ expect(fila.length).toBe(10); });
            expect(L.esPared(n, n.salida[0], n.salida[1])).toBeFalse();
        });
    });

    it("desde los dos inicios se llega a la salida de cada nivel en 50 movimientos o menos", function(){
        L.NIVELES.forEach(function(n){
            L.INICIOS.forEach(function(inicio){
                let distancia = L.distanciaSalida(n, inicio);
                expect(distancia).toBeLessThan(Infinity);
                expect(distancia).toBeLessThan(L.LIMITES.comandos + 1);
            });
        });
    });

    it("un nivel inexistente devuelve null", function(){
        expect(L.obtenerNivel("nada")).toBeNull();
    });
});

describe("Validación de programas", function(){
    it("acepta un programa con todos los tipos de bloque", function(){
        let programa = [
            MOV("right"),
            { tipo: "repeat", n: 2, cuerpo: [MOV("down")] },
            { tipo: "while", cond: "not exit", cuerpo: [MOV("right")] },
            { tipo: "if", cond: "wall up", cuerpo: [MOV("left")] },
            { tipo: "if", cond: "wall up", cuerpo: [MOV("left")], otro: [MOV("up")] }
        ];
        expect(L.validar(programa)).toBeNull();
    });

    it("rechaza lo que no es una lista", function(){
        expect(L.validar("mv right")).not.toBeNull();
    });

    it("rechaza direcciones y tipos desconocidos", function(){
        expect(L.validar([MOV("diagonal")])).not.toBeNull();
        expect(L.validar([{ tipo: "salto" }])).not.toBeNull();
    });

    it("rechaza repeticiones fuera de rango", function(){
        expect(L.validar([{ tipo: "repeat", n: 0, cuerpo: [] }])).not.toBeNull();
        expect(L.validar([{ tipo: "repeat", n: 11, cuerpo: [] }])).not.toBeNull();
        expect(L.validar([{ tipo: "repeat", n: 1.5, cuerpo: [] }])).not.toBeNull();
    });

    it("rechaza condiciones desconocidas", function(){
        expect(L.validar([{ tipo: "if", cond: "wall ahead", cuerpo: [] }])).not.toBeNull();
    });

    it("rechaza más de 60 bloques", function(){
        let muchos = [];
        for (let i = 0; i < 61; i++){ muchos.push(MOV("right")); }
        expect(L.validar(muchos)).not.toBeNull();
    });

    it("rechaza más de 4 niveles de anidamiento", function(){
        let anidado = [MOV("right")];
        for (let i = 0; i < 5; i++){ anidado = [{ tipo: "if", cond: "wall up", cuerpo: anidado }]; }
        expect(L.validar(anidado)).not.toBeNull();
    });
});

describe("Ejecución del programa (trazar)", function(){
    it("un movimiento contra una pared no mueve al robot pero cuenta como comando", function(){
        let t = L.trazar(CLASICO, [1, 1], [MOV("up")]);
        expect(t.final).toEqual([1, 1]);
        expect(t.camino.length).toBe(1);
    });

    it("repeat ejecuta el cuerpo n veces", function(){
        let t = L.trazar(CLASICO, [1, 1], [{ tipo: "repeat", n: 2, cuerpo: [MOV("down")] }]);
        expect(t.final).toEqual([3, 1]);
    });

    it("while not exit repite hasta llegar a la salida y se detiene allí", function(){
        let pasillo = { salida: [1, 8], mapa: ["1111111111", "1000000001", "1000000001", "1111111111"].concat(
            ["1111111111", "1111111111", "1111111111", "1111111111", "1111111111", "1111111111"]) };
        let t = L.trazar(pasillo, [1, 1], [{ tipo: "while", cond: "not exit", cuerpo: [MOV("right")] }]);
        expect(t.llega).toBeTrue();
        expect(t.final).toEqual([1, 8]);
        expect(t.camino.length).toBe(7);
    });

    it("if elige la rama según la pared", function(){
        // Desde (1,1): la pared de arriba está cerrada, entra en la rama "si" (va a la derecha).
        let conPared = [{ tipo: "if", cond: "wall up", cuerpo: [MOV("right")], otro: [MOV("down")] }];
        expect(L.trazar(CLASICO, [1, 1], conPared).final).toEqual([1, 2]);
        // La pared de la derecha está abierta: la condición es falsa y entra en la rama "no" (baja).
        let sinPared = [{ tipo: "if", cond: "wall right", cuerpo: [MOV("right")], otro: [MOV("down")] }];
        expect(L.trazar(CLASICO, [1, 1], sinPared).final).toEqual([2, 1]);
    });

    it("un bucle sin movimientos se corta y no se queda colgado", function(){
        let t = L.trazar(CLASICO, [1, 1], [{ tipo: "while", cond: "not exit", cuerpo: [] }]);
        expect(t.llega).toBeFalse();
        expect(t.camino.length).toBe(0);
    });

    it("nunca supera 50 movimientos aunque el bucle sea infinito", function(){
        let t = L.trazar(CLASICO, [1, 1], [{ tipo: "while", cond: "not exit", cuerpo: [MOV("up")] }]);
        expect(t.camino.length).toBe(L.LIMITES.comandos);
    });

    it("el robot se detiene al llegar a la salida aunque el programa siga", function(){
        let pasillo = { salida: [1, 8], mapa: ["1111111111", "1000000001", "1111111111"] };
        let programa = [];
        for (let i = 0; i < 10; i++){ programa.push(MOV("right")); }
        let t = L.trazar(pasillo, [1, 1], programa);
        expect(t.llega).toBeTrue();
        expect(t.camino.length).toBe(7);
    });
});

describe("Resolución de la carrera", function(){
    function traza(camino, llega, final){
        return { camino: camino, llega: llega, final: final };
    }

    it("gana quien llega a la salida, aunque el otro vaya por delante en distancia", function(){
        let res = L.resolver(CLASICO, [
            traza([[2, 1]], false, [2, 1]),
            traza([[8, 1], [8, 1]], true, [8, 1])
        ]);
        expect(res.indiceGanador).toBe(1);
    });

    it("si llegan los dos, gana el que usa menos movimientos", function(){
        let res = L.resolver(CLASICO, [
            traza([[1, 1], [2, 1], [3, 1]], true, [8, 1]),
            traza([[8, 1]], true, [8, 1])
        ]);
        expect(res.indiceGanador).toBe(1);
    });

    it("llegar a la vez con igual número de movimientos es empate", function(){
        let res = L.resolver(CLASICO, [
            traza([[8, 1]], true, [8, 1]),
            traza([[8, 1]], true, [8, 1])
        ]);
        expect(res.indiceGanador).toBeNull();
        expect(res.razon).toContain("empate");
    });

    it("si nadie llega, gana el más cercano por caminos (no por línea recta)", function(){
        // (7,1) está a 1 paso de la salida; (1,1) está a más de 10 pasos por caminos.
        let res = L.resolver(CLASICO, [
            traza([], false, [7, 1]),
            traza([], false, [1, 1])
        ]);
        expect(res.indiceGanador).toBe(0);
        expect(res.razon).toBe("más cerca de la salida");
    });

    it("la fotografía de la carrera tiene una posición por jugador y paso", function(){
        let trazas = [traza([[2, 1], [3, 1]], false, [3, 1]), traza([[8, 2]], false, [8, 2])];
        let pasos = L.lineaTemporal(CLASICO, L.INICIOS, trazas);
        expect(pasos.length).toBe(2);
        expect(pasos[1].posiciones[0]).toEqual([3, 1]);
        expect(pasos[1].posiciones[1]).toEqual([8, 2]);
    });
});

describe("Bot", function(){
    it("el bot sigue la ruta más corta y llega a la salida de cada nivel", function(){
        L.NIVELES.forEach(function(n){
            let programa = L.programaBot(n, L.INICIOS[1]);
            expect(L.validar(programa)).toBeNull();
            expect(L.trazar(n, L.INICIOS[1], programa).llega).toBeTrue();
        });
    });
});
