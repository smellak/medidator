import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
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

    // Filter products with m3_logistico > 0, sort by COD_ARTICULO
    const sanitize = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();
    const rows = logisticsProducts
      .filter(p => p.m3_logistico !== null && p.m3_logistico !== undefined && Number(p.m3_logistico) > 0)
      .map(p => {
        const cod = String(p['COD.ARTICULO'] || '');
        return {
          COD_ARTICULO: cod,
          DESCRIPCION: sanitize(descMap[cod] || ''),
          VOLUMEN_PAQUETE_M3: Number(p.m3_logistico),
        };
      })
      .sort((a, b) => a.COD_ARTICULO.localeCompare(b.COD_ARTICULO));

    const headers = ['COD_ARTICULO', 'DESCRIPCION', 'VOLUMEN_PAQUETE_M3'];
    const csvLines = [headers.join(',')];
    for (const row of rows) {
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

export { router as jobsRouter };
