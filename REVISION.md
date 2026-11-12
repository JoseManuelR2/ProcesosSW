# Revisión del proyecto ProcesosSW

> **Estado:** todos los puntos de este informe están implementados en la rama
> `feature/revision-maze-duel` (no en `main`). Las pruebas pasan: 96 specs.

Este documento recoge los errores que he encontrado al revisar el código, cómo
arreglarlos de forma sencilla y qué se podría mejorar. Está ordenado por
prioridad: primero lo que rompe el juego o es un problema de seguridad, y al
final las mejoras opcionales.

Antes de los cambios, las pruebas (`npm test`) pasaban (62 specs), pero no cubrían la
comunicación por sockets ni la interfaz, que es donde estaban los errores más graves.

---

## Resumen

| # | Gravedad | Problema | Dónde |
| --- | --- | --- | --- |
| 1 | 🔴 Crítico | Con 2 o más bloques el servidor rechaza el programa | `cliente/juego.js` (`bloquesACodigo`, `parsearCodigoCliente`) |
| 2 | 🔴 Crítico | El botón "Test" no muestra ningún movimiento | `cliente/juego.js` (`parsearCodigoCliente`) |
| 3 | 🔴 Crítico | Cualquiera puede suplantar a otro usuario en el socket (incluido el admin) | `index.js` (`identificar`) |
| 4 | 🔴 Crítico | El bloqueo por intentos fallidos no se usa en el login | `servidor/modelo.js` (`autenticar`) |
| 5 | 🟠 Alto | Bloques `if` / `if-else` / `while` no funcionan | `servidor/juego.js`, `cliente/juego.js` |
| 6 | 🟠 Alto | Temporizador duplicado al reenviar el programa | `index.js` (`programar`) |
| 7 | 🟠 Alto | XSS almacenado en la lista de partidas | `cliente/juego.js` (`actualizarListaPartidas`, `mostrarEditor`) |
| 8 | 🟠 Alto | Un usuario con sesión abierta sigue dentro aunque lo hayan eliminado | `servidor/api.js` (`requiereSesion`) |
| 9 | 🟠 Alto | Cuenta pendiente con enlace caducado que no se puede recuperar | `servidor/modelo.js` (`registrarUsuario`) |
| 10 | 🟠 Alto | Posible secuestro de cuenta al entrar con Google sobre un registro local pendiente | `servidor/modelo.js` (`iniciarConOAuth`) |
| 11 | 🟡 Medio | El botón "Jugar" de una partida en curso da error | `cliente/juego.js` / `index.js` |
| 12 | 🟡 Medio | Ambos jugadores envían su programa con el temporizador | `cliente/juego.js` / `index.js` |
| 13 | 🟡 Medio | Se puede programar o ejecutar fuera de su fase | `servidor/juego.js` / `index.js` |
| 14 | 🟡 Medio | Empate con igual número de comandos gana el creador | `servidor/juego.js` (`ejecutar`) |
| 15 | 🟡 Medio | Partidas que nunca se borran (memoria sin límite) | `servidor/juego.js` |
| 16 | 🟡 Medio | Socket.IO no funciona bien con varias instancias en Cloud Run | `deploy.yml` / `index.js` |
| 17 | 🟡 Medio | Laberinto duplicado en cliente y servidor | `juego.js` (ambos) |
| 18 | 🟡 Medio | Enumeración de usuarios (mensajes distintos según exista o no la cuenta) | `servidor/modelo.js` |
| 19 | 🟢 Bajo | `test-results/` y `.env` (ya ignorado) con riesgos de subida al repo | repositorio |
| 20 | 🟢 Bajo | Playwright: puerto distinto entre config y tests; e2e fuera del CI | `playwright.config.js`, `ci.yml` |
| 21 | 🟢 Bajo | Doble emisión de "solicitarLista" y `onclick` mezclado con jQuery | `cliente/juego.js` |
| 22 | 🟢 Bajo | Leyenda dice "player 2 start" en rojo pero no se dibuja | `cliente/juego.js` |
| 23 | 🟢 Bajo | Ruta de prueba `/api/prueba/bloqueo` expuesta en producción | `servidor/api.js` |
| 24 | 🟢 Bajo | Logs con emails (datos personales) en la consola | `index.js`, `servidor/log.js` |

