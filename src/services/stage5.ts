import * as fs from 'fs';
import * as path from 'path';
import { store } from '../db/memory-store';

const DATA_DIR = path.resolve(process.cwd(), 'data');

interface OutlierEntry {
  'COD.ARTICULO': string;
  rule: string;
  field: string;
  value: number;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  action: 'excluded' | 'flagged' | 'info';
  detail: string;
}

function checkOutliers(product: any): OutlierEntry[] {
  const cod = product['COD.ARTICULO'];
  const m = product.measures || {};
  const type = product.product_type || 'otro';
  const issues: OutlierEntry[] = [];

  const dims: Array<{ field: string; value: number | null }> = [
    { field: 'ancho_cm', value: m.ancho_cm },
    { field: 'alto_cm', value: m.alto_cm },
    { field: 'profundidad_cm', value: m.profundidad_cm },
  ];

  for (const { field, value } of dims) {
    if (value === null) continue;

    // Impossible dimension
    if (value > 500) {
      issues.push({
        'COD.ARTICULO': cod,
        rule: 'dimension_imposible',
        field,
        value,
        severity: 'ERROR',
        action: 'excluded',
        detail: `${field}=${value}cm excede 500cm`,
      });
    } else if (value > 300) {
      issues.push({
        'COD.ARTICULO': cod,
        rule: 'dimension_sospechosa',
        field,
        value,
        severity: 'WARNING',
        action: 'flagged',
        detail: `${field}=${value}cm excede 300cm`,
      });
    }

    // Furniture with tiny dimension
    if (type === 'mueble' && value > 0 && value < 5) {
      issues.push({
        'COD.ARTICULO': cod,
        rule: 'dimension_muy_pequena',
        field,
        value,
        severity: 'WARNING',
        action: 'flagged',
        detail: `Mueble con ${field}=${value}cm (<5cm)`,
      });
    }
  }

  // Weight checks
  if (m.peso_kg !== null) {
    if (m.peso_kg > 500) {
      issues.push({
        'COD.ARTICULO': cod,
        rule: 'peso_excesivo',
        field: 'peso_kg',
        value: m.peso_kg,
        severity: 'ERROR',
        action: 'excluded',
        detail: `Peso ${m.peso_kg}kg excede 500kg`,
      });
    }
  }

  // Density check (kg/m3)
  if (m.peso_kg !== null && m.peso_kg > 0 && m.volumen_m3 !== null && m.volumen_m3 > 0) {
    const density = m.peso_kg / m.volumen_m3;
    if (density > 2000) {
      issues.push({
        'COD.ARTICULO': cod,
        rule: 'densidad_alta',
        field: 'densidad',
        value: Math.round(density),
        severity: 'WARNING',
        action: 'flagged',
        detail: `Densidad ${Math.round(density)} kg/m³ (>2000)`,
      });
    } else if (density < 10) {
      issues.push({
        'COD.ARTICULO': cod,
        rule: 'densidad_baja',
        field: 'densidad',
        value: Math.round(density * 10) / 10,
        severity: 'WARNING',
        action: 'flagged',
        detail: `Densidad ${Math.round(density * 10) / 10} kg/m³ (<10)`,
      });
    }
  }

  // Volume consistency check: calculated vs declared M3
  if (m.volumen_m3 !== null && m.volumen_m3 > 0) {
    const declaredM3 = Number(product.original?.['M3']) || 0;
    if (declaredM3 > 0) {
      const diff = Math.abs(m.volumen_m3 - declaredM3) / declaredM3;
      if (diff > 0.5) {
        issues.push({
          'COD.ARTICULO': cod,
          rule: 'm3_incoherente',
          field: 'volumen_m3',
          value: Math.round(diff * 100),
          severity: 'WARNING',
          action: 'flagged',
          detail: `M3 calculado=${m.volumen_m3.toFixed(4)} vs declarado=${declaredM3} (${Math.round(diff * 100)}% diferencia)`,
        });
      }
    }
  }

  return issues;
}

