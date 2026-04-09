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
  stage8_logistics: Stage;
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
  'stage8_logistics',
] as const;

export type StageName = (typeof STAGE_NAMES)[number];

export const STAGE_LABELS: Record<StageName, string> = {
  stage1_ingest_normalize: 'Ingesta y Normalización',
  stage2_paquete_estimable: 'Paquete Estimable',
  stage3_normalize_measures: 'Normalizar Medidas',
  stage4_ia_enrichment: 'Enriquecimiento IA',
  stage5_outliers_clean: 'Limpieza Outliers',
  stage6_filter_sets: 'Filtrar Sets',
  stage7_stats: 'Estadísticas',
  stage8_logistics: 'Volumen Logístico',
};

export interface HealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
}
