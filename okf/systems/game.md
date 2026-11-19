---
type: System
title: "Maze Duel"
description: "Juego en tiempo real: partidas, programación de robots, laberinto procedural."
resource: repo://compartido/laberinto.js
tags: [juego, maze, socketio, realtime]
module: compartido
generated: { by: human:josep, at: 2026-11-19T00:00:00Z }
status: stable
stale_after: 2027-05-19
---

# Maze Duel

Núcleo compartido en `compartido/laberinto.js` (cliente y servidor usan el mismo
intérprete). Socket.IO gestiona partidas, temporizador y bot. El administrador
puede ver y cancelar partidas.

## Reglas

- Gana quien llega antes a la salida.
- Si nadie llega, gana quien está más cerca por caminos.
- Máximo 60 bloques y 4 niveles de anidamiento.
- Casillas especiales: hielo, trampa, teletransporte, flechas.
---