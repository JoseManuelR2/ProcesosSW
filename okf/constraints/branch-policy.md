---
type: Constraint
title: "Política de ramas y pushes"
description: "main es producción. Rama por tarea, commits locales, push solo del usuario."
resource: repo://README.md
tags: [ramas, git, main]
module: repo
generated: { by: human:josep, at: 2026-11-19T00:00:00Z }
status: stable
stale_after: 2027-05-19
---

# Regla

- `main` es producción y la única rama de integración.
- Toda implementación o fix va en una rama nueva desde `main`.
- El agente puede hacer commits en su rama.
- El agente nunca hace push, PR ni merge.
- En `main`, el agente nunca ejecuta commit, merge ni push.

# Nombres de rama

| Prefijo | Uso |
|---|---|
| `feat/<slug>` | funcionalidad nueva |
| `fix/<slug>` | corrección de un bug |
| `docs/<slug>` | documentación o bundle OKF |
| `ci/<slug>` | workflows y verificación |
| `chore/<slug>` | mantenimiento |
---