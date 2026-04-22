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

type EstimationLayer = 'erp_ground_truth' | 'gemini_embalaje' | 'ratio_subfamilia' | 'ratio_tipo' | 'promedio_subfamilia' | 'promedio_tipo' | 'promedio_subfamilia_corregido' | 'ratio_subfamilia_corregido_fix4' | 'ratio_desde_descripcion_fix5' | 'ratio_residual_fix7' | 'ratio_composicion_ancho_fix8' | 'ratio_subfamilia_fix10_gemini_invalid' | 'ratio_subfamilia_fix11_too_big' | 'ratio_subfamilia_fix12_too_small' | 'rango_fisico_fix9' | 'erp_bogal_dm3_fix13' | 'vol_tipo_apple_fix19' | 'erp_placeholder_ampliado_fix18' | 'subfamilia_silla_fix17' | 'multiplicador_bultos_fix16' | 'dims_corregidas_fix15' | 'ratio_minimo_fisico_fix14' | 'dormitorio_completo_fix20' | 'composicion_supplier_fix21' | 'mesita_corregida_fix22' | 'electro_grande_infraestimado_fix23' | 'erp_electro_aberrante_fix24' | 'mueble_grande_promedio_fix25' | 'supplier_01415_cap_fix26' | 'composicion_generica_fix27' | 'dims_profundidad_mm_fix28' | 'none';

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
      fix9_rango_fisico: 0,
      fix10_gemini_invalid: 0,
      fix11_ratio_too_big: 0,
      fix12_ratio_too_small: 0,
      fix13_bogal_erp_invalidated: 0,
      fix19_apple_vol_assigned: 0,
      fix18_erp_placeholder_extended: 0,
      fix17_silla_subfamilia: 0,
      fix16_split_multibulto: 0,
      fix15_frigo_alto_corrected: 0,
      fix14_ratio_minimo: 0,
      fix20_dormitorio_completo: 0,
      fix21_composicion_supplier: 0,
      fix22_mesita_corregida: 0,
      fix23_electro_grande: 0,
      fix24_erp_electro_aberrante: 0,
      fix25_mueble_grande_promedio: 0,
      fix26_supplier_01415_cap: 0,
      fix27_composicion_generica: 0,
      fix28_dims_profundidad_mm: 0,
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

    // ==========================================
    // POST-VALIDATION FIXES 9-12 (order: Fix10 → Fix12 → Fix11 → Fix9)
    // ==========================================

    // Regex helpers shared by Fix10/11/12
    const EXCLUDE_FLAT_FIX = /\b(CUADRO|ESPEJO|LAMINA|LÁMINA|ALFOMBRA|FELPUDO|PLAID|MANTA|EDREDON|COLCHON ENROLLADO)\b/i;
    // Large electros: vol_producto from stage3 is typically underestimated → exclude from Fix11
    const LARGE_ELECTRO_FIX = /\b(FRIGO|FRIGORIFICO|NEVERA|COMBINADO|LAVADORA|SECADORA|LAVASECADORA)\b/i;

    // Helper: find best ratio for a product (L2 → L1 → tipo)
    const getBestRatio = (subfL2: string, subfL1: string, tipo: string): { r: number; src: string } | null => {
      const l2 = ratios.by_subfamilia_l2?.[subfL2] as RatioGroup | undefined;
      if (l2 && l2.n >= 5) return { r: l2.median, src: `subfL2:${subfL2}` };
      const l1 = ratios.by_subfamilia_l1?.[subfL1] as RatioGroup | undefined;
      if (l1 && l1.n >= 5) return { r: l1.median, src: `subfL1:${subfL1}` };
      const t = ratios.by_tipo?.[tipo] as RatioGroup | undefined;
      if (t && t.n >= 5) return { r: t.median, src: `tipo:${tipo}` };
      return null;
    };

    // ---- Fix 10: Gemini devolvió dims del producto, no del embalaje ----
    // ratio vol_logistico / vol_producto < 1.2 → Gemini package ≈ product → invalid
    const fix10_examples: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const pm = productMeta[i];
      if (e.estimation_layer !== 'gemini_embalaje') continue;
      if (e.m3_logistico === null || e.m3_logistico <= 0) continue;
      const vp = pm.volProducto;
      if (!vp || vp < 0.005 || vp > 2.0) continue;  // volProducto must be plausible
      const ratio = e.m3_logistico / vp;
      if (ratio >= 1.2) continue;

      const best = getBestRatio(pm.subfL2, pm.subfL1, pm.tipo);
      if (!best) continue;

      const nuevoVol = Math.round(vp * best.r * 10000) / 10000;
      const volOriginal = e.m3_logistico;

      layerCounts.gemini_embalaje = Math.max(0, layerCounts.gemini_embalaje - 1);
      layerCounts.ratio_subfamilia++;
      layerConfidences.ratio_subfamilia.push(0.40);

      e.m3_logistico = nuevoVol;
      e.estimation_layer = 'ratio_subfamilia_fix10_gemini_invalid';
      e.confidence = 0.40;
      e.ratio_used = best.r;
      e.ratio_source = `fix10:${best.src}`;
      e.detail = `Fix10 Gemini inválido ratio_pkg/prod=${ratio.toFixed(2)} (<1.2) → ${vp}×${best.r}=${nuevoVol}m³ (era ${volOriginal})`;

      postValidationStats.fix10_gemini_invalid++;
      if (fix10_examples.length < 12) fix10_examples.push(`${pm.cod}: ${volOriginal}→${nuevoVol}m³ [r=${ratio.toFixed(2)}] | ${pm.desc.substring(0, 55)}`);
    }
    console.log(`[Stage8] Fix10 applied: ${postValidationStats.fix10_gemini_invalid} Gemini-invalid products recalculated`);
    if (fix10_examples.length > 0) { console.log('[Stage8] Fix10 examples:'); fix10_examples.forEach(ex => console.log(`  ${ex}`)); }

    // ---- Fix 12: Ratio paquete/producto < 0.05 (embalaje imposiblemente pequeño) ----
    const fix12_examples: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const pm = productMeta[i];
      if (e.m3_logistico === null || e.m3_logistico <= 0) continue;
      const vp = pm.volProducto;
      if (!vp || vp < 0.005 || vp > 2.0) continue;
      if (EXCLUDE_FLAT_FIX.test(pm.desc)) continue;
      // Exclude ERP=0.01 (colchones enrollados verified compact)
      if (e.estimation_layer === 'erp_ground_truth' && Math.abs(e.m3_logistico - 0.01) < 0.001) continue;

      const ratio = e.m3_logistico / vp;
      if (ratio >= 0.05) continue;

      const best = getBestRatio(pm.subfL2, pm.subfL1, pm.tipo);
      if (!best) continue;

      const nuevoVol = Math.round(vp * best.r * 10000) / 10000;
      const volOriginal = e.m3_logistico;

      const oldKey12 = e.estimation_layer as keyof typeof layerCounts;
      if (layerCounts[oldKey12] !== undefined && (layerCounts[oldKey12] as number) > 0) (layerCounts[oldKey12] as number)--;
      layerCounts.ratio_subfamilia++;
      layerConfidences.ratio_subfamilia.push(0.40);

      e.m3_logistico = nuevoVol;
      e.estimation_layer = 'ratio_subfamilia_fix12_too_small';
      e.confidence = 0.40;
      e.ratio_used = best.r;
      e.ratio_source = `fix12:${best.src}`;
      e.detail = `Fix12 ratio_pkg/prod=${ratio.toFixed(3)} (<0.05) imposible → ${vp}×${best.r}=${nuevoVol}m³ (era ${volOriginal})`;

      postValidationStats.fix12_ratio_too_small++;
      if (fix12_examples.length < 12) fix12_examples.push(`${pm.cod}: ${volOriginal}→${nuevoVol}m³ [r=${ratio.toFixed(3)}] | ${pm.desc.substring(0, 55)}`);
    }
    console.log(`[Stage8] Fix12 applied: ${postValidationStats.fix12_ratio_too_small} impossibly-small packages recalculated`);
    if (fix12_examples.length > 0) { console.log('[Stage8] Fix12 examples:'); fix12_examples.forEach(ex => console.log(`  ${ex}`)); }

    // ---- Fix 11: Ratio paquete/producto > 12 (embalaje imposiblemente grande) ----
    // Only when vol_producto is reliable (>0.05 m³), not large electro, not ERP capa 1
    const fix11_examples: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const pm = productMeta[i];
      if (e.m3_logistico === null || e.m3_logistico <= 0) continue;
      const vp = pm.volProducto;
      if (!vp || vp < 0.05 || vp > 2.0) continue;  // only reliable vol_producto
      if (EXCLUDE_FLAT_FIX.test(pm.desc)) continue;
      if (LARGE_ELECTRO_FIX.test(pm.desc)) continue;  // stage3 underestimates these
      if (e.estimation_layer === 'erp_ground_truth') continue;

      const ratio = e.m3_logistico / vp;
      if (ratio <= 12) continue;

      // Cap conservatively at vol_producto × 5
      const cappedVol = Math.round(vp * 5 * 10000) / 10000;
      const volOriginal = e.m3_logistico;

      const oldKey11 = e.estimation_layer as keyof typeof layerCounts;
      if (layerCounts[oldKey11] !== undefined && (layerCounts[oldKey11] as number) > 0) (layerCounts[oldKey11] as number)--;
      layerCounts.ratio_subfamilia++;
      layerConfidences.ratio_subfamilia.push(0.35);

      e.m3_logistico = cappedVol;
      e.estimation_layer = 'ratio_subfamilia_fix11_too_big';
      e.confidence = 0.35;
      e.ratio_used = 5;
      e.ratio_source = `fix11_cap5x:vol_producto=${vp}`;
      e.detail = `Fix11 ratio_pkg/prod=${ratio.toFixed(1)}x (>12) imposible → capped at ${vp}×5=${cappedVol}m³ (era ${volOriginal})`;

      postValidationStats.fix11_ratio_too_big++;
      if (fix11_examples.length < 12) fix11_examples.push(`${pm.cod}: ${volOriginal}→${cappedVol}m³ [r=${ratio.toFixed(1)}x] | ${pm.desc.substring(0, 55)}`);
    }
    console.log(`[Stage8] Fix11 applied: ${postValidationStats.fix11_ratio_too_big} impossibly-large packages capped`);
    if (fix11_examples.length > 0) { console.log('[Stage8] Fix11 examples:'); fix11_examples.forEach(ex => console.log(`  ${ex}`)); }

    // ---- Fix 9: Cap productos fuera de rango físico esperado por categoría ----
    // Aplica solo a capas 2-4 (no ERP capa 1)
    const FIX9_CATEGORIES: Array<{ name: string; regex: RegExp; min: number; max: number }> = [
      { name: 'LAVADORA',     regex: /\b(LAVADORA|LAVASECADORA)\b/i,                             min: 0.25, max: 0.65 },
      { name: 'SECADORA',     regex: /\bSECADORA\b/i,                                            min: 0.25, max: 0.65 },
      { name: 'LAVAVAJILLAS', regex: /\bLAVAVAJILLAS\b/i,                                        min: 0.25, max: 0.55 },
      { name: 'MICROONDAS',   regex: /\bMICROONDAS\b/i,                                          min: 0.03, max: 0.18 },
      { name: 'CAMPANA',      regex: /\bCAMPANA\b/i,                                             min: 0.06, max: 0.45 },
      { name: 'TV',           regex: /\b(TELEVISOR|SMART TV|LED TV|QLED|OLED)\b/i,              min: 0.03, max: 1.50 },
      { name: 'HORNO_PLACA',  regex: /\bHORNO\b|VITROCERAMICA|PLACA INDUCCION|PLACA COCINA/i,   min: 0.03, max: 0.50 },
      { name: 'ASPIRADOR',    regex: /\bASPIRADOR\b/i,                                           min: 0.02, max: 0.25 },
      { name: 'PEQ_ELECTRO',  regex: /\b(CAFETERA|BATIDORA|TOSTADOR|PICADORA|FREIDORA|EXPRIMIDOR)\b/i, min: 0.001, max: 0.10 },
    ];
    // TVs >85" can exceed max — skip upper cap for these
    const FIX9_BIG_TV_REGEX = /\b(85|86|88|90|95|98|100|105|110)\s*["]/i;
    // Mesas de plancha son artículos de >0.10 m³ — no son PEQ_ELECTRO
    const FIX9_MESA_PLANCHA_REGEX = /MESA.*PLANCHA|CENTRO.*PLANCH|PLANCHA.*MESA/i;
    // FRIGO tiene su propio rango pero se maneja desde LAVAVAJILLAS/LAVADORA arriba;
    // FRIGO range lo añadimos explícitamente:
    FIX9_CATEGORIES.unshift({ name: 'FRIGO', regex: /\b(FRIGO|FRIGORIFICO|NEVERA|COMBINADO)\b/i, min: 0.35, max: 1.80 });

    const fix9_examples: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const pm = productMeta[i];
      if (e.m3_logistico === null || e.m3_logistico <= 0) continue;
      if (e.estimation_layer === 'erp_ground_truth') continue;  // trust ERP

      for (const cat of FIX9_CATEGORIES) {
        if (!cat.regex.test(pm.desc)) continue;

        // Specific exclusions
        if (cat.name === 'PEQ_ELECTRO' && FIX9_MESA_PLANCHA_REGEX.test(pm.desc)) break;
        if (cat.name === 'TV' && FIX9_BIG_TV_REGEX.test(pm.desc)) {
          // Only apply lower cap, not upper
          if (e.m3_logistico >= cat.min) break;
        }

        const volActual = e.m3_logistico;
        let clamped: number;
        if (volActual < cat.min) clamped = cat.min;
        else if (volActual > cat.max) clamped = cat.max;
        else break;  // within range, no action needed

        const oldKey9 = e.estimation_layer as keyof typeof layerCounts;
        if (layerCounts[oldKey9] !== undefined && (layerCounts[oldKey9] as number) > 0) (layerCounts[oldKey9] as number)--;
        layerCounts.ratio_subfamilia++;
        layerConfidences.ratio_subfamilia.push(0.30);

        e.m3_logistico = clamped;
        e.estimation_layer = 'rango_fisico_fix9';
        e.confidence = 0.30;
        e.ratio_source = `fix9_${cat.name}:rango=[${cat.min},${cat.max}]`;
        e.detail = `Fix9 rango físico ${cat.name}: ${volActual}→${clamped}m³ (límite ${volActual < cat.min ? 'min' : 'max'}=${volActual < cat.min ? cat.min : cat.max})`;

        postValidationStats.fix9_rango_fisico++;
        if (fix9_examples.length < 12) fix9_examples.push(`${pm.cod}: ${volActual}→${clamped}m³ [${cat.name}] | ${pm.desc.substring(0, 55)}`);
        break;
      }
    }
    console.log(`[Stage8] Fix9 applied: ${postValidationStats.fix9_rango_fisico} products capped to physical range`);
    if (fix9_examples.length > 0) { console.log('[Stage8] Fix9 examples:'); fix9_examples.forEach(ex => console.log(`  ${ex}`)); }

    // ---- Fix 13: ERP BOGAL (proveedor 00362) en dm³ — ratio ERP/vp fuera de rango ----
    const ENROLLABLE_REGEX_EXT = /\b(COLCHON|COLCHÓN|ALFOMBRA|FELPUDO|MANTA|EDREDON|EDREDÓN)\b/i;
    const fix13_examples: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const pm = productMeta[i];
      if (e.estimation_layer !== 'erp_ground_truth') continue;
      if (!pm.cod.startsWith('00362')) continue;
      if (e.m3_logistico === null || e.m3_logistico <= 0) continue;
      const vp = pm.volProducto;
      if (!vp || vp < 0.1) continue;
      const ratio = e.m3_logistico / vp;
      if (ratio >= 0.08 && ratio <= 10) continue;  // ERP plausible
      const best = getBestRatio(pm.subfL2, pm.subfL1, pm.tipo);
      if (!best) continue;
      const nuevoVol = Math.round(vp * best.r * 10000) / 10000;
      const volOriginal = e.m3_logistico;
      layerCounts.erp_ground_truth = Math.max(0, layerCounts.erp_ground_truth - 1);
      layerCounts.ratio_subfamilia++;
      e.m3_logistico = nuevoVol;
      e.estimation_layer = 'erp_bogal_dm3_fix13';
      e.confidence = 0.40;
      e.ratio_used = best.r;
      e.ratio_source = `fix13:${best.src}`;
      e.detail = `Fix13 BOGAL ERP ratio=${ratio.toFixed(3)} (fuera 0.08-10) → ${vp}×${best.r}=${nuevoVol}m³ (era ${volOriginal})`;
      postValidationStats.fix13_bogal_erp_invalidated++;
      if (fix13_examples.length < 12) fix13_examples.push(`${pm.cod}: ${volOriginal}→${nuevoVol}m³ [r=${ratio.toFixed(3)}] | ${pm.desc.substring(0, 55)}`);
    }
    console.log(`[Stage8] Fix13 applied: ${postValidationStats.fix13_bogal_erp_invalidated} BOGAL ERP invalidated`);
    if (fix13_examples.length > 0) { console.log('[Stage8] Fix13 examples:'); fix13_examples.forEach(ex => console.log(`  ${ex}`)); }

    // ---- Fix 19: Apple products (proveedor 01172) sin EAN — vol por tipo ----
    const FIX19_APPLE_LAYERS = new Set<EstimationLayer>(['promedio_subfamilia', 'ratio_subfamilia', 'promedio_tipo', 'ratio_tipo', 'promedio_subfamilia_corregido', 'rango_fisico_fix9']);
    const fix19_examples: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const pm = productMeta[i];
      if (!pm.cod.startsWith('01172')) continue;
      if (!FIX19_APPLE_LAYERS.has(e.estimation_layer as EstimationLayer)) continue;
      if (e.m3_logistico === null) continue;
      const desc = pm.desc.toUpperCase();
      let targetVol: number | null = null;
      let targetConf = 0.55;
      if (/\bIPAD\b|\bTABLET\b/.test(desc)) { targetVol = 0.003; }
      else if (/\bMACBOOK\b|\bPORTATIL\b|\bLAPTOP\b/.test(desc)) { targetVol = 0.012; }
      else if (/\bIMACB?\b|\bIMAC\b/.test(desc)) { targetVol = 0.035; targetConf = 0.50; }
      else if (/\bMAC MINI\b|\bMAC STUDIO\b/.test(desc)) { targetVol = 0.006; targetConf = 0.50; }
      else if (/\bIPHONE\b|\bMOVIL\b|\bMÓVIL\b/.test(desc)) { targetVol = 0.0008; }
      else if (/\bAPPLE WATCH\b|\bSMARTWATCH\b/.test(desc)) { targetVol = 0.0003; }
      else if (/\bAIRPODS\b|\bAURICULAR\b/.test(desc)) { targetVol = 0.0004; }
      if (targetVol === null) continue;
      const volOriginal = e.m3_logistico;
      e.m3_logistico = targetVol;
      e.estimation_layer = 'vol_tipo_apple_fix19';
      e.confidence = targetConf;
      e.ratio_used = null;
      e.ratio_source = 'fix19_apple_keyword';
      e.detail = `Fix19 Apple tipo=${desc.split(' ').slice(0,3).join(' ')}: ${volOriginal}→${targetVol}m³`;
      postValidationStats.fix19_apple_vol_assigned++;
      if (fix19_examples.length < 12) fix19_examples.push(`${pm.cod}: ${volOriginal}→${targetVol}m³ | ${pm.desc.substring(0, 55)}`);
    }
    console.log(`[Stage8] Fix19 applied: ${postValidationStats.fix19_apple_vol_assigned} Apple products corrected`);
    if (fix19_examples.length > 0) { console.log('[Stage8] Fix19 examples:'); fix19_examples.forEach(ex => console.log(`  ${ex}`)); }

    // ---- Fix 18: ERP placeholder 0.01 ampliado (vp > 0.05, antes vp > 0.3) ----
    const fix18_examples: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const pm = productMeta[i];
      if (pm.m3Erp !== 0.01) continue;
      if (e.estimation_layer !== 'erp_ground_truth') continue;  // Fix4 ya lo corrigió si vp > 0.3
      if (pm.tipo === 'accesorio') continue;
      const vp = pm.volProducto;
      if (!vp || vp <= 0.05) continue;
      if (ENROLLABLE_REGEX_EXT.test(pm.desc)) continue;
      const best = getBestRatio(pm.subfL2, pm.subfL1, pm.tipo);
      if (!best) continue;
      const nuevoVol = Math.round(vp * best.r * 10000) / 10000;
      const volOriginal = e.m3_logistico!;
      layerCounts.erp_ground_truth = Math.max(0, layerCounts.erp_ground_truth - 1);
      layerCounts.ratio_subfamilia++;
      e.m3_logistico = nuevoVol;
      e.estimation_layer = 'erp_placeholder_ampliado_fix18';
      e.confidence = 0.40;
      e.ratio_used = best.r;
      e.ratio_source = `fix18:${best.src}`;
      e.detail = `Fix18 ERP placeholder 0.01 (vp=${vp}) → ${vp}×${best.r}=${nuevoVol}m³`;
      postValidationStats.fix18_erp_placeholder_extended++;
      if (fix18_examples.length < 12) fix18_examples.push(`${pm.cod}: ${volOriginal}→${nuevoVol}m³ | ${pm.desc.substring(0, 55)}`);
    }
    console.log(`[Stage8] Fix18 applied: ${postValidationStats.fix18_erp_placeholder_extended} ERP placeholder 0.01 extended`);
    if (fix18_examples.length > 0) { console.log('[Stage8] Fix18 examples:'); fix18_examples.forEach(ex => console.log(`  ${ex}`)); }

    // ---- Fix 17: Subfamilia 00001.00057 sillas vs sofás ----
    const FIX17_SILLA_REGEX = /\b(SILLA|TABURETE|BUTACA|SILLON|SILLÓN)\b/i;
    const fix17_examples: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const pm = productMeta[i];
      if (pm.subfL2 !== '00001.00057') continue;
      if (e.estimation_layer !== 'promedio_subfamilia' && e.estimation_layer !== 'promedio_subfamilia_corregido') continue;
      if (e.m3_logistico === null || e.m3_logistico < 0.50) continue;  // only correct inflated values
      const anchoCm: number | null = (products[i] as any).measures?.ancho_cm ?? null;
      const isSilla = (anchoCm !== null && anchoCm < 90) ||
                      (anchoCm === null && FIX17_SILLA_REGEX.test(pm.desc));
      if (!isSilla) continue;
      const volOriginal = e.m3_logistico;
      e.m3_logistico = 0.20;
      e.estimation_layer = 'subfamilia_silla_fix17';
      e.confidence = 0.40;
      e.ratio_used = null;
      e.ratio_source = `fix17:subfL2=00001.00057,ancho=${anchoCm}cm`;
      e.detail = `Fix17 silla subfamilia 00001.00057: ${volOriginal}→0.20m³ (ancho=${anchoCm}cm)`;
      postValidationStats.fix17_silla_subfamilia++;
      if (fix17_examples.length < 12) fix17_examples.push(`${pm.cod}: ${volOriginal}→0.20m³ [a=${anchoCm}] | ${pm.desc.substring(0, 55)}`);
    }
    console.log(`[Stage8] Fix17 applied: ${postValidationStats.fix17_silla_subfamilia} sillas subfamilia 00001.00057 corrected`);
    if (fix17_examples.length > 0) { console.log('[Stage8] Fix17 examples:'); fix17_examples.forEach(ex => console.log(`  ${ex}`)); }

    // ---- Fix 16: Split AC multi-bulto — multiplicador por unidad exterior ----
    const FIX16_SPLIT_REGEX = /\bSPLIT\b/i;
    const fix16_examples: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const pm = productMeta[i];
      if (!FIX16_SPLIT_REGEX.test(pm.desc)) continue;
      if (pm.bultos < 2) continue;
      if (e.estimation_layer === 'erp_ground_truth') continue;  // confiar en ERP
      if (e.m3_logistico === null || e.m3_logistico <= 0) continue;
      const factor = pm.bultos >= 3 ? 2.5 : 1.8;
      const volOriginal = e.m3_logistico;
      const nuevoVol = Math.round(volOriginal * factor * 10000) / 10000;
      e.m3_logistico = nuevoVol;
      e.estimation_layer = 'multiplicador_bultos_fix16';
      e.confidence = 0.45;
      e.ratio_source = `fix16:split_${pm.bultos}bultos_x${factor}`;
      e.detail = `Fix16 SPLIT ${pm.bultos} bultos: ${volOriginal}×${factor}=${nuevoVol}m³`;
      postValidationStats.fix16_split_multibulto++;
      if (fix16_examples.length < 12) fix16_examples.push(`${pm.cod}: ${volOriginal}→${nuevoVol}m³ [${pm.bultos}b×${factor}] | ${pm.desc.substring(0, 55)}`);
    }
    console.log(`[Stage8] Fix16 applied: ${postValidationStats.fix16_split_multibulto} Split AC multi-bulto corrected`);
    if (fix16_examples.length > 0) { console.log('[Stage8] Fix16 examples:'); fix16_examples.forEach(ex => console.log(`  ${ex}`)); }

    // ---- Fix 15: FRIGO/LAVA alto parseado como 20.3cm en lugar de 203cm ----
    const FIX15_FRIGO_REGEX = /\b(FRIGO|FRIGORIFICO|FRIGORÍFICO|NEVERA|COMBINADO|LAVADORA|SECADORA|LAVAVAJILLAS)\b/i;
    const fix15_examples: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const pm = productMeta[i];
      if (e.estimation_layer === 'erp_ground_truth') continue;  // ERP fiable
      if (!FIX15_FRIGO_REGEX.test(pm.desc)) continue;
      const altoCm: number | null = (products[i] as any).measures?.alto_cm ?? null;
      if (altoCm === null || altoCm >= 50) continue;
      const altoCorrected = altoCm * 10;
      if (altoCorrected < 130 || altoCorrected > 230) continue;
      // Recalculate volProducto with corrected alto
      const anchoCm: number | null = (products[i] as any).measures?.ancho_cm ?? null;
      const profCm: number | null = (products[i] as any).measures?.profundidad_cm ?? null;
      if (!anchoCm || !profCm) continue;
      if (anchoCm < 30 || profCm < 30) continue;  // otras dims también parecen estar en dm → skip
      const vpCorregido = Math.round(anchoCm * altoCorrected * profCm / 1000000 * 10000) / 10000;
      const best = getBestRatio(pm.subfL2, pm.subfL1, pm.tipo);
      if (!best) continue;
      const nuevoVol = Math.round(vpCorregido * best.r * 10000) / 10000;
      const volOriginal = e.m3_logistico!;
      e.m3_logistico = nuevoVol;
      e.estimation_layer = 'dims_corregidas_fix15';
      e.confidence = 0.45;
      e.ratio_used = best.r;
      e.ratio_source = `fix15:alto${altoCm}→${altoCorrected}cm,vp=${vpCorregido}`;
      e.detail = `Fix15 alto parseado ${altoCm}→${altoCorrected}cm: vp=${vpCorregido}m³ × ${best.r} = ${nuevoVol}m³ (era ${volOriginal})`;
      postValidationStats.fix15_frigo_alto_corrected++;
      if (fix15_examples.length < 12) fix15_examples.push(`${pm.cod}: ${volOriginal}→${nuevoVol}m³ [alt=${altoCm}→${altoCorrected}] | ${pm.desc.substring(0, 55)}`);
    }
    console.log(`[Stage8] Fix15 applied: ${postValidationStats.fix15_frigo_alto_corrected} FRIGO/LAVA alto corrected`);
    if (fix15_examples.length > 0) { console.log('[Stage8] Fix15 examples:'); fix15_examples.forEach(ex => console.log(`  ${ex}`)); }

    // ---- Fix 14: Ratio mínimo físico 1.15 — embalaje siempre > producto (ÚLTIMO) ----
    const fix14_examples: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const pm = productMeta[i];
      if (e.estimation_layer === 'erp_ground_truth' || e.estimation_layer === 'gemini_embalaje' || e.estimation_layer === 'rango_fisico_fix9') continue;
      if (pm.tipo !== 'electrodomestico') continue;  // solo electros: muebles desmontables tienen ratio<1 legítimo
      const vp = pm.volProducto;
      if (!vp || vp < 0.01) continue;
      if (EXCLUDE_FLAT_FIX.test(pm.desc)) continue;
      if (e.m3_logistico === null || e.m3_logistico <= 0) continue;
      const minVol = Math.round(vp * 1.15 * 10000) / 10000;
      if (e.m3_logistico >= vp) continue;  // solo cuando embalaje < producto (imposible físicamente)
      const volOriginal = e.m3_logistico;
      e.m3_logistico = minVol;
      e.estimation_layer = 'ratio_minimo_fisico_fix14';
      e.confidence = 0.35;
      e.ratio_used = 1.15;
      e.ratio_source = 'fix14:min_ratio_1.15';
      e.detail = `Fix14 VOL<vp×1.15: ${volOriginal}→${minVol}m³ (vp=${vp})`;
      postValidationStats.fix14_ratio_minimo++;
      if (fix14_examples.length < 12) fix14_examples.push(`${pm.cod}: ${volOriginal}→${minVol}m³ [vp=${vp}] | ${pm.desc.substring(0, 55)}`);
    }
    console.log(`[Stage8] Fix14 applied: ${postValidationStats.fix14_ratio_minimo} products ratio mínimo 1.15`);
    if (fix14_examples.length > 0) { console.log('[Stage8] Fix14 examples:'); fix14_examples.forEach(ex => console.log(`  ${ex}`)); }

    // ---- Fix 20: Dormitorios completos infraestimados ----
    // "DORMITORIO COMPLETO" con vol < 2.5 m³ desde capas promedio → mínimo 3.5 m³ (1.5 si SIN ARMARIO)
    const FIX20_DORM_REGEX = /\b(DORMITORIO COMPLETO|DORMITORIO JUVENIL COMPLETO|JUEGO DORMITORIO|COMPOSICION DORMITORIO COMPLETA)\b/i;
    const FIX20_SIN_ARMARIO_REGEX = /\bSIN ARMARIO\b/i;
    const FIX20_SKIP_LAYERS = new Set<EstimationLayer>(['erp_ground_truth', 'gemini_embalaje']);
    const fix20_examples: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const pm = productMeta[i];
      if (FIX20_SKIP_LAYERS.has(e.estimation_layer as EstimationLayer)) continue;
      if (!FIX20_DORM_REGEX.test(pm.desc)) continue;
      if (e.m3_logistico === null || e.m3_logistico >= 2.5) continue;
      const sinArmario = FIX20_SIN_ARMARIO_REGEX.test(pm.desc);
      const targetVol = sinArmario ? 1.5 : 3.5;
      const volOriginal = e.m3_logistico;
      e.m3_logistico = targetVol;
      e.estimation_layer = 'dormitorio_completo_fix20';
      e.confidence = 0.30;
      e.ratio_used = null;
      e.ratio_source = `fix20:dormitorio_completo${sinArmario ? '_sin_armario' : ''}`;
      e.detail = `Fix20 dormitorio completo: ${volOriginal}→${targetVol}m³${sinArmario ? ' (sin armario)' : ''}`;
      postValidationStats.fix20_dormitorio_completo++;
      if (fix20_examples.length < 12) fix20_examples.push(`${pm.cod}: ${volOriginal}→${targetVol}m³ | ${pm.desc.substring(0, 60)}`);
    }
    console.log(`[Stage8] Fix20 applied: ${postValidationStats.fix20_dormitorio_completo} dormitorios completos corregidos`);
    if (fix20_examples.length > 0) { console.log('[Stage8] Fix20 examples:'); fix20_examples.forEach(ex => console.log(`  ${ex}`)); }

    // ---- Fix 21: Composiciones de proveedor conocido con vol < 0.5 m³ ----
    // Proveedores de salón/dormitorio cuyo ratio está subestimado para composiciones
    const FIX21_SUPPLIERS = new Set(['00362', '00300', '04376', '00010']);
    const FIX21_COMP_REGEX = /\bCOMPOSICIO[NÓ]N?\b/i;
    const FIX21_JORDAN_EVO_REGEX = /\bJORDAN EVO\b/i;
    const FIX21_SKIP_LAYERS = new Set<EstimationLayer>([
      'erp_ground_truth', 'gemini_embalaje',
      'ratio_composicion_ancho_fix8', 'ratio_residual_fix7', 'dormitorio_completo_fix20',
    ]);
    const fix21_examples: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const pm = productMeta[i];
      if (FIX21_SKIP_LAYERS.has(e.estimation_layer as EstimationLayer)) continue;
      // Supplier check
      const suppKey = pm.cod.substring(0, 5);
      if (!FIX21_SUPPLIERS.has(suppKey)) continue;
      if (!FIX21_COMP_REGEX.test(pm.desc)) continue;
      if (e.m3_logistico === null || e.m3_logistico >= 0.5) continue;
      // Jordan EVO composiciones: típicamente dormitorio con cabezal+cama+mesitas → 2.0 m³
      const isJordanEvo = FIX21_JORDAN_EVO_REGEX.test(pm.desc);
      const targetVol = isJordanEvo ? 2.0 : 1.5;
      const volOriginal = e.m3_logistico;
      e.m3_logistico = targetVol;
      e.estimation_layer = 'composicion_supplier_fix21';
      e.confidence = 0.30;
      e.ratio_used = null;
      e.ratio_source = `fix21:supplier_${suppKey}${isJordanEvo ? '_jordan_evo' : ''}`;
      e.detail = `Fix21 composicion supplier ${suppKey}${isJordanEvo ? ' JORDAN EVO' : ''}: ${volOriginal}→${targetVol}m³`;
      postValidationStats.fix21_composicion_supplier++;
      if (fix21_examples.length < 12) fix21_examples.push(`${pm.cod}: ${volOriginal}→${targetVol}m³ | ${pm.desc.substring(0, 60)}`);
    }
    console.log(`[Stage8] Fix21 applied: ${postValidationStats.fix21_composicion_supplier} composiciones supplier corregidas`);
    if (fix21_examples.length > 0) { console.log('[Stage8] Fix21 examples:'); fix21_examples.forEach(ex => console.log(`  ${ex}`)); }

    // ---- Fix 22: Mesitas con vol placeholder alto desde promedio subfamilia ----
    // MESITA/MESILLA con vol >= 0.50 m³ desde capa promedio → imposible físicamente,
    // suele ser el promedio de la subfamilia dominado por camas/armarios.
    // Aplica cuando el mismo vol aparece >= 5 veces en el mismo proveedor (placeholder claro).
    const FIX22_MESITA_REGEX = /\b(MESITA|MESILLA)\b/i;
    const FIX22_PROMEDIO_LAYERS = new Set<EstimationLayer>([
      'promedio_subfamilia', 'promedio_subfamilia_corregido', 'promedio_tipo',
    ]);
    // Build per-supplier vol-frequency map for mesitas
    const mesitaSupplierVol: Record<string, Record<string, number>> = {};
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const pm = productMeta[i];
      if (!FIX22_MESITA_REGEX.test(pm.desc)) continue;
      if (!FIX22_PROMEDIO_LAYERS.has(e.estimation_layer as EstimationLayer)) continue;
      if (e.m3_logistico === null || e.m3_logistico < 0.50) continue;
      const suppKey = pm.cod.substring(0, 5);
      const volKey = String(e.m3_logistico);
      if (!mesitaSupplierVol[suppKey]) mesitaSupplierVol[suppKey] = {};
      mesitaSupplierVol[suppKey][volKey] = (mesitaSupplierVol[suppKey][volKey] || 0) + 1;
    }
    // Find placeholder vols: same vol >= 5 times per supplier
    const fix22PlaceholderVols: Set<string> = new Set();  // "suppKey:volKey"
    for (const [suppKey, volMap] of Object.entries(mesitaSupplierVol)) {
      for (const [volKey, count] of Object.entries(volMap)) {
        if (count >= 5) fix22PlaceholderVols.add(`${suppKey}:${volKey}`);
      }
    }
    const fix22_examples: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const pm = productMeta[i];
      if (!FIX22_MESITA_REGEX.test(pm.desc)) continue;
      if (!FIX22_PROMEDIO_LAYERS.has(e.estimation_layer as EstimationLayer)) continue;
      if (e.m3_logistico === null || e.m3_logistico < 0.50) continue;
      const suppKey = pm.cod.substring(0, 5);
      const volKey = String(e.m3_logistico);
      if (!fix22PlaceholderVols.has(`${suppKey}:${volKey}`)) continue;
      // Target vol: use vol_producto × 1.2 if available and reasonable, else 0.10 m³
      const vp = pm.volProducto;
      const nuevoVol = (vp && vp > 0.01 && vp < 0.20) ? Math.round(vp * 1.2 * 10000) / 10000 : 0.10;
      const volOriginal = e.m3_logistico;
      e.m3_logistico = nuevoVol;
      e.estimation_layer = 'mesita_corregida_fix22';
      e.confidence = 0.35;
      e.ratio_used = null;
      e.ratio_source = `fix22:mesita_placeholder_${suppKey}_vol${volKey}`;
      e.detail = `Fix22 mesita placeholder ${volKey}m³ (supp ${suppKey}): →${nuevoVol}m³ (vp=${vp})`;
      postValidationStats.fix22_mesita_corregida++;
      if (fix22_examples.length < 12) fix22_examples.push(`${pm.cod}: ${volOriginal}→${nuevoVol}m³ [vp=${vp}] | ${pm.desc.substring(0, 55)}`);
    }
    console.log(`[Stage8] Fix22 applied: ${postValidationStats.fix22_mesita_corregida} mesitas placeholder corregidas`);
    if (fix22_examples.length > 0) { console.log('[Stage8] Fix22 examples:'); fix22_examples.forEach(ex => console.log(`  ${ex}`)); }

    // ---- Fix 23: Electrodomésticos grandes (170+ cm) con vol infraestimado ----
    // FRIGO/NEVERA/COMBINADO con altura ≥ 170 cm en descripción y vol < 0.60 m³.
    // Los frigos 200cm necesitan ~0.80-1.00 m³; Fix9 los capó a min=0.35 pero es insuficiente.
    // También cubre ERP corrupto (vol=0.028 imposible para fridge 173cm).
    const FIX23_ELECTRO_REGEX = /\b(FRIGORIFICO|FRIGORÍFICO|NEVERA|COMBINADO|AMERICANO)\b/i;
    const FIX23_HEIGHT_REGEX = /(?<!\d)(1[5-9]\d|2[0-3]\d)(?!\d)/;
    const fix23_examples: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const pm = productMeta[i];
      if (!FIX23_ELECTRO_REGEX.test(pm.desc)) continue;
      if (e.m3_logistico === null) continue;
      // Skip ERP unless clearly impossible (< 0.10 m³ for 170+ cm appliance)
      if (e.estimation_layer === 'erp_ground_truth' && e.m3_logistico >= 0.10) continue;
      if (e.m3_logistico >= 0.60) continue;
      // Extract height from description
      const heightMatch = pm.desc.match(FIX23_HEIGHT_REGEX);
      if (!heightMatch) continue;
      const heightCm = parseInt(heightMatch[1]);
      if (heightCm < 150) continue;
      // Get product measures for dimension-based calculation
      const anchoCm: number | null = (products[i] as any).measures?.ancho_cm ?? null;
      const profCm: number | null = (products[i] as any).measures?.profundidad_cm ?? null;
      let nuevoVol: number;
      if (anchoCm && anchoCm > 50 && profCm && profCm > 50) {
        // Both measures look like a real fridge (not tiny/wrong): compute from corrected dims
        const vpCorr = Math.round(anchoCm * heightCm * profCm / 1000000 * 10000) / 10000;
        nuevoVol = Math.round(vpCorr * 1.15 * 10000) / 10000;
      } else {
        // Default by height tier: 200+cm → 0.85, 180-199cm → 0.75, 150-179cm → 0.65
        nuevoVol = heightCm >= 200 ? 0.85 : heightCm >= 180 ? 0.75 : 0.65;
      }
      nuevoVol = Math.max(0.60, Math.min(1.20, nuevoVol));
      const volOriginal = e.m3_logistico;
      // Update layer counters
      const oldLayer = e.estimation_layer;
      const oldKey = oldLayer as keyof typeof layerCounts;
      if (layerCounts[oldKey] !== undefined && layerCounts[oldKey] > 0) layerCounts[oldKey]--;
      layerCounts.ratio_subfamilia = (layerCounts.ratio_subfamilia || 0) + 1;
      e.m3_logistico = nuevoVol;
      e.estimation_layer = 'electro_grande_infraestimado_fix23';
      e.confidence = 0.40;
      e.ratio_used = null;
      e.ratio_source = `fix23:frigo_h${heightCm}cm_a${anchoCm}cm_p${profCm}cm`;
      e.detail = `Fix23 electro grande h=${heightCm}cm: ${volOriginal}→${nuevoVol}m³`;
      postValidationStats.fix23_electro_grande++;
      if (fix23_examples.length < 12) fix23_examples.push(`${pm.cod}: ${volOriginal}→${nuevoVol}m³ [h=${heightCm}cm] | ${pm.desc.substring(0, 60)}`);
    }
    console.log(`[Stage8] Fix23 applied: ${postValidationStats.fix23_electro_grande} electros grandes infraestimados corregidos`);
    if (fix23_examples.length > 0) { console.log('[Stage8] Fix23 examples:'); fix23_examples.forEach(ex => console.log(`  ${ex}`)); }

    // ---- Fix 24: ERP electro aberrante (vol claramente fuera del rango físico) ----
    // ERP values that are clearly impossible for the product category (>2× max or <0.4× min)
    // Only for erp_ground_truth + electrodomestico; uses Fix9 tier ranges as reference
    const FIX24_CATEGORIES: Array<{ name: string; regex: RegExp; min: number; max: number }> = [
      { name: 'FRIGO',        regex: /\b(FRIGORIFICO|FRIGORÍFICO|NEVERA|COMBINADO|AMERICANO)\b/i, min: 0.35, max: 1.80 },
      { name: 'LAVADORA',     regex: /\b(LAVADORA|LAVASECADORA)\b/i,                               min: 0.25, max: 0.65 },
      { name: 'LAVAVAJILLAS', regex: /\bLAVAVAJILLAS\b/i,                                          min: 0.25, max: 0.55 },
      { name: 'HORNO_PLACA',  regex: /\bHORNO\b|VITROCERAMICA|PLACA INDUCCION|PLACA COCINA/i,      min: 0.03, max: 0.50 },
      { name: 'MICROONDAS',   regex: /\bMICROONDAS\b/i,                                            min: 0.03, max: 0.18 },
    ];
    const fix24_examples: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const pm = productMeta[i];
      if (e.estimation_layer !== 'erp_ground_truth') continue;
      if (pm.tipo !== 'electrodomestico') continue;
      if (e.m3_logistico === null || e.m3_logistico <= 0) continue;

      for (const cat of FIX24_CATEGORIES) {
        if (!cat.regex.test(pm.desc)) continue;
        const vol = e.m3_logistico;
        const isTooBig = vol > cat.max * 1.5;
        const isTooSmall = vol < cat.min * 0.5;
        if (!isTooBig && !isTooSmall) break;

        // Determine correction: tier-based for FRIGO, midpoint for others
        let nuevoVol: number;
        if (cat.name === 'FRIGO') {
          const heightMatch = pm.desc.match(/(?<!\d)(1[5-9]\d|2[0-3]\d)(?!\d)/);
          const heightCm = heightMatch ? parseInt(heightMatch[1]) : 0;
          nuevoVol = heightCm >= 200 ? 0.85 : heightCm >= 180 ? 0.75 : 0.65;
          nuevoVol = Math.max(cat.min, Math.min(cat.max, nuevoVol));
        } else {
          nuevoVol = Math.round((cat.min + cat.max) / 2 * 10000) / 10000;
        }

        const volOriginal = e.m3_logistico;
        if (layerCounts.erp_ground_truth > 0) layerCounts.erp_ground_truth--;
        layerCounts.ratio_subfamilia++;
        layerConfidences.ratio_subfamilia.push(0.40);

        e.m3_logistico = nuevoVol;
        e.estimation_layer = 'erp_electro_aberrante_fix24';
        e.confidence = 0.40;
        e.ratio_used = null;
        e.ratio_source = `fix24_${cat.name}:erp=${volOriginal}_rango=[${cat.min},${cat.max}]`;
        e.detail = `Fix24 ERP aberrante ${cat.name}: ${volOriginal}→${nuevoVol}m³ (rango [${cat.min},${cat.max}])`;

        postValidationStats.fix24_erp_electro_aberrante++;
        if (fix24_examples.length < 12) fix24_examples.push(`${pm.cod}: ${volOriginal}→${nuevoVol}m³ [${cat.name}] | ${pm.desc.substring(0, 60)}`);
        break;
      }
    }
    console.log(`[Stage8] Fix24 applied: ${postValidationStats.fix24_erp_electro_aberrante} ERP electros aberrantes corregidos`);
    if (fix24_examples.length > 0) { console.log('[Stage8] Fix24 examples:'); fix24_examples.forEach(ex => console.log(`  ${ex}`)); }

    // ---- Fix 28: Profundidad parseada en mm en lugar de cm ----
    // When profundidad_cm < 5 from stage4 but desc has NxNxN with plausible depth ≥ 10cm
    // Excludes flat products and products already corrected by Fix5/7/8
    const FIX28_PLANOS_REGEX = /\b(CUADRO|ESPEJO|ALFOMBRA|PLAID|MANTA|LAMINA|LÁMINA|PANEL|CABECERO|TAPIZ)\b/i;
    const FIX28_SKIP_LAYERS = new Set<EstimationLayer>([
      'ratio_desde_descripcion_fix5', 'ratio_residual_fix7', 'ratio_composicion_ancho_fix8',
      'erp_ground_truth', 'gemini_embalaje',
    ]);
    const FIX28_DIM_REGEX = /\b(\d{2,3})[xX×](\d{2,3})[xX×](\d{2,3})\b/;
    const fix28_examples: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const pm = productMeta[i];
      if (e.m3_logistico === null || e.m3_logistico <= 0) continue;
      if (FIX28_SKIP_LAYERS.has(e.estimation_layer)) continue;
      if (FIX28_PLANOS_REGEX.test(pm.desc)) continue;

      // Check profundidad_cm < 5 from stage4 measures
      const profCm28: number | null = (products[i] as any).measures?.profundidad_cm ?? null;
      if (!profCm28 || profCm28 >= 5) continue;

      // Extract NxNxN from desc
      const dimMatch28 = pm.desc.match(FIX28_DIM_REGEX);
      if (!dimMatch28) continue;
      const sorted28 = [parseInt(dimMatch28[1]), parseInt(dimMatch28[2]), parseInt(dimMatch28[3])].sort((a, b) => a - b);
      const [profNew28, anchoNew28, altoNew28] = sorted28;
      if (profNew28 < 10) continue;
      if (anchoNew28 < 20 || altoNew28 < 30) continue;

      const vpCorr28 = Math.round(anchoNew28 * altoNew28 * profNew28 / 1000000 * 10000) / 10000;
      const best28 = getBestRatio(pm.subfL2, pm.subfL1, pm.tipo);
      if (!best28) continue;
      const nuevoVol28 = Math.round(vpCorr28 * best28.r * 10000) / 10000;
      if (nuevoVol28 <= 0.01) continue;
      // Must represent a meaningful improvement (either up or down by 2×) vs current
      const ratio28 = nuevoVol28 / e.m3_logistico;
      if (ratio28 > 0.5 && ratio28 < 2) continue;

      const volOriginal28 = e.m3_logistico;
      const oldLayer28 = e.estimation_layer as keyof typeof layerCounts;
      if (layerCounts[oldLayer28] !== undefined && (layerCounts[oldLayer28] as number) > 0) (layerCounts[oldLayer28] as number)--;
      layerCounts.ratio_subfamilia++;
      layerConfidences.ratio_subfamilia.push(0.45);

      e.m3_logistico = nuevoVol28;
      e.estimation_layer = 'dims_profundidad_mm_fix28';
      e.confidence = 0.45;
      e.ratio_used = best28.r;
      e.ratio_source = `fix28_prof_mm:${anchoNew28}x${altoNew28}x${profNew28}cm_r=${best28.r}`;
      e.detail = `Fix28 prof_mm→cm: prof=${profCm28}cm→${profNew28}cm, dims=${anchoNew28}x${altoNew28}x${profNew28}, vp=${vpCorr28}×${best28.r}=${nuevoVol28}m³ (era ${volOriginal28})`;

      postValidationStats.fix28_dims_profundidad_mm++;
      if (fix28_examples.length < 12) fix28_examples.push(`${pm.cod}: ${volOriginal28}→${nuevoVol28}m³ [prof ${profCm28}→${profNew28}cm] | ${pm.desc.substring(0, 55)}`);
    }
    console.log(`[Stage8] Fix28 applied: ${postValidationStats.fix28_dims_profundidad_mm} profundidades mm→cm corregidas`);
    if (fix28_examples.length > 0) { console.log('[Stage8] Fix28 examples:'); fix28_examples.forEach(ex => console.log(`  ${ex}`)); }

    // ---- Fix 25: Muebles grandes con promedio subfamilia contaminado + NxNxN extractible ----
    // Targets large furniture in promedio layers with a parseable NxNxN in description
    // giving a much larger volume (≥3× current), within mueble physical range [0.3, 5.0 m³]
    const FIX25_MUEBLE_REGEX = /\b(ARMARIO|APARADOR|LIBRERIA|LIBRERÍA|VITRINA|CAMA|CANAPE|CANAPÉ|SOFA|SOFÁ|SALON|SALÓN|SINFONIER|DORMITORIO|CONJUNTO)\b/i;
    const FIX25_PROMEDIO_LAYERS = new Set<EstimationLayer>([
      'promedio_subfamilia', 'promedio_tipo', 'promedio_subfamilia_corregido',
    ]);
    const FIX25_DIM_REGEX = /\b(\d{2,3})[xX×](\d{2,3})[xX×](\d{2,3})\b/;
    const fix25_examples: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const pm = productMeta[i];
      if (!FIX25_PROMEDIO_LAYERS.has(e.estimation_layer)) continue;
      if (!FIX25_MUEBLE_REGEX.test(pm.desc)) continue;
      if (pm.tipo !== 'mueble') continue;
      if (e.m3_logistico === null || e.m3_logistico <= 0) continue;

      const dimMatch25 = pm.desc.match(FIX25_DIM_REGEX);
      if (!dimMatch25) continue;
      const sorted25 = [parseInt(dimMatch25[1]), parseInt(dimMatch25[2]), parseInt(dimMatch25[3])].sort((a, b) => a - b);
      const [profNew25, anchoNew25, altoNew25] = sorted25;

      // Strict dimension minimums — must look like real furniture
      if (anchoNew25 < 50 || altoNew25 < 60 || profNew25 < 30) continue;

      const vpNew25 = Math.round(anchoNew25 * altoNew25 * profNew25 / 1000000 * 10000) / 10000;
      const best25 = getBestRatio(pm.subfL2, pm.subfL1, pm.tipo);
      const ratio25 = best25 ? best25.r : 0.85;
      const nuevoVol25 = Math.round(vpNew25 * ratio25 * 10000) / 10000;

      // Safety checks: range [0.3, 5.0] AND must be ≥2× improvement
      if (nuevoVol25 < 0.3 || nuevoVol25 > 5.0) continue;
      if (nuevoVol25 < e.m3_logistico * 2) continue;

      const volOriginal25 = e.m3_logistico;
      const oldLayer25 = e.estimation_layer as keyof typeof layerCounts;
      if (layerCounts[oldLayer25] !== undefined && (layerCounts[oldLayer25] as number) > 0) (layerCounts[oldLayer25] as number)--;
      layerCounts.ratio_subfamilia++;
      layerConfidences.ratio_subfamilia.push(0.35);

      e.m3_logistico = nuevoVol25;
      e.estimation_layer = 'mueble_grande_promedio_fix25';
      e.confidence = 0.35;
      e.ratio_used = ratio25;
      e.ratio_source = `fix25_mueble_grande:${anchoNew25}x${altoNew25}x${profNew25}cm_r=${ratio25}`;
      e.detail = `Fix25 mueble grande promedio→dims: ${anchoNew25}×${altoNew25}×${profNew25}cm, vp=${vpNew25}×${ratio25}=${nuevoVol25}m³ (era ${volOriginal25})`;

      postValidationStats.fix25_mueble_grande_promedio++;
      if (fix25_examples.length < 12) fix25_examples.push(`${pm.cod}: ${volOriginal25}→${nuevoVol25}m³ [${anchoNew25}x${altoNew25}x${profNew25}] | ${pm.desc.substring(0, 55)}`);
    }
    console.log(`[Stage8] Fix25 applied: ${postValidationStats.fix25_mueble_grande_promedio} muebles grandes promedio→dims corregidos`);
    if (fix25_examples.length > 0) { console.log('[Stage8] Fix25 examples:'); fix25_examples.forEach(ex => console.log(`  ${ex}`)); }

    // ---- Fix 27: Composiciones genéricas de todos los suppliers ----
    // Extends Fix21 to ALL suppliers conservatively (1.2 m³, conf 0.25)
    const FIX27_COMP_REGEX = /\bCOMPOSICI[OÓ]N?\b/i;
    const FIX27_SKIP_LAYERS = new Set<EstimationLayer>([
      'erp_ground_truth', 'gemini_embalaje',
      'ratio_composicion_ancho_fix8', 'composicion_supplier_fix21', 'dormitorio_completo_fix20',
    ]);
    const fix27_examples: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const pm = productMeta[i];
      if (FIX27_SKIP_LAYERS.has(e.estimation_layer)) continue;
      if (!FIX27_COMP_REGEX.test(pm.desc)) continue;
      if (e.m3_logistico === null) continue;
      if (e.m3_logistico >= 0.5) continue;

      const volOriginal27 = e.m3_logistico;
      const nuevoVol27 = 1.2;

      const oldLayer27 = e.estimation_layer as keyof typeof layerCounts;
      if (layerCounts[oldLayer27] !== undefined && (layerCounts[oldLayer27] as number) > 0) (layerCounts[oldLayer27] as number)--;
      layerCounts.ratio_subfamilia++;
      layerConfidences.ratio_subfamilia.push(0.25);

      e.m3_logistico = nuevoVol27;
      e.estimation_layer = 'composicion_generica_fix27';
      e.confidence = 0.25;
      e.ratio_used = null;
      e.ratio_source = 'fix27_composicion_generica';
      e.detail = `Fix27 composición genérica vol<0.5: ${volOriginal27}→${nuevoVol27}m³`;

      postValidationStats.fix27_composicion_generica++;
      if (fix27_examples.length < 12) fix27_examples.push(`${pm.cod}: ${volOriginal27}→${nuevoVol27}m³ | ${pm.desc.substring(0, 70)}`);
    }
    console.log(`[Stage8] Fix27 applied: ${postValidationStats.fix27_composicion_generica} composiciones genéricas corregidas`);
    if (fix27_examples.length > 0) { console.log('[Stage8] Fix27 examples:'); fix27_examples.forEach(ex => console.log(`  ${ex}`)); }

    // ---- Fix 26: Supplier 01415 (Infiniton) caps por categoría ----
    // Supplier 01415 has mixed categories causing bad ratio estimates; cap to realistic ranges
    const FIX26_CATEGORIES: Array<{ name: string; regex: RegExp; min: number; max: number }> = [
      { name: 'VENTILADOR',    regex: /\bVENTILADOR\b/i,                          min: 0.02,   max: 0.35  },
      { name: 'PLANCHA',       regex: /\bPLANCHA\b/i,                              min: 0.005,  max: 0.08  },
      { name: 'ROBOT',         regex: /\bROBOT\b/i,                                min: 0.02,   max: 0.12  },
      { name: 'PATINETE',      regex: /\bPATINETE\b/i,                             min: 0.08,   max: 0.50  },
      { name: 'SECADOR',       regex: /\bSECADOR\b/i,                              min: 0.001,  max: 0.015 },
      { name: 'BATIDORA',      regex: /\bBATIDORA\b/i,                             min: 0.002,  max: 0.02  },
      { name: 'BASCULA',       regex: /\bBÁSCULA|BASCULA\b/i,                     min: 0.0005, max: 0.008 },
      { name: 'CALEFACTOR',    regex: /\bCALEFACTOR\b/i,                           min: 0.008,  max: 0.10  },
      { name: 'FREIDORA_AIRE', regex: /FREIDORA DE AIRE|AIR FRYER/i,              min: 0.008,  max: 0.05  },
      { name: 'ASPIRADOR',     regex: /\bASPIRADOR\b/i,                            min: 0.02,   max: 0.25  },
    ];
    const fix26_examples: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const pm = productMeta[i];
      if (!pm.cod.startsWith('01415')) continue;
      if (e.m3_logistico === null || e.m3_logistico <= 0) continue;
      // Only apply to ratio/rango layers — not ERP/Gemini/already-fixed
      if (!e.estimation_layer.startsWith('ratio_subfamilia') && e.estimation_layer !== 'rango_fisico_fix9') continue;

      for (const cat of FIX26_CATEGORIES) {
        if (!cat.regex.test(pm.desc)) continue;
        const vol = e.m3_logistico;
        if (vol >= cat.min && vol <= cat.max) break; // within range, no action
        const clamped = vol > cat.max ? cat.max : cat.min;
        const volOriginal26 = e.m3_logistico;

        const oldLayer26 = e.estimation_layer as keyof typeof layerCounts;
        if (layerCounts[oldLayer26] !== undefined && (layerCounts[oldLayer26] as number) > 0) (layerCounts[oldLayer26] as number)--;
        layerCounts.ratio_subfamilia++;
        layerConfidences.ratio_subfamilia.push(0.35);

        e.m3_logistico = clamped;
        e.estimation_layer = 'supplier_01415_cap_fix26';
        e.confidence = 0.35;
        e.ratio_used = null;
        e.ratio_source = `fix26_01415_${cat.name}:rango=[${cat.min},${cat.max}]`;
        e.detail = `Fix26 supplier 01415 ${cat.name}: ${volOriginal26}→${clamped}m³ (${vol > cat.max ? 'cap max' : 'cap min'})`;

        postValidationStats.fix26_supplier_01415_cap++;
        if (fix26_examples.length < 12) fix26_examples.push(`${pm.cod}: ${volOriginal26}→${clamped}m³ [${cat.name}] | ${pm.desc.substring(0, 55)}`);
        break;
      }
    }
    console.log(`[Stage8] Fix26 applied: ${postValidationStats.fix26_supplier_01415_cap} 01415 productos caps aplicados`);
    if (fix26_examples.length > 0) { console.log('[Stage8] Fix26 examples:'); fix26_examples.forEach(ex => console.log(`  ${ex}`)); }

    console.log(`[Stage8] Post-validation done: fix1=${postValidationStats.fix1_exterior_plegable}, fix2_nulled=${postValidationStats.fix2_electro_excessive_nulled}, fix2_cache=${postValidationStats.fix2_electro_excessive_from_cache}, fix3=${postValidationStats.fix3_mueble_tiny_corrected}, fix4=${postValidationStats.fix4_erp_placeholder_corrected}, fix5=${postValidationStats.fix5_dims_from_description}, fix7=${postValidationStats.fix7_residual_large_tiny}, fix8=${postValidationStats.fix8_composicion_ancho}, fix9=${postValidationStats.fix9_rango_fisico}, fix10=${postValidationStats.fix10_gemini_invalid}, fix11=${postValidationStats.fix11_ratio_too_big}, fix12=${postValidationStats.fix12_ratio_too_small}, fix13=${postValidationStats.fix13_bogal_erp_invalidated}, fix19=${postValidationStats.fix19_apple_vol_assigned}, fix18=${postValidationStats.fix18_erp_placeholder_extended}, fix17=${postValidationStats.fix17_silla_subfamilia}, fix16=${postValidationStats.fix16_split_multibulto}, fix15=${postValidationStats.fix15_frigo_alto_corrected}, fix14=${postValidationStats.fix14_ratio_minimo}, fix20=${postValidationStats.fix20_dormitorio_completo}, fix21=${postValidationStats.fix21_composicion_supplier}, fix22=${postValidationStats.fix22_mesita_corregida}, fix23=${postValidationStats.fix23_electro_grande}, fix24=${postValidationStats.fix24_erp_electro_aberrante}, fix25=${postValidationStats.fix25_mueble_grande_promedio}, fix26=${postValidationStats.fix26_supplier_01415_cap}, fix27=${postValidationStats.fix27_composicion_generica}, fix28=${postValidationStats.fix28_dims_profundidad_mm}`);

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
