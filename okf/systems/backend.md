---
type: System
title: "Backend (Node/Express)"
description: "Servidor Express con Socket.IO, MongoDB y autenticación."
resource: repo://index.js
tags: [backend, express, node, socketio]
module: servidor
generated: { by: human:josep, at: 2026-11-19T00:00:00Z }
status: stable
stale_after: 2027-05-19
---

# Backend

Punto de entrada `index.js` (crearServidor). Cuatro capas: API (`servidor/api.js`),
lógica (`servidor/modelo.js`), CAD (`servidor/cad.js`, `cadMongo.js`, `cadMemoria.js`)
y log (`servidor/log.js`). Socket.IO en `servidor/sockets.js` y `servidor/juego.js`.

## Reglas

- La lógica no accede a la BD; solo la CAD.
- Las rutas revalidan sesión y rol en el servidor.
- El primer administrador se siembra con `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
---