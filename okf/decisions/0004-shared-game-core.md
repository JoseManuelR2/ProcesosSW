---
type: Decision
title: "Núcleo del juego compartido"
description: "compartido/laberinto.js usado por cliente y servidor."
resource: repo://compartido/laberinto.js
tags: [juego, compartido, paridad]
module: compartido
generated: { by: human:josep, at: 2026-11-19T00:00:00Z }
status: stable
stale_after: 2027-05-19
---

# Decisión

El intérprete y las reglas del laberinto viven en `compartido/laberinto.js`,
usado por cliente y servidor, garantizando que lo que se prueba en el navegador
es lo que se ejecuta.
---