import * as fs from 'fs';
import * as path from 'path';
import { store } from '../db/memory-store';

const DATA_DIR = path.resolve(process.cwd(), 'data');

interface ProductEstimable {
  'COD.ARTICULO': string;
  category: 'complete' | 'html_rich' | 'partial' | 'description_only' | 'empty';
  composite: boolean;
  component_count: number;
  sources: {
    numeric_dims: boolean;
    numeric_weight: boolean;
    html_measures: boolean;
    description_measures: boolean;
    has_m3: boolean;
  };
  estimable: boolean;
  confidence: number;
  original: Record<string, any>;
}

function hasNumericDims(p: Record<string, any>): boolean {
  const alto = Number(p['Alto']) || 0;
  const ancho = Number(p['Ancho']) || 0;
  const largo = Number(p['Largo']) || 0;
  return alto > 0 && ancho > 0 && largo > 0;
}

function hasNumericWeight(p: Record<string, any>): boolean {
  return (Number(p['PESO_NETO']) || 0) > 0 || (Number(p['PESO_BRUTO']) || 0) > 0;
}

function hasHtmlMeasures(html: string): boolean {
  if (!html || html.trim().length < 5) return false;
  // Check for measure keywords in HTML
  const measurePattern = /(?:ancho|alto|altura|largo|fondo|profundidad|di[aá]metro|longitud|anchura)\s*[:\s]*[\d,\.]+/i;
  const dimPattern = /[\d,\.]+\s*(?:cm|mm|m\b)/i;
  const nxnPattern = /\d+\s*[xX×]\s*\d+/;
  return measurePattern.test(html) || dimPattern.test(html) || nxnPattern.test(html);
}

function hasDescriptionMeasures(desc: string): boolean {
  if (!desc) return false;
  // Patterns like "82X60X55" or "190x90" in description
  return /\d+\s*[xX×]\s*\d+/.test(desc);
}

function countStrongTags(html: string): number {
  if (!html) return 0;
  const matches = html.match(/<strong>/gi);
  return matches ? matches.length : 0;
}

function classifyProduct(p: Record<string, any>): ProductEstimable {
  const numDims = hasNumericDims(p);
  const numWeight = hasNumericWeight(p);
  const html = String(p['MEDIDAS COLECCION'] || '');
  const htmlMeas = hasHtmlMeasures(html);
  const desc = String(p['Descripcion del proveedor'] || '');
  const descMeas = hasDescriptionMeasures(desc);
  const hasM3 = (Number(p['M3']) || 0) > 0;
  const strongCount = countStrongTags(html);
  const isComposite = strongCount > 1;

  let category: ProductEstimable['category'];
  let confidence: number;

  if (numDims && numWeight) {
    category = 'complete';
    confidence = 1.0;
  } else if (htmlMeas) {
    category = 'html_rich';
    confidence = 0.85;
  } else if (hasM3 || (numDims && !numWeight)) {
    category = 'partial';
    confidence = 0.5;
  } else if (descMeas) {
    category = 'description_only';
    confidence = 0.3;
  } else {
    category = 'empty';
    confidence = 0.0;
  }

  return {
    'COD.ARTICULO': String(p['COD.ARTICULO'] || ''),
    category,
    composite: isComposite,
    component_count: isComposite ? strongCount : 1,
    sources: {
      numeric_dims: numDims,
      numeric_weight: numWeight,
      html_measures: htmlMeas,
      description_measures: descMeas,
      has_m3: hasM3,
    },
    estimable: category !== 'empty',
    confidence,
    original: p,
  };
}

export async function executeStage2(jobId: string): Promise<void> {
  const job = store.getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  job.stages.stage2_paquete_estimable.status = 'processing';
  job.status = 'processing';
  store.updateJob(jobId, job);

  try {
    // Read stage1 output
    const stage1File = path.join(DATA_DIR, jobId, 'stage1_base.json');
    if (!fs.existsSync(stage1File)) {
      throw new Error('Stage 1 output not found. Run stage 1 first.');
    }
    const products: Record<string, any>[] = JSON.parse(fs.readFileSync(stage1File, 'utf-8'));

    // Classify each product
    const classified = products.map(classifyProduct);

    // Build summary
    const summary = {
      total: classified.length,
      complete: classified.filter(p => p.category === 'complete').length,
      html_rich: classified.filter(p => p.category === 'html_rich').length,
      partial: classified.filter(p => p.category === 'partial').length,
      description_only: classified.filter(p => p.category === 'description_only').length,
      empty: classified.filter(p => p.category === 'empty').length,
      composites: classified.filter(p => p.composite).length,
      estimable: classified.filter(p => p.estimable).length,
    };

    const output = { summary, products: classified };

    // Write output
    const jobDataDir = path.join(DATA_DIR, jobId);
    if (!fs.existsSync(jobDataDir)) {
      fs.mkdirSync(jobDataDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(jobDataDir, 'stage2_estimable.json'),
      JSON.stringify(output, null, 2)
    );

    // Update job
    job.stages.stage2_paquete_estimable.status = 'success';
    job.stages.stage2_paquete_estimable.metrics = summary;
    store.updateJob(jobId, job);
  } catch (err: any) {
    job.stages.stage2_paquete_estimable.status = 'error';
    job.stages.stage2_paquete_estimable.error = err.message;
    job.status = 'error';
    store.updateJob(jobId, job);
    throw err;
  }
}
