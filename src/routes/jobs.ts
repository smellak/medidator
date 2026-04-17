import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { store } from '../db/memory-store';
import { executeStage1 } from '../services/stage1';
import { executeStage2 } from '../services/stage2';
import { executeStage3 } from '../services/stage3';
import { executeStage4 } from '../services/stage4';
import { executeStage5 } from '../services/stage5';
import { executeStage6 } from '../services/stage6';
import { executeStage7 } from '../services/stage7';
import { executeStage8 } from '../services/stage8';

const router = Router();
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const jobId = Date.now().toString();
    (req as any).jobId = jobId;
    const dir = path.join(UPLOADS_DIR, jobId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, 'input.xlsx');
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.xls') {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos .xlsx o .xls'));
    }
  },
});

// POST /jobs - Create new job with Excel upload
router.post('/', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No se proporcionó archivo Excel' });
    return;
  }

  const jobId = (req as any).jobId as string;
  const inputFilePath = path.join('uploads', jobId, 'input.xlsx');
  const job = store.createJob(jobId, inputFilePath);

  res.status(201).json(job);
});

// GET /jobs - List all jobs
router.get('/', (req: Request, res: Response) => {
  const { status, limit, offset } = req.query;
  let jobs = store.getAllJobs();

  if (status && typeof status === 'string') {
    jobs = jobs.filter(j => j.status === status);
  }

  const limitNum = limit ? parseInt(limit as string, 10) : jobs.length;
  const offsetNum = offset ? parseInt(offset as string, 10) : 0;
  jobs = jobs.slice(offsetNum, offsetNum + limitNum);

  res.json(jobs);
});

// GET /jobs/:jobId - Get job detail
router.get('/:jobId', (req: Request, res: Response) => {
  const job = store.getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json(job);
});

