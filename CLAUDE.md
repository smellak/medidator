# Medidator — Procesador de Medidas

## Project Overview

Medidator is a measurement processing pipeline integrated into **CHS Platform v2**. It ingests Excel files (.xlsx/.xls), runs a 7-stage pipeline (stages 2-7 are heuristic + AI), and outputs normalized/validated measurement data. The app is deployed as a Docker container on Coolify, behind Traefik reverse proxy with CHS ForwardAuth SSO.

## Architecture

```
Client (React + Vite)  →  Express Backend  →  Google Gemini AI (stage 4 only)
     client/                  src/              @google/generative-ai
```

- **Backend**: Express + TypeScript (`src/`), compiled to `dist/`, runs on port 3000
- **Frontend**: React 19 + Vite + Tailwind CSS v4 (`client/`), built to `dist-ui/`
- **Storage**: In-memory store (`src/db/memory-store.ts`) — no database, data lost on restart
- **AI**: Google Gemini 2.5 Flash via `@google/generative-ai` — used ONLY in stage4 for EAN lookups

## Key Directories

```
src/                    # Backend source
  server.ts             # Express entry point (port 3000)
  routes/jobs.ts        # CRUD + pipeline execution endpoints (stages 1-7 + /run)
  routes/agent.ts       # CHS Platform agent API (/api/agent) — 7 capabilities
  services/stage1.ts    # Stage 1: ingest + normalize Excel
  services/stage2.ts    # Stage 2: classify product completeness (estimable)
  services/stage3.ts    # Stage 3: parse HTML measures + normalize dimensions
  services/stage4.ts    # Stage 4: heuristic enrichment + Gemini EAN lookup (electro only)
  services/stage5.ts    # Stage 5: outlier detection + exclusion
  services/stage6.ts    # Stage 6: grouping sets (by family, brand, type, etc.)
  services/stage7.ts    # Stage 7: statistics + distributions + final summary
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

data/                   # Pipeline output + EAN cache
  ean_cache.json        # Global Gemini EAN cache (persists across jobs, ~1877 entries)
  <jobId>/              # Per-job stage outputs (stage1_base.json ... stage7_stats.json)

e2e/                    # Playwright E2E tests (38 specs)
dist-ui/                # Built frontend (committed, served by Express)
uploads/                # Uploaded Excel files
validate_200.js         # Validation script: 200-product coherence check via Gemini
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check (public, no auth) |
| GET | `/jobs` | List all jobs |
| GET | `/jobs/:id` | Get job by ID |
| POST | `/jobs` | Create job (multipart, file upload) |
| POST | `/jobs/:id/stage1` | Run stage 1 only |
| POST | `/jobs/:id/stage2` | Run stage 2 only |
| POST | `/jobs/:id/stage3` | Run stage 3 only |
| POST | `/jobs/:id/stage4` | Run stage 4 only (requires GEMINI_API_KEY env var) |
| POST | `/jobs/:id/stage5` | Run stage 5 only |
| POST | `/jobs/:id/stage6` | Run stage 6 only |
| POST | `/jobs/:id/stage7` | Run stage 7 only |
| POST | `/jobs/:id/run` | Run full pipeline (skips already-completed stages) |
| GET | `/jobs/:id/export?format=csv\|json` | Export job results |
| POST | `/api/agent` | CHS Platform agent endpoint (7 capabilities) |

## Pipeline Stages (all implemented)

1. **stage1_ingest_normalize** — Parse Excel (.xlsx/.xls), normalize 14 columns, store as JSON
2. **stage2_paquete_estimable** — Classify each product: complete / html_rich / partial / description_only / empty; detect composites via `<strong>` tag count
3. **stage3_normalize_measures** — Parse HTML `MEDIDAS COLECCION` field with regex (named dims, NxN format, Spanish units); merge with numeric Excel dims (Alto/Ancho/Largo in meters × 100); calculate volume
4. **stage4_ia_enrichment** — Classify by FAMILIA prefix (mueble/electro/accesorio); extract dims from description; **Gemini EAN lookup for electrodomésticos only** (1896 electros with valid EAN, 96% found); global cache at `data/ean_cache.json`
5. **stage5_outliers_clean** — 7 outlier rules (dim > 500cm, dim > 300cm, dim < 5cm for mueble, peso > 500kg, densidad alta/baja, M3 incoherente); ERROR → excluded, WARNING → flagged
6. **stage6_filter_sets** — 8 grouping sets: by_family, by_linea, by_marca, by_type, by_completeness, with_measures, composites, missing_measures
7. **stage7_stats** — Coverage stats, dimension distributions with histograms, per-type analysis, quality metrics, composite stats; sets job.status = 'completed'

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000) |
| `GEMINI_API_KEY` | Yes (for stage4 AI) | Google Gemini API key. **NEVER hardcode — env var only** |

## Security Rules

- **NEVER commit API keys, tokens, or passwords to git** (CHS Platform Rule 15)
- API keys go ONLY in Coolify environment variables
- Before `git add`, always verify: `grep -rn "AIzaSy\|sk-ant-api\|ghp_" . --include="*.ts" --include="*.js" | grep -v node_modules`
- The original Gemini key was leaked to GitHub and auto-revoked by Google (2026-04-07). Lesson learned.

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

# Local testing (port 3000 may be in use by Docker container)
PORT=3333 npx ts-node --transpile-only src/server.ts

# E2E Tests
npx playwright test  # Run all 38 E2E tests against production

# Validate measures (requires GEMINI_API_KEY env var)
GEMINI_API_KEY=... node validate_200.js
```

