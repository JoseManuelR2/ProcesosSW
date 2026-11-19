---
type: Playbook
title: "Preparar una release"
description: "Flujo de despliegue en Cloud Run."
resource: repo://.github/workflows/deploy.yml
tags: [release, deploy, cloudrun]
module: repo
generated: { by: human:josep, at: 2026-11-19T00:00:00Z }
status: stable
stale_after: 2027-05-19
---

# Playbook

- Cada push a `main` despliega en Cloud Run.
- No se despliega a mano.
- Los secretos se configuran en GitHub Actions.
- `BASE_URL` la fija el propio despliegue.
---