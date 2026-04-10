# Medidator — Procesador de Medidas

## Project Overview

Medidator is a measurement processing pipeline integrated into **CHS Platform v2**. It ingests Excel files (.xlsx/.xls), runs an 8-stage pipeline (stages 2-7 are heuristic + AI, stage 8 is logistics volume estimation), and outputs normalized/validated measurement data. The app is deployed as a Docker container on Coolify, behind Traefik reverse proxy with CHS ForwardAuth SSO.

## Architecture

```
Client (React + Vite)  →  Express Backend  →  Google Gemini AI (stage 4 only)
     client/                  src/              @google/generative-ai
```

- **Backend**: Express + TypeScript (`src/`), compiled to `dist/`, runs on port 3000
- **Frontend**: React 19 + Vite + Tailwind CSS v4 (`client/`), built to `dist-ui/`
- **Storage**: In-memory store (`src/db/memory-store.ts`) — no database, data lost on restart
- **AI**: Google Gemini via `@google/generative-ai` — used in stage4 (product EAN lookups) and stage8 (packaging EAN lookups)

## Key Directories

```
src/                    # Backend source
  server.ts             # Express entry point (port 3000)
  routes/jobs.ts        # CRUD + pipeline execution endpoints (stages 1-8 + /run)
  routes/agent.ts       # CHS Platform agent API (/api/agent) — 7 capabilities
  services/stage1.ts    # Stage 1: ingest + normalize Excel
  services/stage2.ts    # Stage 2: classify product completeness (estimable)
  services/stage3.ts    # Stage 3: parse HTML measures + normalize dimensions
  services/stage4.ts    # Stage 4: heuristic enrichment + Gemini EAN lookup (electro only)
  services/stage5.ts    # Stage 5: outlier detection + exclusion
  services/stage6.ts    # Stage 6: grouping sets (by family, brand, type, etc.)
  services/stage7.ts    # Stage 7: statistics + distributions + final summary
  services/stage8.ts    # Stage 8: logistics volume estimation (4 layers)
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
    StageTimeline.tsx    # 8-stage pipeline progress visualization

data/                   # Pipeline output + caches
  ean_cache.json        # Gemini product EAN cache (~1877 entries, stage4)
  ean_packaging_cache.json # Gemini packaging EAN cache (~2233 entries, stage8)
  ground_truth_logistics.json # 3,118 products with ERP M3 ground truth
  ratios_calibracion.json # Calibration ratios by subfamilia/tipo
  <jobId>/              # Per-job stage outputs (stage1_base.json ... stage8_logistics.json)

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
| POST | `/jobs/:id/stage8` | Run stage 8 only (logistics volume, Gemini for electro packaging) |
| POST | `/jobs/:id/run` | Run full 8-stage pipeline (skips already-completed stages) |
| GET | `/jobs/:id/export?format=csv\|json` | Export job results (legacy: full product dump) |
| GET | `/jobs/:id/export?format=csv&type=logistics` | 5-col logistics CSV (COD,DESC,VOL,CONFIDENCE,CAPA), `COD_ARTICULO` as `="..."` text |
| GET | `/jobs/:id/export/custom?columns=...&format=csv\|xlsx` | Configurable export with column selector + filters |
| GET | `/jobs/:id/export/columns` | List of available columns and groups for custom export |
| POST | `/api/agent` | CHS Platform agent endpoint (7 capabilities) |

## Pipeline Stages (all implemented)

1. **stage1_ingest_normalize** — Parse Excel (.xlsx/.xls), normalize 14 columns, store as JSON
2. **stage2_paquete_estimable** — Classify each product: complete / html_rich / partial / description_only / empty; detect composites via `<strong>` tag count
3. **stage3_normalize_measures** — Parse HTML `MEDIDAS COLECCION` field with regex (named dims, NxN format, Spanish units); merge with numeric Excel dims (Alto/Ancho/Largo in meters × 100); calculate volume; **post-validation fixes**: electro mm→cm (threshold >200), NxNxN nulling (electro+mueble), thousands separator, small dims from desc, merged dm→cm, cross-validation, axis swap for tall furniture
4. **stage4_ia_enrichment** — Classify by FAMILIA prefix (mueble/electro/accesorio); extract dims from description; **Gemini EAN lookup for electrodomésticos only** (1896 electros with valid EAN, 96% found); global cache at `data/ean_cache.json`
5. **stage5_outliers_clean** — 7 outlier rules (dim > 500cm, dim > 300cm, dim < 5cm for mueble, peso > 500kg, densidad alta/baja, M3 incoherente); **peso unit fix** (electro >300kg ÷10, any >5000kg ÷1000); ERROR → excluded, WARNING → flagged
6. **stage6_filter_sets** — 8 grouping sets: by_family, by_linea, by_marca, by_type, by_completeness, with_measures, composites, missing_measures
7. **stage7_stats** — Coverage stats, dimension distributions with histograms, per-type analysis, quality metrics, composite stats
8. **stage8_logistics** — Logistics volume estimation with 4-layer cascade + post-validation:
   - **Layer 1 (ERP ground truth)**: M3 field from ERP (matches agency invoices at 99.8%), confidence 0.99
   - **Layer 2 (Gemini packaging)**: Query Gemini for packaging/embalaje dimensions by EAN (electros only), cache at `data/ean_packaging_cache.json`, confidence 0.80
   - **Layer 3 (Ratio estimation)**: vol_logístico = vol_producto × calibration ratio by subfamilia, confidence 0.30-0.65
   - **Layer 4 (Heuristic average)**: Average vol_logístico from same subfamily/type, confidence 0.15-0.20
   - **Post-validation fixes** (after the 4 layers):
     - **Fix 1 — exterior plegable**: PARASOL/PERGOLA/CENADOR/GAZEBO/CARPA/TOLDO with vol > 5 m³ → factor 0.05 (se doblan para transporte), confidence 0.25 (~7 productos)
     - **Fix 2 — electros >3 m³**: look up `ean_packaging_cache.json` for reliable Gemini data; else nullify (estimation_layer='none', confidence=0)
     - **Fix 3 — muebles tiny**: COMODA/MESA/ARMARIO/etc. with vol < 0.01 m³ → replace with `promedio_subfamilia_corregido` (subfamily average excluding values < 0.01), confidence 0.15 (~468 productos)
   - Sets job.status = 'completed' (stage8 is the completion gate)
   - Coverage on real dataset: 100% (14,320/14,324), total ~5,468 m³

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000) |
| `GEMINI_API_KEY` | No (fallback) | Google Gemini API key fallback. **NEVER hardcode — env var only** |
| `CHS_PLATFORM_URL` | Yes (for stage4+8 AI) | CHS Platform internal URL for centralized AI key resolution |

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
- **Current container**: `wk8sggsg4koowwccssww4c4s-143150211251`

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
git add src/ dist-ui/ data/ean_cache.json data/ean_packaging_cache.json data/ground_truth_logistics.json data/ratios_calibracion.json
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

## Custom Export (column selector)

Configurable export endpoint that lets the user pick exactly which columns and filters they want.

- **Backend**: `GET /jobs/:jobId/export/custom?columns=...&format=csv|xlsx`
  - `columns` — comma-separated list of column IDs (default: `COD_ARTICULO,DESCRIPCION,VOLUMEN_PAQUETE_M3`)
  - `format` — `csv` (default) or `xlsx`
  - Filters (optional): `capa=1,2`, `confidence_min=0.8`, `tipo=mueble|electrodomestico|accesorio|otro`
  - CSV: `COD_ARTICULO` wrapped in `="..."` (Excel formula format) to preserve leading zeros
  - XLSX: `COD_ARTICULO` cells written as `{ t: 's', v: ..., z: '@' }` (text type) so leading zeros survive
  - Auto column widths in xlsx
- **Listing endpoint**: `GET /jobs/:jobId/export/columns` returns the catalog (columns, default, groups)
- **26 columns in 4 groups** (defined in `COLUMN_CATALOG` in `src/routes/jobs.ts`):
  - **Datos básicos** (9): COD_ARTICULO (always), DESCRIPCION, FAMILIA, TIPO, EAN, PROVEEDOR, PROGRAMA, MARCA, LINEA
  - **Medidas de producto** (6): ANCHO_CM, ALTO_CM, PROFUNDIDAD_CM, VOLUMEN_PRODUCTO_M3, PESO_NETO_KG, PESO_BRUTO_KG
  - **Logística** (5): VOLUMEN_PAQUETE_M3, BULTOS, CAPA, CONFIDENCE, ESTIMATION_SOURCE
  - **Calidad** (6): PARSE_CONFIDENCE, SOURCE, COMPOSITE, NUM_COMPONENTS, OUTLIER_WARNING, CATEGORY
- **Frontend**: `client/components/ExportDialog.tsx` — modal launched from `JobDetail` ("Exportar personalizado" button, only visible when stage 8 is success)
  - Checkboxes per column group, COD_ARTICULO always selected/disabled
  - 4 presets: `basic` (3 cols), `full` (logística completa), `measures` (medidas producto), `all` (todas)
  - Filters: capa dropdown, confidence slider (0-1, step 0.05), tipo dropdown
  - CSV/XLSX format selector with icons
  - Live URL preview in footer

## Caches & Static Data

- **`data/ean_cache.json`**: ~1877 product EAN lookups (stage4, product dimensions)
- **`data/ean_packaging_cache.json`**: ~2233 packaging EAN lookups (stage8, embalaje dimensions, 99.5% hit rate)
- **`data/ground_truth_logistics.json`**: 3,118 products with ERP M3 ground truth (static reference)
- **`data/ratios_calibracion.json`**: Calibration ratios product→package by subfamilia/tipo (static reference)
- All baked into Docker image via `COPY data/ ./data/` — survives rebuilds
- **No persistent volume** — runtime cache additions are lost on container restart
- Only electrodomésticos are queried for EAN (mueble EANs are unreliable)

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

## Coherence Audit Results (v2, 2026-04-09)

Two audits performed (200 + 500 product samples). Current pipeline coherence: **~92%** (up from 86% in audit v1).

### Post-validation fixes in stage3 (`postValidate*` functions):
| Fix | Description | Products Fixed |
|-----|-------------|----------------|
| fix1_nxnxn_nulled | Electro: 3 identical dims → null | 103 |
| fix_mueble_nxnxn_nulled | Mueble: 3 identical dims (no PUF/CUBO) → null | 128 |
| fix2_mm_to_cm | Electro: dims >200cm → ÷10 (mm→cm), handles partial dims | 188 |
| fix3_thousands_separator | Electro: "1.279" → 127.9cm | 4 |
| fix_small_dims_from_desc | All dims <20cm + desc NxN 5-15x bigger → use desc | 0 (edge) |
| fix_merged_dm_to_cm | Merged source, all dims <20, big furniture → ×10 | 0 (edge) |
| fix_cross_validation_desc | Desc NxN >30% mismatch vs parsed → use desc | 0 (edge) |
| fix_axis_swap_tall | VITRINA/ESTANTERIA: alto < prof → swap | 0 (edge) |

### Post-validation fix in stage5 (`fixPesoUnits`):
- peso_kg >5000 → ÷1000 (grams→kg)
- Electro peso_kg >300 → ÷10

### Remaining known anomalies:
- **46 muebles with dim >400cm**: possibly legitimate large furniture or HTML parsing errors
- **21 NxNxN residual**: products with identical dims that don't match filter criteria
- **66 products with all dims <10cm**: edge cases not caught by current heuristics

## Known Issues / TODOs

- **~737 products without measures**: mostly cuchillos/utensilios with unparseable HTML
- **447 muebles flagged dim < 5cm**: many are cabeceros/paneles with legitimately thin profundidad
- **82 products with dirty FAMILIA**: irregular formats like "0", "90001;0;00003"
- **peso_kg ~80% empty**: weight data is sparse across the catalog
- **No persistent volume**: data/ and uploads/ are ephemeral — lost on container restart
- **Validation pending**: 200-product coherence check (`validate_200.js`) needs new GEMINI_API_KEY to run
- **Conformidad CHS Platform**: 2/11 deberes cumplidos (solo health + favicon)

## Notes

- The backend uses in-memory storage — data is lost on container restart
- Container names change on each Coolify deploy (format: `{uuid}-{timestamp}`)
- Alpine containers resolve `localhost` to IPv6 — use `127.0.0.1` for internal wget/curl
- E2E tests run against production (`platform.centrohogarsanchez.es`), not local dev
- `dist/` is in .gitignore — backend is compiled by Docker during build, only `dist-ui/` is committed
