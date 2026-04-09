/**
 * Coverage analysis: how many products can each estimation layer cover?
 *
 * Usage: npx ts-node --transpile-only scripts/coverage_analysis.ts [jobId]
 */
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');

let jobId = process.argv[2];
if (!jobId) {
  const dirs = fs.readdirSync(DATA_DIR).filter(d => /^\d+$/.test(d) && fs.existsSync(path.join(DATA_DIR, d, 'stage5_cleaned.json')));
  jobId = dirs.sort().pop()!;
  console.log(`Using latest job: ${jobId}`);
}

const gt = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'ground_truth_logistics.json'), 'utf-8'));
const ratios = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'ratios_calibracion.json'), 'utf-8'));
const stage5 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, jobId, 'stage5_cleaned.json'), 'utf-8'));
const products: any[] = stage5.products;

let layer1 = 0, layer2 = 0, layer3 = 0, layer4 = 0, noData = 0;
const byTipo: Record<string, Record<string, number>> = {};

for (const p of products) {
  const cod = p['COD.ARTICULO'];
  const m3 = Number(p.original?.['M3']) || 0;
  const tipo = p.product_type || 'otro';

  if (!byTipo[tipo]) byTipo[tipo] = { layer1: 0, layer2: 0, layer3: 0, layer4: 0, none: 0, total: 0 };
  byTipo[tipo].total++;

  if (m3 > 0) {
    layer1++; byTipo[tipo].layer1++; continue;
  }

  const ean = p.original?.['EAN-code'];
  const hasEan = ean && String(ean).trim().length > 3 && String(ean) !== '0';
  if (tipo === 'electrodomestico' && hasEan) {
    layer2++; byTipo[tipo].layer2++; continue;
  }

  const m = p.measures;
  const has3dims = m && m.ancho_cm !== null && m.alto_cm !== null && m.profundidad_cm !== null;
  if (has3dims) {
    const familia = String(p.original?.['FAMILIA'] || '');
    const l2 = familia.substring(0, 11);
    const l1 = familia.substring(0, 5);
    if (ratios.by_subfamilia_l2[l2] || ratios.by_subfamilia_l1[l1] || ratios.by_tipo[tipo]) {
      layer3++; byTipo[tipo].layer3++; continue;
    }
  }

  if (ratios.by_tipo[tipo]) {
    layer4++; byTipo[tipo].layer4++; continue;
  }

  noData++; byTipo[tipo].none++;
}

const total = products.length;
console.log('=== COVERAGE ANALYSIS (Stage 8 Logistics Volume) ===\n');
console.log(`Total clean products: ${total}\n`);
console.log(`Layer 1 (M3 ERP ground truth):     ${String(layer1).padStart(5)} (${(layer1/total*100).toFixed(1)}%)`);
console.log(`Layer 2 (Electro+EAN, future):      ${String(layer2).padStart(5)} (${(layer2/total*100).toFixed(1)}%)`);
console.log(`Layer 3 (3 dims + ratio n>=5):      ${String(layer3).padStart(5)} (${(layer3/total*100).toFixed(1)}%)`);
console.log(`Layer 4 (Type heuristic fallback):   ${String(layer4).padStart(5)} (${(layer4/total*100).toFixed(1)}%)`);
console.log(`No data:                             ${String(noData).padStart(5)} (${(noData/total*100).toFixed(1)}%)`);
console.log(`                                    ------`);
console.log(`Total estimable (L1+L2+L3+L4):     ${String(total-noData).padStart(5)} (${((total-noData)/total*100).toFixed(1)}%)`);

console.log('\n=== BY TYPE ===\n');
for (const [tipo, counts] of Object.entries(byTipo).sort((a, b) => b[1].total - a[1].total)) {
  const t = counts.total;
  console.log(`${tipo} (${t}):`);
  console.log(`  L1: ${counts.layer1} (${(counts.layer1/t*100).toFixed(1)}%), L2: ${counts.layer2} (${(counts.layer2/t*100).toFixed(1)}%), L3: ${counts.layer3} (${(counts.layer3/t*100).toFixed(1)}%), L4: ${counts.layer4} (${(counts.layer4/t*100).toFixed(1)}%), None: ${counts.none} (${(counts.none/t*100).toFixed(1)}%)`);
}
