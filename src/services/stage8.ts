import * as fs from 'fs';
import * as path from 'path';
import { store } from '../db/memory-store';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const GROUND_TRUTH_FILE = path.join(DATA_DIR, 'ground_truth_logistics.json');
const RATIOS_FILE = path.join(DATA_DIR, 'ratios_calibracion.json');

type EstimationLayer = 'erp_ground_truth' | 'ean_packaging' | 'ratio_estimate' | 'heuristic_fallback' | 'none';

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

function classifyByFamilia(familia: string): string {
  const prefix = (familia || '').split('.')[0];
  switch (prefix) {
    case '00001': return 'mueble';
    case '00002': return 'electrodomestico';
    case '00003': return 'accesorio';
    default: return 'otro';
  }
}

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

    // Process each product
    const entries: LogisticsEntry[] = [];
    const layerCounts: Record<EstimationLayer, number> = {
      erp_ground_truth: 0, ean_packaging: 0, ratio_estimate: 0, heuristic_fallback: 0, none: 0,
    };

    for (const p of products) {
      const cod = String(p['COD.ARTICULO']);
      const m3Erp = Number(p.original?.['M3']) || 0;
      const bultos = Number(p.original?.['Bultos']) || 1;
      const pesoBruto = Number(p.original?.['PESO_BRUTO']) || null;
      const familia = String(p.original?.['FAMILIA'] || '');
      const tipo = p.product_type || classifyByFamilia(familia);

      let entry: LogisticsEntry;

      // Layer 1: ERP ground truth (M3 > 0)
      if (m3Erp > 0) {
        entry = {
          'COD.ARTICULO': cod, m3_logistico: m3Erp, bultos, peso_bruto_kg: pesoBruto,
          estimation_layer: 'erp_ground_truth', confidence: 0.99,
          ratio_used: null, ratio_source: null,
          detail: `M3 directo del ERP: ${m3Erp}`,
        };
        layerCounts.erp_ground_truth++;
      }
      // Layers 2-4: pending for future phases
      else {
        entry = {
          'COD.ARTICULO': cod, m3_logistico: null, bultos, peso_bruto_kg: pesoBruto,
          estimation_layer: 'none', confidence: 0,
          ratio_used: null, ratio_source: null,
          detail: 'Pendiente: sin estimacion en Phase 0',
        };
        layerCounts.none++;
      }

      entries.push(entry);
    }

    // M3 stats for products with estimates
    const m3Values = entries.filter(e => e.m3_logistico !== null && e.m3_logistico > 0).map(e => e.m3_logistico!);
    const m3Stats = m3Values.length > 0 ? {
      count: m3Values.length,
      min: Math.round(Math.min(...m3Values) * 10000) / 10000,
      max: Math.round(Math.max(...m3Values) * 10000) / 10000,
      avg: Math.round(m3Values.reduce((s, v) => s + v, 0) / m3Values.length * 10000) / 10000,
      total_m3: Math.round(m3Values.reduce((s, v) => s + v, 0) * 100) / 100,
    } : { count: 0, min: 0, max: 0, avg: 0, total_m3: 0 };

    const summary = {
      total_products: products.length + excluded.length,
      clean_products: products.length,
      excluded_products: excluded.length,
      with_estimate: products.length - layerCounts.none,
      coverage_pct: Math.round((products.length - layerCounts.none) / products.length * 1000) / 10,
      layer_coverage: {
        erp_ground_truth: { count: layerCounts.erp_ground_truth, pct: Math.round(layerCounts.erp_ground_truth / products.length * 1000) / 10 },
        ean_packaging: { count: layerCounts.ean_packaging, pct: Math.round(layerCounts.ean_packaging / products.length * 1000) / 10 },
        ratio_estimate: { count: layerCounts.ratio_estimate, pct: Math.round(layerCounts.ratio_estimate / products.length * 1000) / 10 },
        heuristic_fallback: { count: layerCounts.heuristic_fallback, pct: Math.round(layerCounts.heuristic_fallback / products.length * 1000) / 10 },
        none: { count: layerCounts.none, pct: Math.round(layerCounts.none / products.length * 1000) / 10 },
      },
      m3_stats: m3Stats,
      phase: 0,
      active_layers: ['erp_ground_truth'],
      pending_layers: ['ean_packaging', 'ratio_estimate', 'heuristic_fallback'],
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
  } catch (err: any) {
    job.stages.stage8_logistics.status = 'error';
    job.stages.stage8_logistics.error = err.message;
    job.status = 'error';
    store.updateJob(jobId, job);
    throw err;
  }
}
