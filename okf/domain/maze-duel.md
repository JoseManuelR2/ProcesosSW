---
type: Domain Concept
title: "Maze Duel"
description: "Reglas del juego, bloques y protocolo Socket.IO."
resource: repo://compartido/laberinto.js
tags: [juego, maze, bloques, socketio]
module: compartido
generated: { by: human:josep, at: 2026-11-19T00:00:00Z }
status: stable
stale_after: 2027-05-19
---

# Maze Duel

- Laberinto procedural por semilla; tamaños Small/Medium/Large.
- Los jugadores programan un robot con bloques (máx. 60, 4 niveles).
- Condiciones: wall, exit visible, ice, trap, teleport, arrow; negables.
- Gana quien llega antes; si nadie, quien está más cerca por caminos.
- Bot con ruta óptima si nadie se une en 30 s.
---