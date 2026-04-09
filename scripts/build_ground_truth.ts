/**
 * Build ground truth logistics data from ERP M3 field.
 * M3 in the ERP matches agency transport invoices at 99.8%.
 *
 * Usage: npx ts-node --transpile-only scripts/build_ground_truth.ts [jobId]
 */
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const jobId = process.argv[2];

if (!jobId) {
  // Find most recent job directory
  const dirs = fs.readdirSync(DATA_DIR).filter(d => /^\d+$/.test(d) && fs.existsSync(path.join(DATA_DIR, d, 'stage1_base.json')));
  if (dirs.length === 0) { console.error('No job directories found'); process.exit(1); }
  const latest = dirs.sort().pop()!;
  console.log(`No jobId specified, using latest: ${latest}`);
  process.argv[2] = latest;
}

const JOB_ID = process.argv[2];
const stage1File = path.join(DATA_DIR, JOB_ID, 'stage1_base.json');

if (!fs.existsSync(stage1File)) {
  console.error(`stage1_base.json not found for job ${JOB_ID}`);
  process.exit(1);
}

console.log(`Reading ${stage1File}...`);
const rows: any[] = JSON.parse(fs.readFileSync(stage1File, 'utf-8'));
console.log(`Total products: ${rows.length}`);

function classifyByFamilia(familia: string): string {
  const prefix = (familia || '').split('.')[0];
  switch (prefix) {
    case '00001': return 'mueble';
    case '00002': return 'electrodomestico';
    case '00003': return 'accesorio';
    default: return 'otro';
  }
}

const products: Record<string, any> = {};
const byTipo: Record<string, number> = {};

for (const r of rows) {
  const m3 = Number(r['M3']) || 0;
  if (m3 <= 0) continue;

  const cod = String(r['COD.ARTICULO']);
  const familia = String(r['FAMILIA'] || '');
  const tipo = classifyByFamilia(familia);
  byTipo[tipo] = (byTipo[tipo] || 0) + 1;

  products[cod] = {
    m3_logistico: m3,
    bultos: Number(r['Bultos']) || 1,
    peso_bruto_kg: Number(r['PESO_BRUTO']) || null,
    peso_neto_kg: Number(r['PESO_NETO']) || null,
    tipo,
    familia,
    alto_paquete_cm: r['Alto'] > 0 ? Math.round(Number(r['Alto']) * 100 * 10) / 10 : null,
    ancho_paquete_cm: r['Ancho'] > 0 ? Math.round(Number(r['Ancho']) * 100 * 10) / 10 : null,
    largo_paquete_cm: r['Largo'] > 0 ? Math.round(Number(r['Largo']) * 100 * 10) / 10 : null,
  };
}

const count = Object.keys(products).length;
const output = {
  meta: {
    source_job: JOB_ID,
    generated_at: new Date().toISOString(),
    source: 'M3 campo ERP (Excel original)',
    total_products: count,
    by_tipo: byTipo,
    note: 'M3 del ERP coincide al 99.8% con volumenes medidos en facturas de agencia de transporte',
  },
  products,
};

const outFile = path.join(DATA_DIR, 'ground_truth_logistics.json');
fs.writeFileSync(outFile, JSON.stringify(output, null, 2));
console.log(`\nGround truth: ${count} productos con vol logistico real`);
console.log('By tipo:', JSON.stringify(byTipo));
console.log(`Written to ${outFile}`);
