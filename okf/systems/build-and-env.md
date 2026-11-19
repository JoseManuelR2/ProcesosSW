---
type: System
title: "Entorno y build"
description: "Node.js 20+, npm, variables de entorno y despliegue en Cloud Run."
resource: repo://package.json
tags: [build, env, node, cloudrun]
module: repo
generated: { by: human:josep, at: 2026-11-19T00:00:00Z }
status: stable
stale_after: 2027-05-19
---

# Entorno

Requisitos: Node.js 20+. Dependencias en `package.json`. Variables en `.env`
(ver `.env.example`). Sin `MONGODB_URI`, la CAD es en memoria.

## Comandos

```bash
npm install
npm start
npm test
npm run test:e2e
```
---