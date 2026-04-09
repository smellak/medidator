import * as fs from 'fs';
import * as path from 'path';
import { store } from '../db/memory-store';

const DATA_DIR = path.resolve(process.cwd(), 'data');

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * p / 100) - 1;
  return sorted[Math.max(0, idx)];
}

function buildHistogram(values: number[], buckets: number[]): Record<string, number> {
  const hist: Record<string, number> = {};
  for (let i = 0; i < buckets.length; i++) {
    const low = i === 0 ? 0 : buckets[i - 1];
    const high = buckets[i];
    const label = `${low}-${high}`;
    hist[label] = values.filter(v => v > low && v <= high).length;
  }
  hist[`${buckets[buckets.length - 1]}+`] = values.filter(v => v > buckets[buckets.length - 1]).length;
  return hist;
}

function dimStats(values: number[]) {
  if (values.length === 0) return { count: 0, min: 0, max: 0, avg: 0, median: 0, p25: 0, p75: 0 };
  return {
    count: values.length,
    min: Math.round(Math.min(...values) * 10) / 10,
    max: Math.round(Math.max(...values) * 10) / 10,
    avg: Math.round(values.reduce((s, v) => s + v, 0) / values.length * 10) / 10,
    median: Math.round(median(values) * 10) / 10,
    p25: Math.round(percentile(values, 25) * 10) / 10,
    p75: Math.round(percentile(values, 75) * 10) / 10,
  };
}

