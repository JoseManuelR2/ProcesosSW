const L = require("../compartido/laberinto.js");

const MOV = function(dir){ return { tipo: "mv", dir: dir }; };

// Niveles mínimos para probar una mecánica concreta sin depender del azar.
const PASILLO = { filas: 3, columnas: 8, mapa: ["11111111", "10000001", "11111111"], salida: [1, 6], inicios: [[1, 1], [1, 2]], maxPasos: 20 };
const HIELO = { filas: 3, columnas: 6, mapa: ["111111", "10HH01", "111111"], salida: [1, 4], inicios: [[1, 1], [1, 2]], maxPasos: 20 };
const TRAMPA = { filas: 3, columnas: 7, mapa: ["1111111", "10T0001", "1111111"], salida: [1, 5], inicios: [[1, 1], [1, 3]], maxPasos: 20 };
const TELEPORT = {
    filas: 3, columnas: 10,
    mapa: ["1111111111", "10P0000P01", "1111111111"],
    salida: [1, 8], inicios: [[1, 1], [1, 6]], maxPasos: 20,
    teleports: [[[1, 2], [1, 7]]]
};
const FLECHA = { filas: 3, columnas: 8, mapa: ["11111111", "10>00001", "11111111"], salida: [1, 6], inicios: [[1, 1], [1, 5]], maxPasos: 20 };
const VISTA = { filas: 3, columnas: 9, mapa: ["111111111", "100100001", "111111111"], salida: [1, 7], inicios: [[1, 1], [1, 4]], maxPasos: 20 };
const CARRERA = { filas: 3, columnas: 12, mapa: ["111111111111", "100000000001", "111111111111"], salida: [1, 10], inicios: [[1, 1], [1, 2]], maxPasos: 20 };

