---
type: System
title: "CI/CD y despliegue"
description: "GitHub Actions: ci.yml y deploy.yml a Cloud Run."
resource: repo://.github/workflows/ci.yml
tags: [ci, cd, github-actions, cloudrun]
module: repo
generated: { by: human:josep, at: 2026-11-19T00:00:00Z }
status: stable
stale_after: 2027-05-19
---

# CI/CD

- CI (`.github/workflows/ci.yml`): `npm ci`, `npm test`, Playwright e2e.
- CD (`.github/workflows/deploy.yml`): cada push a `main` despliega en Cloud Run.
- `main` es producción; solo el usuario hace push y merge.
---