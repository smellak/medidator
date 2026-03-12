import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { store } from '../db/memory-store';
import { executeStage1 } from '../services/stage1';

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
    const updatedJob = store.getJob(jobId);
    res.json(updatedJob);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /jobs/:jobId/run - Execute pipeline (stage1 only for now)
router.post('/:jobId/run', async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = store.getJob(jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  try {
    // Only stage 1 implemented for now
    if (job.stages.stage1_ingest_normalize.status !== 'success') {
      await executeStage1(jobId);
    }
    const updatedJob = store.getJob(jobId);
    res.json(updatedJob);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /jobs/:jobId/export - Export results
router.get('/:jobId/export', (req: Request, res: Response) => {
  const { jobId } = req.params;
  const format = (req.query.format as string) || 'json';
  const job = store.getJob(jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  // Find the latest stage output file
  const DATA_DIR = path.resolve(process.cwd(), 'data');
  const possibleFiles = [
    'stage7_final.json',
    'stage6_main_clean.json',
    'stage5_clean.json',
    'stage4_enriched.json',
    'stage3_medidas_normalizadas.json',
    'stage2_paquete_estimable.json',
    'stage1_base.json',
  ];

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

  if (format === 'csv' && Array.isArray(data) && data.length > 0) {
    const headers = Object.keys(data[0]);
    const csvLines = [headers.join(',')];
    for (const row of data) {
      const values = headers.map(h => {
        const val = row[h];
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
