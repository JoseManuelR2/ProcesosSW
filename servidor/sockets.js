// Capa de comunicación en tiempo real (Socket.IO) del juego Maze Duel.
// - La identidad sale de la sesión HTTP, nunca de lo que envía el cliente.
// - Cada evento revalida la cuenta contra la base de datos.
// - El servidor es quien decide las fases y el temporizador.
// Protocolo documentado en el README (sección "Protocolo de Maze Duel").
const { crearLimitador } = require("./limitador.js");

const MINUTO = 60 * 1000;
const DIEZ_SEGUNDOS = 10 * 1000;

function montarSockets(io, opciones){
    const gestor = opciones.gestor;
    const modelo = opciones.modelo;
    const esperaBotMs = opciones.esperaBotMs;
    const segundosTemporizador = opciones.segundosTemporizador;
    const limitador = crearLimitador();

    // Las cookies de la sesión HTTP también viajan en el handshake de Socket.IO.
    io.engine.use(opciones.sesion);

    io.use(async function(socket, next){
        try{
            let sesion = socket.request.session;
            let email = sesion && sesion.usuario && sesion.usuario.email;
            let usuario = email ? await modelo.usuarioVigente(email) : null;
            if (!usuario){
                return next(new Error("No autenticado"));
            }
            socket.data.email = usuario.email;
            next();
        }
        catch(e){
            next(e);
        }
    });

    function emitirLista(){
        io.emit("listaPartidas", gestor.listar());
    }

    // Registra un evento con revalidación de la cuenta y límite de frecuencia.
    function accion(socket, nombre, maximo, ventanaMs, fn){
        socket.on(nombre, async function(datos){
            try{
                let usuario = await modelo.usuarioVigente(socket.data.email);
                if (!usuario){
                    return socket.emit("error", "Tu sesión ya no es válida. Vuelve a iniciar sesión.");
                }
                if (!limitador.permitir(nombre + ":" + usuario.email, maximo, ventanaMs)){
                    return socket.emit("error", "Demasiadas peticiones. Espera un momento.");
                }
                await fn(usuario, datos || {});
            }
            catch(e){
                console.error(e);
                socket.emit("error", "Error interno del servidor");
            }
        });
    }

    // Si nadie se une en el tiempo de espera, la partida se completa con un bot.
    function programarBot(partida){
        partida.temporizadorBot = setTimeout(function(){
            if (gestor.obtener(partida.id) === partida && partida.estado === "esperando"){
                partida.agregarBot();
                io.to(partida.id).emit("partidaActualizada", partida.resumen());
                emitirLista();
            }
        }, esperaBotMs);
        if (partida.temporizadorBot.unref){ partida.temporizadorBot.unref(); }
    }

    function finalizar(partida){
        let resultado = partida.ejecutar();
        if (resultado.error){ return; }
        io.to(partida.id).emit("resultado", resultado);
        emitirLista();
    }

    io.on("connection", function(socket){
        let email = socket.data.email;

        // Al conectar (o recargar la página) se recupera la partida en curso.
        let enCurso = gestor.enCursoDe(email);
        if (enCurso){
            socket.join(enCurso.id);
            socket.emit("partidaActualizada", enCurso.resumen());
        }
        socket.emit("listaPartidas", gestor.listar());

        accion(socket, "solicitarLista", 60, MINUTO, async function(){
            socket.emit("listaPartidas", gestor.listar());
        });

        accion(socket, "crearPartida", 5, MINUTO, async function(usuario, datos){
            let partida = gestor.crear(usuario.email, datos.nivel);
            if (partida.error){
                return socket.emit("error", partida.error);
            }
            socket.join(partida.id);
            socket.emit("partidaCreada", { id: partida.id, partida: partida.resumen() });
            programarBot(partida);
            emitirLista();
        });

        accion(socket, "unirsePartida", 20, MINUTO, async function(usuario, datos){
            let partida = gestor.obtener(datos.id);
            if (!partida){
                return socket.emit("error", "Partida no encontrada");
            }
            let resultado = partida.agregarJugador(usuario.email);
            if (resultado.error){
                return socket.emit("error", resultado.error);
            }
            socket.join(partida.id);
            if (resultado.yaEsta){
                return socket.emit("partidaActualizada", partida.resumen());
            }
            clearTimeout(partida.temporizadorBot);
            io.to(partida.id).emit("partidaActualizada", partida.resumen());
            emitirLista();
        });

        accion(socket, "programar", 30, DIEZ_SEGUNDOS, async function(usuario, datos){
            let partida = gestor.obtener(datos.id);
            if (!partida){
                return socket.emit("error", "Partida no encontrada");
            }
            let resultado = partida.programar(usuario.email, datos.programa);
            if (resultado.error){
                return socket.emit("error", resultado.error);
            }
            socket.emit("programado", { ok: true, comandos: resultado.comandos });

            if (partida.ambosProgramados()){
                return finalizar(partida);
            }
            // El temporizador lo gestiona el servidor y solo arranca una vez.
            let arrancado = partida.arrancarTemporizador(
                segundosTemporizador,
                function(segundos){ io.to(partida.id).emit("timerTick", { segundos: segundos }); },
                function(){
                    partida.cerrarProgramasPendientes();
                    finalizar(partida);
                }
            );
            if (arrancado){
                io.to(partida.id).emit("timerInicio", { segundos: segundosTemporizador });
            }
        });

        accion(socket, "cancelarPartida", 30, MINUTO, async function(usuario, datos){
            if (usuario.rol !== "administrador"){
                return socket.emit("error", "Solo el administrador puede cancelar partidas");
            }
            let resultado = gestor.cancelar(datos.id);
            if (resultado.error){
                return socket.emit("error", resultado.error);
            }
            io.to(datos.id).emit("partidaCancelada", { id: datos.id });
            emitirLista();
        });
    });

    // Limpieza periódica de partidas abandonadas o terminadas.
    let limpieza = setInterval(function(){
        if (gestor.limpiar(Date.now()) > 0){ emitirLista(); }
    }, MINUTO);
    if (limpieza.unref){ limpieza.unref(); }

    return {
        cerrar: function(){
            clearInterval(limpieza);
            Object.keys(gestor.partidas).forEach(function(id){
                let p = gestor.partidas[id];
                clearTimeout(p.temporizadorBot);
                p.pararTemporizador();
            });
        }
    };
}

module.exports = { montarSockets };
