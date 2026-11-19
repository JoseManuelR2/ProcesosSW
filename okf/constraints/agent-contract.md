---
type: Constraint
title: "Contrato del agente"
description: "Reglas que un agente debe respetar antes de tocar código en ProcesosSW."
resource: repo://README.md
tags: [agente, reglas, seguridad]
module: repo
generated: { by: human:josep, at: 2026-11-19T00:00:00Z }
status: stable
stale_after: 2027-05-19
---

# Reglas duras

1. `main` es producción; el agente nunca hace push, PR ni merge.
2. Toda implementación o fix va en una rama nueva desde `main`.
3. El agente puede commitear en su rama, pero no en `main`.
4. No se toca `.env` ni secretos.
5. No se amplían baselines ni se omiten tests sin justificar.
6. La capa lógica (`servidor/modelo.js`) no accede a la base de datos; solo la CAD.
7. El cliente solo se comunica por API REST y Socket.IO; no accede a la BD.
8. No se cambian `FORMAT_VERSION`, esquemas ni claves de identidad sin seguir el playbook.
9. No se inventa verificación: un test omitido no es un test pasado.

# Antes de editar

1. Lee `AGENTS.md` y este bundle por el [índice](../index.md).
2. Comprueba que estás en una rama de tarea.
3. Abre los `resource:` del concepto afectado y sus tests.
4. Si el concepto contradice al código, manda el código y actualiza el concepto.
---