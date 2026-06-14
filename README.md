# garden-backend

Backend for **Garden** — a smart plant watering system.

An ESP32 board in the greenhouse pushes sensor readings to this API, a web
dashboard reads the current state and queues watering commands, and the board
polls those commands back and reports when watering is done.

```
┌──────────┐   telemetry / watering   ┌─────────────┐   state / history   ┌───────────┐
│  ESP32   │ ───────────────────────► │  garden-api │ ◄────────────────── │ Dashboard │
│  board   │ ◄─────────────────────── │  (Express)  │ ──────────────────► │  (web)    │
└──────────┘    pending commands      └──────┬──────┘     commands         └───────────┘
                                              │
                                       ┌──────┴──────┐
                                       │ PostgreSQL  │
                                       └─────────────┘
```

## Tech stack

- **Node.js 22** + **Express 4** — HTTP API (ES modules)
- **PostgreSQL 16** — telemetry, commands, and history storage
- **Docker** + **docker-compose** — local and production runtime
- **GitHub Actions** — deploy to a server over SSH on every push to `main`

## Project layout

| Path | Purpose |
| --- | --- |
| `src/server.js` | Entry point — loads env and starts the HTTP server |
| `src/app.js` | Express app and all route handlers |
| `src/db.js` | PostgreSQL connection pool and `query()` helper |
| `schema.sql` | Database schema and seed data |
| `mock-device.js` | ESP32 simulator that sends telemetry every 10s |
| `Dockerfile` | Multi-stage production image (non-root user) |
| `docker-compose.yml` | `db` + `api` services for local/prod |
| `.github/workflows/deploy.yml` | SSH deploy pipeline |

## Database schema

| Table | Description |
| --- | --- |
| `devices` | Registered boards: last-seen time and Wi-Fi signal |
| `pots` | Plant pots per device (slot, name, plant type, moisture threshold) |
| `pot_readings` | Time series of per-pot moisture readings |
| `ambient_readings` | Environment readings (temperature, humidity, pressure, light, tank level) |
| `watering_events` | Log of every watering, manual or automatic |
| `commands` | Queue of commands sent from the dashboard to a board |
| `ai_recommendations` | AI-generated advice surfaced on the dashboard |

## API reference

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/health` | Liveness check — server status and database connectivity |
| `POST` | `/api/telemetry` | Board pushes sensor readings (ambient + per-pot moisture) |
| `GET` | `/api/state/:deviceId` | Full current state for the dashboard, in one request |
| `GET` | `/api/history/:potId?hours=24` | Moisture time series for a pot |
| `POST` | `/api/commands` | Dashboard queues a "water" command |
| `GET` | `/api/commands/pending/:deviceId` | Board polls for pending commands |
| `PATCH` | `/api/commands/:id/done` | Board marks a command as completed |
| `POST` | `/api/watering` | Board reports a locally triggered auto-watering |

### Telemetry payload

`POST /api/telemetry` expects the following JSON contract:

```json
{
  "deviceId": "greenhouse-01",
  "ambient": { "tempC": 22.8, "humidity": 46, "pressureHpa": 1012, "lightLux": 8200 },
  "tank": { "lowLevel": false },
  "pots": [
    { "slot": 1, "moisturePct": 62, "rawAdc": 2140 }
  ],
  "wifiRssi": -58
}
```

Only `deviceId` and `pots` are required; `ambient`, `tank`, and `wifiRssi` are optional.

## Getting started

### 1. Configure environment

```bash
cp .env.example .env
# edit .env and set a real DB_PASSWORD
```

### 2. Run with Docker (recommended)

Brings up PostgreSQL and the API together:

```bash
docker compose up -d
```

Then load the schema and seed data into the database:

```bash
docker compose exec -T db psql -U garden -d garden < schema.sql
```

### 3. Run locally without Docker

Requires a reachable PostgreSQL instance and `DATABASE_URL` set in `.env`.

```bash
npm install
npm run dev      # auto-restart on file changes
# or
npm start
```

The API listens on `http://localhost:3000` by default.

## Simulating a device

With the API running, the mock device streams realistic telemetry every 10 seconds:

```bash
API_URL=http://localhost:3000 node mock-device.js
```

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which connects to the
server over SSH, pulls the latest code, rebuilds the image, and restarts only the
`api` service (the database is left untouched). The following repository secrets
are required:

| Secret | Description |
| --- | --- |
| `SERVER_HOST` | Deploy target hostname or IP |
| `SERVER_USER` | SSH user |
| `SERVER_SSH_KEY` | Private SSH key for the deploy user |
