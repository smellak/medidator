export interface StageMetrics {
  [key: string]: any;
}

export interface Stage {
  status: 'pending' | 'processing' | 'success' | 'error';
  metrics: StageMetrics | null;
  error?: string;
}

export interface Stages {
  stage1_ingest_normalize: Stage;
  stage2_paquete_estimable: Stage;
  stage3_normalize_measures: Stage;
  stage4_ia_enrichment: Stage;
  stage5_outliers_clean: Stage;
  stage6_filter_sets: Stage;
  stage7_stats: Stage;
}

export interface Job {
  id: string;
  created_at: string;
  status: 'created' | 'ingested' | 'processing' | 'completed' | 'error';
  input_file_path: string;
  stages: Stages;
  summary: any | null;
}

export const STAGE_NAMES = [
  'stage1_ingest_normalize',
  'stage2_paquete_estimable',
  'stage3_normalize_measures',
  'stage4_ia_enrichment',
  'stage5_outliers_clean',
  'stage6_filter_sets',
  'stage7_stats',
] as const;

export type StageName = typeof STAGE_NAMES[number];

export function createInitialStages(): Stages {
  return {
    stage1_ingest_normalize: { status: 'pending', metrics: null },
    stage2_paquete_estimable: { status: 'pending', metrics: null },
    stage3_normalize_measures: { status: 'pending', metrics: null },
    stage4_ia_enrichment: { status: 'pending', metrics: null },
    stage5_outliers_clean: { status: 'pending', metrics: null },
    stage6_filter_sets: { status: 'pending', metrics: null },
    stage7_stats: { status: 'pending', metrics: null },
  };
}
