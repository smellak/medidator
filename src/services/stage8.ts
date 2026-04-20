import * as fs from 'fs';
import * as path from 'path';
import { store } from '../db/memory-store';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getAiKey, invalidateKeyCache } from '../lib/platform-key';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const GROUND_TRUTH_FILE = path.join(DATA_DIR, 'ground_truth_logistics.json');
const RATIOS_FILE = path.join(DATA_DIR, 'ratios_calibracion.json');
const EAN_PACKAGING_CACHE_FILE = path.join(DATA_DIR, 'ean_packaging_cache.json');

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 1000;
const SAVE_EVERY = 50;

type EstimationLayer = 'erp_ground_truth' | 'gemini_embalaje' | 'ratio_subfamilia' | 'ratio_tipo' | 'promedio_subfamilia' | 'promedio_tipo' | 'promedio_subfamilia_corregido' | 'ratio_subfamilia_corregido_fix4' | 'ratio_desde_descripcion_fix5' | 'ratio_residual_fix7' | 'ratio_composicion_ancho_fix8' | 'none';

interface LogisticsEntry {
  'COD.ARTICULO': string;
  m3_logistico: number | null;
  bultos: number;
  peso_bruto_kg: number | null;
  estimation_layer: EstimationLayer;
  confidence: number;
  ratio_used: number | null;
  ratio_source: string | null;
  detail: string;
}

interface PackagingCacheEntry {
  embalaje_ancho_cm: number | null;
  embalaje_alto_cm: number | null;
  embalaje_profundidad_cm: number | null;
  embalaje_peso_bruto_kg: number | null;
  encontrado: boolean;
  source: 'gemini';
  fetched_at: string;
}

interface RatioGroup {
  n: number;
  median: number;
  mean: number;
  std: number;
  p25: number;
  p75: number;
  min: number;
  max: number;
  confidence: number;
}

// --- Helpers ---

function classifyByFamilia(familia: string): string {
  const prefix = (familia || '').split('.')[0];
  switch (prefix) {
    case '00001': return 'mueble';
    case '00002': return 'electrodomestico';
    case '00003': return 'accesorio';
    default: return 'otro';
  }
}

function getSubfamiliaL2(familia: string): string {
  return (familia || '').substring(0, 11);
}

function getSubfamiliaL1(familia: string): string {
  return (familia || '').substring(0, 5);
}

