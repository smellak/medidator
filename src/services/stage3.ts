import * as fs from 'fs';
import * as path from 'path';
import { store } from '../db/memory-store';

const DATA_DIR = path.resolve(process.cwd(), 'data');

// HTML entity map for Spanish
const HTML_ENTITIES: Record<string, string> = {
  '&aacute;': 'á', '&eacute;': 'é', '&iacute;': 'í',
  '&oacute;': 'ó', '&uacute;': 'ú', '&ntilde;': 'ñ',
  '&Aacute;': 'Á', '&Eacute;': 'É', '&Iacute;': 'Í',
  '&Oacute;': 'Ó', '&Uacute;': 'Ú', '&Ntilde;': 'Ñ',
  '&nbsp;': ' ', '&middot;': '·', '&amp;': '&',
  '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&uuml;': 'ü', '&Uuml;': 'Ü',
};

function decodeEntities(html: string): string {
  let result = html;
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    result = result.replace(new RegExp(entity, 'g'), char);
  }
  // Numeric entities
  result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
  return result;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Clean encoding artifacts like ¿ used as separator
function cleanArtifacts(text: string): string {
  return text.replace(/¿/g, ' ').replace(/\s+/g, ' ').trim();
}

interface ComponentMeasures {
  name: string;
  ancho_cm: number | null;
  alto_cm: number | null;
  profundidad_cm: number | null;
  largo_cm: number | null;
  diametro_cm: number | null;
  peso_kg: number | null;
}

interface ProductMeasures {
  'COD.ARTICULO': string;
  measures: {
    ancho_cm: number | null;
    alto_cm: number | null;
    profundidad_cm: number | null;
    peso_kg: number | null;
    volumen_m3: number | null;
  };
  components: ComponentMeasures[];
  source: 'numeric' | 'html' | 'merged' | 'description' | 'none';
  parse_confidence: number;
  warnings: string[];
  category: string;
  composite: boolean;
  original: Record<string, any>;
}

