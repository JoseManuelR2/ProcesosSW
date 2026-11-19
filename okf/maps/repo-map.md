---
type: Map
title: Mapa del repositorio
description: Estadísticas generadas desde el árbol real. No editar a mano.
resource: repo://.
tags: [mapa, generado, estadisticas]
module: repo
generated: { by: tool:okf-map/1.0, at: 2026-11-19T00:00:00Z }
status: stable
stale_after: 2027-05-18
---

# Cómo se genera

```bash
python3 scripts/ai/okf_map.py
python3 scripts/ai/okf_check.py
```

# Módulos y código

| Área | Ficheros `.js` | Líneas |
|---|---|---|
| `servidor/` | 19 | 2605 |
| `cliente/` | 5 | 1481 |
| `compartido/` | 1 | 638 |

# Tests

- Jasmine: 6 ficheros spec
- Playwright: 2 ficheros spec
- Total aproximado de casos: 152

# Ficheros más grandes

| Fichero | Líneas |
|---|---|
| `cliente/juego.js` | 846 |
| `compartido/laberinto.js` | 638 |
| `cliente/controlWeb.js` | 458 |
| `servidor/modelo.js` | 349 |
| `servidor/laberintoSpec.js` | 312 |
| `servidor/modeloSpec.js` | 274 |
| `servidor/socketsSpec.js` | 267 |
| `servidor/juego.js` | 244 |
| `servidor/juegoSpec.js` | 203 |
| `servidor/sockets.js` | 186 |

# Versiones y contratos

| Clave | Valor |
|---|---|
| Node | 20+ |
| Versión | 1.0.0 |
| Tests Jasmine | 6 |
| Tests e2e | 2 |

# Conceptos del bundle por tipo

| Tipo | Conceptos |
|---|---|
| Constraint | 3 |
| Decision | 4 |
| Domain Concept | 4 |
| Map | 1 |
| Playbook | 4 |
| Reference | 1 |
| System | 5 |
