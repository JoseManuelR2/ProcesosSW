---
type: Decision
title: "Cuatro capas"
description: "Arquitectura en capas: presentación, comunicación, lógica, CAD."
resource: repo://README.md
tags: [arquitectura, capas]
module: repo
generated: { by: human:josep, at: 2026-11-19T00:00:00Z }
status: stable
stale_after: 2027-05-19
---

# Decisión

El backend se organiza en cuatro capas separadas en archivos distintos:
presentación (cliente), comunicación (clienteRest), lógica (modelo) y acceso a
datos (CAD). La frontera entre lógica y CAD permite evaluar el proyecto sin
dependencia de la BD.
---