/**
 * P0.3: Fix peso unit errors — grams coded as kg
 */
function fixPesoUnits(product: any): string | null {
  const m = product.measures;
  if (!m || m.peso_kg === null || m.peso_kg <= 0) return null;
  const type = product.product_type || 'otro';

  // peso > 5000 for any type → probably grams, divide by 1000
  if (m.peso_kg > 5000) {
    m.peso_kg = Math.round(m.peso_kg / 1000 * 100) / 100;
    return 'fix_peso_g_to_kg';
  }

  // peso > 300 for electro → probably ×10 error, divide by 10
  if (type === 'electrodomestico' && m.peso_kg > 300) {
    m.peso_kg = Math.round(m.peso_kg / 10 * 100) / 100;
    return 'fix_peso_electro_div10';
  }

  return null;
}

export async function executeStage5(jobId: string): Promise<void> {
  const job = store.getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  job.stages.stage5_outliers_clean.status = 'processing';
  job.status = 'processing';
  store.updateJob(jobId, job);

  try {
    const stage4File = path.join(DATA_DIR, jobId, 'stage4_enriched.json');
    if (!fs.existsSync(stage4File)) {
      throw new Error('Stage 4 output not found. Run stage 4 first.');
    }
    const stage4Data = JSON.parse(fs.readFileSync(stage4File, 'utf-8'));
    const products: any[] = stage4Data.products;

    const allOutliers: OutlierEntry[] = [];
    const excludedCods = new Set<string>();

    let pesoFixCount = 0;
    for (const p of products) {
      // P0.3: Fix peso units before outlier detection
      const pesoFix = fixPesoUnits(p);
      if (pesoFix) {
        p.warnings = p.warnings || [];
        p.warnings.push(pesoFix);
        pesoFixCount++;
      }
      const issues = checkOutliers(p);
      allOutliers.push(...issues);
      if (issues.some(i => i.severity === 'ERROR')) {
        excludedCods.add(p['COD.ARTICULO']);
      }
    }

    // Separate clean from excluded
    const cleanProducts = products.filter(p => !excludedCods.has(p['COD.ARTICULO']));
    const excludedProducts = products.filter(p => excludedCods.has(p['COD.ARTICULO']));

    // Mark outlier flags on clean products (WARNING level)
    const warningCods = new Set(
      allOutliers.filter(o => o.severity === 'WARNING').map(o => o['COD.ARTICULO'])
    );
    for (const p of cleanProducts) {
      p.outlier_warning = warningCods.has(p['COD.ARTICULO']);
    }

    const summary = {
      total: products.length,
      clean: cleanProducts.length,
      warnings: warningCods.size,
      errors: excludedCods.size,
      excluded: excludedCods.size,
      outlier_count: allOutliers.length,
      peso_fixes: pesoFixCount,
      by_rule: {} as Record<string, number>,
      by_severity: { ERROR: 0, WARNING: 0, INFO: 0 } as Record<string, number>,
    };

    for (const o of allOutliers) {
      summary.by_rule[o.rule] = (summary.by_rule[o.rule] || 0) + 1;
      summary.by_severity[o.severity] = (summary.by_severity[o.severity] || 0) + 1;
    }

    const output = {
      summary,
      outliers: allOutliers,
      products: cleanProducts,
      excluded: excludedProducts,
    };

    const jobDataDir = path.join(DATA_DIR, jobId);
    fs.writeFileSync(
      path.join(jobDataDir, 'stage5_cleaned.json'),
      JSON.stringify(output, null, 2)
    );

    job.stages.stage5_outliers_clean.status = 'success';
    job.stages.stage5_outliers_clean.metrics = summary;
    store.updateJob(jobId, job);
  } catch (err: any) {
    job.stages.stage5_outliers_clean.status = 'error';
    job.stages.stage5_outliers_clean.error = err.message;
    job.status = 'error';
    store.updateJob(jobId, job);
    throw err;
  }
}