## Deployment

- **Platform**: Coolify PaaS at `http://localhost:8000`
- **Coolify API token**: stored in `~/.env` as `$COOLIFY_API_TOKEN`
- **Coolify app UUID**: `wk8sggsg4koowwccssww4c4s`
- **Domain**: `medidas.centrohogarsanchez.es`
- **Docker**: Multi-stage build (deps → builder → runner), Node 20 Alpine
- **Current container**: `wk8sggsg4koowwccssww4c4s-170202987601`

### Traefik ForwardAuth

Config file: `/data/coolify/proxy/dynamic/chs-v2-medidas-auth.yaml`

- `/health` and `/assets/*` are public (no auth, priority 200)
- All other routes go through CHS ForwardAuth SSO (priority 100)
- The ForwardAuth middleware is defined in `chs-v2-citas-auth.yaml`
- **After each Coolify redeploy**: update the container name in the YAML service URL

### Deploy workflow

```bash
# 1. VERIFY no secrets in code
grep -rn "AIzaSy\|sk-ant-api\|ghp_" . --include="*.ts" --include="*.js" | grep -v node_modules

# 2. Build frontend (if changed)
npx vite build

# 3. Commit & push
git add src/ dist-ui/ data/ean_cache.json
git commit -m "description"
source ~/.env && git push https://${GITHUB_TOKEN}@github.com/smellak/medidator.git main

# 4. Trigger Coolify deploy
source ~/.env
curl -s -X POST "http://localhost:8000/api/v1/applications/wk8sggsg4koowwccssww4c4s/restart" \
  -H "Authorization: Bearer $COOLIFY_API_TOKEN"

# 5. Wait for new container, verify health
sudo docker ps --filter "name=wk8sggsg4koowwccssww4c4s" --format "{{.Names}} {{.Status}}"
sudo docker exec NEW_CONTAINER wget -qO- http://127.0.0.1:3000/health

# 6. Update Traefik YAML with new container name
sudo sed -i "s/wk8sggsg4koowwccssww4c4s-OLD/wk8sggsg4koowwccssww4c4s-NEW/g" \
  /data/coolify/proxy/dynamic/chs-v2-medidas-auth.yaml

# 7. Update DB internal_url
sudo docker exec chs-db psql -U chs -d chs -c \
  "UPDATE app_instances SET internal_url = 'http://wk8sggsg4koowwccssww4c4s-NEW:3000' WHERE internal_url LIKE '%wk8sggsg4koowwccssww4c4s%';"
```