---

## 🔴 Críticos

### 1. Con 2 o más bloques el servidor rechaza el programa

**Qué pasa:** en `cliente/juego.js`, la función `bloquesACodigo` une las líneas
con `lineas.join("\\n")`. En JavaScript, `"\\n"` es una **barra invertida seguida
de la letra n**, no un salto de línea. Así el programa llega al servidor como una
sola línea (`mv right\nmv down`), y `parsearCodigo` en `servidor/juego.js` no la
entiende: devuelve `null` y el servidor responde "El código no es válido".

Comprobado: con 1 bloque funciona; con 2 bloques, `parsearCodigo` devuelve `null`.

**Solución:** usar un salto de línea real en los dos sitios del cliente:

```js
// cliente/juego.js, en bloquesACodigo
return lineas.join("\n");

// cliente/juego.js, en parsearCodigoCliente
let lineas = codigo.split("\n")...
```

### 2. El botón "Test" no muestra movimientos

**Qué pasa:** el mismo error aparece en `parsearCodigoCliente`. Además de
`split("\\n")`, la expresión `linea.split(/\\s+/)` busca una barra invertida
literal seguida de `s`, así que nunca separa `"mv right"`. Resultado: la lista de
comandos queda vacía y la vista previa dice "No hay movimientos para probar".

Comprobado: `parsearCodigoCliente` devuelve `[]` para `mv right` y para `for 2`.

**Solución:** cambiar todas las `\\s` y `\\n` de esa función por `\s` y `\n`.
Hay además una copia del analizador en el cliente y otra en el servidor (ver
punto 17); lo ideal es mantener una sola.

> Nota: el commit "fix(juego): server leia data.comandos..." muestra que ya se
> ha tocado esta zona, pero el escapado sigue roto.

### 3. Cualquiera puede suplantar a otro usuario en Socket.IO

**Qué pasa:** en `index.js`, el evento `identificar` acepta cualquier email que
mande el cliente y lo guarda en `socketEmail[socket.id]`. Nunca se comprueba
contra la sesión. Con la consola del navegador se puede hacer:

```js
socket.emit("identificar", "admin@ejemplo.com");
socket.emit("cancelarPartida", "P1");   // cancela partidas como si fuera admin
```

Además, `cancelarPartida` compara con `process.env.ADMIN_EMAIL`. Si esa variable
no está definida, un socket anónimo (`undefined`) pasa la comprobación
`undefined !== undefined` → `false`, así que también puede cancelar.

**Solución:** no confiar en el cliente. Compartir la sesión de Express con
Socket.IO y tomar el email de la sesión:

```js
// index.js, justo después de crear io
io.engine.use(session(opcionesSesion));
io.use(function(socket, next){
    socket.request.session.usuario ? next() : next(new Error("No autenticado"));
});

// y dentro de cada evento, en lugar de socketEmail[socket.id]:
let email = socket.request.session.usuario.email;
```

Así se elimina `identificar` por completo. Para el rol, usar
`socket.request.session.usuario.rol === "administrador"` en lugar de comparar
con `ADMIN_EMAIL`, que es más coherente con el resto de la aplicación.

### 4. El bloqueo por intentos fallidos no se aplica en el login

**Qué pasa:** el README describe la "variante 4" como bloqueo tras 5 fallos en
15 minutos. La función `evaluarBloqueo` existe y está probada, pero solo la llama
la ruta de prueba `/api/prueba/bloqueo`. `autenticar()` nunca la usa, así que se
puede probar contraseñas sin límite (fuerza bruta).

**Solución sencilla:** guardar la lista de fallos del usuario (en la CAD, p. ej.
campo `fallos: [fechas]`) y comprobar antes de verificar la contraseña:

