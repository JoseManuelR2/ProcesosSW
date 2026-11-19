---
type: Decision
title: "WebSockets para el juego"
description: "Socket.IO para partidas en tiempo real."
resource: repo://servidor/sockets.js
tags: [socketio, realtime, juego]
module: servidor
generated: { by: human:josep, at: 2026-11-19T00:00:00Z }
status: stable
stale_after: 2027-05-19
---

# Decisión

El juego Maze Duel usa Socket.IO para comunicación en tiempo real. La conexión
exige sesión HTTP; el servidor identifica al jugador por la cookie, nunca por
datos del cliente.
---