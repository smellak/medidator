/**
 * Build calibration ratios: M3_logistico / vol_producto per subfamily.
 * Uses products with BOTH M3 (ground truth) and 3 HTML product dims.
 *
 * Usage: npx ts-node --transpile-only scripts/build_calibration_ratios.ts [jobId]
 */
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');

// Find job ID
let jobId = process.argv[2];
if (!jobId) {
  const dirs = fs.readdirSync(DATA_DIR).filter(d => /^\d+$/.test(d) && fs.existsSync(path.join(DATA_DIR, d, 'stage4_enriched.json')));
  jobId = dirs.sort().pop()!;
  console.log(`Using latest job: ${jobId}`);
}

// Load ground truth
const gtFile = path.join(DATA_DIR, 'ground_truth_logistics.json');
const gt = JSON.parse(fs.readFileSync(gtFile, 'utf-8'));
const gtProducts: Record<string, any> = gt.products;
console.log(`Ground truth: ${Object.keys(gtProducts).length} products`);

// Load stage4
console.log(`Loading stage4_enriched.json for job ${jobId}...`);
const stage4 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, jobId, 'stage4_enriched.json'), 'utf-8'));
const enrichedByCod: Record<string, any> = {};
for (const p of stage4.products) {
  enrichedByCod[p['COD.ARTICULO']] = p;
}
console.log(`Stage4 products: ${stage4.products.length}`);

// Compute ratios
interface RatioSample {
  cod: string;
  m3_logistico: number;
  vol_producto: number;
  ratio: number;
  tipo: string;
  familia: string;
  subfamilia_l1: string;
  subfamilia_l2: string;
}

const samples: RatioSample[] = [];
let skippedNoDims = 0;
let skippedOutlier = 0;

for (const [cod, gtEntry] of Object.entries(gtProducts) as [string, any][]) {
  const enriched = enrichedByCod[cod];
  if (!enriched) continue;

  const m = enriched.measures;
  if (!m || m.ancho_cm === null || m.alto_cm === null || m.profundidad_cm === null) {
    skippedNoDims++;
    continue;
  }
  if (m.ancho_cm <= 0 || m.alto_cm <= 0 || m.profundidad_cm <= 0) {
    skippedNoDims++;
    continue;
  }

  const vol_producto = (m.ancho_cm * m.alto_cm * m.profundidad_cm) / 1_000_000;
  if (vol_producto < 0.001) { skippedNoDims++; continue; }

  const ratio = gtEntry.m3_logistico / vol_producto;
  if (ratio > 20 || ratio < 0.01) { skippedOutlier++; continue; }

  const familia = String(gtEntry.familia || '');
  samples.push({
    cod,
    m3_logistico: gtEntry.m3_logistico,
    vol_producto: Math.round(vol_producto * 10000) / 10000,
    ratio: Math.round(ratio * 1000) / 1000,
    tipo: gtEntry.tipo,
    familia,
    subfamilia_l1: familia.substring(0, 5),
    subfamilia_l2: familia.substring(0, 11),
  });
}

console.log(`\nSamples: ${samples.length} (skipped: ${skippedNoDims} no dims, ${skippedOutlier} outlier ratios)`);

// Stats helper
function computeStats(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((s, v) => s + v, 0);
  const mean = sum / n;
  const mid = Math.floor(n / 2);
  const median = n % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const p25idx = Math.max(0, Math.ceil(n * 0.25) - 1);
  const p75idx = Math.max(0, Math.ceil(n * 0.75) - 1);
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);

  return {
    n,
    median: Math.round(median * 1000) / 1000,
    mean: Math.round(mean * 1000) / 1000,
    std: Math.round(std * 1000) / 1000,
    p25: Math.round(sorted[p25idx] * 1000) / 1000,
    p75: Math.round(sorted[p75idx] * 1000) / 1000,
    min: Math.round(sorted[0] * 1000) / 1000,
    max: Math.round(sorted[n - 1] * 1000) / 1000,
  };
}

function assignConfidence(stats: ReturnType<typeof computeStats>): number | null {
  if (!stats || stats.n < 5) return null;
  if (stats.n >= 20 && stats.std < stats.median) return 0.70;
  if (stats.n >= 10 && stats.std < stats.median * 2) return 0.60;
  if (stats.n >= 5) return 0.50;
  return null;
}

function buildGroupRatios(groupKey: keyof RatioSample) {
  const groups: Record<string, number[]> = {};
  for (const s of samples) {
    const key = String(s[groupKey]);
    if (!groups[key]) groups[key] = [];
    groups[key].push(s.ratio);
  }

  const result: Record<string, any> = {};
  for (const [key, ratios] of Object.entries(groups)) {
    const stats = computeStats(ratios);
    const confidence = assignConfidence(stats);
    if (confidence !== null) {
      result[key] = { ...stats, confidence };
    }
  }
  return result;
}

const byL2 = buildGroupRatios('subfamilia_l2');
const byL1 = buildGroupRatios('subfamilia_l1');
const byTipo = buildGroupRatios('tipo');

const output = {
  meta: {
    source_job: jobId,
    generated_at: new Date().toISOString(),
    total_samples: samples.length,
    skipped_no_dims: skippedNoDims,
    skipped_outlier_ratio: skippedOutlier,
    ratio_explanation: 'ratio = M3_logistico_ERP / vol_producto_HTML. >1 = package bigger than product. <1 = ships disassembled/folded.',
  },
  by_subfamilia_l2: byL2,
  by_subfamilia_l1: byL1,
  by_tipo: byTipo,
};

const outFile = path.join(DATA_DIR, 'ratios_calibracion.json');
fs.writeFileSync(outFile, JSON.stringify(output, null, 2));

console.log(`\nWritten to ${outFile}`);
console.log(`Groups: L2=${Object.keys(byL2).length}, L1=${Object.keys(byL1).length}, tipo=${Object.keys(byTipo).length}`);
console.log('\nBy tipo:');
for (const [t, s] of Object.entries(byTipo) as [string, any][]) {
  console.log(`  ${t}: n=${s.n}, median=${s.median}, mean=${s.mean}, std=${s.std}, conf=${s.confidence}`);
}
console.log('\nTop 10 L2 groups by n:');
const sortedL2 = Object.entries(byL2).sort((a: any, b: any) => b[1].n - a[1].n).slice(0, 10);
for (const [k, s] of sortedL2 as [string, any][]) {
  console.log(`  ${k}: n=${s.n}, median=${s.median}, std=${s.std}, conf=${s.confidence}`);
}
