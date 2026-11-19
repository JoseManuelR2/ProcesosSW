---
okf_version: "0.2"
---

# ProcesosSW · knowledge bundle

Conocimiento curado del proyecto **ProcesosSW**: aplicación SaaS en capas con
gestión de usuarios y Maze Duel en tiempo real. Punto de entrada para humanos y
agentes.

## Restricciones (leer siempre)

* [Contrato del agente](constraints/agent-contract.md)
* [Política de ramas y pushes](constraints/branch-policy.md)
* [Verificación](constraints/verification.md)

## Sistemas

* [Backend (Node/Express)](systems/backend.md)
* [Frontend (SPA)](systems/frontend.md)
* [Maze Duel](systems/game.md)
* [Entorno y build](systems/build-and-env.md)
* [CI/CD y despliegue](systems/ci-cd.md)

## Dominio

* [Usuarios y autenticación](domain/users-and-auth.md)
* [Maze Duel (reglas)](domain/maze-duel.md)
* [Seguridad](domain/security.md)
* [Persistencia](domain/persistence.md)

## Decisiones

* [0001 · Cuatro capas](decisions/0001-four-layers.md)
* [0002 · CAD en memoria o Mongo](decisions/0002-cad-memory-vs-mongo.md)
* [0003 · WebSockets para el juego](decisions/0003-websockets-for-game.md)
* [0004 · Núcleo del juego compartido](decisions/0004-shared-game-core.md)

## Playbooks

* [Añadir o mover un test](playbooks/add-test.md)
* [Cambiar esquema o formato persistido](playbooks/schema-change.md)
* [Preparar una release](playbooks/release.md)
* [Cambio de paridad frontend/backend](playbooks/feature-change.md)

## Mapas y referencia

* [Mapa del repositorio](maps/repo-map.md)
* [Glosario](glossary.md)

## Propuestas (no implementadas)

* (ninguna por ahora)
---