# Medidator — Procesador de Medidas

## Project Overview

Medidator is a measurement processing pipeline integrated into **CHS Platform v2**. It ingests Excel files (.xlsx/.xls), runs a 7-stage AI-powered pipeline using Google Gemini, and outputs normalized/validated measurement data. The app is deployed as a Docker container on Coolify, behind Traefik reverse proxy with CHS ForwardAuth SSO.

## Architecture

```
Client (React + Vite)  →  Express Backend  →  Google Gemini AI
     client/                  src/              @google/generative-ai
```

- **Backend**: Express + TypeScript (`src/`), compiled to `dist/`, runs on port 3000
- **Frontend**: React 19 + Vite + Tailwind CSS v4 (`client/`), built to `dist-ui/`
- **Storage**: In-memory store (`src/db/memory-store.ts`) — no database
- **AI**: Google Gemini via `@google/generative-ai` for measurement processing stages

## Key Directories

```
src/                    # Backend source
  server.ts             # Express entry point (port 3000)
  routes/jobs.ts        # CRUD + pipeline execution endpoints
  routes/agent.ts       # CHS Platform agent API (/api/agent)
  services/stage1.ts    # Stage 1: ingest + normalize Excel
  middleware/chs-auth.ts # ForwardAuth header extraction
  types/job.ts          # Job/Stage type definitions
  db/memory-store.ts    # In-memory job storage

client/                 # Frontend source
  main.tsx              # React entry point
  App.tsx               # Main SPA (dashboard + detail views)
  api.ts                # API client functions
  types.ts              # Frontend type definitions
  index.css             # Tailwind v4 + CHS Design System tokens
  components/
    StatsCards.tsx       # Dashboard stat cards (glass effect)
    UploadForm.tsx       # Excel file upload with drag & drop
    JobList.tsx          # Job list with status badges
    JobDetail.tsx        # Full job view with stages + metrics
    StageTimeline.tsx    # 7-stage pipeline progress visualization

e2e/                    # Playwright E2E tests (38 specs)
  helpers.ts            # Login helpers, constants
  01-login.spec.ts      # CHS Platform login flow
  02-medidator-health.spec.ts
  03-agent-api.spec.ts
  04-jobs-api.spec.ts
  05-chat-integration.spec.ts
  06-forwardauth.spec.ts
  07-app-visibility.spec.ts

dist-ui/                # Built frontend (committed, served by Express)
data/                   # Seed data
uploads/                # Uploaded Excel files
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (public, no auth) |
| GET | `/jobs` | List all jobs |
| GET | `/jobs/:id` | Get job by ID |
| POST | `/jobs` | Create job (multipart, file upload) |
| POST | `/jobs/:id/stage1` | Run stage 1 only |
| POST | `/jobs/:id/run` | Run full pipeline |
| GET | `/jobs/:id/export?format=csv\|json` | Export job results |
| POST | `/api/agent` | CHS Platform agent endpoint |

## Pipeline Stages

1. **stage1_ingest_normalize** — Parse Excel, normalize columns
2. **stage2_unit_detection** — Detect measurement units
3. **stage3_range_validation** — Validate value ranges
4. **stage4_cross_reference** — Cross-reference measurements
5. **stage5_anomaly_detection** — Detect anomalies
6. **stage6_report_generation** — Generate report
7. **stage7_export** — Export final results

## Commands

```bash
# Development
npm run dev          # Backend with ts-node-dev (hot reload)
npm run dev:ui       # Frontend Vite dev server (port 5173, proxies to :3000)

# Build
npm run build        # tsc + vite build → dist/ + dist-ui/
npx vite build       # Frontend only → dist-ui/

# Production
npm start            # node dist/server.js

# E2E Tests
npx playwright test  # Run all 38 E2E tests against production
```

## Deployment

- **Platform**: Coolify PaaS at `http://localhost:8000`
- **Coolify API token**: `36|ckitF425STqCCrKNSs06q8AUbZQGchDVLX8vDJwWf13f0533`
- **Coolify app UUID**: `wk8sggsg4koowwccssww4c4s`
- **Domain**: `medidas.centrohogarsanchez.es`
- **Docker**: Multi-stage build (deps → builder → runner), Node 20 Alpine

### Traefik ForwardAuth

Config file: `/data/coolify/proxy/dynamic/chs-v2-medidas-auth.yaml`

- `/health` and `/assets/*` are public (no auth, priority 200)
- All other routes go through CHS ForwardAuth SSO (priority 100)
- The ForwardAuth middleware is defined in `chs-v2-citas-auth.yaml`
- **After each Coolify redeploy**: update the container name in the YAML service URL

### Deploy workflow

```bash
# 1. Build frontend
npx vite build

# 2. Commit & push
git add dist-ui/ && git commit && git push

# 3. Trigger Coolify deploy
curl -s -X POST "http://localhost:8000/api/v1/applications/wk8sggsg4koowwccssww4c4s/restart" \
  -H "Authorization: Bearer 36|ckitF425STqCCrKNSs06q8AUbZQGchDVLX8vDJwWf13f0533"

# 4. Wait for new container, then update Traefik YAML
sudo sed -i "s/wk8sggsg4koowwccssww4c4s-OLD_TIMESTAMP/wk8sggsg4koowwccssww4c4s-NEW_TIMESTAMP/" \
  /data/coolify/proxy/dynamic/chs-v2-medidas-auth.yaml

# 5. Update DB internal_url
sudo docker exec chs-db psql -U chs -d chs -c \
  "UPDATE app_instances SET internal_url = 'http://wk8sggsg4koowwccssww4c4s-NEW:3000' WHERE internal_url LIKE '%wk8sggsg4koowwccssww4c4s%';"
```

## CHS Platform Integration

- **App slug**: `medidas`
- **App name**: Procesador de Medidas
- **App color**: Cyan `#0891B2`
- **App icon**: `Ruler` (Lucide)
- **DB registration**: `apps` + `agents` + `app_instances` tables in `chs` database (user: `chs`, db: `chs`, container: `chs-db`)

## Design System

Uses CHS Platform Design System v1:
- **Fonts**: Inter (UI/headings) + Open Sans (body), loaded from Google Fonts
- **Colors**: Navy deep `#0a1628`, Blue 900 `#0D47A1`, Blue 800 `#1565C0`, Blue 700 `#1976D2`
- **Effects**: Glassmorphism (backdrop-filter blur), dot pattern overlays, 4-stop hero gradient
- **Animations**: fadeInUp with stagger delays, card hover translateY(-4px)
- **Icons**: Lucide React
- **Tailwind**: v4 with `@tailwindcss/vite` plugin, custom `@theme` tokens in `client/index.css`

## Notes

- The backend uses in-memory storage — data is lost on container restart
- Container names change on each Coolify deploy (format: `{uuid}-{timestamp}`)
- Alpine containers resolve `localhost` to IPv6 — use `127.0.0.1` for internal wget/curl
- E2E tests run against production (`platform.centrohogarsanchez.es`), not local dev
