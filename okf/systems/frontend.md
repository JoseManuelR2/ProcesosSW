---
type: System
title: "Frontend (SPA)"
description: "Interfaz de navegador: controlWeb.js, juego.js, estilos.css, ui.js."
resource: repo://cliente/index.html
tags: [frontend, spa, bootstrap, jquery]
module: cliente
generated: { by: human:josep, at: 2026-11-19T00:00:00Z }
status: stable
stale_after: 2027-05-19
---

# Frontend

SPA en `cliente/index.html`. Capas: presentación (`controlWeb.js`, `juego.js`),
comunicación (`clienteRest.js`), utilidades (`ui.js`). Estilos en `cliente/estilos.css`.

## Reglas

- El cliente solo se comunica por API REST y Socket.IO.
- La identidad visual vive en `estilos.css` y `ui.js`.
- Los selectores e2e no deben desaparecer sin justificación.
---