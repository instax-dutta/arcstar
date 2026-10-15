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
pnpm build
pnpm --filter @arcstar/api dev
```

The API listens on `http://localhost:8787` by default.

## Docker Compose

The Compose stack runs PostgreSQL, applies migrations through a dedicated `migrate`
service, then starts the API. The API uses PostgreSQL repositories when `DATABASE_URL`
is set and in-memory repositories when it is not.

```bash
cp .env.example .env
docker compose up --build
```

The API binds to `127.0.0.1:8787`. PostgreSQL binds to `127.0.0.1:5432`.

Production mode refuses the bundled `arcstar/arcstar` database credentials. Set
`POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` before starting a production
deployment.

## Environment variables

| Name | Purpose | Default |
|---|---|---|
| `PORT` | API port | `8787` |
| `NODE_ENV` | Runtime environment | `development` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allowed browser origins | `http://localhost:5173` in development, empty in production |
| `RATE_LIMIT_MAX` | Expensive-route requests per window before HTTP 429 | `60` |
| `RATE_LIMIT_WINDOW_MS` | Rate-limit window in milliseconds | `60000` |
| `TRUSTED_PROXIES` | Comma-separated immediate peers allowed to send `X-Forwarded-For` | empty |
| `POSTGRES_USER` | PostgreSQL user | `arcstar` |
| `POSTGRES_PASSWORD` | PostgreSQL password | `arcstar` |
| `POSTGRES_DB` | PostgreSQL database | `arcstar` |
| `DATABASE_URL` | PostgreSQL connection string; enables persisted repositories and migrations | unset locally |

## Migrations

Canonical migration files live in `migrations/`. Apply them in order with:

```bash
DATABASE_URL=postgres://user:pass@localhost:5432/arcstar pnpm migrate
```

The migration runner:

- creates `schema_migration`
- applies each migration once
- rolls back the whole migration if a migration fails

## Backup and restore

PostgreSQL is the source of truth when `DATABASE_URL` is set.

Backup:

```bash
pg_dump "$DATABASE_URL" > arcstar-backup.sql
```

Restore:

```bash
psql "$DATABASE_URL" -f arcstar-backup.sql
```

After restoring a database from an older Arcstar version, run `pnpm migrate` to apply any
new forward-only migrations. There is no automatic downgrade.

## API routes used by the investigation workflow

- `GET /health`: liveness only.
- `GET /ready`: dependency readiness.
- `GET /claims/:id`: claim, evidence, review history, and latest assessment.
- `POST /claims/:id/evidence`: add or revise claim evidence and update claim source links.
- `POST /claims/:id/evidence/reviews`: record an auditable review status transition.
- `POST /claims/:id/assessments`: create an assessment with an input snapshot.
- `GET /sources/:id`: source, full lineage records, and explicit lineage gaps.
- `GET /scenarios/:node`: server-owned bounded graph scenario snapshot.

`/score` and `/blast-radius` accept client-supplied graphs. They are experimental
utilities, not persisted product assessments.

## Rate limiting and CORS

Expensive routes use a bounded in-memory fixed-window limitor. For multi-process
deployments, terminate rate limiting at the reverse proxy or replace it with shared
state. Browser origins are allowlisted. `X-Forwarded-For` is trusted only when the
immediate peer is listed in `TRUSTED_PROXIES`.

## Hardening notes

- Do not expose the API or PostgreSQL on a public interface without a reverse proxy,
  TLS, and authentication appropriate to your environment.
- Replace the bundled development database credentials before any real deployment.
- The project is AGPL-3.0. If you modify and run it as a network service, review the
  license obligations that apply to you.