describe("Generación procedural de niveles", function(){
    it("la misma semilla genera siempre el mismo nivel", function(){
        let a = L.generarNivel({ dificultad: "mediano", semilla: 1234 });
        let b = L.generarNivel({ dificultad: "mediano", semilla: 1234 });
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    it("semillas distintas generan laberintos distintos", function(){
        let a = L.generarNivel({ dificultad: "mediano", semilla: 1 });
        let b = L.generarNivel({ dificultad: "mediano", semilla: 2 });
        expect(a.mapa.join("\n")).not.toBe(b.mapa.join("\n"));
    });

    it("cada dificultad tiene su tamaño", function(){
        ["pequeno", "mediano", "grande"].forEach(function(clave){
            let nivel = L.generarNivel({ dificultad: clave, semilla: 7 });
            expect(nivel.filas).toBe(L.DIFICULTADES[clave].filas);
            expect(nivel.columnas).toBe(L.DIFICULTADES[clave].columnas);
            expect(nivel.mapa.length).toBe(nivel.filas);
            nivel.mapa.forEach(function(fila){ expect(fila.length).toBe(nivel.columnas); });
        });
    });

    it("los bordes son paredes y las salidas de los dos jugadores son pasillos", function(){
        ["pequeno", "mediano", "grande"].forEach(function(clave){
            let nivel = L.generarNivel({ dificultad: clave, semilla: 3 });
            expect(L.esPared(nivel, 0, 0)).toBeTrue();
            expect(L.esPared(nivel, nivel.filas - 1, nivel.columnas - 1)).toBeTrue();
            nivel.inicios.forEach(function(inicio){
                expect(L.esPared(nivel, inicio[0], inicio[1])).toBeFalse();
            });
            expect(L.esPared(nivel, nivel.salida[0], nivel.salida[1])).toBeFalse();
        });
    });

    it("todos los niveles generados son resolubles dentro del límite de movimientos", function(){
        ["pequeno", "mediano", "grande"].forEach(function(clave){
            for (let semilla = 1; semilla <= 10; semilla++){
                let nivel = L.generarNivel({ dificultad: clave, semilla: semilla });
                expect(L.solucionable(nivel)).toBeTrue();
                nivel.inicios.forEach(function(inicio){
                    expect(L.distanciaSalida(nivel, inicio, inicio)).toBeLessThan(L.maximoPasos(nivel));
                });
            }
        });
    });

    it("el mapa incluye hielo, trampas, flechas y teletransportes", function(){
        let encontradas = { H: 0, T: 0, P: 0, "^": 0, v: 0, "<": 0, ">": 0 };
        for (let semilla = 1; semilla <= 8; semilla++){
            let nivel = L.generarNivel({ dificultad: "grande", semilla: semilla });
            nivel.mapa.join("").split("").forEach(function(c){
                if (encontradas.hasOwnProperty(c)){ encontradas[c]++; }
            });
        }
        expect(encontradas.H).toBeGreaterThan(0);
        expect(encontradas.T).toBeGreaterThan(0);
        expect(encontradas.P).toBeGreaterThan(0);
        expect(encontradas["^"] + encontradas.v + encontradas["<"] + encontradas[">"]).toBeGreaterThan(0);
    });

    it("el bot resuelve cualquier nivel generado", function(){
        ["pequeno", "mediano", "grande"].forEach(function(clave){
            for (let semilla = 1; semilla <= 5; semilla++){
                let nivel = L.generarNivel({ dificultad: clave, semilla: semilla });
                nivel.inicios.forEach(function(inicio){
                    let programa = L.programaBot(nivel, inicio);
                    expect(L.trazar(nivel, inicio, programa).llega).toBeTrue();
                });
            }
        });
    });

    it("el límite de movimientos crece con el tamaño del mapa", function(){
        let pequeno = L.generarNivel({ dificultad: "pequeno", semilla: 1 });
        let grande = L.generarNivel({ dificultad: "grande", semilla: 1 });
        expect(L.maximoPasos(grande)).toBeGreaterThan(L.maximoPasos(pequeno));
    });
});

describe("Validación de programas", function(){
    it("acepta un programa con todos los tipos de bloque y negaciones", function(){
        let programa = [
            MOV("right"),
            { tipo: "repeat", n: 2, cuerpo: [MOV("down")] },
            { tipo: "while", cond: "exit visible", dir: "right", negada: true, cuerpo: [MOV("right")] },
            { tipo: "if", cond: "ice", dir: "left", negada: true, cuerpo: [MOV("left")] },
            { tipo: "if", cond: "wall", dir: "up", cuerpo: [MOV("left")], otro: [MOV("up")] }
        ];
        expect(L.validar(programa)).toBeNull();
    });

    it("rechaza lo que no es una lista", function(){
        expect(L.validar("mv right")).not.toBeNull();
    });

    it("rechaza direcciones, tipos y condiciones desconocidas", function(){
        expect(L.validar([MOV("diagonal")])).not.toBeNull();
        expect(L.validar([{ tipo: "salto" }])).not.toBeNull();
        expect(L.validar([{ tipo: "if", cond: "wall ahead", dir: "up", cuerpo: [] }])).not.toBeNull();
    });

    it("rechaza una dirección de condición desconocida", function(){
        expect(L.validar([{ tipo: "if", cond: "trap", dir: "diagonal", cuerpo: [] }])).not.toBeNull();
    });

    it("la condición wall exige dirección", function(){
        expect(L.validar([{ tipo: "if", cond: "wall", cuerpo: [] }])).not.toBeNull();
    });

    it("rechaza una negación que no es booleana", function(){
        expect(L.validar([{ tipo: "if", cond: "ice", negada: "si", cuerpo: [] }])).not.toBeNull();
    });

    it("rechaza repeticiones fuera de rango", function(){
        expect(L.validar([{ tipo: "repeat", n: 0, cuerpo: [] }])).not.toBeNull();
        expect(L.validar([{ tipo: "repeat", n: 11, cuerpo: [] }])).not.toBeNull();
        expect(L.validar([{ tipo: "repeat", n: 1.5, cuerpo: [] }])).not.toBeNull();
    });

    it("rechaza más de 60 bloques", function(){
        let muchos = [];
        for (let i = 0; i < 61; i++){ muchos.push(MOV("right")); }
        expect(L.validar(muchos)).not.toBeNull();
    });

    it("rechaza más de 4 niveles de anidamiento", function(){
        let anidado = [MOV("right")];
        for (let i = 0; i < 5; i++){ anidado = [{ tipo: "if", cond: "wall", dir: "up", cuerpo: anidado }]; }
        expect(L.validar(anidado)).not.toBeNull();
    });
});

describe("Ejecución del programa (trazar)", function(){
    it("un movimiento contra una pared no mueve al robot pero cuenta como comando", function(){
        let t = L.trazar(PASILLO, [1, 1], [MOV("up")]);
        expect(t.final).toEqual([1, 1]);
        expect(t.camino.length).toBe(1);
    });

    it("repeat ejecuta el cuerpo n veces", function(){
        let t = L.trazar(PASILLO, [1, 1], [{ tipo: "repeat", n: 2, cuerpo: [MOV("right")] }]);
        expect(t.final).toEqual([1, 3]);
    });

    it("while con la condición negada repite hasta que deja de cumplirse", function(){
        let t = L.trazar(PASILLO, [1, 1], [{ tipo: "while", cond: "wall", dir: "right", negada: true, cuerpo: [MOV("right")] }]);
        expect(t.llega).toBeTrue();
        expect(t.final).toEqual([1, 6]);
    });

    it("if ejecuta el cuerpo cuando la condición es cierta y la rama 'otro' cuando es falsa", function(){
        let conPared = [{ tipo: "if", cond: "wall", dir: "up", cuerpo: [MOV("right")], otro: [MOV("down")] }];
        expect(L.trazar(PASILLO, [1, 1], conPared).final).toEqual([1, 2]);
        let sinPared = [{ tipo: "if", cond: "wall", dir: "up", negada: true, cuerpo: [MOV("left")], otro: [MOV("right")] }];
        expect(L.trazar(PASILLO, [1, 1], sinPared).final).toEqual([1, 2]);
    });

    it("la negación invierte la condición", function(){
        let normal = [{ tipo: "if", cond: "wall", dir: "up", cuerpo: [MOV("right")] }];
        let negada = [{ tipo: "if", cond: "wall", dir: "up", negada: true, cuerpo: [MOV("right")] }];
        expect(L.trazar(PASILLO, [1, 1], normal).camino.length).toBe(1);
        expect(L.trazar(PASILLO, [1, 1], negada).camino.length).toBe(0);
    });

    it("'exit visible' mira en la dirección indicada y detecta paredes entre medias", function(){
        let derecha = [{ tipo: "if", cond: "exit visible", dir: "right", cuerpo: [MOV("right")] }];
        let izquierda = [{ tipo: "if", cond: "exit visible", dir: "left", cuerpo: [MOV("right")] }];
        expect(L.trazar(VISTA, [1, 4], derecha).final).toEqual([1, 5]);
        expect(L.trazar(VISTA, [1, 4], izquierda).final).toEqual([1, 4]);
        expect(L.trazar(VISTA, [1, 1], derecha).final).toEqual([1, 1]);
    });

    it("los sensores miran la casilla vecina en la dirección elegida", function(){
        expect(L.trazar(HIELO, [1, 1], [{ tipo: "if", cond: "ice", dir: "right", cuerpo: [MOV("right")] }]).final).toEqual([1, 4]);
        expect(L.trazar(TRAMPA, [1, 3], [{ tipo: "if", cond: "trap", dir: "left", cuerpo: [MOV("right")] }]).final).toEqual([1, 4]);
        expect(L.trazar(TELEPORT, [1, 1], [{ tipo: "if", cond: "teleport", dir: "right", cuerpo: [MOV("right")] }]).final).toEqual([1, 7]);
        expect(L.trazar(FLECHA, [1, 1], [{ tipo: "if", cond: "arrow", dir: "right", cuerpo: [MOV("right")] }]).final).toEqual([1, 2]);
    });

    it("la negación también se aplica a una condición direccional", function(){
        let t = L.trazar(TRAMPA, [1, 4], [{ tipo: "if", cond: "trap", dir: "left", negada: true, cuerpo: [MOV("right")] }]);
        expect(t.llega).toBeTrue();
        expect(t.final).toEqual([1, 5]);
    });

    it("se compone while + negación + sensor + dirección ('mientras no haya trampa a la izquierda')", function(){
        let nivel = {
            filas: 3, columnas: 10,
            mapa: ["1111111111", "10T0000001", "1111111111"],
            salida: [1, 8], inicios: [[1, 1], [1, 4]], maxPasos: 20
        };
        let t = L.trazar(nivel, [1, 4], [
            { tipo: "while", cond: "trap", dir: "left", negada: true, cuerpo: [MOV("right")] }
        ]);
        expect(t.llega).toBeTrue();
        expect(t.final).toEqual([1, 8]);
        expect(t.camino.length).toBe(4);
    });

    it("un bucle sin movimientos se corta y no se queda colgado", function(){
        let t = L.trazar(PASILLO, [1, 1], [{ tipo: "while", cond: "wall", dir: "up", cuerpo: [] }]);
        expect(t.camino.length).toBe(0);
    });

    it("nunca supera el máximo del nivel aunque el bucle sea infinito", function(){
        let t = L.trazar(PASILLO, [1, 1], [{ tipo: "while", cond: "wall", dir: "up", cuerpo: [MOV("up")] }]);
        expect(t.camino.length).toBe(PASILLO.maxPasos);
    });
});

describe("Casillas especiales", function(){
    it("en el hielo el robot resbala hasta la siguiente casilla libre", function(){
        let t = L.trazar(HIELO, [1, 1], [MOV("right")]);
        expect(t.final).toEqual([1, 4]);
        expect(t.llega).toBeTrue();
    });

    it("pisar una trampa devuelve al robot a su salida", function(){
        let t = L.trazar(TRAMPA, [1, 1], [MOV("right")]);
        expect(t.final).toEqual([1, 1]);
        expect(t.camino.length).toBe(1);
    });

    it("una trampa en el único pasillo hace imposible llegar", function(){
        expect(L.distanciaSalida(TRAMPA, [1, 1], [1, 1])).toBe(Infinity);
    });

    it("un teletransporte lleva a su pareja", function(){
        let t = L.trazar(TELEPORT, [1, 1], [MOV("right")]);
        expect(t.final).toEqual([1, 7]);
        let completa = L.trazar(TELEPORT, [1, 1], [MOV("right"), MOV("right")]);
        expect(completa.llega).toBeTrue();
        expect(completa.final).toEqual([1, 8]);
    });

    it("una flecha solo se puede atravesar en su dirección", function(){
        expect(L.trazar(FLECHA, [1, 1], [MOV("right")]).final).toEqual([1, 2]);
        expect(L.trazar(FLECHA, [1, 3], [MOV("left")]).final).toEqual([1, 3]);
    });
});

describe("Resolución de la carrera", function(){
    function traza(camino, llega, final, inicio){
        return { camino: camino, llega: llega, final: final, inicio: inicio || [1, 1] };
    }

    it("gana quien llega a la salida", function(){
        let res = L.resolver(CARRERA, [
            traza([[1, 2]], false, [1, 2], [1, 1]),
            traza([[1, 10]], true, [1, 10], [1, 9])
        ]);
        expect(res.indiceGanador).toBe(1);
        expect(res.razon).toBe("llegó a la salida");
    });

    it("si llegan los dos, gana el que usa menos movimientos", function(){
        let res = L.resolver(CARRERA, [
            traza([[1, 2], [1, 3]], true, [1, 10], [1, 1]),
            traza([[1, 10]], true, [1, 10], [1, 9])
        ]);
        expect(res.indiceGanador).toBe(1);
    });

    it("llegar a la vez con igual número de movimientos es empate", function(){
        let res = L.resolver(CARRERA, [
            traza([[1, 10]], true, [1, 10], [1, 9]),
            traza([[1, 10]], true, [1, 10], [1, 9])
        ]);
        expect(res.indiceGanador).toBeNull();
        expect(res.razon).toContain("empate");
    });

    it("si nadie llega, gana el más cercano por caminos", function(){
        let res = L.resolver(CARRERA, [
            traza([], false, [1, 8], [1, 1]),
            traza([], false, [1, 2], [1, 2])
        ]);
        expect(res.indiceGanador).toBe(0);
        expect(res.razon).toBe("más cerca de la salida");
    });

    it("la fotografía de la carrera empieza con cada robot en su salida", function(){
        let trazas = [
            traza([[1, 2], [1, 3]], false, [1, 3], [1, 1]),
            traza([[1, 3]], false, [1, 3], [1, 2])
        ];
        let pasos = L.lineaTemporal(CARRERA, CARRERA.inicios, trazas);
        expect(pasos.length).toBe(3);
        expect(pasos[0].posiciones).toEqual([[1, 1], [1, 2]]);
        expect(pasos[1].posiciones).toEqual([[1, 2], [1, 3]]);
        expect(pasos[2].posiciones).toEqual([[1, 3], [1, 3]]);
    });
});