```js
// servidor/modelo.js, dentro de autenticar()
let estado = evaluarBloqueo(usuario.fallos || [], new Date().toISOString());
if (estado.bloqueado){
    return { error: "Cuenta bloqueada temporalmente", codigo: 429 };
}
// si la contraseña es incorrecta:
await this.cad.actualizarUsuario(email, { fallos: (usuario.fallos || []).concat(new Date().toISOString()) });
// si es correcta: fallos = []
```

---

## 🟠 Altos

### 5. Los bloques `if`, `if/else` y `while` no funcionan

- `if` y `if/else` generan líneas `if wall ahead` que `parsearCodigo` no conoce,
  así que el programa entero se rechaza (devuelve `null`). Comprobado.
- `while` (en el servidor) repite el cuerpo 50 veces **sin mirar la condición**,
  así que "while not exit" no hace lo que dice.
- Al buscar el `end` de un bloque, solo se cuentan `repeat`, `for` y `while`;
  un `if` anidado rompe el emparejamiento de `end`.
- Los condicionales (`wall ahead`, `exit visible`) no están implementados en el
  motor de ejecución.

**Solución:** o bien implementar `if` de verdad (evaluar la condición en cada
paso de la simulación, con sensores como `wall ahead`), o bien quitar esos
bloques de la paleta hasta que estén listos. Para `while`, implementar la
condición real o usar solo `repeat N`. Si se implementa, el analizador debe
contar también `if` al buscar `end`, y es mejor reescribirlo como un parser
recursivo que construya un árbol (ver mejoras).

### 6. Temporizador duplicado al reenviar el programa

**Qué pasa:** en `index.js`, cada vez que el **primer** jugador envía su programa
(`quienProgramoPrimero === email`) se crea un nuevo `setInterval` sin cancelar el
anterior. El handle del anterior se pierde (`partida.timer` se sobrescribe), así
que ese intervalo no se puede parar. Consecuencias: el contador baja más rápido,
se envían varios `timerTick`, y la partida puede ejecutarse varias veces.

**Solución:**

```js
if (partida.timer){ clearInterval(partida.timer); }   // antes de crear el nuevo
partida.timer = setInterval(...);
```

Y mejor aún: iniciar el temporizador solo la primera vez
(`if (!partida.timer && ...)`).

### 7. XSS almacenado en la lista de partidas

**Qué pasa:** `RE_EMAIL` (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) admite caracteres como
`<` o `"`. Un usuario puede registrarse con un email del tipo
`"<img src=x onerror=alert(1)>@x.com`. En `actualizarListaPartidas` (en
`cliente/juego.js`), el creador y los jugadores se meten en el HTML **sin
escapar**, y lo ve cualquiera que abra el lobby, incluido el administrador.

En `mostrarEditor` pasa lo mismo con `partida.jugadores.join(" vs ")`.

**Solución:** usar `this.escapar(...)` en todos esos campos, o mejor, construir
los elementos con jQuery (`$("<td>").text(p.creador)`). Y endurecer
`RE_EMAIL` para no admitir `<>"'` en la parte local.

### 8. Una sesión sigue activa aunque la cuenta esté eliminada

**Qué pasa:** `requiereSesion` solo mira si existe `req.session.usuario`. No
consulta la base de datos. Si un admin elimina a un usuario que tiene sesión
abierta, esa persona sigue usando la API y el juego hasta que caduque la cookie.
Lo mismo ocurre con el rol: si cambia de usuario a administrador, la sesión
guarda el rol antiguo.

**Solución sencilla:** en `requiereSesion`, volver a leer el usuario:

```js
async function requiereSesion(req, res, next){
    let u = req.session && req.session.usuario;
    if (!u) return res.status(401).send({ error: "Se requiere iniciar sesión" });
    let actual = await modelo.cad.obtenerUsuario(u.email);   // o un método de modelo
    if (!actual || actual.estado !== "confirmado") { return req.session.destroy(() => res.status(401).send({ error: "Sesión no válida" })); }
    req.session.usuario.rol = actual.rol;
    next();
}
```

