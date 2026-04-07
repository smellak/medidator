import * as fs from 'fs';
import * as path from 'path';
import { store } from '../db/memory-store';
import { GoogleGenerativeAI } from '@google/generative-ai';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const EAN_CACHE_FILE = path.join(DATA_DIR, 'ean_cache.json');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.5-flash';
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 1000;
const SAVE_EVERY = 50;

type ProductType = 'mueble' | 'electrodomestico' | 'accesorio' | 'otro';

interface EanCacheEntry {
  ancho_cm: number | null;
  alto_cm: number | null;
  profundidad_cm: number | null;
  peso_kg: number | null;
  marca: string;
  modelo: string;
  source: 'gemini';
  encontrado: boolean;
  fetched_at: string;
}

function classifyByFamilia(familia: string): ProductType {
  const prefix = (familia || '').split('.')[0];
  switch (prefix) {
    case '00001': return 'mueble';
    case '00002': return 'electrodomestico';
    case '00003': return 'accesorio';
    default: return 'otro';
  }
}

function parseNumber(s: string): number | null {
  if (!s) return null;
  const cleaned = s.replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function extractDimsFromDescription(desc: string): {
  ancho_cm: number | null;
  alto_cm: number | null;
  profundidad_cm: number | null;
} {
  const result = { ancho_cm: null as number | null, alto_cm: null as number | null, profundidad_cm: null as number | null };
  if (!desc) return result;

  const match = desc.match(/(\d+(?:[,\.]\d+)?)\s*[xX×]\s*(\d+(?:[,\.]\d+)?)(?:\s*[xX×]\s*(\d+(?:[,\.]\d+)?))?\s*(CM|MM|M)?/i);
  if (!match) return result;

  const v1 = parseNumber(match[1]);
  const v2 = parseNumber(match[2]);
  const v3 = match[3] ? parseNumber(match[3]) : null;
  const unit = (match[4] || 'CM').toUpperCase();
  const factor = unit === 'MM' ? 0.1 : unit === 'M' ? 100 : 1;

  if (v1 !== null && v2 !== null) {
    if (v3 !== null) {
      result.alto_cm = v1 * factor;
      result.ancho_cm = v2 * factor;
      result.profundidad_cm = v3 * factor;
    } else {
      result.alto_cm = v1 * factor;
      result.ancho_cm = v2 * factor;
    }
  }
  return result;
}

// --- EAN Cache ---

function loadEanCache(): Record<string, EanCacheEntry> {
  try {
    if (fs.existsSync(EAN_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(EAN_CACHE_FILE, 'utf-8'));
    }
  } catch { /* ignore corrupt cache */ }
  return {};
}

function saveEanCache(cache: Record<string, EanCacheEntry>): void {
  fs.mkdirSync(path.dirname(EAN_CACHE_FILE), { recursive: true });
  fs.writeFileSync(EAN_CACHE_FILE, JSON.stringify(cache, null, 2));
}

// --- Gemini EAN lookup ---

function buildPrompt(ean: string, descripcion: string): string {
  return `Eres un experto en electrodomésticos. Dado el siguiente código EAN/EAN-13: ${ean}
Y la descripción del producto: ${descripcion}
Busca las especificaciones técnicas de este electrodoméstico y devuelve SOLO un JSON válido:
{
  "ancho_cm": number|null,
  "alto_cm": number|null,
  "profundidad_cm": number|null,
  "peso_kg": number|null,
  "marca": "string",
  "modelo": "string",
  "encontrado": true|false
}
Si no puedes identificar el producto o no encuentras medidas, pon encontrado: false y nulls.
No incluyas texto adicional, solo el JSON.`;
}

function parseGeminiResponse(text: string): Omit<EanCacheEntry, 'source' | 'fetched_at'> | null {
  try {
    // Strip markdown code fences if present
    let cleaned = text.trim();
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
    const parsed = JSON.parse(cleaned);
    return {
      ancho_cm: typeof parsed.ancho_cm === 'number' ? parsed.ancho_cm : null,
      alto_cm: typeof parsed.alto_cm === 'number' ? parsed.alto_cm : null,
      profundidad_cm: typeof parsed.profundidad_cm === 'number' ? parsed.profundidad_cm : null,
      peso_kg: typeof parsed.peso_kg === 'number' ? parsed.peso_kg : null,
      marca: String(parsed.marca || ''),
      modelo: String(parsed.modelo || ''),
      encontrado: !!parsed.encontrado,
    };
  } catch {
    return null;
  }
}

async function queryGeminiBatch(
  model: any,
  items: Array<{ ean: string; desc: string }>,
): Promise<Array<{ ean: string; result: Omit<EanCacheEntry, 'source' | 'fetched_at'> | null }>> {
  const results = await Promise.all(
    items.map(async ({ ean, desc }) => {
      try {
        const prompt = buildPrompt(ean, desc);
        const response = await model.generateContent(prompt);
        const text = response.response.text();
        return { ean, result: parseGeminiResponse(text) };
      } catch (err: any) {
        console.error(`[Stage4] Gemini error for EAN ${ean}: ${err.message}`);
        return { ean, result: null };
      }
    }),
  );
  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isValidEan(ean: any): boolean {
  if (ean === null || ean === undefined) return false;
  const s = String(ean).trim();
  return s.length > 0 && s !== '0' && s !== 'null' && s !== 'None';
}

// --- Main ---

interface EnrichedProduct {
  'COD.ARTICULO': string;
  measures: {
    ancho_cm: number | null;
    alto_cm: number | null;
    profundidad_cm: number | null;
    peso_kg: number | null;
    volumen_m3: number | null;
  };
  components: any[];
  product_type: ProductType;
  enrichment_source: 'none' | 'description' | 'heuristic' | 'gemini';
  enrichment_confidence: number;
  source: string;
  parse_confidence: number;
  category: string;
  composite: boolean;
  warnings: string[];
  original: Record<string, any>;
}

export async function executeStage4(jobId: string): Promise<void> {
  const job = store.getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  job.stages.stage4_ia_enrichment.status = 'processing';
  job.status = 'processing';
  store.updateJob(jobId, job);

  try {
    const stage3File = path.join(DATA_DIR, jobId, 'stage3_normalized.json');
    if (!fs.existsSync(stage3File)) {
      throw new Error('Stage 3 output not found. Run stage 3 first.');
    }
    const stage3Data = JSON.parse(fs.readFileSync(stage3File, 'utf-8'));
    const products: any[] = stage3Data.products;

    // --- Phase 1: Classify all products and apply description enrichment ---
    let enrichedByDesc = 0;
    const typeCounts: Record<string, number> = {};

    const enriched: EnrichedProduct[] = products.map((p: any) => {
      const familia = String(p.original?.['FAMILIA'] || '');
      const desc = String(p.original?.['Descripcion del proveedor'] || '');
      const productType = classifyByFamilia(familia);
      typeCounts[productType] = (typeCounts[productType] || 0) + 1;

      const measures = { ...p.measures };
      let enrichmentSource: EnrichedProduct['enrichment_source'] = 'none';
      let enrichmentConfidence = p.parse_confidence;
      const warnings = [...(p.warnings || [])];

      const hasMeasures = measures.ancho_cm !== null || measures.alto_cm !== null || measures.profundidad_cm !== null;

      if (!hasMeasures || p.parse_confidence < 0.5) {
        const descDims = extractDimsFromDescription(desc);
        if (descDims.ancho_cm !== null || descDims.alto_cm !== null) {
          if (measures.ancho_cm === null) measures.ancho_cm = descDims.ancho_cm;
          if (measures.alto_cm === null) measures.alto_cm = descDims.alto_cm;
          if (measures.profundidad_cm === null) measures.profundidad_cm = descDims.profundidad_cm;
          enrichmentSource = 'description';
          enrichmentConfidence = Math.max(enrichmentConfidence, 0.4);
          enrichedByDesc++;
        }
      }

      // Calculate volume if all dims present and no volume yet
      if (measures.ancho_cm && measures.alto_cm && measures.profundidad_cm && !measures.volumen_m3) {
        measures.volumen_m3 = Math.round(
          (measures.ancho_cm * measures.alto_cm * measures.profundidad_cm) / 1000000 * 10000
        ) / 10000;
      }

      return {
        'COD.ARTICULO': p['COD.ARTICULO'],
        measures,
        components: p.components || [],
        product_type: productType,
        enrichment_source: enrichmentSource,
        enrichment_confidence: enrichmentConfidence,
        source: p.source,
        parse_confidence: p.parse_confidence,
        category: p.category,
        composite: p.composite,
        warnings,
        original: p.original,
      };
    });

    // --- Phase 2: Gemini EAN lookup for electrodomésticos ---
    const eanCache = loadEanCache();
    let eanCached = 0;
    let eanQueried = 0;
    let eanFound = 0;
    let eanEnriched = 0;
    let eanTotalElectro = 0;
    let eanErrors = 0;

    // Identify electros with valid EAN that need lookup
    const electrosWithEan: Array<{ index: number; ean: string; desc: string }> = [];

    for (let i = 0; i < enriched.length; i++) {
      const p = enriched[i];
      if (p.product_type !== 'electrodomestico') continue;

      const ean = p.original?.['EAN-code'];
      if (!isValidEan(ean)) continue;

      eanTotalElectro++;
      const eanStr = String(ean).trim();

      if (eanCache[eanStr]) {
        // Cached — apply immediately
        eanCached++;
        const cached = eanCache[eanStr];
        if (cached.encontrado) {
          eanFound++;
          applyGeminiMeasures(p, cached);
          if (p.enrichment_source === 'gemini') eanEnriched++;
        }
      } else {
        // Need to query
        electrosWithEan.push({
          index: i,
          ean: eanStr,
          desc: String(p.original?.['Descripcion del proveedor'] || ''),
        });
      }
    }

    // Process uncached EANs in batches
    if (electrosWithEan.length > 0) {
      console.log(`[Stage4] Querying Gemini for ${electrosWithEan.length} EANs (${eanCached} cached)...`);
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

      for (let batchStart = 0; batchStart < electrosWithEan.length; batchStart += BATCH_SIZE) {
        const batch = electrosWithEan.slice(batchStart, batchStart + BATCH_SIZE);
        const results = await queryGeminiBatch(model, batch);

        for (const { ean, result } of results) {
          eanQueried++;
          if (result) {
            const entry: EanCacheEntry = {
              ...result,
              source: 'gemini',
              fetched_at: new Date().toISOString(),
            };
            eanCache[ean] = entry;

            if (result.encontrado) {
              eanFound++;
              // Find the product and apply
              const item = batch.find(b => b.ean === ean);
              if (item) {
                const p = enriched[item.index];
                applyGeminiMeasures(p, entry);
                if (p.enrichment_source === 'gemini') eanEnriched++;
              }
            }
          } else {
            eanErrors++;
            // Cache as not found to avoid re-querying
            eanCache[ean] = {
              ancho_cm: null, alto_cm: null, profundidad_cm: null, peso_kg: null,
              marca: '', modelo: '', source: 'gemini', encontrado: false,
              fetched_at: new Date().toISOString(),
            };
          }
        }

        // Save cache periodically
        if (eanQueried % SAVE_EVERY < BATCH_SIZE) {
          saveEanCache(eanCache);
        }

        // Rate limit between batches
        if (batchStart + BATCH_SIZE < electrosWithEan.length) {
          await sleep(BATCH_DELAY_MS);
        }

        // Log progress every 50
        if (eanQueried % 50 < BATCH_SIZE) {
          console.log(`[Stage4] Progress: ${eanQueried}/${electrosWithEan.length} queried, ${eanFound} found, ${eanEnriched} enriched`);
        }
      }

      // Final cache save
      saveEanCache(eanCache);
      console.log(`[Stage4] Gemini lookup complete: ${eanQueried} queried, ${eanFound} found, ${eanEnriched} enriched, ${eanErrors} errors`);
    }

    // --- Phase 3: Summary ---
    const withMeasures = enriched.filter(p =>
      p.measures.ancho_cm !== null || p.measures.alto_cm !== null || p.measures.profundidad_cm !== null
    );

    const summary = {
      total: enriched.length,
      enriched_by_description: enrichedByDesc,
      enriched_by_heuristic: 0,
      classified: enriched.length,
      with_measures: withMeasures.length,
      types: typeCounts,
      ean_total_electro: eanTotalElectro,
      ean_cached: eanCached,
      ean_queried: eanQueried,
      ean_found: eanFound,
      ean_enriched: eanEnriched,
      ean_errors: eanErrors,
    };

    const output = { summary, products: enriched };

    const jobDataDir = path.join(DATA_DIR, jobId);
    fs.writeFileSync(
      path.join(jobDataDir, 'stage4_enriched.json'),
      JSON.stringify(output, null, 2)
    );

    job.stages.stage4_ia_enrichment.status = 'success';
    job.stages.stage4_ia_enrichment.metrics = summary;
    store.updateJob(jobId, job);
  } catch (err: any) {
    job.stages.stage4_ia_enrichment.status = 'error';
    job.stages.stage4_ia_enrichment.error = err.message;
    job.status = 'error';
    store.updateJob(jobId, job);
    throw err;
  }
}

/** Apply Gemini measures to a product. Only if confidence < 0.85 or no measures. */
function applyGeminiMeasures(p: EnrichedProduct, gemini: EanCacheEntry): void {
  if (!gemini.encontrado) return;

  // Don't overwrite if already high confidence
  if (p.parse_confidence >= 0.85) {
    // Still note that Gemini had data, but don't change measures
    p.warnings.push('gemini_data_available_but_existing_confidence_high');
    return;
  }

  const hadMeasures = p.measures.ancho_cm !== null || p.measures.alto_cm !== null || p.measures.profundidad_cm !== null;

  // Apply Gemini measures for missing fields
  if (gemini.ancho_cm !== null && p.measures.ancho_cm === null) p.measures.ancho_cm = gemini.ancho_cm;
  if (gemini.alto_cm !== null && p.measures.alto_cm === null) p.measures.alto_cm = gemini.alto_cm;
  if (gemini.profundidad_cm !== null && p.measures.profundidad_cm === null) p.measures.profundidad_cm = gemini.profundidad_cm;
  if (gemini.peso_kg !== null && p.measures.peso_kg === null) p.measures.peso_kg = gemini.peso_kg;

  // If product had no measures at all, overwrite completely
  if (!hadMeasures) {
    if (gemini.ancho_cm !== null) p.measures.ancho_cm = gemini.ancho_cm;
    if (gemini.alto_cm !== null) p.measures.alto_cm = gemini.alto_cm;
    if (gemini.profundidad_cm !== null) p.measures.profundidad_cm = gemini.profundidad_cm;
    if (gemini.peso_kg !== null) p.measures.peso_kg = gemini.peso_kg;
  }

  // Recalculate volume
  if (p.measures.ancho_cm && p.measures.alto_cm && p.measures.profundidad_cm) {
    p.measures.volumen_m3 = Math.round(
      (p.measures.ancho_cm * p.measures.alto_cm * p.measures.profundidad_cm) / 1000000 * 10000
    ) / 10000;
  }

  const newHasMeasures = p.measures.ancho_cm !== null || p.measures.alto_cm !== null || p.measures.profundidad_cm !== null;
  if (newHasMeasures && (!hadMeasures || p.parse_confidence < 0.85)) {
    p.enrichment_source = 'gemini';
    p.enrichment_confidence = 0.90;
  }
}
