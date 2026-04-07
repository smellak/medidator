import * as fs from 'fs';
import * as path from 'path';
import { store } from '../db/memory-store';

const DATA_DIR = path.resolve(process.cwd(), 'data');

type ProductType = 'mueble' | 'electrodomestico' | 'accesorio' | 'otro';

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

// Try to extract dimensions from description text like "82X60X55 CM" or "194X69"
function extractDimsFromDescription(desc: string): {
  ancho_cm: number | null;
  alto_cm: number | null;
  profundidad_cm: number | null;
} {
  const result = { ancho_cm: null as number | null, alto_cm: null as number | null, profundidad_cm: null as number | null };
  if (!desc) return result;

  // Match patterns like "82X60X55" or "190x90" with optional unit
  const match = desc.match(/(\d+(?:[,\.]\d+)?)\s*[xX×]\s*(\d+(?:[,\.]\d+)?)(?:\s*[xX×]\s*(\d+(?:[,\.]\d+)?))?\s*(CM|MM|M)?/i);
  if (!match) return result;

  const v1 = parseNumber(match[1]);
  const v2 = parseNumber(match[2]);
  const v3 = match[3] ? parseNumber(match[3]) : null;
  const unit = (match[4] || 'CM').toUpperCase();

  const factor = unit === 'MM' ? 0.1 : unit === 'M' ? 100 : 1;

  if (v1 !== null && v2 !== null) {
    if (v3 !== null) {
      // 3 dims: alto x ancho x profundidad (common in product descriptions)
      result.alto_cm = v1 * factor;
      result.ancho_cm = v2 * factor;
      result.profundidad_cm = v3 * factor;
    } else {
      // 2 dims: alto x ancho
      result.alto_cm = v1 * factor;
      result.ancho_cm = v2 * factor;
    }
  }
  return result;
}

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
  enrichment_source: 'none' | 'description' | 'heuristic';
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

    let enrichedByDesc = 0;
    let enrichedByHeuristic = 0;
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

      // Try to enrich products that have no measures or low confidence
      const hasMeasures = measures.ancho_cm !== null || measures.alto_cm !== null || measures.profundidad_cm !== null;

      if (!hasMeasures || p.parse_confidence < 0.5) {
        // Try extracting from description
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

    const withMeasures = enriched.filter(p =>
      p.measures.ancho_cm !== null || p.measures.alto_cm !== null || p.measures.profundidad_cm !== null
    );

    const summary = {
      total: enriched.length,
      enriched_by_description: enrichedByDesc,
      enriched_by_heuristic: enrichedByHeuristic,
      classified: enriched.length,
      with_measures: withMeasures.length,
      types: typeCounts,
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