### 9. Cuenta pendiente con enlace caducado que no se puede recuperar

**Qué pasa:** el mensaje del enlace caducado dice "Regístrate de nuevo". Pero
`registrarUsuario` devuelve **409 "Ya existe una cuenta con ese email"** si la
cuenta está en estado `pendiente`. Solo se permite volver a registrar si estaba
`eliminado`. El usuario queda bloqueado y no tiene forma de recibir un correo
nuevo.

**Solución:** añadir un caso para pendientes:

```js
if (existente && existente.estado === ESTADO_PENDIENTE){
    // Reenviar token nuevo y caducidad nueva (o borrar y volver a crear).
}
```

Y añadir un botón "Reenviar correo de confirmación" en la interfaz.

### 10. Posible secuestro de cuenta con Google sobre un registro local pendiente

**Qué pasa:** alguien se registra con el email de otra persona y pone su propia
contraseña (la cuenta queda `pendiente`, sin confirmar). Más tarde, la persona
real entra con Google: `iniciarConOAuth` **confirma la cuenta sin borrar la
contraseña** (solo cambia el estado). Desde ese momento, el atacante puede entrar
por email y contraseña como si fuera la víctima.

**Solución:** al confirmar por OAuth una cuenta que tenía contraseña local,
borrarla (`password: null`), igual que se hace al reactivar una cuenta eliminada.

---

## 🟡 Medios

### 11. El botón "Jugar" de una partida en curso da error

En `actualizarListaPartidas`, el botón "Play" envía `unirsePartida`. El servidor
responde "Ya estás en esta partida" porque el jugador ya está dentro, así que el
editor nunca vuelve a abrirse (por ejemplo, tras recargar la página).

**Solución:** en el servidor, si el email ya está en la partida, devolver la
partida en lugar de un error (y emitir `partidaActualizada` solo a ese socket).
Y que el socket vuelva a unirse a la sala de la partida.

### 12. Ambos jugadores envían su programa con el temporizador

En `index.js` el temporizador avisa a **toda la sala** (`io.to(data.id)`), y en
el cliente `iniciarTimer` también se ejecuta en los dos navegadores. Al acabar
el tiempo, **cada cliente** vuelve a enviar `programar` con lo que tenga en el
espacio de trabajo. Si el primero ha cambiado bloques mientras tanto, se envía
una versión distinta de la que se guardó.

**Solución:** que el temporizador solo lo gestione el servidor. El cliente solo
muestra el contador (`timerTick`) y no envía nada al terminar.

### 13. Se puede programar o ejecutar fuera de la fase correspondiente

- `programar` no comprueba `estado`. Un jugador puede cambiar su programa
  después de que la partida haya terminado, o mientras se ejecuta.
- El evento `ejecutar` no comprueba quién lo pide ni si ambos han programado.
  Si no están listos, devuelve `{error}` y el cliente recibe un `resultado` roto,
  lo que puede fallar en `mostrarResultado`. Además, reejecutar una partida
  terminada sobrescribe el resultado.

**Solución:** al inicio de `programar` y `ejecutar`:

```js
if (partida.estado !== "programando") return socket.emit("error", "La partida no admite cambios");
```

Y eliminar el evento `ejecutar` del cliente, porque la ejecución la decide el
servidor cuando ambos han programado.

### 14. Empate con igual número de comandos gana el creador

En `ejecutar`, si los dos llegan a la salida a la vez con el mismo número de
comandos, no se cambia `ganador`, que queda con el primero de la lista (el
creador). Según las reglas del propio juego debería ser **empate**.

```js
if (c0 === c1){ ganador = null; razon = "empate"; }
```

### 15. Las partidas nunca se borran

`GestorPartidas.partidas` crece sin límite. Las partidas terminadas, las
abandonadas en "esperando" y las de jugadores desconectados siguen en memoria.
Además, los IDs (`P1`, `P2`...) son predecibles.

