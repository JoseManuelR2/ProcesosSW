---
type: Playbook
title: "Cambiar esquema o formato persistido"
description: "Reglas para cambios de datos y formato de sync."
resource: repo://servidor/modelo.js
tags: [schema, datos, migracion]
module: servidor
generated: { by: human:josep, at: 2026-11-19T00:00:00Z }
status: stable
stale_after: 2027-05-19
---

# Playbook

- No se cambian claves de identidad ni esquemas sin migración.
- Los usuarios eliminados se conservan como borrado lógico.
- Los cambios de comportamiento se aplican a la lógica y a la CAD.
---