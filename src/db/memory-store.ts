import { Job, createInitialStages } from '../types/job';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');

class MemoryStore {
  private jobs: Map<string, Job> = new Map();

  constructor() {
    this.loadExistingJobs();
  }

  /**
   * Scan data/ and uploads/ directories to reconstruct jobs from existing files.
   */
  private loadExistingJobs(): void {
    if (!fs.existsSync(DATA_DIR)) return;

    const jobDirs = fs.readdirSync(DATA_DIR).filter(d => {
      return fs.statSync(path.join(DATA_DIR, d)).isDirectory();
    });

    for (const jobId of jobDirs) {
      const jobDataPath = path.join(DATA_DIR, jobId);
      const uploadsPath = path.resolve(process.cwd(), 'uploads', jobId);

      const stages = createInitialStages();
      let status: Job['status'] = 'created';

      // Check which stage files exist and mark them as success
      const stageFiles: Record<string, string[]> = {
        stage1_ingest_normalize: ['stage1_base.json'],
        stage2_paquete_estimable: ['stage2_estimable.json', 'stage2_paquete_estimable.json'],
        stage3_normalize_measures: ['stage3_normalized.json', 'stage3_medidas_normalizadas.json'],
        stage4_ia_enrichment: ['stage4_enriched.json'],
        stage5_outliers_clean: ['stage5_cleaned.json', 'stage5_clean.json'],
        stage6_filter_sets: ['stage6_sets.json', 'stage6_main_clean.json'],
        stage7_stats: ['stage7_stats.json', 'stage7_final.json'],
        stage8_logistics: ['stage8_logistics.json'],
      };

      let lastCompletedStage = 0;
      for (const [stageName, fileNames] of Object.entries(stageFiles)) {
        let found = false;
        for (const fileName of fileNames) {
          const filePath = path.join(jobDataPath, fileName);
          if (fs.existsSync(filePath)) {
            (stages as any)[stageName].status = 'success';

            // Try to load basic metrics
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              if (Array.isArray(data)) {
                (stages as any)[stageName].metrics = { totalRows: data.length };
              } else if (data.summary) {
                (stages as any)[stageName].metrics = data.summary;
              }
            } catch {
              // ignore parsing errors
            }

            found = true;
            break;
          }
        }
        if (found) lastCompletedStage++;
      }

      // Determine job status based on completed stages
      if (lastCompletedStage === 8) {
        status = 'completed';
      } else if (lastCompletedStage > 0) {
        status = 'ingested';
      }

      // Try to get created_at from directory stat
      let createdAt: string;
      try {
        const stat = fs.statSync(jobDataPath);
        createdAt = stat.birthtime.toISOString();
      } catch {
        createdAt = new Date().toISOString();
      }

      // Build input_file_path
      let inputFilePath = '';
      if (fs.existsSync(uploadsPath)) {
        const files = fs.readdirSync(uploadsPath);
        const xlsxFile = files.find(f => f.endsWith('.xlsx') || f.endsWith('.xls'));
        if (xlsxFile) {
          inputFilePath = path.join('uploads', jobId, xlsxFile);
        }
      }

      // Load summary if stage7 stats exist
      let summary = null;
      const statsGlobalPath = path.join(jobDataPath, 'stage7_stats_global.json');
      if (fs.existsSync(statsGlobalPath)) {
        try {
          summary = JSON.parse(fs.readFileSync(statsGlobalPath, 'utf-8'));
        } catch {
          // ignore
        }
      }

      const job: Job = {
        id: jobId,
        created_at: createdAt,
        status,
        input_file_path: inputFilePath,
        stages,
        summary,
      };

      this.jobs.set(jobId, job);
    }

    console.log(`[MemoryStore] Loaded ${this.jobs.size} existing jobs from disk`);
  }

  createJob(id: string, inputFilePath: string): Job {
    const job: Job = {
      id,
      created_at: new Date().toISOString(),
      status: 'created',
      input_file_path: inputFilePath,
      stages: createInitialStages(),
      summary: null,
    };
    this.jobs.set(id, job);
    return job;
  }

  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  updateJob(id: string, updates: Partial<Job>): Job | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    Object.assign(job, updates);
    return job;
  }

  getAllJobs(): Job[] {
    return Array.from(this.jobs.values())
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  getJobCount(): number {
    return this.jobs.size;
  }

  getJobsByStatus(status: Job['status']): Job[] {
    return this.getAllJobs().filter(j => j.status === status);
  }

  /**
   * Re-scan data/ directory and load any new jobs not yet in memory.
   * Returns the number of newly discovered jobs.
   */
  reloadFromDisk(): number {
    const before = this.jobs.size;
    this.loadExistingJobs();
    return this.jobs.size - before;
  }
}

export const store = new MemoryStore();