**Solución:** borrar las partidas terminadas tras unos minutos (`setTimeout`), y
las que sigan en "esperando" tras 10 minutos. Usar IDs aleatorios con
`crypto.randomUUID()`.

### 16. Socket.IO con varias instancias en Cloud Run

Las partidas viven en la memoria de un proceso. Si Cloud Run arranca dos
instancias, un jugador puede acabar en una instancia y el rival en otra, y no se
verían. El despliegue (`deploy.yml`) no limita el número de instancias.

**Solución rápida:** añadir `--max-instances=1` al despliegue (y `--session-affinity`
si se quiere escalar). **Solución real:** guardar las partidas en MongoDB y usar
el adaptador de Redis de Socket.IO.

### 17. Laberinto y analizador duplicados en cliente y servidor

El mapa, las posiciones y el parser existen dos veces (`cliente/juego.js` y
`servidor/juego.js`). Ya hay divergencias (punto 1, 2, 5). Un cambio en uno se
olvida en el otro.

**Solución:** que el servidor envíe el mapa y las posiciones de inicio al
conectar (`partidaCreada`, `partidaActualizada`) y que el cliente no tenga
constantes propias. Para el parser, usar un único módulo compartido si el
proyecto puede servir ficheros comunes (`cliente/` puede importar un
`compartido/parser.js` vía `express.static`), o al menos un test que compare
ambas versiones.

### 18. Enumeración de usuarios

- Registro: "Ya existe una cuenta con ese email" (409) revela si un email existe.
- Login: si el usuario no existe, responde mucho más rápido (no se ejecuta
  bcrypt), lo que también revela si existe.

**Solución:** en el registro responder algo neutro ("Revisa tu correo"), y en el
login ejecutar siempre una comparación de hash aunque no exista el usuario.

---

## 🟢 Bajos

### 19. Ficheros que no deberían estar en el repositorio

- `test-results/.last-run.json` está versionado. Añadir `test-results/` y
  `playwright-report/` a `.gitignore` y borrarlo del índice con
  `git rm --cached -r test-results`.
- `.env` no está versionado (bien, está en `.gitignore`). Comprobar con
  `git log --all -- .env` que nunca se haya subido.

### 20. Playwright y CI

- `playwright.config.js` usa `baseURL: "http://localhost:3300"` pero el servidor
  arranca en el puerto 3000 y los tests usan `localhost:3000`. Unificar.
- La CI (`ci.yml`) solo ejecuta `npm test` (Jasmine). Los tests e2e no se
  ejecutan, así que pueden romperse sin avisar.

### 21. Eventos duplicados en el cliente

- `btnVolverLobby` tiene un `onclick` inline **y** un manejador de jQuery; los
  dos envían `solicitarLista`. Quedarse solo con uno (el de jQuery).
- `$(document).off(...).on(...)` se vuelve a registrar cada vez que se abre el
  editor. Funciona, pero conviene registrar los manejadores una sola vez.

### 22. Leyenda del laberinto incorrecta

La leyenda dice "red = player 2 start", pero `renderizarLaberinto` solo dibuja la
casilla de inicio del jugador 1. La de jugador 2 (`[8, 8]`) no se marca.

### 23. Ruta de prueba expuesta

`POST /api/prueba/bloqueo` es pública y no tiene sentido en producción. Cuando
se aplique el punto 4, eliminarla o protegerla con `NODE_ENV !== "production"`.

### 24. Datos personales en los logs

`console.log("identificar: " + email ...)` y los logs de `Log.registrar` guardan
emails en claro. Para una práctica es aceptable, pero conviene anotarlo o
enmascarar el email (`a***@dominio.com`).

---

## Cosas que se podrían implementar para mejorar el resultado

### Del juego (la idea de "Scratch")

1. **Condicionales de verdad:** `if wall ahead`, `if exit visible`, `if/else`.
   Es lo que hace interesante un Scratch: el robot "mira" y decide.
2. **Bucle `while` con condición real** (`while not exit`) con límite de pasos
   para evitar bucles infinitos (ya existe el tope de 50).
