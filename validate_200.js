const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.5-flash';
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 2000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;
const DATA_DIR = path.resolve(__dirname, 'data');
const JOB_ID = '1765816026406';
const OUTPUT_FILE = path.join(DATA_DIR, 'validation_200.json');
const SEED = 42;

function mulberry32(seed) {
  let s = seed | 0;
  return function() {
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function queryWithRetry(model, prompt, maxRetries) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await model.generateContent(prompt);
      let text = response.response.text().trim();
      text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
      return JSON.parse(text);
    } catch (e) {
      const msg = e.message || '';
      if ((msg.includes('503') || msg.includes('429') || msg.includes('500')) && attempt < maxRetries) {
        const delay = RETRY_DELAY_MS * attempt;
        console.log(`  Retry ${attempt}/${maxRetries} after ${delay}ms: ${msg.substring(0, 80)}`);
        await sleep(delay);
        continue;
      }
      throw e;
    }
  }
}

async function main() {
  const enriched = JSON.parse(fs.readFileSync(path.join(DATA_DIR, JOB_ID, 'stage4_enriched.json'), 'utf-8'));
  const products = enriched.products;

  const with3d = products.filter(p =>
    p.measures.ancho_cm != null && p.measures.alto_cm != null && p.measures.profundidad_cm != null
  );

  console.log(`Products with 3 dims: ${with3d.length}`);

  const byType = { mueble: [], electrodomestico: [], accesorio: [], otro: [] };
  for (const p of with3d) {
    const t = p.product_type || 'otro';
    if (byType[t]) byType[t].push(p);
    else byType.otro.push(p);
  }

  console.log('By type:', Object.entries(byType).map(([k, v]) => `${k}: ${v.length}`).join(', '));

  const rng = mulberry32(SEED);
  const muebles = shuffle(byType.mueble, rng).slice(0, 100);
  const electros = shuffle(byType.electrodomestico, rng).slice(0, 80);
  const accOtros = shuffle([...byType.accesorio, ...byType.otro], rng).slice(0, 20);

  const sample = [...muebles, ...electros, ...accOtros];
  console.log(`Sample: ${muebles.length} muebles + ${electros.length} electros + ${accOtros.length} acc/otros = ${sample.length}\n`);

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const results = [];
  let queried = 0;
  let apiErrors = 0;

  for (let i = 0; i < sample.length; i += BATCH_SIZE) {
    const batch = sample.slice(i, i + BATCH_SIZE);

    // Process batch sequentially to avoid rate limits
    for (const p of batch) {
      const desc = String(p.original?.['Descripcion del proveedor'] || '').substring(0, 200);
      const m = p.measures;
      const pesoStr = m.peso_kg != null ? `${m.peso_kg} kg` : 'no disponible';

      const prompt = `Eres un verificador de datos de productos de hogar. Te doy un producto con sus medidas actuales. Evalúa si las dimensiones tienen sentido para este tipo de producto.

Producto: ${desc}
Tipo: ${p.product_type}
Medidas actuales:
- Ancho: ${m.ancho_cm} cm
- Alto: ${m.alto_cm} cm
- Profundidad: ${m.profundidad_cm} cm
- Volumen: ${m.volumen_m3} m³
- Peso: ${pesoStr}

Responde SOLO con JSON:
{"coherente": true|false, "confianza": 0.0-1.0, "problema": "descripción breve del problema si no es coherente, null si es coherente", "dims_esperadas": {"ancho_cm": number|null, "alto_cm": number|null, "profundidad_cm": number|null}, "razon": "breve explicación"}`;

      try {
        const parsed = await queryWithRetry(model, prompt, MAX_RETRIES);
        results.push({
          cod: p['COD.ARTICULO'],
          product_type: p.product_type,
          source: p.source,
          enrichment_source: p.enrichment_source,
          desc: desc.substring(0, 100),
          measures: m,
          validation: parsed,
        });
      } catch (e) {
        apiErrors++;
        results.push({
          cod: p['COD.ARTICULO'],
          product_type: p.product_type,
          source: p.source,
          enrichment_source: p.enrichment_source,
          desc: desc.substring(0, 100),
          measures: m,
          validation: { coherente: null, error: e.message },
        });
      }

      queried++;
    }

    if (queried % 50 === 0 || queried === sample.length) {
      const ok = results.filter(r => r.validation.coherente === true).length;
      const bad = results.filter(r => r.validation.coherente === false).length;
      const err = results.filter(r => r.validation.coherente === null).length;
      console.log(`Progress: ${queried}/${sample.length} | ok:${ok} bad:${bad} err:${err}`);
    }

    if (i + BATCH_SIZE < sample.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  // Build summary
  const coherentes = results.filter(r => r.validation.coherente === true);
  const incoherentes = results.filter(r => r.validation.coherente === false);
  const errores = results.filter(r => r.validation.coherente === null);

  const byTypeSum = {};
  const bySourceSum = {};
  for (const r of results) {
    if (!byTypeSum[r.product_type]) byTypeSum[r.product_type] = { total: 0, coherente: 0, incoherente: 0, error: 0 };
    byTypeSum[r.product_type].total++;
    if (r.validation.coherente === true) byTypeSum[r.product_type].coherente++;
    else if (r.validation.coherente === false) byTypeSum[r.product_type].incoherente++;
    else byTypeSum[r.product_type].error++;

    const src = r.source;
    if (!bySourceSum[src]) bySourceSum[src] = { total: 0, coherente: 0, incoherente: 0, error: 0 };
    bySourceSum[src].total++;
    if (r.validation.coherente === true) bySourceSum[src].coherente++;
    else if (r.validation.coherente === false) bySourceSum[src].incoherente++;
    else bySourceSum[src].error++;
  }

  const validResults = results.filter(r => r.validation.coherente !== null);
  const summary = {
    total: results.length,
    valid_responses: validResults.length,
    coherentes: coherentes.length,
    incoherentes: incoherentes.length,
    errores_api: errores.length,
    pct_coherente: validResults.length > 0 ? Math.round(coherentes.length / validResults.length * 1000) / 10 : 0,
    pct_incoherente: validResults.length > 0 ? Math.round(incoherentes.length / validResults.length * 1000) / 10 : 0,
    by_type: byTypeSum,
    by_source: bySourceSum,
    incoherentes_detalle: incoherentes.map(r => ({
      cod: r.cod,
      product_type: r.product_type,
      source: r.source,
      desc: r.desc,
      measures: r.measures,
      problema: r.validation.problema,
      dims_esperadas: r.validation.dims_esperadas,
      razon: r.validation.razon,
      confianza: r.validation.confianza,
    })),
  };

  const output = { summary, results };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\nSaved to ${OUTPUT_FILE}`);
  console.log('\n=== RESUMEN ===');
  console.log(`Total: ${summary.total} (${summary.valid_responses} respuestas válidas, ${summary.errores_api} errores API)`);
  console.log(`Coherentes: ${summary.coherentes} (${summary.pct_coherente}%)`);
  console.log(`Incoherentes: ${summary.incoherentes} (${summary.pct_incoherente}%)`);
  console.log('\nPor tipo:');
  for (const [t, v] of Object.entries(byTypeSum)) {
    const pct = v.total - v.error > 0 ? Math.round(v.coherente / (v.total - v.error) * 100) : 0;
    console.log(`  ${t}: ${v.coherente}/${v.total - v.error} coherentes (${pct}%) [${v.error} errores]`);
  }
  console.log('\nPor source:');
  for (const [s, v] of Object.entries(bySourceSum)) {
    const pct = v.total - v.error > 0 ? Math.round(v.coherente / (v.total - v.error) * 100) : 0;
    console.log(`  ${s}: ${v.coherente}/${v.total - v.error} coherentes (${pct}%) [${v.error} errores]`);
  }
  if (incoherentes.length > 0) {
    console.log(`\n--- INCOHERENTES (${incoherentes.length}) ---`);
    for (const r of incoherentes) {
      const m = r.measures;
      console.log(`${r.cod} [${r.product_type}/${r.source}] ${m.ancho_cm}x${m.alto_cm}x${m.profundidad_cm} cm`);
      console.log(`  Desc: ${r.desc}`);
      console.log(`  Problema: ${r.validation.problema}`);
      if (r.validation.dims_esperadas) {
        const d = r.validation.dims_esperadas;
        console.log(`  Esperado: ${d.ancho_cm}x${d.alto_cm}x${d.profundidad_cm} cm`);
      }
      console.log('');
    }
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
