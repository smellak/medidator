import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { store } from '../db/memory-store';

const DATA_DIR = path.resolve(process.cwd(), 'data');

export async function executeStage1(jobId: string): Promise<void> {
  const job = store.getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  // Mark stage as processing
  job.stages.stage1_ingest_normalize.status = 'processing';
  job.status = 'processing';
  store.updateJob(jobId, job);

  try {
    const inputPath = path.resolve(process.cwd(), job.input_file_path);
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file not found: ${job.input_file_path}`);
    }

    // Read Excel
    const workbook = XLSX.readFile(inputPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convert to JSON
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);

    // Get file stats
    const fileStat = fs.statSync(inputPath);

    // Get column names
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    // Ensure data directory exists
    const jobDataDir = path.join(DATA_DIR, jobId);
    if (!fs.existsSync(jobDataDir)) {
      fs.mkdirSync(jobDataDir, { recursive: true });
    }

    // Write stage1 output
    const outputPath = path.join(jobDataDir, 'stage1_base.json');
    fs.writeFileSync(outputPath, JSON.stringify(rows, null, 2));

    // Update metrics
    job.stages.stage1_ingest_normalize.status = 'success';
    job.stages.stage1_ingest_normalize.metrics = {
      totalRows: rows.length,
      columns,
      fileSizeBytes: fileStat.size,
    };
    job.status = 'ingested';
    store.updateJob(jobId, job);
  } catch (err: any) {
    job.stages.stage1_ingest_normalize.status = 'error';
    job.stages.stage1_ingest_normalize.error = err.message;
    job.status = 'error';
    store.updateJob(jobId, job);
    throw err;
  }
}
