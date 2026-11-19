---
type: Domain Concept
title: "Usuarios y autenticación"
description: "Registro, confirmación por correo, OAuth con Google y One Tap."
resource: repo://servidor/modelo.js
tags: [usuarios, auth, oauth, email]
module: servidor
generated: { by: human:josep, at: 2026-11-19T00:00:00Z }
status: stable
stale_after: 2027-05-19
---

# Usuarios y autenticación

- Registro local con confirmación por correo (token de un solo uso, 24 h).
- Inicio de sesión local (bcrypt) y con Google (OAuth 2.0 + One Tap).
- Roles: `usuario` y `administrador`.
- Eliminación lógica (borrado lógico, reactivable con Google).
- Bloqueo por 5 contraseñas incorrectas en 15 minutos.
---