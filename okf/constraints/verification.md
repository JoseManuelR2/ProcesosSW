---
type: Constraint
title: "Verificación"
description: "Comandos canónicos y qué significa verde."
resource: repo://package.json
tags: [tests, verificacion, ci]
module: repo
generated: { by: human:josep, at: 2026-11-19T00:00:00Z }
status: stable
stale_after: 2027-05-19
tests: [package.json]
---

# Comandos

```bash
npm test          # 120 specs Jasmine (capa lógica, CAD en memoria)
npm run test:e2e  # 4 specs Playwright (navegador real)
git diff --check  # sin conflictos de espacios
```

# Qué significa verde

- Código de salida 0.
- Cero tests fallidos. Los omitidos no cuentan como pasados.
- No se amplían baselines.

# Matriz de tests

| Dónde | Qué prueba | Requisitos |
|---|---|---|
| `servidor/*Spec.js` | capa lógica, usuarios, juego, laberinto, sockets | Node 20+ |
| `e2e/*.spec.js` | navegador real, lobby | Node 20+, Chromium |
---