function parseNumber(s: string): number | null {
  if (!s) return null;
  // Handle Spanish decimal comma: "69,1" -> 69.1
  let cleaned = s.replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function convertToCm(value: number, unit: string): number {
  const u = unit.toLowerCase().trim();
  if (u === 'mm') return value / 10;
  if (u === 'm') return value * 100;
  return value; // cm or no unit
}

function convertToKg(value: number, unit: string): number {
  const u = unit.toLowerCase().trim();
  if (u === 'g') return value / 1000;
  return value; // kg
}

function extractMeasuresFromText(text: string): ComponentMeasures {
  const m: ComponentMeasures = {
    name: '',
    ancho_cm: null,
    alto_cm: null,
    profundidad_cm: null,
    largo_cm: null,
    diametro_cm: null,
    peso_kg: null,
  };

  // Named dimension patterns: "Ancho 202 cm", "Altura: 820 mm", "Fondo del aparato sin tirador: 548 mm"
  const dimPatterns: Array<{ regex: RegExp; field: keyof ComponentMeasures }> = [
    { regex: /(?:ancho|anchura)[^:\d]*[:\s]*([\d,\.]+)\s*(cm|mm|m)?/gi, field: 'ancho_cm' },
    { regex: /(?:alto|altura)[^:\d]*[:\s]*([\d,\.]+)\s*(cm|mm|m)?/gi, field: 'alto_cm' },
    { regex: /(?:fondo|profundidad)[^:\d]*[:\s]*([\d,\.]+)\s*(cm|mm|m)?/gi, field: 'profundidad_cm' },
    { regex: /(?:largo|longitud|long)[^:\d]*[:\s]*([\d,\.]+)\s*(cm|mm|m)?/gi, field: 'largo_cm' },
    { regex: /(?:di[aá]metro|diam)[^:\d]*[:\s]*([\d,\.]+)\s*(cm|mm|m)?/gi, field: 'diametro_cm' },
    { regex: /(?:peso(?:\s+neto)?)[^:\d]*[:\s]*([\d,\.]+)\s*(kg|g)?/gi, field: 'peso_kg' },
  ];

  for (const { regex, field } of dimPatterns) {
    const match = regex.exec(text);
    if (match) {
      const val = parseNumber(match[1]);
      if (val !== null && val > 0) {
        if (field === 'peso_kg') {
          (m as any)[field] = convertToKg(val, match[2] || 'kg');
        } else {
          (m as any)[field] = convertToCm(val, match[2] || 'cm');
        }
      }
    }
  }

  // Try NxN format: "23x50x38cm" or "190x90 cm"
  // Only if we didn't already get dimensions from named patterns
  if (m.ancho_cm === null && m.alto_cm === null) {
    const nxnMatch = text.match(/([\d,\.]+)\s*[xX×]\s*([\d,\.]+)(?:\s*[xX×]\s*([\d,\.]+))?\s*(cm|mm|m)?/);
    if (nxnMatch) {
      const unit = nxnMatch[4] || 'cm';
      const v1 = parseNumber(nxnMatch[1]);
      const v2 = parseNumber(nxnMatch[2]);
      const v3 = nxnMatch[3] ? parseNumber(nxnMatch[3]) : null;

      if (v1 !== null && v2 !== null) {
        if (v3 !== null) {
          // 3 dimensions: interpret as ancho x profundidad x alto (or largo x ancho x alto)
          m.ancho_cm = convertToCm(v1, unit);
          m.profundidad_cm = convertToCm(v2, unit);
          m.alto_cm = convertToCm(v3, unit);
        } else {
          // 2 dimensions: interpret as ancho x largo/alto
          m.ancho_cm = convertToCm(v1, unit);
          m.alto_cm = convertToCm(v2, unit);
        }
      }
    }
  }

  return m;
}

function parseHtmlMeasures(html: string): ComponentMeasures[] {
  if (!html || html.trim().length < 3) return [];

  const decoded = decodeEntities(html);
  const components: ComponentMeasures[] = [];

  // Split by <strong> tags to detect sub-components
  const strongParts = decoded.split(/<strong>/i);

  if (strongParts.length <= 1) {
    // No <strong> tags — single component
    const cleanText = cleanArtifacts(stripTags(decoded));
    const measures = extractMeasuresFromText(cleanText);
    measures.name = 'principal';
    components.push(measures);
  } else {
    // Multiple <strong> sections — composite product
    for (let i = 0; i < strongParts.length; i++) {
      const part = strongParts[i];
      if (i === 0 && stripTags(part).trim().length < 3) continue; // Skip empty preamble

      // Extract component name from <strong>...</strong>
      const nameMatch = part.match(/^(.*?)<\/strong>/i);
      let name = nameMatch ? stripTags(nameMatch[1]).trim() : `componente_${i}`;
      // Clean name of trailing colons/spaces
      name = name.replace(/[:\s]+$/, '').trim() || `componente_${i}`;

      const cleanText = cleanArtifacts(stripTags(part));
      const measures = extractMeasuresFromText(cleanText);
      measures.name = name;

      // Only add if it has at least one dimension
      const hasDim = measures.ancho_cm !== null || measures.alto_cm !== null ||
                     measures.profundidad_cm !== null || measures.largo_cm !== null ||
                     measures.diametro_cm !== null || measures.peso_kg !== null;
      if (hasDim || i === 1) { // Always include first named component
        components.push(measures);
      }
    }
  }

  return components;
}

/**
 * Post-validate measures for electrodomésticos to fix systematic parsing errors:
 * - Fix 1 (NxNxN): 3 identical dims → spec number replicated, not real dims → null
 * - Fix 2 (mm→cm): dims > 400 in electro → likely mm parsed as cm → divide by 10
 * - Fix 3 (decimal thousands): dim < 10 with 3-decimal-place pattern → Spanish thousands separator (1.279 = 1279mm)
 * Returns array of applied fix descriptions for warnings.
 */
function postValidateElectroMeasures(measures: ProductMeasures['measures'], familia: string): string[] {
  const familiaPrefix = (familia || '').split('.')[0].replace(/^0+/, '');
  const isElectro = familiaPrefix === '2';
  if (!isElectro) return [];

  const { ancho_cm, alto_cm, profundidad_cm } = measures;
  if (ancho_cm === null || alto_cm === null || profundidad_cm === null) return [];
  const fixes: string[] = [];

  // Fix 3: Detect Spanish thousands separator (e.g., 1.279 = 1279mm = 127.9cm)
  // Check each dim: if value < 10 and has exactly 3 decimal digits → multiply by 100
  const fixThousandsSep = (val: number): { fixed: number; applied: boolean } => {
    if (val >= 10 || val <= 0) return { fixed: val, applied: false };
    // Check if it has exactly 3 decimal places (e.g., 1.279, 1.077, 1.194)
    const str = String(val);
    const dotIdx = str.indexOf('.');
    if (dotIdx === -1) return { fixed: val, applied: false };
    const decimals = str.length - dotIdx - 1;
    if (decimals === 3) {
      return { fixed: val * 1000 / 10, applied: true }; // 1.279 → 1279mm → 127.9cm
    }
    return { fixed: val, applied: false };
  };

  let fix3Applied = false;
  const a = fixThousandsSep(measures.ancho_cm!);
  const h = fixThousandsSep(measures.alto_cm!);
  const p = fixThousandsSep(measures.profundidad_cm!);
  if (a.applied || h.applied || p.applied) {
    measures.ancho_cm = a.fixed;
    measures.alto_cm = h.fixed;
    measures.profundidad_cm = p.fixed;
    fix3Applied = true;
    fixes.push('fix3_thousands_separator');
  }

  // Fix 1: NxNxN — all 3 dims identical → spec number replicated as dims → unreliable
  if (measures.ancho_cm === measures.alto_cm && measures.alto_cm === measures.profundidad_cm) {
    measures.ancho_cm = null;
    measures.alto_cm = null;
    measures.profundidad_cm = null;
    measures.volumen_m3 = null;
    fixes.push('fix1_nxnxn_nulled');
    return fixes;
  }

  // Fix 2: mm parsed as cm — dims > 400 for electro are likely in mm
  const dims = [measures.ancho_cm!, measures.alto_cm!, measures.profundidad_cm!];
  const overCount = dims.filter(d => d > 400).length;
  if (overCount >= 2) {
    // All dims likely in mm → divide all by 10
    measures.ancho_cm = Math.round(measures.ancho_cm! / 10 * 100) / 100;
    measures.alto_cm = Math.round(measures.alto_cm! / 10 * 100) / 100;
    measures.profundidad_cm = Math.round(measures.profundidad_cm! / 10 * 100) / 100;
    fixes.push('fix2_mm_to_cm_all');
  } else if (overCount === 1) {
    // Only 1 dim > 400 and the others < 100 → that specific dim is in mm
    if (measures.ancho_cm! > 400 && measures.alto_cm! < 100 && measures.profundidad_cm! < 100) {
      measures.ancho_cm = Math.round(measures.ancho_cm! / 10 * 100) / 100;
      fixes.push('fix2_mm_to_cm_ancho');
    }
    if (measures.alto_cm! > 400 && measures.ancho_cm! < 100 && measures.profundidad_cm! < 100) {
      measures.alto_cm = Math.round(measures.alto_cm! / 10 * 100) / 100;
      fixes.push('fix2_mm_to_cm_alto');
    }
    if (measures.profundidad_cm! > 400 && measures.ancho_cm! < 100 && measures.alto_cm! < 100) {
      measures.profundidad_cm = Math.round(measures.profundidad_cm! / 10 * 100) / 100;
      fixes.push('fix2_mm_to_cm_prof');
    }
  }

  // Recalculate volume after fixes
  if (measures.ancho_cm && measures.alto_cm && measures.profundidad_cm) {
    measures.volumen_m3 = Math.round(
      (measures.ancho_cm * measures.alto_cm * measures.profundidad_cm) / 1000000 * 10000
    ) / 10000;
  }

  return fixes;
}

function processProduct(product: Record<string, any>): ProductMeasures {
  const cod = String(product['COD.ARTICULO'] || '');
  const html = String(product['MEDIDAS COLECCION'] || '');
  const desc = String(product['Descripcion del proveedor'] || '');
  const category = product.category || 'unknown';
  const isComposite = product.composite || false;
  const warnings: string[] = [];

  // Numeric dimensions (in METERS from Excel, convert to cm)
  const numAlto = (Number(product.original?.['Alto']) || 0) * 100;
  const numAncho = (Number(product.original?.['Ancho']) || 0) * 100;
  const numLargo = (Number(product.original?.['Largo']) || 0) * 100;
  const numM3 = Number(product.original?.['M3']) || 0;
  const numPesoNeto = Number(product.original?.['PESO_NETO']) || 0;
  const numPesoBruto = Number(product.original?.['PESO_BRUTO']) || 0;
  const numPeso = numPesoNeto > 0 ? numPesoNeto : numPesoBruto;
  const hasNumDims = numAlto > 0 && numAncho > 0 && numLargo > 0;

  // Parse HTML
  const originalHtml = String(product.original?.['MEDIDAS COLECCION'] || html);
  const htmlComponents = parseHtmlMeasures(originalHtml);

  // Determine source and merge
  let source: ProductMeasures['source'] = 'none';
  let finalMeasures: ProductMeasures['measures'] = {
    ancho_cm: null,
    alto_cm: null,
    profundidad_cm: null,
    peso_kg: null,
    volumen_m3: null,
  };
  let confidence = 0;

  if (hasNumDims && htmlComponents.length > 0) {
    // Merge: numeric dims take priority, supplement from HTML
    source = 'merged';
    const htmlMain = htmlComponents[0];
    finalMeasures.ancho_cm = numAncho;
    finalMeasures.alto_cm = numAlto;
    finalMeasures.profundidad_cm = numLargo; // "Largo" in Excel = profundidad for furniture
    finalMeasures.peso_kg = numPeso > 0 ? numPeso : htmlMain.peso_kg;
    finalMeasures.volumen_m3 = numM3 > 0 ? numM3 : null;
    confidence = 0.95;
  } else if (hasNumDims) {
    source = 'numeric';
    finalMeasures.ancho_cm = numAncho;
    finalMeasures.alto_cm = numAlto;
    finalMeasures.profundidad_cm = numLargo;
    finalMeasures.peso_kg = numPeso > 0 ? numPeso : null;
    finalMeasures.volumen_m3 = numM3 > 0 ? numM3 : null;
    confidence = 0.9;
  } else if (htmlComponents.length > 0) {
    source = 'html';
    const main = htmlComponents[0];
    finalMeasures.ancho_cm = main.ancho_cm;
    finalMeasures.alto_cm = main.alto_cm;
    finalMeasures.profundidad_cm = main.profundidad_cm || main.largo_cm;
    finalMeasures.peso_kg = main.peso_kg;
    confidence = 0.85;

    // Validate parsed values
    if (finalMeasures.ancho_cm === null && finalMeasures.alto_cm === null && finalMeasures.profundidad_cm === null) {
      // HTML had no parseable dimensions
      if (main.diametro_cm !== null) {
        finalMeasures.ancho_cm = main.diametro_cm;
        finalMeasures.profundidad_cm = main.diametro_cm;
        confidence = 0.7;
      } else {
        confidence = 0.2;
        warnings.push('HTML present but no dimensions parsed');
      }
    }
  } else {
    // Try description
    const descMeasures = extractMeasuresFromText(desc);
    if (descMeasures.ancho_cm !== null || descMeasures.alto_cm !== null) {
      source = 'description';
      finalMeasures.ancho_cm = descMeasures.ancho_cm;
      finalMeasures.alto_cm = descMeasures.alto_cm;
      finalMeasures.profundidad_cm = descMeasures.profundidad_cm || descMeasures.largo_cm;
      finalMeasures.peso_kg = descMeasures.peso_kg;
      confidence = 0.3;
    }
  }

  // Calculate volume if possible
  if (finalMeasures.ancho_cm && finalMeasures.alto_cm && finalMeasures.profundidad_cm && !finalMeasures.volumen_m3) {
    finalMeasures.volumen_m3 = Math.round(
      (finalMeasures.ancho_cm * finalMeasures.alto_cm * finalMeasures.profundidad_cm) / 1000000 * 10000
    ) / 10000;
  }

  // Post-validate electro measures (fix NxNxN, mm→cm, thousands separator)
  const familia = String(product.original?.['FAMILIA'] || product['FAMILIA'] || '');
  const electroFixes = postValidateElectroMeasures(finalMeasures, familia);
  if (electroFixes.length > 0) {
    warnings.push(...electroFixes);
    // Lower confidence for fixed measures
    if (electroFixes.includes('fix1_nxnxn_nulled')) {
      confidence = 0.1;
    } else {
      confidence = Math.min(confidence, 0.7);
    }
  }

  return {
    'COD.ARTICULO': cod,
    measures: finalMeasures,
    components: htmlComponents,
    source,
    parse_confidence: confidence,
    warnings,
    category,
    composite: isComposite,
    original: product.original || product,
  };
}

export async function executeStage3(jobId: string): Promise<void> {
  const job = store.getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  job.stages.stage3_normalize_measures.status = 'processing';
  job.status = 'processing';
  store.updateJob(jobId, job);

  try {
    const stage2File = path.join(DATA_DIR, jobId, 'stage2_estimable.json');
    if (!fs.existsSync(stage2File)) {
      throw new Error('Stage 2 output not found. Run stage 2 first.');
    }
    const stage2Data = JSON.parse(fs.readFileSync(stage2File, 'utf-8'));
    const products: any[] = stage2Data.products;

    const normalized = products.map(processProduct);

    // Build summary
    const withMeasures = normalized.filter(p =>
      p.measures.ancho_cm !== null || p.measures.alto_cm !== null || p.measures.profundidad_cm !== null
    );
    const withAllDims = normalized.filter(p =>
      p.measures.ancho_cm !== null && p.measures.alto_cm !== null && p.measures.profundidad_cm !== null
    );
    const compositeParsed = normalized.filter(p => p.composite && p.components.length > 0);
    const totalComponents = normalized.reduce((sum, p) => sum + p.components.length, 0);

    const sourceCounts: Record<string, number> = {};
    for (const p of normalized) {
      sourceCounts[p.source] = (sourceCounts[p.source] || 0) + 1;
    }

    // Count electro validation fixes applied
    const fixCounts = { fix1_nxnxn: 0, fix2_mm_to_cm: 0, fix3_thousands: 0 };
    for (const p of normalized) {
      for (const w of p.warnings) {
        if (w === 'fix1_nxnxn_nulled') fixCounts.fix1_nxnxn++;
        if (w.startsWith('fix2_mm_to_cm')) fixCounts.fix2_mm_to_cm++;
        if (w === 'fix3_thousands_separator') fixCounts.fix3_thousands++;
      }
    }

    const summary = {
      total: normalized.length,
      with_any_measures: withMeasures.length,
      with_all_dimensions: withAllDims.length,
      composites_parsed: compositeParsed.length,
      total_components: totalComponents,
      by_source: sourceCounts,
      avg_confidence: Math.round(
        normalized.reduce((s, p) => s + p.parse_confidence, 0) / normalized.length * 100
      ) / 100,
      electro_fixes: fixCounts,
    };

    const output = { summary, products: normalized };

    const jobDataDir = path.join(DATA_DIR, jobId);
    fs.writeFileSync(
      path.join(jobDataDir, 'stage3_normalized.json'),
      JSON.stringify(output, null, 2)
    );

    job.stages.stage3_normalize_measures.status = 'success';
    job.stages.stage3_normalize_measures.metrics = summary;
    store.updateJob(jobId, job);
  } catch (err: any) {
    job.stages.stage3_normalize_measures.status = 'error';
    job.stages.stage3_normalize_measures.error = err.message;
    job.status = 'error';
    store.updateJob(jobId, job);
    throw err;
  }
}
