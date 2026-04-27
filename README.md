# MT Middleware Console

Production-ready middleware app inspired by the 7-minute demo system:

- Config-driven calendar routing (`service + ZIP/geofence/polygon`)
- CRM stage mapping to GHL stages
- Per-stage plugin toggles
- Idempotent webhook ingestion (`lead`, `status`)
- Event log + lead log
- Internal admin console UI with live config preview and route test

## Stack

- API: Node.js + Express + TypeScript + Zod
- Web: React + Vite + TypeScript
- Storage: JSON file store (`packages/api/data/store.json`) with seed data
- Tests: Vitest + Supertest

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. API env:

```bash
copy packages\\api\\.env.example packages\\api\\.env
```

3. Web env:

```bash
copy packages\\web\\.env.example packages\\web\\.env
```

4. Run both services:

```bash
npm run dev
```

- API: `http://localhost:4000`
- Web: `http://localhost:5173`

## Quality Commands

```bash
npm run lint
npm run test
npm run build
```

## API Overview

### Health

- `GET /api/health`

### Admin (requires `x-admin-token`)

- `GET /api/configs`
- `GET /api/configs/:id`
- `POST /api/configs`
- `PUT /api/configs/:id`
- `DELETE /api/configs/:id`
- `GET /api/events`
- `GET /api/leads`
- `POST /api/route/preview`

### Webhooks (requires `x-webhook-secret`)

- `POST /api/webhooks/lead`
- `POST /api/webhooks/status`
- `POST /api/webhooks/estimate`
- `POST /api/webhooks/job`

`lead` and `status` endpoints support idempotency via `x-idempotency-key`.

## Notes for Real Deployment

- Replace JSON store with Mongo/Postgres adapter.
- Connect `GHL_BASE_URL` and `GHL_API_KEY` for live API calls.
- Run API behind TLS + reverse proxy.
- Rotate `ADMIN_TOKEN` and `WEBHOOK_SECRET`.
- Add queue/worker for retryable outbound actions.
