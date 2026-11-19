---
type: Domain Concept
title: "Persistencia"
description: "CAD en memoria o MongoDB mediante Mongoose."
resource: repo://servidor/cad.js
tags: [persistencia, mongodb, mongoose, cad]
module: servidor
generated: { by: human:josep, at: 2026-11-19T00:00:00Z }
status: stable
stale_after: 2027-05-19
---

# Persistencia

- `servidor/cad.js` selecciona CAD: Mongo si `MONGODB_URI` existe, si no memoria.
- `cadMongo.js`: Mongoose.
- `cadMemoria.js`: datos en memoria (pruebas/desarrollo).
- La capa lógica no conoce la implementación de la CAD.
---