// POST /jobs/:jobId/stage1 - Execute stage 1
router.post('/:jobId/stage1', async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = store.getJob(jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  try {
    await executeStage1(jobId);
    res.json(store.getJob(jobId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /jobs/:jobId/stage2 - Execute stage 2
router.post('/:jobId/stage2', async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = store.getJob(jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  try {
    await executeStage2(jobId);
    res.json(store.getJob(jobId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /jobs/:jobId/stage3 - Execute stage 3
router.post('/:jobId/stage3', async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = store.getJob(jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  try {
    await executeStage3(jobId);
    res.json(store.getJob(jobId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /jobs/:jobId/stage4 - Execute stage 4
router.post('/:jobId/stage4', async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = store.getJob(jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  try {
    await executeStage4(jobId);
    res.json(store.getJob(jobId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /jobs/:jobId/stage5 - Execute stage 5
router.post('/:jobId/stage5', async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = store.getJob(jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  try {
    await executeStage5(jobId);
    res.json(store.getJob(jobId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /jobs/:jobId/stage6 - Execute stage 6
router.post('/:jobId/stage6', async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = store.getJob(jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  try {
    await executeStage6(jobId);
    res.json(store.getJob(jobId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /jobs/:jobId/stage7 - Execute stage 7
router.post('/:jobId/stage7', async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = store.getJob(jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  try {
    await executeStage7(jobId);
    res.json(store.getJob(jobId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /jobs/:jobId/stage8 - Execute stage 8
router.post('/:jobId/stage8', async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = store.getJob(jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  try {
    await executeStage8(jobId);
    res.json(store.getJob(jobId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Stage executors in order
const stageExecutors = [
  { name: 'stage1_ingest_normalize', fn: executeStage1 },
  { name: 'stage2_paquete_estimable', fn: executeStage2 },
  { name: 'stage3_normalize_measures', fn: executeStage3 },
  { name: 'stage4_ia_enrichment', fn: executeStage4 },
  { name: 'stage5_outliers_clean', fn: executeStage5 },
  { name: 'stage6_filter_sets', fn: executeStage6 },
  { name: 'stage7_stats', fn: executeStage7 },
  { name: 'stage8_logistics', fn: executeStage8 },
];

// POST /jobs/:jobId/run - Execute full 7-stage pipeline
router.post('/:jobId/run', async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = store.getJob(jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  try {
    for (const stage of stageExecutors) {
      const current = store.getJob(jobId)!;
      if ((current.stages as any)[stage.name].status !== 'success') {
        await stage.fn(jobId);
      }
    }
    res.json(store.getJob(jobId));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /jobs/:jobId/export - Export results
router.get('/:jobId/export', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const format = (req.query.format as string) || 'json';
  const type = (req.query.type as string) || '';
  const job = store.getJob(jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  const DATA_DIR = path.resolve(process.cwd(), 'data');

  // Logistics export: 3-column CSV (COD_ARTICULO, DESCRIPCION, VOLUMEN_PAQUETE_M3)
  if (format === 'csv' && type === 'logistics') {
    const stage8File = path.join(DATA_DIR, jobId, 'stage8_logistics.json');
    if (!fs.existsSync(stage8File)) {
      res.status(400).json({ error: 'Stage 8 (logística) no ejecutado. Ejecuta el pipeline completo primero.' });
      return;
    }

    const stage8Data = JSON.parse(fs.readFileSync(stage8File, 'utf-8'));
    const logisticsProducts: any[] = stage8Data.products || [];

    // Build descriptions map from stage4 or stage1
    const descMap: Record<string, string> = {};
    const stage4File = path.join(DATA_DIR, jobId, 'stage4_enriched.json');
    const stage1File = path.join(DATA_DIR, jobId, 'stage1_base.json');
    if (fs.existsSync(stage4File)) {
      const stage4Data = JSON.parse(fs.readFileSync(stage4File, 'utf-8'));
      for (const p of stage4Data.products || []) {
        const cod = String(p['COD.ARTICULO'] || '');
        if (cod) descMap[cod] = String(p.original?.['Descripcion del proveedor'] || '');
      }
    } else if (fs.existsSync(stage1File)) {
      const stage1Data = JSON.parse(fs.readFileSync(stage1File, 'utf-8'));
      const rows = Array.isArray(stage1Data) ? stage1Data : [];
      for (const r of rows) {
        const cod = String(r['COD.ARTICULO'] || '');
        if (cod) descMap[cod] = String(r['Descripcion del proveedor'] || '');
      }
    }

    // Map estimation_layer to capa number
    const layerToCapa = (layer: string): number => {
      if (layer === 'erp_ground_truth') return 1;
      if (layer === 'gemini_embalaje') return 2;
      if (layer === 'ratio_subfamilia' || layer === 'ratio_tipo' || layer === 'ratio_subfamilia_corregido_fix4' || layer === 'ratio_desde_descripcion_fix5') return 3;
      if (layer === 'promedio_subfamilia' || layer === 'promedio_tipo' || layer === 'promedio_subfamilia_corregido') return 4;
      return 0;
    };

    // Filter products with m3_logistico > 0 AND confidence > 0, sort by COD_ARTICULO
    const sanitize = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();
    const rows = logisticsProducts
      .filter(p =>
        p.m3_logistico !== null &&
        p.m3_logistico !== undefined &&
        Number(p.m3_logistico) > 0 &&
        Number(p.confidence) > 0
      )
      .map(p => {
        const cod = String(p['COD.ARTICULO'] || '');
        return {
          COD_ARTICULO: cod,
          DESCRIPCION: sanitize(descMap[cod] || ''),
          VOLUMEN_PAQUETE_M3: Number(p.m3_logistico),
          CONFIDENCE: Number(p.confidence),
          CAPA: layerToCapa(String(p.estimation_layer || '')),
        };
      })
      .sort((a, b) => a.COD_ARTICULO.localeCompare(b.COD_ARTICULO));

    const headers = ['COD_ARTICULO', 'DESCRIPCION', 'VOLUMEN_PAQUETE_M3', 'CONFIDENCE', 'CAPA'];
    const csvLines = [headers.join(',')];
    for (const row of rows) {
      const values = headers.map(h => {
        const val = (row as any)[h];
        if (val === null || val === undefined) return '';
        const str = String(val);
        // Force Excel to treat COD_ARTICULO as text (preserves leading zeros)
        if (h === 'COD_ARTICULO') {
          return `="${str.replace(/"/g, '""')}"`;
        }
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      csvLines.push(values.join(','));
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=job_${jobId}_logistics.csv`);
    res.send(csvLines.join('\n'));
    return;
  }

  // For CSV export, prefer files with product arrays
  // For JSON export, prefer the latest stage output
  const csvFiles = [
    'stage5_cleaned.json',
    'stage4_enriched.json',
    'stage3_normalized.json',
    'stage2_estimable.json',
    'stage1_base.json',
  ];
  const jsonFiles = [
    'stage7_stats.json',
    'stage6_sets.json',
    ...csvFiles,
  ];
  const possibleFiles = format === 'csv' ? csvFiles : jsonFiles;

  let dataFile: string | null = null;
  for (const f of possibleFiles) {
    const fp = path.join(DATA_DIR, jobId, f);
    if (fs.existsSync(fp)) {
      dataFile = fp;
      break;
    }
  }

  if (!dataFile) {
    res.status(404).json({ error: 'No processed data found for this job' });
    return;
  }

  const data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));

  if (format === 'csv') {
    // For CSV, extract the products array from the data
    const products = data.products || (Array.isArray(data) ? data : []);
    if (products.length === 0) {
      res.status(400).json({ error: 'No product data available for CSV export' });
      return;
    }

    // Flatten measures for CSV
    const sanitize = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();
    const csvRows = products.map((p: any) => ({
      'COD.ARTICULO': p['COD.ARTICULO'] || '',
      Descripcion: sanitize(String(p.original?.['Descripcion del proveedor'] || '')),
      FAMILIA: p.original?.['FAMILIA'] || '',
      product_type: p.product_type || '',
      category: p.category || '',
      ancho_cm: p.measures?.ancho_cm ?? '',
      alto_cm: p.measures?.alto_cm ?? '',
      profundidad_cm: p.measures?.profundidad_cm ?? '',
      peso_kg: p.measures?.peso_kg ?? '',
      volumen_m3: p.measures?.volumen_m3 ?? '',
      source: p.source || '',
      parse_confidence: p.parse_confidence ?? '',
      composite: p.composite ? 'SI' : 'NO',
      components: (p.components || []).length,
      outlier_warning: p.outlier_warning ? 'SI' : 'NO',
    }));

    const headers = Object.keys(csvRows[0]);
    const csvLines = [headers.join(',')];
    for (const row of csvRows) {
      const values = headers.map(h => {
        const val = (row as any)[h];
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      csvLines.push(values.join(','));
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=job_${jobId}_export.csv`);
    res.send(csvLines.join('\n'));
  } else {
    res.json(data);
  }
});

// ============================================================
// Custom export with column selection
// GET /jobs/:jobId/export/custom?columns=...&format=csv|xlsx&capa=&confidence_min=&tipo=
// ============================================================

// Catalog of available columns and how to extract them.
// Each extractor receives the merged record { stage4: any, stage8: any, cod: string }.
type ColumnExtractor = (r: { cod: string; s4: any; s8: any }) => any;
const COLUMN_CATALOG: Record<string, ColumnExtractor> = {
  // Básicos
  COD_ARTICULO: ({ cod }) => cod,
  DESCRIPCION: ({ s4 }) => s4?.original?.['Descripcion del proveedor'] ?? '',
  FAMILIA: ({ s4 }) => s4?.original?.['FAMILIA'] ?? '',
  TIPO: ({ s4 }) => s4?.product_type ?? '',
  EAN: ({ s4 }) => {
    const e = s4?.original?.['EAN-code'];
    return e && String(e).trim() !== '' && String(e).trim() !== '0' ? String(e) : '';
  },
  PROVEEDOR: ({ s4 }) => s4?.original?.['PROVEEDOR'] ?? '',
  PROGRAMA: ({ s4 }) => s4?.original?.['Programa'] ?? '',
  MARCA: ({ s4 }) => s4?.original?.['Marca'] ?? '',
  LINEA: ({ s4 }) => s4?.original?.['Linea'] ?? '',
  // Medidas producto
  ANCHO_CM: ({ s4 }) => s4?.measures?.ancho_cm ?? '',
  ALTO_CM: ({ s4 }) => s4?.measures?.alto_cm ?? '',
  PROFUNDIDAD_CM: ({ s4 }) => s4?.measures?.profundidad_cm ?? '',
  VOLUMEN_PRODUCTO_M3: ({ s4 }) => s4?.measures?.volumen_m3 ?? '',
  PESO_NETO_KG: ({ s4 }) => {
    const v = s4?.original?.['PESO_NETO'];
    return v !== undefined && v !== null && v !== '' ? Number(v) : '';
  },
  PESO_BRUTO_KG: ({ s4, s8 }) => {
    // Prefer stage8 peso (may have been enriched from Gemini)
    if (s8?.peso_bruto_kg !== null && s8?.peso_bruto_kg !== undefined) return s8.peso_bruto_kg;
    const v = s4?.original?.['PESO_BRUTO'];
    return v !== undefined && v !== null && v !== '' ? Number(v) : '';
  },
  // Logística
  VOLUMEN_PAQUETE_M3: ({ s8 }) => (s8?.m3_logistico !== null && s8?.m3_logistico !== undefined ? s8.m3_logistico : ''),
  BULTOS: ({ s4, s8 }) => {
    if (s8?.bultos !== undefined && s8?.bultos !== null) return s8.bultos;
    const v = s4?.original?.['Bultos'];
    return v !== undefined && v !== null && v !== '' ? Number(v) : '';
  },
  CAPA: ({ s8 }) => {
    const layer = s8?.estimation_layer;
    if (layer === 'erp_ground_truth') return 1;
    if (layer === 'gemini_embalaje') return 2;
    if (layer === 'ratio_subfamilia' || layer === 'ratio_tipo' || layer === 'ratio_subfamilia_corregido_fix4' || layer === 'ratio_desde_descripcion_fix5') return 3;
    if (layer === 'promedio_subfamilia' || layer === 'promedio_tipo' || layer === 'promedio_subfamilia_corregido') return 4;
    return 0;
  },
  CONFIDENCE: ({ s8 }) => (s8?.confidence !== undefined && s8?.confidence !== null ? s8.confidence : ''),
  ESTIMATION_SOURCE: ({ s8 }) => s8?.detail ?? '',
  // Calidad
  PARSE_CONFIDENCE: ({ s4 }) => (s4?.parse_confidence !== undefined && s4?.parse_confidence !== null ? s4.parse_confidence : ''),
  SOURCE: ({ s4 }) => s4?.source ?? '',
  COMPOSITE: ({ s4 }) => (s4?.composite ? 'SI' : 'NO'),
  NUM_COMPONENTS: ({ s4 }) => (Array.isArray(s4?.components) ? s4.components.length : 0),
  OUTLIER_WARNING: ({ s4 }) => {
    const warnings = s4?.warnings;
    return Array.isArray(warnings) && warnings.length > 0 ? 'SI' : 'NO';
  },
  CATEGORY: ({ s4 }) => s4?.category ?? '',
};

const DEFAULT_COLUMNS = ['COD_ARTICULO', 'DESCRIPCION', 'VOLUMEN_PAQUETE_M3'];

function sanitizeText(s: any): string {
  return String(s ?? '').replace(/[\r\n]+/g, ' ').trim();
}

router.get('/:jobId/export/custom', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = store.getJob(jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  // --- Parse query params ---
  const format = String(req.query.format || 'csv').toLowerCase();
  if (format !== 'csv' && format !== 'xlsx') {
    res.status(400).json({ error: "format debe ser 'csv' o 'xlsx'" });
    return;
  }

  const columnsParam = String(req.query.columns || '').trim();
  const requestedColumns = columnsParam
    ? columnsParam.split(',').map(c => c.trim()).filter(Boolean)
    : DEFAULT_COLUMNS;

  // Validate columns
  const invalidColumns = requestedColumns.filter(c => !(c in COLUMN_CATALOG));
  if (invalidColumns.length > 0) {
    res.status(400).json({
      error: `Columnas no válidas: ${invalidColumns.join(', ')}`,
      available: Object.keys(COLUMN_CATALOG),
    });
    return;
  }

  // Always ensure COD_ARTICULO is present and first
  const columns = requestedColumns.includes('COD_ARTICULO')
    ? ['COD_ARTICULO', ...requestedColumns.filter(c => c !== 'COD_ARTICULO')]
    : ['COD_ARTICULO', ...requestedColumns];

  // Filters
  const filterCapas = req.query.capa
    ? String(req.query.capa).split(',').map(c => parseInt(c.trim(), 10)).filter(n => !isNaN(n))
    : null;
  const filterConfidenceMin = req.query.confidence_min !== undefined
    ? parseFloat(String(req.query.confidence_min))
    : null;
  const filterTipo = req.query.tipo ? String(req.query.tipo).toLowerCase() : null;

  // --- Load source data ---
  const DATA_DIR = path.resolve(process.cwd(), 'data');
  const stage8File = path.join(DATA_DIR, jobId, 'stage8_logistics.json');
  if (!fs.existsSync(stage8File)) {
    res.status(400).json({ error: 'Stage 8 (logística) no ejecutado. Ejecuta el pipeline completo primero.' });
    return;
  }

  const stage4File = path.join(DATA_DIR, jobId, 'stage4_enriched.json');
  const stage5File = path.join(DATA_DIR, jobId, 'stage5_cleaned.json');
  let productsSrc: any[] = [];
  if (fs.existsSync(stage5File)) {
    const s5 = JSON.parse(fs.readFileSync(stage5File, 'utf-8'));
    productsSrc = s5.products || [];
  } else if (fs.existsSync(stage4File)) {
    const s4 = JSON.parse(fs.readFileSync(stage4File, 'utf-8'));
    productsSrc = s4.products || [];
  } else {
    res.status(400).json({ error: 'No hay datos de stage4/stage5. Ejecuta el pipeline primero.' });
    return;
  }

  const stage8Data = JSON.parse(fs.readFileSync(stage8File, 'utf-8'));
  const stage8Products: any[] = stage8Data.products || [];

  // Build product lookup map by COD.ARTICULO
  const productMap = new Map<string, any>();
  for (const p of productsSrc) {
    const cod = String(p['COD.ARTICULO'] || '');
    if (cod) productMap.set(cod, p);
  }

  // Capa computation
  const layerToCapa = (layer: string): number => {
    if (layer === 'erp_ground_truth') return 1;
    if (layer === 'gemini_embalaje') return 2;
    if (layer === 'ratio_subfamilia' || layer === 'ratio_tipo' || layer === 'ratio_subfamilia_corregido_fix4' || layer === 'ratio_desde_descripcion_fix5') return 3;
    if (layer === 'promedio_subfamilia' || layer === 'promedio_tipo' || layer === 'promedio_subfamilia_corregido') return 4;
    return 0;
  };

  // --- Build merged rows with filters ---
  const rows: Record<string, any>[] = [];
  for (const s8 of stage8Products) {
    const cod = String(s8['COD.ARTICULO'] || '');
    if (!cod) continue;

    const s4 = productMap.get(cod);

    // Apply filters
    if (filterCapas && filterCapas.length > 0) {
      const capa = layerToCapa(String(s8.estimation_layer || ''));
      if (!filterCapas.includes(capa)) continue;
    }
    if (filterConfidenceMin !== null && !isNaN(filterConfidenceMin)) {
      const conf = Number(s8.confidence ?? 0);
      if (conf < filterConfidenceMin) continue;
    }
    if (filterTipo) {
      const tipo = String(s4?.product_type || '').toLowerCase();
      if (tipo !== filterTipo) continue;
    }

    const row: Record<string, any> = {};
    for (const col of columns) {
      const extractor = COLUMN_CATALOG[col];
      const val = extractor({ cod, s4, s8 });
      row[col] = val;
    }
    rows.push(row);
  }

  // Sort by COD_ARTICULO ascending
  rows.sort((a, b) => String(a.COD_ARTICULO).localeCompare(String(b.COD_ARTICULO)));

  // --- Emit output ---
  if (format === 'csv') {
    const csvLines: string[] = [columns.join(',')];
    for (const row of rows) {
      const values = columns.map(col => {
        const val = row[col];
        if (val === null || val === undefined || val === '') return '';
        // Force text for COD_ARTICULO
        if (col === 'COD_ARTICULO') {
          return `="${String(val).replace(/"/g, '""')}"`;
        }
        const str = col === 'DESCRIPCION' || col === 'ESTIMATION_SOURCE'
          ? sanitizeText(val)
          : String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      csvLines.push(values.join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=medidator_${jobId}_custom.csv`);
    res.send(csvLines.join('\n'));
    return;
  }

  // XLSX output
  // Build an AOA (array of arrays) so we can set explicit cell types.
  const aoa: any[][] = [columns];
  for (const row of rows) {
    aoa.push(columns.map(col => {
      const v = row[col];
      if (col === 'DESCRIPCION' || col === 'ESTIMATION_SOURCE') return sanitizeText(v);
      return v === '' || v === null || v === undefined ? null : v;
    }));
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Force COD_ARTICULO column as text to preserve leading zeros.
  // COD_ARTICULO is always the first column (index 0).
  const codColIdx = columns.indexOf('COD_ARTICULO');
  if (codColIdx >= 0) {
    const colLetter = XLSX.utils.encode_col(codColIdx);
    // aoa row 0 is header, data rows start at 1
    for (let r = 1; r < aoa.length; r++) {
      const cellRef = `${colLetter}${r + 1}`;
      const cellValue = aoa[r][codColIdx];
      if (cellValue !== null && cellValue !== undefined) {
        ws[cellRef] = { t: 's', v: String(cellValue), z: '@' };
      }
    }
  }

  // Auto column widths
  const colWidths = columns.map(col => {
    let maxLen = col.length;
    for (let r = 1; r < aoa.length; r++) {
      const v = aoa[r][columns.indexOf(col)];
      if (v !== null && v !== undefined) {
        const len = String(v).length;
        if (len > maxLen) maxLen = len;
      }
    }
    return { wch: Math.min(Math.max(maxLen + 2, 10), 60) };
  });
  (ws as any)['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Medidator');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=medidator_${jobId}_custom.xlsx`);
  res.send(buffer);
});

// GET /jobs/:jobId/export/columns - list available columns for custom export
router.get('/:jobId/export/columns', (_req: Request, res: Response) => {
  res.json({
    columns: Object.keys(COLUMN_CATALOG),
    default: DEFAULT_COLUMNS,
    groups: {
      basicos: ['COD_ARTICULO', 'DESCRIPCION', 'FAMILIA', 'TIPO', 'EAN', 'PROVEEDOR', 'PROGRAMA', 'MARCA', 'LINEA'],
      medidas_producto: ['ANCHO_CM', 'ALTO_CM', 'PROFUNDIDAD_CM', 'VOLUMEN_PRODUCTO_M3', 'PESO_NETO_KG', 'PESO_BRUTO_KG'],
      logistica: ['VOLUMEN_PAQUETE_M3', 'BULTOS', 'CAPA', 'CONFIDENCE', 'ESTIMATION_SOURCE'],
      calidad: ['PARSE_CONFIDENCE', 'SOURCE', 'COMPOSITE', 'NUM_COMPONENTS', 'OUTLIER_WARNING', 'CATEGORY'],
    },
  });
});

export { router as jobsRouter };