3. **Árbol de sintaxis en vez de texto**: enviar al servidor un JSON con los
   bloques (`{ tipo: "repeat", n: 3, hijos: [...] }`). Se elimina el parser de
   texto y los errores del punto 1, 2 y 5.
4. **Niveles**: varios laberintos (fácil, medio, difícil) elegidos al crear la
   partida, guardados en un fichero JSON compartido.
5. **Editor de laberintos** para el administrador.
6. **Vista de la simulación** paso a paso compartida por los dos jugadores
   (ya hay `pasos` en el resultado; falta animarlo en la pantalla de resultado).
7. **Distancia real por caminos** (BFS) en lugar de Manhattan para decidir quién
   está más cerca cuando nadie llega. Manhattan puede dar "más cerca" a quien
   está detrás de una pared.
8. **Reglas más claras**: mostrar en el lobby el criterio de desempate y el
   límite de comandos.
9. **Historial de partidas** guardado en MongoDB (ganadores, comandos usados,
   fecha) y un ranking por victorias.
10. **Partida contra la IA** cuando no haya rival en 30 segundos (un
    programa aleatorio o un BFS como referencia).
11. **Reconexión**: si un jugador recarga la página, recuperar su partida en
    lugar de perderla (hoy depende de que la sala siga existiendo en memoria).
12. **Modo espectador** para que el administrador o otros usuarios vean la
    partida en directo.

### De la aplicación y el código

13. **Tests del juego por sockets**: usar `socket.io-client` en Jasmine o
    Playwright para probar `crearPartida`, `programar` y `ejecutar` de extremo a
    extremo. Habría detectado los puntos 1, 2 y 6.
14. **Validación de entrada** con un esquema (por ejemplo `zod` o `joi`) en las
    rutas y en los eventos de socket.
15. **Límite de peticiones** (`express-rate-limit`) en login, registro y en los
    eventos `crearPartida` / `programar` de socket.
16. **Cabeceras de seguridad** con `helmet` (CSP, `X-Frame-Options`...).
17. **Dependencias CSS y JS desde CDN** sin `integrity` (SRI): añadir el atributo
    `integrity` y `crossorigin` a Bootstrap y jQuery.
18. **Quitar código muerto o de prueba**: `/api/prueba/bloqueo`, `this.log` vacío
    en el modelo, comentarios de "variante 4" que mezclan la prueba con la
    funcionalidad real.
19. **Un único punto de arranque para los sockets** en su propio módulo
    (`servidor/sockets.js`) en lugar de tener toda la lógica dentro de
    `index.js`, que ya tiene más de 150 líneas de manejadores.
20. **Migrar la interfaz** a un framework (Vue, React o Svelte) o al menos
    separar las plantillas. Ahora hay HTML construido con concatenación de
    cadenas, lo que es la causa de los problemas de escapado (punto 7).
21. **ESLint y Prettier** en el CI, y `npm audit` para revisar dependencias.
22. **Docker** con un `Dockerfile` propio para que el despliegue sea
    reproducible y no dependa de los buildpacks de Cloud Run.
23. **Observabilidad**: logs estructurados (JSON) y un endpoint `/health` para
    que Cloud Run compruebe que el servicio está vivo.
24. **Documentar el protocolo de sockets** (nombres de eventos y payloads) en el
    README, igual que ya está la API REST.

---

## Orden recomendado para arreglarlo

1. Puntos **1 y 2** (son fáciles y devuelven la funcionalidad básica).
2. Punto **3** (suplantación por socket), porque afecta a la seguridad del admin.
3. Puntos **6, 11, 12 y 13** (el flujo de partida).
4. Puntos **7, 8, 9 y 10** (seguridad y cuentas).
5. Punto **4** (bloqueo en el login), que es un requisito explícito del enunciado.
6. Resto de puntos y mejoras, empezando por el test de sockets (mejora 13) para
   evitar que vuelvan a aparecer errores como el del punto 1.
