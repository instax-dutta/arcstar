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

The Compose stack runs PostgreSQL and the API. PostgreSQL is optional today, but it is
included for persistence work and local development.

```bash
cp .env.example .env
docker compose up --build
```

The API binds to `127.0.0.1:8787`. PostgreSQL binds to `127.0.0.1:5432`.

## Environment variables

| Name | Purpose | Default |
|---|---|---|
| `PORT` | API port | `8787` |
| `NODE_ENV` | Runtime environment | `development` |
| `LOG_LEVEL` | Reserved for future structured logging | `info` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allowed browser origins | `http://localhost:5173` in development, empty in production |
| `POSTGRES_USER` | PostgreSQL user | `arcstar` |
| `POSTGRES_PASSWORD` | PostgreSQL password | `arcstar` |
| `POSTGRES_DB` | PostgreSQL database | `arcstar` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://arcstar:arcstar@localhost:5432/arcstar` |

## Database migrations

Canonical migration files live in `migrations/`. Apply them in order with your PostgreSQL
client or migration tool:

```bash
for migration in migrations/*.sql; do
  psql "$DATABASE_URL" -f "$migration"
done
```

The API currently serves deterministic scoring and graph endpoints from pure packages and
in-memory repositories. `DATABASE_URL` is reserved for the persistence adapter that maps
the migration schema to repository implementations.

## Hardening notes

- Do not expose the API or PostgreSQL on a public interface without a reverse proxy,
  TLS, and authentication appropriate to your environment.
- Replace the bundled development database credentials before any real deployment.
- The project is AGPL-3.0. If you modify and run it as a network service, review the
  license obligations that apply to you.
