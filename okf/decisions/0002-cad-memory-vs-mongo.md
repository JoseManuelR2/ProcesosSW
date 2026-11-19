---
type: Decision
title: "CAD en memoria o Mongo"
description: "Selección de CAD según MONGODB_URI."
resource: repo://servidor/cad.js
tags: [cad, mongodb, memoria]
module: servidor
generated: { by: human:josep, at: 2026-11-19T00:00:00Z }
status: stable
stale_after: 2027-05-19
---

# Decisión

Si `MONGODB_URI` está definida se usa `cadMongo.js`; si no, `cadMemoria.js`.
Esto permite pruebas sin base de datos y persistencia en producción.
---