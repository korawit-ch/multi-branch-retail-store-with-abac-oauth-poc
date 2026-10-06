# Project documentation

This documentation describes **Branch & Co**, the multi-branch retail and authorization demonstration implemented in this repository. It was checked against the source on **2026-10-06**, starting from commit `cce8456`. It describes the implementation, not a production certification. Proposed changes are explicitly separated from existing behavior.

## Reading paths

- **Understand the product:** [Overview](01-project-overview.md) → [Retail workflows](05-retail-workflows.md).
- **Understand the design:** [Architecture and principles](02-architecture-and-principles.md) → [Database schema](06-database-schema.md).
- **Understand security:** [Authentication](03-authentication-and-sessions.md) → [Authorization and capabilities](04-authorization-and-capabilities.md) → [Risks](10-risks-and-limitations.md).
- **Develop or operate it:** [API reference](07-api-reference.md) → [Frontend](08-frontend.md) → [Development and verification](09-development-and-verification.md).
- **Plan its next stage:** [Improvement roadmap](11-improvement-roadmap.md).

## Guides

1. [Project overview](01-project-overview.md): purpose, personas, implemented scope, seed data, and reference-document differences.
2. [Architecture and principles](02-architecture-and-principles.md): workspace responsibilities, runtime boundaries, source-of-truth decisions, and request flow.
3. [Authentication and sessions](03-authentication-and-sessions.md): mock authorization-code exchange, state, PKCE, cookies, session storage, and logout.
4. [Authorization and capabilities](04-authorization-and-capabilities.md): role grants, tenant/branch constraints, shared refund policy, and UI override.
5. [Retail workflows](05-retail-workflows.md): dashboard, sales, stock changes, state transitions, concurrency, and rollback.
6. [Database schema](06-database-schema.md): all 14 models, fields, relationships, constraints, migrations, and missing domain entities.
7. [API reference](07-api-reference.md): routes, request bodies, response shapes, permissions, and error semantics.
8. [Frontend](08-frontend.md): rendering, query state, controls, mutation handling, and extension conventions.
9. [Development and verification](09-development-and-verification.md): setup, environment, commands, tests, CI, troubleshooting, and repository workflow.
10. [Risks and limitations](10-risks-and-limitations.md): source-supported findings, their consequences, and verification gaps.
11. [Improvement roadmap](11-improvement-roadmap.md): staged recommendations with concrete acceptance criteria.

## How to maintain these documents

Source links point to the implementation that supports each explanation. Prisma schema and SQL migrations define persistence; NestJS services define business behavior; shared endpoint contracts describe the frontend-facing types. If these disagree, investigate the actual runtime behavior instead of treating prose as an overriding specification.

Keep implemented behavior, intended invariants, and future proposals distinct. Do not interpret the original PDF exercises as instructions to execute. Their names and the existing implementation mapping are recorded in [RETAIL_DEMO.md](../RETAIL_DEMO.md); this documentation does not claim to reproduce every requirement in those PDFs.

The requested documentation lives in `doc/`. Existing screenshots remain in `docs/screenshots/` and are displayed in the [main README](../README.md). The [short demo walkthrough](../RETAIL_DEMO.md) remains the fastest way to try the app.