export async function executeStage7(jobId: string): Promise<void> {
  const job = store.getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  job.stages.stage7_stats.status = 'processing';
  job.status = 'processing';
  store.updateJob(jobId, job);

  try {
    // Load data from previous stages
    const stage2File = path.join(DATA_DIR, jobId, 'stage2_estimable.json');
    const stage4File = path.join(DATA_DIR, jobId, 'stage4_enriched.json');
    const stage5File = path.join(DATA_DIR, jobId, 'stage5_cleaned.json');
    const stage6File = path.join(DATA_DIR, jobId, 'stage6_sets.json');

    if (!fs.existsSync(stage5File)) {
      throw new Error('Stage 5 output not found. Run previous stages first.');
    }

    const stage5Data = JSON.parse(fs.readFileSync(stage5File, 'utf-8'));
    const products: any[] = stage5Data.products;
    const outliers: any[] = stage5Data.outliers || [];
    const excluded: any[] = stage5Data.excluded || [];
    const totalAll = products.length + excluded.length;

    // Load stage 2 summary for completeness categories
    let stage2Summary: any = null;
    if (fs.existsSync(stage2File)) {
      stage2Summary = JSON.parse(fs.readFileSync(stage2File, 'utf-8')).summary;
    }

    // Load stage 6 summary
    let stage6Summary: any = null;
    if (fs.existsSync(stage6File)) {
      stage6Summary = JSON.parse(fs.readFileSync(stage6File, 'utf-8')).summary;
    }

    // Coverage stats
    const withNumericDims = products.filter(p => p.source === 'numeric' || p.source === 'merged').length;
    const withHtml = products.filter(p => {
      const mc = p.original?.['MEDIDAS COLECCION'];
      return mc && String(mc).trim().length > 5;
    }).length;
    const withParsedMeasures = products.filter(p =>
      p.measures.ancho_cm !== null || p.measures.alto_cm !== null || p.measures.profundidad_cm !== null
    ).length;
    const withAllDims = products.filter(p =>
      p.measures.ancho_cm !== null && p.measures.alto_cm !== null && p.measures.profundidad_cm !== null
    ).length;
    const withWeight = products.filter(p => p.measures.peso_kg !== null && p.measures.peso_kg > 0).length;
    const composites = products.filter(p => p.composite).length;

    const coverage = {
      with_numeric_dims: { count: withNumericDims, pct: Math.round(withNumericDims / totalAll * 1000) / 10 },
      with_html_measures: { count: withHtml, pct: Math.round(withHtml / totalAll * 1000) / 10 },
      with_parsed_measures: { count: withParsedMeasures, pct: Math.round(withParsedMeasures / totalAll * 1000) / 10 },
      with_all_dimensions: { count: withAllDims, pct: Math.round(withAllDims / totalAll * 1000) / 10 },
      with_weight: { count: withWeight, pct: Math.round(withWeight / totalAll * 1000) / 10 },
      composites: { count: composites, pct: Math.round(composites / totalAll * 1000) / 10 },
    };

    // Distributions
    const anchos = products.map(p => p.measures.ancho_cm).filter((v: any) => v !== null && v > 0) as number[];
    const altos = products.map(p => p.measures.alto_cm).filter((v: any) => v !== null && v > 0) as number[];
    const profs = products.map(p => p.measures.profundidad_cm).filter((v: any) => v !== null && v > 0) as number[];
    const pesos = products.map(p => p.measures.peso_kg).filter((v: any) => v !== null && v > 0) as number[];
    const volumenes = products.map(p => p.measures.volumen_m3).filter((v: any) => v !== null && v > 0) as number[];

    const dimBuckets = [50, 100, 150, 200, 300];
    const pesoBuckets = [5, 10, 25, 50, 100, 200];
    const volBuckets = [0.1, 0.5, 1, 2, 5];

    const distributions = {
      ancho_cm: { ...dimStats(anchos), histogram: buildHistogram(anchos, dimBuckets) },
      alto_cm: { ...dimStats(altos), histogram: buildHistogram(altos, dimBuckets) },
      profundidad_cm: { ...dimStats(profs), histogram: buildHistogram(profs, dimBuckets) },
      peso_kg: { ...dimStats(pesos), histogram: buildHistogram(pesos, pesoBuckets) },
      volumen_m3: { ...dimStats(volumenes), histogram: buildHistogram(volumenes, volBuckets) },
    };

    // By product type
    const byType: Record<string, any> = {};
    const types = [...new Set(products.map(p => p.product_type || 'otro'))];
    for (const t of types) {
      const tp = products.filter(p => p.product_type === t);
      const tAnchos = tp.map(p => p.measures.ancho_cm).filter((v: any) => v !== null && v > 0) as number[];
      const tAltos = tp.map(p => p.measures.alto_cm).filter((v: any) => v !== null && v > 0) as number[];
      const tProfs = tp.map(p => p.measures.profundidad_cm).filter((v: any) => v !== null && v > 0) as number[];
      const tPesos = tp.map(p => p.measures.peso_kg).filter((v: any) => v !== null && v > 0) as number[];

      byType[t] = {
        count: tp.length,
        with_measures: tp.filter(p => p.measures.ancho_cm !== null).length,
        ancho_cm: dimStats(tAnchos),
        alto_cm: dimStats(tAltos),
        profundidad_cm: dimStats(tProfs),
        peso_kg: dimStats(tPesos),
      };
    }

    // Quality metrics
    const avgConfidence = products.length > 0
      ? Math.round(products.reduce((s: number, p: any) => s + (p.parse_confidence || 0), 0) / products.length * 100) / 100
      : 0;

    const quality = {
      outliers_detected: outliers.length,
      products_excluded: excluded.length,
      products_with_warnings: products.filter((p: any) => p.outlier_warning).length,
      parse_success_rate: Math.round(withParsedMeasures / totalAll * 1000) / 10,
      avg_confidence: avgConfidence,
    };

    // Composites stats
    const compositeProducts = products.filter(p => p.composite);
    const componentCounts = compositeProducts.map(p => (p.components || []).length);
    const compositeStats = {
      total: compositeProducts.length,
      avg_components: componentCounts.length > 0
        ? Math.round(componentCounts.reduce((s: number, c: number) => s + c, 0) / componentCounts.length * 10) / 10
        : 0,
      max_components: componentCounts.length > 0 ? Math.max(...componentCounts) : 0,
      component_distribution: buildHistogram(componentCounts, [2, 3, 5, 10]),
    };

    const output = {
      pipeline: {
        job_id: jobId,
        processed_at: new Date().toISOString(),
        total_products: totalAll,
        clean_products: products.length,
        excluded_products: excluded.length,
        stages_completed: 7,
      },
      coverage,
      distributions,
      by_type: byType,
      quality,
      composites: compositeStats,
      stage2_summary: stage2Summary,
      stage6_summary: stage6Summary,
    };

    const jobDataDir = path.join(DATA_DIR, jobId);
    fs.writeFileSync(
      path.join(jobDataDir, 'stage7_stats.json'),
      JSON.stringify(output, null, 2)
    );

    // Update job
    job.stages.stage7_stats.status = 'success';
    job.stages.stage7_stats.metrics = {
      total_products: totalAll,
      clean_products: products.length,
      coverage_pct: coverage.with_parsed_measures.pct,
      avg_confidence: avgConfidence,
      outliers: outliers.length,
    };
    // job.status remains 'processing' — stage8 is the new completion gate
    job.summary = output;
    store.updateJob(jobId, job);
  } catch (err: any) {
    job.stages.stage7_stats.status = 'error';
    job.stages.stage7_stats.error = err.message;
    job.status = 'error';
    store.updateJob(jobId, job);
    throw err;
  }
}
