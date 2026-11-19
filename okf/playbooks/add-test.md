---
type: Playbook
title: "Añadir o mover un test"
description: "Dónde poner pruebas unitarias y e2e."
resource: repo://spec/support/jasmine.json
tags: [tests, jasmine, playwright]
module: repo
generated: { by: human:josep, at: 2026-11-19T00:00:00Z }
status: stable
stale_after: 2027-05-19
---

# Playbook

- Pruebas de la capa lógica: `servidor/*Spec.js` (Jasmine).
- Pruebas e2e: `e2e/*.spec.js` (Playwright).
- Los selectores usados por e2e no deben desaparecer sin justificación.
- Un bug corregido deja un test que falla antes del arreglo.
---