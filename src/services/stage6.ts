import * as fs from 'fs';
import * as path from 'path';
import { store } from '../db/memory-store';

const DATA_DIR = path.resolve(process.cwd(), 'data');

interface SetGroup {
  count: number;
  products: string[]; // COD.ARTICULO list
}

function buildGrouping(
  products: any[],
  keyFn: (p: any) => string,
  labelFn?: (key: string) => string
): Record<string, SetGroup> {
  const groups: Record<string, SetGroup> = {};
  for (const p of products) {
    const key = keyFn(p);
    if (!key) continue;
    if (!groups[key]) {
      groups[key] = { count: 0, products: [] };
    }
    groups[key].count++;
    groups[key].products.push(p['COD.ARTICULO']);
  }
  return groups;
}

const FAMILIA_NAMES: Record<string, string> = {
  '00001': 'Muebles',
  '00002': 'Electrodomésticos',
  '00003': 'Accesorios',
  '00006': 'Otros',
};

export async function executeStage6(jobId: string): Promise<void> {
  const job = store.getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  job.stages.stage6_filter_sets.status = 'processing';
  job.status = 'processing';
  store.updateJob(jobId, job);

  try {
    const stage5File = path.join(DATA_DIR, jobId, 'stage5_cleaned.json');
    if (!fs.existsSync(stage5File)) {
      throw new Error('Stage 5 output not found. Run stage 5 first.');
    }
    const stage5Data = JSON.parse(fs.readFileSync(stage5File, 'utf-8'));
    const products: any[] = stage5Data.products;

    // 1. By family (first segment of FAMILIA)
    const byFamily = buildGrouping(products, p => {
      const fam = String(p.original?.['FAMILIA'] || '').split('.')[0];
      return fam || 'unknown';
    });
    // Add human-readable names
    const byFamilyNamed: Record<string, any> = {};
    for (const [key, group] of Object.entries(byFamily)) {
      byFamilyNamed[key] = {
        name: FAMILIA_NAMES[key] || key,
        ...group,
      };
    }

    // 2. By Linea
    const byLinea = buildGrouping(products, p => {
      const linea = p.original?.['Linea'];
      return linea !== undefined && linea !== null ? String(linea) : '';
    });

    // 3. By Marca
    const byMarca = buildGrouping(products, p => {
      const marca = p.original?.['Marca'];
      return marca !== undefined && marca !== null ? String(marca) : '';
    });

    // 4. By product_type (from stage 4)
    const byType = buildGrouping(products, p => p.product_type || 'otro');

    // 5. By completeness category (from stage 2)
    const byCompleteness = buildGrouping(products, p => p.category || 'unknown');

    // 6. Products with complete measures
    const withMeasures = products.filter(p =>
      p.measures.ancho_cm !== null && p.measures.alto_cm !== null && p.measures.profundidad_cm !== null
    );

    // 7. Composites
    const composites = products.filter(p => p.composite);

    // 8. Missing measures
    const missingMeasures = products.filter(p =>
      p.measures.ancho_cm === null && p.measures.alto_cm === null && p.measures.profundidad_cm === null
    );

    const summary = {
      total_products: products.length,
      total_sets: 8,
      sets: {
        by_family: { groups: Object.keys(byFamilyNamed).length, products: products.length },
        by_linea: { groups: Object.keys(byLinea).length, products: products.length },
        by_marca: { groups: Object.keys(byMarca).length, products: products.length },
        by_type: { groups: Object.keys(byType).length, products: products.length },
        by_completeness: { groups: Object.keys(byCompleteness).length, products: products.length },
        with_measures: { products: withMeasures.length },
        composites: { products: composites.length },
        missing_measures: { products: missingMeasures.length },
      },
    };

    const output = {
      summary,
      sets: {
        by_family: byFamilyNamed,
        by_linea: byLinea,
        by_marca: byMarca,
        by_type: byType,
        by_completeness: byCompleteness,
        with_measures: { count: withMeasures.length, products: withMeasures.map(p => p['COD.ARTICULO']) },
        composites: { count: composites.length, products: composites.map(p => p['COD.ARTICULO']) },
        missing_measures: { count: missingMeasures.length, products: missingMeasures.map(p => p['COD.ARTICULO']) },
      },
    };

    const jobDataDir = path.join(DATA_DIR, jobId);
    fs.writeFileSync(
      path.join(jobDataDir, 'stage6_sets.json'),
      JSON.stringify(output, null, 2)
    );

    job.stages.stage6_filter_sets.status = 'success';
    job.stages.stage6_filter_sets.metrics = summary;
    store.updateJob(jobId, job);
  } catch (err: any) {
    job.stages.stage6_filter_sets.status = 'error';
    job.stages.stage6_filter_sets.error = err.message;
    job.status = 'error';
    store.updateJob(jobId, job);
    throw err;
  }
}