function isValidEan(ean: any): boolean {
  if (ean === null || ean === undefined) return false;
  const s = String(ean).trim();
  return s.length > 0 && s !== '0' && s !== 'null' && s !== 'None';
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Packaging EAN Cache ---

function loadPackagingCache(): Record<string, PackagingCacheEntry> {
  try {
    if (fs.existsSync(EAN_PACKAGING_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(EAN_PACKAGING_CACHE_FILE, 'utf-8'));
    }
  } catch { /* ignore corrupt cache */ }
  return {};
}

function savePackagingCache(cache: Record<string, PackagingCacheEntry>): void {
  fs.mkdirSync(path.dirname(EAN_PACKAGING_CACHE_FILE), { recursive: true });
  fs.writeFileSync(EAN_PACKAGING_CACHE_FILE, JSON.stringify(cache, null, 2));
}

// --- Gemini Packaging Lookup ---

function buildPackagingPrompt(ean: string, descripcion: string): string {
  return `Eres un experto en logística de electrodomésticos. Dado el EAN: ${ean}
Y la descripción: ${descripcion}
Necesito las dimensiones del EMBALAJE/CAJA de este producto (NO las del producto en sí).
Los fabricantes publican estas medidas como "packaging dimensions" o "dimensiones del embalaje" en sus fichas técnicas.
Devuelve SOLO JSON válido:
{
"embalaje_ancho_cm": number|null,
"embalaje_alto_cm": number|null,
"embalaje_profundidad_cm": number|null,
"embalaje_peso_bruto_kg": number|null,
"encontrado": true|false
}
Si no encuentras datos de embalaje, pon encontrado: false y nulls.`;
}

function parsePackagingResponse(text: string): Omit<PackagingCacheEntry, 'source' | 'fetched_at'> | null {
  try {
    let cleaned = text.trim();
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
    const parsed = JSON.parse(cleaned);
    return {
      embalaje_ancho_cm: typeof parsed.embalaje_ancho_cm === 'number' ? parsed.embalaje_ancho_cm : null,
      embalaje_alto_cm: typeof parsed.embalaje_alto_cm === 'number' ? parsed.embalaje_alto_cm : null,
      embalaje_profundidad_cm: typeof parsed.embalaje_profundidad_cm === 'number' ? parsed.embalaje_profundidad_cm : null,
      embalaje_peso_bruto_kg: typeof parsed.embalaje_peso_bruto_kg === 'number' ? parsed.embalaje_peso_bruto_kg : null,
      encontrado: !!parsed.encontrado,
    };
  } catch {
    return null;
  }
}

async function queryGeminiPackagingBatch(
  model: any,
  items: Array<{ ean: string; desc: string }>,
): Promise<Array<{ ean: string; result: Omit<PackagingCacheEntry, 'source' | 'fetched_at'> | null }>> {
  const results = await Promise.all(
    items.map(async ({ ean, desc }) => {
      try {
        const prompt = buildPackagingPrompt(ean, desc);
        const response = await model.generateContent(prompt);
        const text = response.response.text();
        return { ean, result: parsePackagingResponse(text) };
      } catch (err: any) {
        console.error(`[Stage8] Gemini packaging error for EAN ${ean}: ${err.message}`);
        return { ean, result: null };
      }
    }),
  );
  return results;
}

// --- Main ---

export async function executeStage8(jobId: string): Promise<void> {
  const job = store.getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  job.stages.stage8_logistics.status = 'processing';
  job.status = 'processing';
  store.updateJob(jobId, job);

  try {
    // Load stage5 cleaned products
    const stage5File = path.join(DATA_DIR, jobId, 'stage5_cleaned.json');
    if (!fs.existsSync(stage5File)) {
      throw new Error('Stage 5 output not found. Run previous stages first.');
    }
    const stage5Data = JSON.parse(fs.readFileSync(stage5File, 'utf-8'));
    const products: any[] = stage5Data.products;
    const excluded: any[] = stage5Data.excluded || [];

    // Load static reference files
    let groundTruth: Record<string, any> = {};
    if (fs.existsSync(GROUND_TRUTH_FILE)) {
      groundTruth = JSON.parse(fs.readFileSync(GROUND_TRUTH_FILE, 'utf-8')).products || {};
    }

    let ratios: any = { by_subfamilia_l2: {}, by_subfamilia_l1: {}, by_tipo: {} };
    if (fs.existsSync(RATIOS_FILE)) {
      ratios = JSON.parse(fs.readFileSync(RATIOS_FILE, 'utf-8'));
    }

    // Process each product — entries array built sequentially through layers
    const entries: LogisticsEntry[] = [];
    const layerCounts = {
      erp_ground_truth: 0,
      gemini_embalaje: 0,
      ratio_subfamilia: 0,
      ratio_tipo: 0,
      promedio_subfamilia: 0,
      promedio_tipo: 0,
      promedio_subfamilia_corregido: 0,
      none: 0,
    };
    const layerConfidences: Record<string, number[]> = {
      erp_ground_truth: [], gemini_embalaje: [], ratio_subfamilia: [],
      ratio_tipo: [], promedio_subfamilia: [], promedio_tipo: [],
    };

    // Build product metadata for all layers
    const productMeta: Array<{
      cod: string; m3Erp: number; bultos: number; pesoBruto: number | null;
      familia: string; tipo: string; subfL2: string; subfL1: string;
      volProducto: number | null; ean: any; desc: string;
    }> = products.map((p: any) => {
      const familia = String(p.original?.['FAMILIA'] || '');
      const tipo = p.product_type || classifyByFamilia(familia);
      const a = p.measures?.ancho_cm;
      const h = p.measures?.alto_cm;
      const pr = p.measures?.profundidad_cm;
      const volProducto = (a && h && pr) ? Math.round(a * h * pr / 1000000 * 10000) / 10000 : null;
      return {
        cod: String(p['COD.ARTICULO']),
        m3Erp: Number(p.original?.['M3']) || 0,
        bultos: Number(p.original?.['Bultos']) || 1,
        pesoBruto: Number(p.original?.['PESO_BRUTO']) || null,
        familia,
        tipo,
        subfL2: getSubfamiliaL2(familia),
        subfL1: getSubfamiliaL1(familia),
        volProducto,
        ean: p.original?.['EAN-code'],
        desc: String(p.original?.['Descripcion del proveedor'] || ''),
      };
    });

    // Initialize all entries as 'none'
    for (const pm of productMeta) {
      entries.push({
        'COD.ARTICULO': pm.cod,
        m3_logistico: null,
        bultos: pm.bultos,
        peso_bruto_kg: pm.pesoBruto,
        estimation_layer: 'none',
        confidence: 0,
        ratio_used: null,
        ratio_source: null,
        detail: '',
      });
    }

    // ==========================================
    // LAYER 1: ERP ground truth (M3 > 0)
    // ==========================================
    console.log('[Stage8] Layer 1: ERP ground truth...');
    for (let i = 0; i < productMeta.length; i++) {
      const pm = productMeta[i];
      if (pm.m3Erp > 0) {
        entries[i].m3_logistico = pm.m3Erp;
        entries[i].estimation_layer = 'erp_ground_truth';
        entries[i].confidence = 0.99;
        entries[i].detail = `M3 directo del ERP: ${pm.m3Erp}`;
        layerCounts.erp_ground_truth++;
        layerConfidences.erp_ground_truth.push(0.99);
      }
    }
    console.log(`[Stage8] Layer 1 done: ${layerCounts.erp_ground_truth} products with ERP M3`);

    // ==========================================
    // LAYER 2: Gemini packaging EAN (electros sin M3)
    // ==========================================
    const geminiStats = { queried: 0, cached: 0, found: 0, enriched: 0, errors: 0, skipped: false };

    console.log('[Stage8] Layer 2: Gemini packaging lookup...');
    const packagingCache = loadPackagingCache();

    // Identify electros with valid EAN that need Layer 2
    const electrosNeedL2: Array<{ index: number; ean: string; desc: string }> = [];
    for (let i = 0; i < productMeta.length; i++) {
      if (entries[i].estimation_layer !== 'none') continue; // already covered by L1
      const pm = productMeta[i];
      if (pm.tipo !== 'electrodomestico') continue;
      if (!isValidEan(pm.ean)) continue;

      const eanStr = String(pm.ean).trim();
      if (packagingCache[eanStr]) {
        // Apply from cache
        geminiStats.cached++;
        const cached = packagingCache[eanStr];
        if (cached.encontrado && cached.embalaje_ancho_cm && cached.embalaje_alto_cm && cached.embalaje_profundidad_cm) {
          const vol = Math.round(
            cached.embalaje_ancho_cm * cached.embalaje_alto_cm * cached.embalaje_profundidad_cm / 1000000 * 10000
          ) / 10000;
          entries[i].m3_logistico = vol;
          entries[i].estimation_layer = 'gemini_embalaje';
          entries[i].confidence = 0.80;
          entries[i].peso_bruto_kg = cached.embalaje_peso_bruto_kg || entries[i].peso_bruto_kg;
          entries[i].detail = `Gemini embalaje (cache): ${cached.embalaje_ancho_cm}×${cached.embalaje_alto_cm}×${cached.embalaje_profundidad_cm} cm = ${vol} m³`;
          layerCounts.gemini_embalaje++;
          layerConfidences.gemini_embalaje.push(0.80);
          geminiStats.found++;
          geminiStats.enriched++;
        }
      } else {
        electrosNeedL2.push({ index: i, ean: eanStr, desc: pm.desc });
      }
    }

    // Query Gemini for uncached EANs
    if (electrosNeedL2.length > 0) {
      let apiKeyAvailable = false;
      try {
        const { apiKey, defaultModel } = await getAiKey('google');
        if (apiKey) {
          apiKeyAvailable = true;
          const geminiModelName = defaultModel || 'gemini-2.5-flash';
          const genAI = new GoogleGenerativeAI(apiKey);
          const model = genAI.getGenerativeModel({ model: geminiModelName });
          let retried = false;

          console.log(`[Stage8] Querying Gemini for ${electrosNeedL2.length} packaging EANs (${geminiStats.cached} cached)...`);

          for (let batchStart = 0; batchStart < electrosNeedL2.length; batchStart += BATCH_SIZE) {
            const batch = electrosNeedL2.slice(batchStart, batchStart + BATCH_SIZE);
            let results: Array<{ ean: string; result: Omit<PackagingCacheEntry, 'source' | 'fetched_at'> | null }>;

            try {
              results = await queryGeminiPackagingBatch(model, batch);
            } catch (err: any) {
              if (!retried && err?.status === 403) {
                console.warn('[Stage8] Gemini 403 — invalidating key cache and retrying...');
                invalidateKeyCache();
                const fresh = await getAiKey('google');
                const freshGenAI = new GoogleGenerativeAI(fresh.apiKey);
                const freshModel = freshGenAI.getGenerativeModel({ model: fresh.defaultModel || 'gemini-2.5-flash' });
                results = await queryGeminiPackagingBatch(freshModel, batch);
                retried = true;
              } else {
                console.error(`[Stage8] Gemini batch error: ${err.message}`);
                // Skip remaining batches on persistent error
                break;
              }
            }

            for (const { ean, result } of results) {
              geminiStats.queried++;
              if (result) {
                const cacheEntry: PackagingCacheEntry = {
                  ...result,
                  source: 'gemini',
                  fetched_at: new Date().toISOString(),
                };
                packagingCache[ean] = cacheEntry;

                if (result.encontrado && result.embalaje_ancho_cm && result.embalaje_alto_cm && result.embalaje_profundidad_cm) {
                  geminiStats.found++;
                  const item = batch.find(b => b.ean === ean);
                  if (item) {
                    const vol = Math.round(
                      result.embalaje_ancho_cm * result.embalaje_alto_cm * result.embalaje_profundidad_cm / 1000000 * 10000
                    ) / 10000;
                    entries[item.index].m3_logistico = vol;
                    entries[item.index].estimation_layer = 'gemini_embalaje';
                    entries[item.index].confidence = 0.80;
                    entries[item.index].peso_bruto_kg = result.embalaje_peso_bruto_kg || entries[item.index].peso_bruto_kg;
                    entries[item.index].detail = `Gemini embalaje: ${result.embalaje_ancho_cm}×${result.embalaje_alto_cm}×${result.embalaje_profundidad_cm} cm = ${vol} m³`;
                    layerCounts.gemini_embalaje++;
                    layerConfidences.gemini_embalaje.push(0.80);
                    geminiStats.enriched++;
                  }
                }
              } else {
                geminiStats.errors++;
                packagingCache[ean] = {
                  embalaje_ancho_cm: null, embalaje_alto_cm: null, embalaje_profundidad_cm: null,
                  embalaje_peso_bruto_kg: null, encontrado: false, source: 'gemini',
                  fetched_at: new Date().toISOString(),
                };
              }
            }

            // Save cache periodically
            if (geminiStats.queried % SAVE_EVERY < BATCH_SIZE) {
              savePackagingCache(packagingCache);
            }

            // Rate limit
            if (batchStart + BATCH_SIZE < electrosNeedL2.length) {
              await sleep(BATCH_DELAY_MS);
            }

            // Log progress every 50
            if (geminiStats.queried % 50 < BATCH_SIZE) {
              console.log(`[Stage8] L2 progress: ${geminiStats.queried}/${electrosNeedL2.length} queried, ${geminiStats.found} found`);
            }
          }

          // Final cache save
          savePackagingCache(packagingCache);
        }
      } catch (err: any) {
        console.warn(`[Stage8] Layer 2 skipped — no API key available: ${err.message}`);
        geminiStats.skipped = true;
      }

      if (!apiKeyAvailable) {
        console.warn('[Stage8] Layer 2 skipped — Gemini API key not available');
        geminiStats.skipped = true;
      }
    }

    console.log(`[Stage8] Layer 2 done: ${layerCounts.gemini_embalaje} products from Gemini packaging (${geminiStats.queried} queried, ${geminiStats.cached} cached, ${geminiStats.found} found)`);

    // ==========================================
    // LAYER 3: Ratio producto → paquete
    // ==========================================
    console.log('[Stage8] Layer 3: Ratio estimation...');
    for (let i = 0; i < productMeta.length; i++) {
      if (entries[i].estimation_layer !== 'none') continue; // already covered by L1 or L2

      const pm = productMeta[i];
      if (!pm.volProducto || pm.volProducto <= 0) continue; // no product dimensions

      // Lookup ratio: subfamilia L2 → L1 → tipo
      let ratioGroup: RatioGroup | null = null;
      let ratioSource = '';
      let confidence = 0;

      const l2 = ratios.by_subfamilia_l2?.[pm.subfL2] as RatioGroup | undefined;
      if (l2 && l2.n >= 5) {
        ratioGroup = l2;
        ratioSource = `subfamilia_l2:${pm.subfL2}`;
        if (l2.n >= 20) confidence = 0.65;
        else if (l2.n >= 10) confidence = 0.55;
        else confidence = 0.45;
      }

      if (!ratioGroup) {
        const l1 = ratios.by_subfamilia_l1?.[pm.subfL1] as RatioGroup | undefined;
        if (l1 && l1.n >= 5) {
          ratioGroup = l1;
          ratioSource = `subfamilia_l1:${pm.subfL1}`;
          confidence = 0.40;
        }
      }

      if (!ratioGroup) {
        const t = ratios.by_tipo?.[pm.tipo] as RatioGroup | undefined;
        if (t && t.n >= 5) {
          ratioGroup = t;
          ratioSource = `tipo:${pm.tipo}`;
          confidence = 0.30;
        }
      }

      if (ratioGroup) {
        const vol = Math.round(pm.volProducto * ratioGroup.median * 10000) / 10000;
        const layer: EstimationLayer = ratioSource.startsWith('tipo:') ? 'ratio_tipo' : 'ratio_subfamilia';
        entries[i].m3_logistico = vol;
        entries[i].estimation_layer = layer;
        entries[i].confidence = confidence;
        entries[i].ratio_used = ratioGroup.median;
        entries[i].ratio_source = ratioSource;
        entries[i].detail = `vol_prod=${pm.volProducto} × ratio=${ratioGroup.median} (${ratioSource}, n=${ratioGroup.n}) = ${vol} m³`;

        if (layer === 'ratio_tipo') {
          layerCounts.ratio_tipo++;
          layerConfidences.ratio_tipo.push(confidence);
        } else {
          layerCounts.ratio_subfamilia++;
          layerConfidences.ratio_subfamilia.push(confidence);
        }
      }
    }
    console.log(`[Stage8] Layer 3 done: ${layerCounts.ratio_subfamilia} ratio_subfamilia + ${layerCounts.ratio_tipo} ratio_tipo`);

    // ==========================================
    // LAYER 4: Heuristic averages
    // ==========================================
    console.log('[Stage8] Layer 4: Heuristic averages...');

    // Build average vol_logistico by subfamilia L2 and by tipo from layers 1-3
    const volBySubfL2: Record<string, number[]> = {};
    const volByTipo: Record<string, number[]> = {};

    for (let i = 0; i < entries.length; i++) {
      if (entries[i].m3_logistico !== null && entries[i].m3_logistico! > 0) {
        const pm = productMeta[i];
        if (!volBySubfL2[pm.subfL2]) volBySubfL2[pm.subfL2] = [];
        volBySubfL2[pm.subfL2].push(entries[i].m3_logistico!);
        if (!volByTipo[pm.tipo]) volByTipo[pm.tipo] = [];
        volByTipo[pm.tipo].push(entries[i].m3_logistico!);
      }
    }

    for (let i = 0; i < productMeta.length; i++) {
      if (entries[i].estimation_layer !== 'none') continue;

      const pm = productMeta[i];

      // Try subfamily average (>= 3 products)
      const subfVols = volBySubfL2[pm.subfL2];
      if (subfVols && subfVols.length >= 3) {
        const avg = Math.round(subfVols.reduce((s, v) => s + v, 0) / subfVols.length * 10000) / 10000;
        entries[i].m3_logistico = avg;
        entries[i].estimation_layer = 'promedio_subfamilia';
        entries[i].confidence = 0.20;
        entries[i].detail = `Promedio subfamilia ${pm.subfL2} (n=${subfVols.length}): ${avg} m³`;
        layerCounts.promedio_subfamilia++;
        layerConfidences.promedio_subfamilia.push(0.20);
        continue;
      }

      // Try type average
      const tipoVols = volByTipo[pm.tipo];
      if (tipoVols && tipoVols.length >= 3) {
        const avg = Math.round(tipoVols.reduce((s, v) => s + v, 0) / tipoVols.length * 10000) / 10000;
        entries[i].m3_logistico = avg;
        entries[i].estimation_layer = 'promedio_tipo';
        entries[i].confidence = 0.15;
        entries[i].detail = `Promedio tipo ${pm.tipo} (n=${tipoVols.length}): ${avg} m³`;
        layerCounts.promedio_tipo++;
        layerConfidences.promedio_tipo.push(0.15);
        continue;
      }

      // No data at all
      entries[i].detail = 'Sin datos suficientes para estimar volumen logístico';
      layerCounts.none++;
    }
    console.log(`[Stage8] Layer 4 done: ${layerCounts.promedio_subfamilia} promedio_subfamilia + ${layerCounts.promedio_tipo} promedio_tipo`);

    // ==========================================
    // POST-VALIDATION PHASE
    // Fix 1: Exterior products (parasol/pergola/...) > 5 m³ → factor 0.05
    // Fix 2: Electros > 3 m³ → use packaging cache or nullify
    // Fix 3: Muebles (comoda/mesa/...) < 0.01 m³ → subfamily average (excluding < 0.01)
    // ==========================================
    console.log('[Stage8] Post-validation phase...');

    const postValidationStats = {
      fix1_exterior_plegable: 0,
      fix2_electro_excessive_nulled: 0,
      fix2_electro_excessive_from_cache: 0,
      fix3_mueble_tiny_corrected: 0,
      fix3_mueble_tiny_no_avg: 0,
      fix4_erp_placeholder_corrected: 0,
      fix5_dims_from_description: 0,
      fix7_residual_large_tiny: 0,
      fix8_composicion_ancho: 0,
    };

    const EXTERIOR_REGEX = /\b(PARASOL|PERGOLA|PÉRGOLA|CENADOR|GAZEBO|CARPA|TOLDO)\b/i;
    const MUEBLE_TARGET_REGEX = /\b(COMODA|CÓMODA|MESA|MESITA|SINFONIER|ARMARIO|ESTANTERIA|ESTANTERÍA|VITRINA|APARADOR|CAMA|SOFA|SOFÁ)\b/i;

    // ---- Fix 1: exterior plegable ----
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.m3_logistico === null || e.m3_logistico <= 5) continue;
      const desc = productMeta[i].desc || '';
      if (!EXTERIOR_REGEX.test(desc)) continue;

      const original = e.m3_logistico;
      const corrected = Math.round(original * 0.05 * 10000) / 10000;
      e.m3_logistico = corrected;
      e.confidence = 0.25;
      e.detail = `Producto exterior plegable: vol_original=${original} × 0.05 = ${corrected} m³ (fix1)`;
      postValidationStats.fix1_exterior_plegable++;
    }

    // ---- Fix 2: electros con volumen > 3 m³ ----
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.m3_logistico === null || e.m3_logistico <= 3) continue;
      const pm = productMeta[i];
      if (pm.tipo !== 'electrodomestico') continue;

      // Try packaging cache first
      let fromCache = false;
      if (isValidEan(pm.ean)) {
        const eanStr = String(pm.ean).trim();
        const cached = packagingCache[eanStr];
        if (cached && cached.encontrado && cached.embalaje_ancho_cm && cached.embalaje_alto_cm && cached.embalaje_profundidad_cm) {
          const vol = Math.round(
            cached.embalaje_ancho_cm * cached.embalaje_alto_cm * cached.embalaje_profundidad_cm / 1000000 * 10000
          ) / 10000;
          if (vol > 0 && vol <= 3) {
            // Decrement old layer counter if needed
            const oldLayer = e.estimation_layer;
            if (oldLayer !== 'gemini_embalaje') {
              const oldKey = oldLayer as keyof typeof layerCounts;
              if (layerCounts[oldKey] !== undefined && layerCounts[oldKey] > 0) layerCounts[oldKey]--;
              layerCounts.gemini_embalaje++;
            }
            e.m3_logistico = vol;
            e.estimation_layer = 'gemini_embalaje';
            e.confidence = 0.80;
            e.peso_bruto_kg = cached.embalaje_peso_bruto_kg || e.peso_bruto_kg;
            e.detail = `Fix2 electro>3m³: Gemini embalaje ${cached.embalaje_ancho_cm}×${cached.embalaje_alto_cm}×${cached.embalaje_profundidad_cm} cm = ${vol} m³`;
            postValidationStats.fix2_electro_excessive_from_cache++;
            fromCache = true;
          }
        }
      }

      if (!fromCache) {
        // Decrement old layer counter
        const oldLayer = e.estimation_layer;
        const oldKey = oldLayer as keyof typeof layerCounts;
        if (layerCounts[oldKey] !== undefined && layerCounts[oldKey] > 0) layerCounts[oldKey]--;
        layerCounts.none++;

        e.m3_logistico = null;
        e.estimation_layer = 'none';
        e.confidence = 0;
        e.ratio_used = null;
        e.ratio_source = null;
        e.detail = `Fix2 electro>3m³: volumen inverosímil, sin dato fiable`;
        postValidationStats.fix2_electro_excessive_nulled++;
      }
    }

    // ---- Fix 3: muebles con volumen < 0.01 m³ ----
    // Build subfamily averages EXCLUDING values < 0.01
    const volBySubfL2Clean: Record<string, number[]> = {};
    for (let i = 0; i < entries.length; i++) {
      const v = entries[i].m3_logistico;
      if (v === null || v < 0.01) continue;
      const subfL2 = productMeta[i].subfL2;
      if (!volBySubfL2Clean[subfL2]) volBySubfL2Clean[subfL2] = [];
      volBySubfL2Clean[subfL2].push(v);
    }

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.m3_logistico === null || e.m3_logistico >= 0.01) continue;
      const pm = productMeta[i];
      if (pm.tipo !== 'mueble') continue;
      const desc = pm.desc || '';
      if (!MUEBLE_TARGET_REGEX.test(desc)) continue;

      const cleanVols = volBySubfL2Clean[pm.subfL2];
      if (cleanVols && cleanVols.length >= 3) {
        const avg = Math.round(cleanVols.reduce((s, v) => s + v, 0) / cleanVols.length * 10000) / 10000;
        const original = e.m3_logistico;

        // Decrement old layer counter
        const oldLayer = e.estimation_layer;
        const oldKey = oldLayer as keyof typeof layerCounts;
        if (layerCounts[oldKey] !== undefined && layerCounts[oldKey] > 0) layerCounts[oldKey]--;
        layerCounts.promedio_subfamilia_corregido =
          (layerCounts.promedio_subfamilia_corregido || 0) + 1;

        e.m3_logistico = avg;
        e.estimation_layer = 'promedio_subfamilia_corregido';
        e.confidence = 0.15;
        e.ratio_source = `promedio_subfamilia_corregido:${pm.subfL2}`;
        e.detail = `Fix3 mueble<0.01m³ (${original}): promedio subfamilia limpia ${pm.subfL2} (n=${cleanVols.length}) = ${avg} m³`;
        postValidationStats.fix3_mueble_tiny_corrected++;
      } else {
        postValidationStats.fix3_mueble_tiny_no_avg++;
      }
    }

    // ---- Fix 4: ERP placeholder 0.01 m³ en muebles grandes ----
    // El ERP usa 0.01 como valor dummy para muchos muebles. Si vol_producto > 0.3 m³
    // el packaging de 0.01 m³ es físicamente imposible. Se invalida y recalcula con ratio.
    const ENROLLABLE_REGEX = /\b(COLCHON|COLCH[OÓ]N|ALFOMBRA|FELPUDO|MANTA)\b/i;
    const fix4_examples: string[] = [];

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];

      // Criterio 1: actualmente asignado por ERP
      if (e.estimation_layer !== 'erp_ground_truth') continue;

      // Criterio 2: m3_logistico ≈ 0.01 (con tolerancia pequeña)
      if (e.m3_logistico === null || e.m3_logistico < 0.009 || e.m3_logistico > 0.011) continue;

      const pm = productMeta[i];

      // Criterio 3: vol_producto > 0.3 m³ (mueble grande ensamblado)
      if (!pm.volProducto || pm.volProducto < 0.3) continue;

      // Criterio 4: excluir productos legítimamente compactables (colchones, alfombras)
      if (ENROLLABLE_REGEX.test(pm.desc)) continue;

      // Buscar ratio por subfamilia L2 → L1 → tipo
      let fix4Ratio: RatioGroup | null = null;
      let fix4Source = '';
      let fix4Conf = 0;

      const l2 = ratios.by_subfamilia_l2?.[pm.subfL2] as RatioGroup | undefined;
      if (l2 && l2.n >= 5) {
        fix4Ratio = l2;
        fix4Source = `fix4_erp_placeholder:${pm.subfL2}`;
        fix4Conf = l2.n >= 20 ? 0.55 : l2.n >= 10 ? 0.45 : 0.35;
      }

      if (!fix4Ratio) {
        const l1 = ratios.by_subfamilia_l1?.[pm.subfL1] as RatioGroup | undefined;
        if (l1 && l1.n >= 5) {
          fix4Ratio = l1;
          fix4Source = `fix4_erp_placeholder:subfamilia_l1:${pm.subfL1}`;
          fix4Conf = 0.35;
        }
      }

      if (!fix4Ratio) {
        const t = ratios.by_tipo?.[pm.tipo] as RatioGroup | undefined;
        if (t && t.n >= 5) {
          fix4Ratio = t;
          fix4Source = `fix4_erp_placeholder:tipo:${pm.tipo}`;
          fix4Conf = 0.30;
        }
      }

      if (fix4Ratio) {
        const nuevoVol = Math.round(pm.volProducto * fix4Ratio.median * 10000) / 10000;
        const volOriginal = e.m3_logistico;

        // Ajustar contadores: quitar de ERP, añadir a ratio_subfamilia
        if (layerCounts.erp_ground_truth > 0) layerCounts.erp_ground_truth--;
        layerCounts.ratio_subfamilia++;
        layerConfidences.ratio_subfamilia.push(fix4Conf);

        e.m3_logistico = nuevoVol;
        e.estimation_layer = 'ratio_subfamilia_corregido_fix4';
        e.confidence = fix4Conf;
        e.ratio_used = fix4Ratio.median;
        e.ratio_source = fix4Source;
        e.detail = `Fix4 ERP=${volOriginal} placeholder (vol_prod=${pm.volProducto}): ratio ${fix4Ratio.median} → ${nuevoVol} m³`;

        postValidationStats.fix4_erp_placeholder_corrected++;
        if (fix4_examples.length < 10) {
          fix4_examples.push(`${pm.cod}: ${volOriginal}→${nuevoVol}m³ | ${pm.desc.substring(0, 50)}`);
        }
      }
    }

    console.log(`[Stage8] Fix4 applied: ${postValidationStats.fix4_erp_placeholder_corrected} ERP placeholders corrected`);
    if (fix4_examples.length > 0) {
      console.log('[Stage8] Fix4 examples:');
      fix4_examples.forEach(ex => console.log(`  ${ex}`));
    }

    // ---- Fix 5: Supplier 00860 con dims en descripción ----
    // El supplier 00860 (muebles MB-) tiene dims erróneas en stage4 pero la
    // descripción contiene las dims correctas: "MUEBLE TV MADERA 120X50X58 NEGRO"
    const EXCLUDE_PLANOS_REGEX = /\b(CUADRO|ESPEJO|LAMINA|LÁMINA|DECORACION|DECORACIÓN|COLGANTE|ESTRELLA|BANDEJA|NACIMIENTO|PAPANOEL)\b/i;
    // Acepta enteros y decimales con coma: "145,5X40,5X60" o "185,42X35,56X55,88"
    const DIM_REGEX = /\b(\d{2,3}(?:,\d{1,2})?)[xX×](\d{1,3}(?:,\d{1,2})?)[xX×](\d{2,3}(?:,\d{1,2})?)\b/;
    const fix5_examples: string[] = [];

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const pm = productMeta[i];

      // Criterio 1: supplier 00860
      if (!pm.cod.startsWith('00860')) continue;

      // Criterio 2: m3 < 0.01 (incluye 0 / null)
      if (e.m3_logistico !== null && e.m3_logistico >= 0.01) continue;

      // Criterio 3: excluir productos planos/decorativos legítimamente pequeños
      if (EXCLUDE_PLANOS_REGEX.test(pm.desc)) continue;

      // Criterio 4: parsear dims de la descripción
      const match = pm.desc.match(DIM_REGEX);
      if (!match) continue;

      const d1 = parseFloat(match[1].replace(',', '.'));
      const d2 = parseFloat(match[2].replace(',', '.'));
      const d3 = parseFloat(match[3].replace(',', '.'));

      // Sanity check: dims razonables (cm)
      if (d1 < 10 || d1 > 400 || d2 < 3 || d2 > 300 || d3 < 10 || d3 > 400) continue;

      // Volumen producto desde dims de descripción
      const volProductoDesc = Math.round(d1 * d2 * d3 / 1000000 * 10000) / 10000;

      // Ratio: subfamilia L2 → L1 → tipo → fallback 0.85
      let fix5Ratio = 0.85;
      let fix5Source = 'fix5_fallback_mueble';
      const l2r = ratios.by_subfamilia_l2?.[pm.subfL2] as RatioGroup | undefined;
      if (l2r && l2r.n >= 5) {
        fix5Ratio = l2r.median;
        fix5Source = `fix5_desc_dims:subfL2:${pm.subfL2}`;
      } else {
        const l1r = ratios.by_subfamilia_l1?.[pm.subfL1] as RatioGroup | undefined;
        if (l1r && l1r.n >= 5) {
          fix5Ratio = l1r.median;
          fix5Source = `fix5_desc_dims:subfL1:${pm.subfL1}`;
        } else {
          const tr = ratios.by_tipo?.[pm.tipo] as RatioGroup | undefined;
          if (tr && tr.n >= 5) {
            fix5Ratio = tr.median;
            fix5Source = `fix5_desc_dims:tipo:${pm.tipo}`;
          }
        }
      }

      const nuevoVol = Math.round(volProductoDesc * fix5Ratio * 10000) / 10000;
      const volOriginal = e.m3_logistico;

      // Ajustar contadores de capas
      const oldLayer = e.estimation_layer;
      const oldKey = oldLayer as keyof typeof layerCounts;
      if (layerCounts[oldKey] !== undefined && layerCounts[oldKey] > 0) {
        layerCounts[oldKey]--;
      }
      layerCounts.ratio_subfamilia++;
      layerConfidences.ratio_subfamilia.push(0.45);

      e.m3_logistico = nuevoVol;
      e.estimation_layer = 'ratio_desde_descripcion_fix5';
      e.confidence = 0.45;
      e.ratio_used = fix5Ratio;
      e.ratio_source = fix5Source;
      e.detail = `Fix5 dims desc (${d1}x${d2}x${d3}cm, vol_prod=${volProductoDesc}): ratio ${fix5Ratio} → ${nuevoVol} m³`;

      postValidationStats.fix5_dims_from_description++;
      if (fix5_examples.length < 10) {
        fix5_examples.push(`${pm.cod}: ${volOriginal}→${nuevoVol}m³ (${d1}x${d2}x${d3}) | ${pm.desc.substring(0, 50)}`);
      }
    }

    console.log(`[Stage8] Fix5 applied: ${postValidationStats.fix5_dims_from_description} products recovered from description dims`);
    if (fix5_examples.length > 0) {
      console.log('[Stage8] Fix5 examples:');
      fix5_examples.forEach(ex => console.log(`  ${ex}`));
    }

    // ---- Fix 7: Electros/muebles grandes residuales con tiny volume ----
    // Captura lo que Fix3-6 no pillaron: electros grandes (frigos, lavadoras, termos)
    // y muebles grandes (recibidores, escritorios, literas, cabezales) del 00860/00664/04376.
    // Nivel A: parsea NxNxN (acepta "200/190X90" tomando primer número)
    // Nivel B: usa vol_producto del stage4 si > 0.05 m³
    const ELECTRO_GRANDE_REGEX = /\b(FRIGO|FRIGOR[IÍ]FICO|LAVADORA|LAVAVAJILLAS|LAVASECADORA|SECADORA|CONGELADOR|HORNO\s|TERMO|CALENTADOR)\b/i;
    const MUEBLE_GRANDE_REGEX = /\b(RECIBIDOR|ESCRITORIO|LITERA|BICAMA|CABEZAL|CABECERO|COMPOSICI[OÓ]N|APILABLE|VESTIDOR|MUEBLE\s+TV)\b/i;
    const EXCLUDE_FIX7_REGEX = /\b(MINI|PEQUE[NÑ]O|PORT[AÁ]TIL|VIAJE|INFANTIL|MU[NÑ]ECA)\b/i;
    // Acepta "200/190X90X135" y dims mm con * como separador: "2030*595*658"
    // Primer grupo hasta 4 dígitos para capturar mm en electros (2030mm=203cm)
    const DIM_REGEX_FIX7 = /\b(\d{2,4})(?:\/\d{2,4})?(?:,\d{1,2})?[xX×*](\d{1,4})(?:\/\d{1,4})?(?:,\d{1,2})?[xX×*](\d{2,4})(?:\/\d{2,4})?(?:,\d{1,2})?\b/;
    const fix7_examples: string[] = [];

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const pm = productMeta[i];

      if (e.m3_logistico === null) continue;

      const isElectroGrande = ELECTRO_GRANDE_REGEX.test(pm.desc);
      const isMuebleGrande = MUEBLE_GRANDE_REGEX.test(pm.desc);

      if (!isElectroGrande && !isMuebleGrande) continue;
      if (EXCLUDE_FIX7_REGEX.test(pm.desc)) continue;

      // Umbrales diferentes por tipo
      const threshold = isElectroGrande ? 0.05 : 0.01;
      if (e.m3_logistico >= threshold) continue;

      // NIVEL A: parsear dims de la descripción
      let volFromDims: number | null = null;
      let dimsSource = '';

      const match = pm.desc.match(DIM_REGEX_FIX7);
      if (match) {
        let d1 = parseFloat(match[1].replace(',', '.'));
        let d2 = parseFloat(match[2].replace(',', '.'));
        let d3 = parseFloat(match[3].replace(',', '.'));
        // Electros: dims en mm si alguna > 200 → dividir por 10 para obtener cm
        if (isElectroGrande && (d1 > 200 || d2 > 200 || d3 > 200)) {
          if (d1 > 200) d1 = Math.round(d1 / 10 * 10) / 10;
          if (d2 > 200) d2 = Math.round(d2 / 10 * 10) / 10;
          if (d3 > 200) d3 = Math.round(d3 / 10 * 10) / 10;
          dimsSource = `fix7_dims_desc_mm:${d1}x${d2}x${d3}`;
        } else {
          dimsSource = `fix7_dims_desc:${d1}x${d2}x${d3}`;
        }
        if (d1 >= 10 && d1 <= 400 && d2 >= 3 && d2 <= 300 && d3 >= 10 && d3 <= 400) {
          volFromDims = Math.round(d1 * d2 * d3 / 1000000 * 10000) / 10000;
        }
      }

      // NIVEL B: si no hay dims parseables, usar vol_producto del stage4
      if (volFromDims === null && pm.volProducto && pm.volProducto > 0.05) {
        volFromDims = pm.volProducto;
        dimsSource = `fix7_vol_producto_stage4:${pm.volProducto}`;
      }

      if (volFromDims === null) continue;

      // Ratio según tipo
      let ratio: number;
      let confFix7: number;

      if (isElectroGrande) {
        ratio = 1.0;
        confFix7 = 0.50;
      } else {
        const ratioData = (ratios.by_subfamilia_l2?.[pm.subfL2] as RatioGroup | undefined)
          || (ratios.by_subfamilia_l1?.[pm.subfL1] as RatioGroup | undefined)
          || (ratios.by_tipo?.[pm.tipo] as RatioGroup | undefined);
        ratio = ratioData?.median || 0.85;
        confFix7 = 0.45;
      }

      const nuevoVol = Math.round(volFromDims * ratio * 10000) / 10000;
      const volOriginal = e.m3_logistico;

      // Sanity: el nuevo volumen debe ser al menos 5x el original
      if (nuevoVol < volOriginal * 5) continue;

      // Ajustar contadores
      const oldKey = e.estimation_layer as keyof typeof layerCounts;
      if (layerCounts[oldKey] !== undefined && layerCounts[oldKey] > 0) {
        layerCounts[oldKey]--;
      }
      layerCounts.ratio_subfamilia++;
      layerConfidences.ratio_subfamilia.push(confFix7);

      e.m3_logistico = nuevoVol;
      e.estimation_layer = 'ratio_residual_fix7';
      e.confidence = confFix7;
      e.ratio_used = ratio;
      e.ratio_source = dimsSource;
      e.detail = `Fix7 ${isElectroGrande ? 'electro' : 'mueble'} grande tiny: vol_dims=${volFromDims} * ratio=${ratio} → ${nuevoVol} m³ (era ${volOriginal})`;

      postValidationStats.fix7_residual_large_tiny++;
      if (fix7_examples.length < 15) {
        fix7_examples.push(`${pm.cod}: ${volOriginal}→${nuevoVol}m³ [${dimsSource}] | ${pm.desc.substring(0, 55)}`);
      }
    }

    console.log(`[Stage8] Fix7 applied: ${postValidationStats.fix7_residual_large_tiny} large electros/furniture recovered`);
    if (fix7_examples.length > 0) {
      console.log('[Stage8] Fix7 examples:');
      fix7_examples.forEach(ex => console.log(`  ${ex}`));
    }

    // ---- Fix 8: Composiciones con ancho total en descripción ----
    // Composiciones cuyo vol < 0.5 m³ tienen "NNN CM" (NNN >= 80) en descripción = ancho total.
    // El pipeline capturó dims de UN módulo individual en vez de la composición completa.
    // Recalcular: vol = ancho × PROF_ESTANDAR × ALTO_ESTANDAR / 1e6 × ratio_subfamilia
    // Calibrado contra ERP reales 00300: prof=35cm, alto=200cm
    const COMPOSICION_FIX8_REGEX = /\bCOMPOSICI[OÓ]N\b/i;
    const PROF_COMPOSICION = 35;  // cm, calibrado contra ERP 00300 salon/recibidor
    const ALTO_COMPOSICION = 200; // cm, estándar composición de muebles
    const fix8_examples: string[] = [];

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const pm = productMeta[i];

      if (!COMPOSICION_FIX8_REGEX.test(pm.desc)) continue;
      if (e.m3_logistico === null || e.m3_logistico >= 0.5) continue;

      // Buscar primer "NNN CM" con NNN >= 80 (ancho total de la composición)
      let anchoTotal: number | null = null;
      const anchoRe = /\b(\d{2,3})\s*CM\b/gi;
      let mAncho: RegExpExecArray | null;
      while ((mAncho = anchoRe.exec(pm.desc)) !== null) {
        const val = parseInt(mAncho[1], 10);
        if (val >= 80) { anchoTotal = val; break; }
      }
      if (!anchoTotal) continue;

      // Vol composición usando ancho total + dimensiones estándar
      const volComposicion = Math.round(anchoTotal * PROF_COMPOSICION * ALTO_COMPOSICION / 1_000_000 * 10000) / 10000;

      // Ratio: L2 → L1 → tipo → fallback 0.66
      let fix8Ratio = 0.66;
      let fix8Source = 'fix8_fallback_mueble';
      const l2r8 = ratios.by_subfamilia_l2?.[pm.subfL2] as RatioGroup | undefined;
      if (l2r8 && l2r8.n >= 5) {
        fix8Ratio = l2r8.median;
        fix8Source = `fix8_composicion:subfL2:${pm.subfL2}`;
      } else {
        const l1r8 = ratios.by_subfamilia_l1?.[pm.subfL1] as RatioGroup | undefined;
        if (l1r8 && l1r8.n >= 5) {
          fix8Ratio = l1r8.median;
          fix8Source = `fix8_composicion:subfL1:${pm.subfL1}`;
        } else {
          const tr8 = ratios.by_tipo?.[pm.tipo] as RatioGroup | undefined;
          if (tr8 && tr8.n >= 5) {
            fix8Ratio = tr8.median;
            fix8Source = `fix8_composicion:tipo:${pm.tipo}`;
          }
        }
      }

      const nuevoVol = Math.round(volComposicion * fix8Ratio * 10000) / 10000;
      const volOriginal = e.m3_logistico;

      // Solo aplicar si mejora significativa (≥2x)
      if (nuevoVol < volOriginal * 2) continue;

      // Ajustar contadores
      const oldKey8 = e.estimation_layer as keyof typeof layerCounts;
      if (layerCounts[oldKey8] !== undefined && layerCounts[oldKey8] > 0) {
        layerCounts[oldKey8]--;
      }
      layerCounts.ratio_subfamilia++;
      layerConfidences.ratio_subfamilia.push(0.35);

      e.m3_logistico = nuevoVol;
      e.estimation_layer = 'ratio_composicion_ancho_fix8';
      e.confidence = 0.35;
      e.ratio_used = fix8Ratio;
      e.ratio_source = fix8Source;
      e.detail = `Fix8 composición ${anchoTotal}cm: ${anchoTotal}×${PROF_COMPOSICION}×${ALTO_COMPOSICION}cm=${volComposicion}m³ × ratio=${fix8Ratio} → ${nuevoVol}m³ (era ${volOriginal})`;

      postValidationStats.fix8_composicion_ancho++;
      if (fix8_examples.length < 15) {
        fix8_examples.push(`${pm.cod}: ${volOriginal}→${nuevoVol}m³ [ancho=${anchoTotal}cm,r=${fix8Ratio}] | ${pm.desc.substring(0, 55)}`);
      }
    }

    console.log(`[Stage8] Fix8 applied: ${postValidationStats.fix8_composicion_ancho} composiciones corrected via total width`);
    if (fix8_examples.length > 0) {
      console.log('[Stage8] Fix8 examples:');
      fix8_examples.forEach(ex => console.log(`  ${ex}`));
    }

    console.log(`[Stage8] Post-validation done: fix1=${postValidationStats.fix1_exterior_plegable}, fix2_nulled=${postValidationStats.fix2_electro_excessive_nulled}, fix2_cache=${postValidationStats.fix2_electro_excessive_from_cache}, fix3=${postValidationStats.fix3_mueble_tiny_corrected}, fix4=${postValidationStats.fix4_erp_placeholder_corrected}, fix5=${postValidationStats.fix5_dims_from_description}, fix7=${postValidationStats.fix7_residual_large_tiny}, fix8=${postValidationStats.fix8_composicion_ancho}`);

    // ==========================================
    // Summary
    // ==========================================
    const totalWithEstimate = entries.filter(e => e.m3_logistico !== null && e.m3_logistico > 0 && e.confidence > 0).length;
    const sinDatoCount = entries.length - totalWithEstimate;
    const m3Values = entries.filter(e => e.m3_logistico !== null && e.m3_logistico > 0 && e.confidence > 0).map(e => e.m3_logistico!);
    const totalM3 = m3Values.length > 0 ? Math.round(m3Values.reduce((s, v) => s + v, 0) * 100) / 100 : 0;

    const avgConf = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length * 100) / 100 : 0;

    const summary = {
      total_products: products.length + excluded.length,
      clean_products: products.length,
      excluded_products: excluded.length,
      con_estimacion: totalWithEstimate,
      sin_dato: sinDatoCount,
      coverage_pct: Math.round(totalWithEstimate / products.length * 1000) / 10,
      por_capa: {
        capa1_real: {
          count: layerCounts.erp_ground_truth,
          pct: Math.round(layerCounts.erp_ground_truth / products.length * 1000) / 10,
          avg_confidence: avgConf(layerConfidences.erp_ground_truth),
        },
        capa2_gemini: {
          count: layerCounts.gemini_embalaje,
          pct: Math.round(layerCounts.gemini_embalaje / products.length * 1000) / 10,
          avg_confidence: avgConf(layerConfidences.gemini_embalaje),
        },
        capa3_ratio_subfamilia: {
          count: layerCounts.ratio_subfamilia,
          pct: Math.round(layerCounts.ratio_subfamilia / products.length * 1000) / 10,
          avg_confidence: avgConf(layerConfidences.ratio_subfamilia),
        },
        capa3_ratio_tipo: {
          count: layerCounts.ratio_tipo,
          pct: Math.round(layerCounts.ratio_tipo / products.length * 1000) / 10,
          avg_confidence: avgConf(layerConfidences.ratio_tipo),
        },
        capa4_promedio_subfamilia: {
          count: layerCounts.promedio_subfamilia,
          pct: Math.round(layerCounts.promedio_subfamilia / products.length * 1000) / 10,
          avg_confidence: avgConf(layerConfidences.promedio_subfamilia),
        },
        capa4_promedio_tipo: {
          count: layerCounts.promedio_tipo,
          pct: Math.round(layerCounts.promedio_tipo / products.length * 1000) / 10,
          avg_confidence: avgConf(layerConfidences.promedio_tipo),
        },
        capa4_promedio_subfamilia_corregido: {
          count: layerCounts.promedio_subfamilia_corregido,
          pct: Math.round(layerCounts.promedio_subfamilia_corregido / products.length * 1000) / 10,
          avg_confidence: 0.15,
        },
        sin_dato: {
          count: layerCounts.none,
          pct: Math.round(layerCounts.none / products.length * 1000) / 10,
        },
      },
      vol_total_m3: totalM3,
      gemini_stats: geminiStats,
      post_validation: postValidationStats,
      phase: 1,
      active_layers: ['erp_ground_truth', 'gemini_embalaje', 'ratio_subfamilia', 'ratio_tipo', 'promedio_subfamilia', 'promedio_tipo', 'promedio_subfamilia_corregido'],
    };

    const output = { summary, products: entries };

    const jobDataDir = path.join(DATA_DIR, jobId);
    fs.writeFileSync(
      path.join(jobDataDir, 'stage8_logistics.json'),
      JSON.stringify(output, null, 2)
    );

    job.stages.stage8_logistics.status = 'success';
    job.stages.stage8_logistics.metrics = summary;
    job.status = 'completed';
    store.updateJob(jobId, job);

    console.log(`[Stage8] Complete: ${totalWithEstimate}/${products.length} products (${summary.coverage_pct}%), total ${totalM3} m³`);
  } catch (err: any) {
    job.stages.stage8_logistics.status = 'error';
    job.stages.stage8_logistics.error = err.message;
    job.status = 'error';
    store.updateJob(jobId, job);
    throw err;
  }
}
