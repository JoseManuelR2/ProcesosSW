---
type: Domain Concept
title: "Seguridad"
description: "Hash de contraseñas, sesión, CSP, limitación de peticiones."
resource: repo://servidor/seguridad.js
tags: [seguridad, bcrypt, csp, sesion]
module: servidor
generated: { by: human:josep, at: 2026-11-19T00:00:00Z }
status: stable
stale_after: 2027-05-19
---

# Seguridad

- Contraseñas con bcryptjs (nunca en claro).
- Sesión en servidor con cookie HttpOnly.
- Cabeceras CSP y SRI en CDN.
- Limitador de peticiones por IP/usuario.
- Borrado lógico de cuentas.
- Roles aplicados en el servidor.
---