## EAN Cache

- **File**: `data/ean_cache.json` (global, not per-job)
- **Entries**: ~1877 electrodoméstico EANs with Gemini-sourced dimensions
- **Baked into Docker image** via `COPY data/ ./data/` — survives rebuilds
- **No persistent volume** — runtime cache additions are lost on container restart
- Cache is checked before each Gemini API call; re-run with cache takes ~300ms vs ~55min without
- Only electrodomésticos are queried (mueble EANs are unreliable)

## Data Characteristics (from real 16,009-product dataset)

- **14 Excel columns**: COD.ARTICULO, Linea, Marca, Descripcion, Alto, Ancho, Largo, M3, Bultos, EAN-code, FAMILIA, PESO_NETO, PESO_BRUTO, MEDIDAS COLECCION
- **85.8%** have zero numeric dims (Alto/Ancho/Largo) — rely on HTML parsing
- **98.3%** have MEDIDAS COLECCION HTML with parseable measures
- **Numeric dims are in meters** (0.55 = 55cm) — multiply by 100 in stage3
- **FAMILIA prefix**: 00001 = mueble, 00002 = electrodoméstico, 00003 = accesorio
- **Composites**: ~13.8% products have multiple `<strong>` sections (packs, dormitorios)
- **EAN coverage**: 48.4% of products have EAN; 59.2% of electros have EAN

## CHS Platform Integration

- **App slug**: `medidas`
- **App name**: Procesador de Medidas
- **App color**: Cyan `#0891B2`
- **App icon**: `Ruler` (Lucide)
- **DB registration**: `apps` + `agents` + `app_instances` tables in `chs` database
- **Agent capabilities** (7): listar_jobs, ver_job, ver_metricas_stage1, estadisticas_generales, ver_estadisticas_job, ver_outliers, ver_productos_sin_medidas

## Design System

Uses CHS Platform Design System v1:
- **Fonts**: Inter (UI/headings) + Open Sans (body), loaded from Google Fonts
- **Colors**: Navy deep `#0a1628`, Blue 900 `#0D47A1`, Blue 800 `#1565C0`, Blue 700 `#1976D2`
- **Effects**: Glassmorphism (backdrop-filter blur), dot pattern overlays, 4-stop hero gradient
- **Animations**: fadeInUp with stagger delays, card hover translateY(-4px)
- **Icons**: Lucide React
- **Tailwind**: v4 with `@tailwindcss/vite` plugin, custom `@theme` tokens in `client/index.css`

## Known Issues / TODOs

- **912 products without measures**: mostly cuchillos/utensilios classified as html_rich but with unparseable HTML
- **935 muebles flagged dim < 5cm**: many are cabeceros/paneles with legitimately thin profundidad
- **82 products with dirty FAMILIA**: irregular formats like "0", "90001;0;00003"
- **peso_kg 80.7% empty**: weight data is sparse across the catalog
- **No persistent volume**: data/ and uploads/ are ephemeral — lost on container restart
- **Validation pending**: 200-product coherence check (`validate_200.js`) needs new GEMINI_API_KEY to run
- **Conformidad CHS Platform**: 2/11 deberes cumplidos (solo health + favicon)

## Notes

- The backend uses in-memory storage — data is lost on container restart
- Container names change on each Coolify deploy (format: `{uuid}-{timestamp}`)
- Alpine containers resolve `localhost` to IPv6 — use `127.0.0.1` for internal wget/curl
- E2E tests run against production (`platform.centrohogarsanchez.es`), not local dev
- `dist/` is in .gitignore — backend is compiled by Docker during build, only `dist-ui/` is committed
