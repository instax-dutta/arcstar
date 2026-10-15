# Self-hosting

Arcstar is free and open. There are no accounts, no paywall, and no required external
services.

## Requirements

- Node.js 22 or newer
- pnpm 9 or newer
- Optional: Docker with Compose support

## Local development

```bash
pnpm install
pnpm --filter @arcstar/api dev
```

The API listens on `http://localhost:8787` by default.

## Docker Compose

The Compose stack runs PostgreSQL and the API. With `DATABASE_URL` set, the API uses
the PostgreSQL repositories for entities, edges, claims, claim evidence, sources,
lineage gaps, and assessments. Without it, the API uses in-memory repositories.

```bash
cp .env.example .env
docker compose up --build
```

The API binds to `127.0.0.1:8787`. PostgreSQL binds to `127.0.0.1:5432`. Apply the
migrations before using persisted claims or scenarios.

## Environment variables

| Name | Purpose | Default |
|---|---|---|
| `PORT` | API port | `8787` |
| `NODE_ENV` | Runtime environment | `development` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allowed browser origins | `http://localhost:5173` in development, empty in production |
| `RATE_LIMIT_MAX` | Expensive-route requests per window before HTTP 429 | `60` |
| `RATE_LIMIT_WINDOW_MS` | Rate-limit window in milliseconds | `60000` |
| `POSTGRES_USER` | PostgreSQL user | `arcstar` |
| `POSTGRES_PASSWORD` | PostgreSQL password | `arcstar` |
| `POSTGRES_DB` | PostgreSQL database | `arcstar` |
| `DATABASE_URL` | PostgreSQL connection string; enables persisted repositories | unset locally |

## Database migrations

Canonical migration files live in `migrations/`. Apply them in order with your PostgreSQL
client or migration tool:

```bash
for migration in migrations/*.sql; do
  psql "$DATABASE_URL" -f "$migration"
done
```

The PostgreSQL repository mapping is exercised through a fake SQL client and route
integration tests, not through a live database in unit CI. Run the migration and smoke
suite against a real PostgreSQL instance during deployment verification.

## API routes used by the investigation workflow

- `GET /claims/:id`: claim, evidence, and latest assessment.
- `POST /claims/:id/evidence`: add or revise reviewable claim evidence.
- `POST /claims/:id/assessments`: create an assessment and store its input snapshot.
- `GET /sources/:id`: source and explicit unresolved lineage gaps.
- `GET /scenarios/:node`: server-owned snapshot bounded blast-radius result.

## Rate limiting and CORS

Expensive routes use a bounded in-memory fixed-window limitor. For multi-process
deployments, terminate rate limiting at the reverse proxy or replace it with shared
state. Browser origins are allowlisted and must be configured explicitly.

## Hardening notes

- Do not expose the API or PostgreSQL on a public interface without a reverse proxy,
  TLS, and authentication appropriate to your environment.
- Replace the bundled development database credentials before any real deployment.
- The project is AGPL-3.0. If you modify and run it as a network service, review the
  license obligations that apply to you.
