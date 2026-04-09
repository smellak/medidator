import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { requireCHS } from '../middleware/chs-auth';
import { store } from '../db/memory-store';
import { STAGE_NAMES } from '../types/job';

const router = Router();
const DATA_DIR = path.resolve(process.cwd(), 'data');

interface AgentRequest {
  capability: string;
  parameters: Record<string, any>;
}

interface AgentResponse {
  text: string;
  success: boolean;
  data?: any;
  error?: string;
}

const CAPABILITIES = [
  'listar_jobs',
  'ver_job',
  'ver_metricas_stage1',
  'estadisticas_generales',
  'ver_estadisticas_job',
  'ver_outliers',
  'ver_productos_sin_medidas',
];

router.post('/agent', requireCHS, async (req: Request, res: Response) => {
  const { capability, parameters } = req.body as AgentRequest;

  if (!capability) {
    const response: AgentResponse = {
      text: 'No se especificó la capability',
      success: false,
      error: 'MISSING_CAPABILITY',
    };
    res.status(400).json(response);
    return;
  }

  try {
    let result: AgentResponse;

    switch (capability) {
      case 'listar_jobs':
        result = handleListarJobs(parameters);
        break;
      case 'ver_job':
        result = handleVerJob(parameters);
        break;
      case 'ver_metricas_stage1':
        result = handleVerMetricasStage1(parameters);
        break;
      case 'estadisticas_generales':
        result = handleEstadisticasGenerales();
        break;
      case 'ver_estadisticas_job':
        result = handleVerEstadisticasJob(parameters);
        break;
      case 'ver_outliers':
        result = handleVerOutliers(parameters);
        break;
      case 'ver_productos_sin_medidas':
        result = handleVerProductosSinMedidas(parameters);
        break;
      default:
        result = {
          text: `Capability '${capability}' no reconocida. Capabilities disponibles: ${CAPABILITIES.join(', ')}`,
          success: false,
          error: 'UNKNOWN_CAPABILITY',
        };
    }

    res.json(result);
  } catch (err: any) {
    const response: AgentResponse = {
      text: `Error interno: ${err.message}`,
      success: false,
      error: 'INTERNAL_ERROR',
    };
    res.status(500).json(response);
  }
});

function handleListarJobs(params: Record<string, any>): AgentResponse {
  const limite = params.limite || 20;
  const allJobs = store.getAllJobs();
  const jobs = allJobs.slice(0, limite);

  if (jobs.length === 0) {
    return {
      text: 'No hay jobs de procesamiento de medidas registrados.',
      success: true,
      data: { jobs: [], total: 0 },
    };
  }

  const jobSummaries = jobs.map(job => {
    const stagesCompleted = STAGE_NAMES.filter(
      s => job.stages[s].status === 'success'
    ).length;

    return {
      id: job.id,
      status: job.status,
      created_at: job.created_at,
      stages_completados: stagesCompleted,
      stages_total: STAGE_NAMES.length,
    };
  });

  const lines = jobSummaries.map(j =>
    `- Job ${j.id}: ${j.status} (${j.stages_completados}/${STAGE_NAMES.length} stages) - Creado: ${new Date(j.created_at).toLocaleString('es-ES')}`
  );

  return {
    text: `Se encontraron ${allJobs.length} jobs en total. Mostrando ${jobs.length}:\n\n${lines.join('\n')}`,
    success: true,
    data: { jobs: jobSummaries, total: allJobs.length },
  };
}

function handleVerJob(params: Record<string, any>): AgentResponse {
  const { jobId } = params;
  if (!jobId) {
    return {
      text: 'Se requiere el parámetro jobId',
      success: false,
      error: 'MISSING_PARAM',
    };
  }

  const job = store.getJob(jobId);
  if (!job) {
    return {
      text: `Job '${jobId}' no encontrado`,
      success: false,
      error: 'JOB_NOT_FOUND',
    };
  }

  const stageLines = STAGE_NAMES.map((name, idx) => {
    const stage = job.stages[name];
    const metricsStr = stage.metrics
      ? ` | Métricas: ${JSON.stringify(stage.metrics)}`
      : '';
    const errorStr = stage.error ? ` | Error: ${stage.error}` : '';
    return `  Stage ${idx + 1} (${name}): ${stage.status}${metricsStr}${errorStr}`;
  });

  return {
    text: `**Job ${job.id}**\n- Estado: ${job.status}\n- Creado: ${new Date(job.created_at).toLocaleString('es-ES')}\n- Archivo: ${job.input_file_path}\n\n**Stages:**\n${stageLines.join('\n')}`,
    success: true,
    data: {
      id: job.id,
      status: job.status,
      created_at: job.created_at,
      input_file_path: job.input_file_path,
      stages: job.stages,
      summary: job.summary,
    },
  };
}

function handleVerMetricasStage1(params: Record<string, any>): AgentResponse {
  const { jobId } = params;
  if (!jobId) {
    return {
      text: 'Se requiere el parámetro jobId',
      success: false,
      error: 'MISSING_PARAM',
    };
  }

  const job = store.getJob(jobId);
  if (!job) {
    return {
      text: `Job '${jobId}' no encontrado`,
      success: false,
      error: 'JOB_NOT_FOUND',
    };
  }

  const stage1File = path.join(DATA_DIR, jobId, 'stage1_base.json');
  if (!fs.existsSync(stage1File)) {
    return {
      text: `El Stage 1 del job '${jobId}' no se ha ejecutado todavía. No hay datos de ingesta disponibles.`,
      success: false,
      error: 'STAGE1_NOT_EXECUTED',
    };
  }

  try {
    const data = JSON.parse(fs.readFileSync(stage1File, 'utf-8'));
    const totalRows = Array.isArray(data) ? data.length : 0;
    const columns = totalRows > 0 ? Object.keys(data[0]) : [];
    const preview = Array.isArray(data) ? data.slice(0, 5) : [];

    return {
      text: `**Métricas del Stage 1 (Ingesta) - Job ${jobId}:**\n- Total de filas: ${totalRows}\n- Columnas (${columns.length}): ${columns.join(', ')}\n- Preview: primeras 5 filas incluidas en data`,
      success: true,
      data: {
        totalRows,
        columns,
        columnsCount: columns.length,
        preview,
      },
    };
  } catch (err: any) {
    return {
      text: `Error leyendo datos del Stage 1: ${err.message}`,
      success: false,
      error: 'READ_ERROR',
    };
  }
}

function handleEstadisticasGenerales(): AgentResponse {
  const allJobs = store.getAllJobs();
  const total = allJobs.length;

  const byStatus = {
    created: 0,
    ingested: 0,
    processing: 0,
    completed: 0,
    error: 0,
  };

  for (const job of allJobs) {
    if (job.status in byStatus) {
      byStatus[job.status as keyof typeof byStatus]++;
    }
  }

  const lastJob = allJobs.length > 0 ? allJobs[0] : null;
  const lastJobInfo = lastJob
    ? `${lastJob.id} (${lastJob.status}, ${new Date(lastJob.created_at).toLocaleString('es-ES')})`
    : 'Ninguno';

  return {
    text: `**Estadísticas del Procesador de Medidas:**\n- Total de jobs: ${total}\n- Completados: ${byStatus.completed}\n- En proceso: ${byStatus.processing}\n- Ingesta realizada: ${byStatus.ingested}\n- Creados (sin procesar): ${byStatus.created}\n- Con error: ${byStatus.error}\n- Último job: ${lastJobInfo}`,
    success: true,
    data: {
      total,
      byStatus,
      lastJob: lastJob
        ? { id: lastJob.id, status: lastJob.status, created_at: lastJob.created_at }
        : null,
    },
  };
}

function handleVerEstadisticasJob(params: Record<string, any>): AgentResponse {
  const { jobId } = params;
  if (!jobId) {
    return { text: 'Se requiere el parámetro jobId', success: false, error: 'MISSING_PARAM' };
  }

  const statsFile = path.join(DATA_DIR, jobId, 'stage7_stats.json');
  if (!fs.existsSync(statsFile)) {
    return {
      text: `El Stage 7 (Estadísticas) del job '${jobId}' no se ha ejecutado todavía.`,
      success: false,
      error: 'STAGE7_NOT_EXECUTED',
    };
  }

  try {
    const stats = JSON.parse(fs.readFileSync(statsFile, 'utf-8'));
    const c = stats.coverage || {};
    const q = stats.quality || {};

    const lines = [
      `**Estadísticas del Job ${jobId}:**`,
      ``,
      `**Cobertura:**`,
      `- Con medidas parseadas: ${c.with_parsed_measures?.count || 0} (${c.with_parsed_measures?.pct || 0}%)`,
      `- Con todas las dimensiones: ${c.with_all_dimensions?.count || 0} (${c.with_all_dimensions?.pct || 0}%)`,
      `- Con peso: ${c.with_weight?.count || 0} (${c.with_weight?.pct || 0}%)`,
      `- Compuestos: ${c.composites?.count || 0} (${c.composites?.pct || 0}%)`,
      ``,
      `**Calidad:**`,
      `- Outliers detectados: ${q.outliers_detected || 0}`,
      `- Productos excluidos: ${q.products_excluded || 0}`,
      `- Tasa de parseo exitoso: ${q.parse_success_rate || 0}%`,
      `- Confianza promedio: ${q.avg_confidence || 0}`,
    ];

    // Add distribution summaries
    if (stats.distributions) {
      lines.push('', '**Distribuciones (mediana):**');
      for (const [dim, data] of Object.entries(stats.distributions) as any[]) {
        lines.push(`- ${dim}: mediana=${data.median}, rango=${data.min}-${data.max}, avg=${data.avg}`);
      }
    }

    return {
      text: lines.join('\n'),
      success: true,
      data: stats,
    };
  } catch (err: any) {
    return { text: `Error leyendo estadísticas: ${err.message}`, success: false, error: 'READ_ERROR' };
  }
}

function handleVerOutliers(params: Record<string, any>): AgentResponse {
  const { jobId } = params;
  if (!jobId) {
    return { text: 'Se requiere el parámetro jobId', success: false, error: 'MISSING_PARAM' };
  }

  const stage5File = path.join(DATA_DIR, jobId, 'stage5_cleaned.json');
  if (!fs.existsSync(stage5File)) {
    return {
      text: `El Stage 5 (Outliers) del job '${jobId}' no se ha ejecutado todavía.`,
      success: false,
      error: 'STAGE5_NOT_EXECUTED',
    };
  }

  try {
    const data = JSON.parse(fs.readFileSync(stage5File, 'utf-8'));
    const outliers = data.outliers || [];
    const summary = data.summary || {};
    const limite = params.limite || 20;

    const lines = [
      `**Outliers del Job ${jobId}:**`,
      `- Total detectados: ${summary.outlier_count || outliers.length}`,
      `- Productos excluidos (ERROR): ${summary.excluded || 0}`,
      `- Productos con warnings: ${summary.warnings || 0}`,
      '',
      '**Por regla:**',
    ];

    if (summary.by_rule) {
      for (const [rule, count] of Object.entries(summary.by_rule)) {
        lines.push(`- ${rule}: ${count}`);
      }
    }

    lines.push('', `**Primeros ${Math.min(limite, outliers.length)} outliers:**`);
    for (const o of outliers.slice(0, limite)) {
      lines.push(`- ${o['COD.ARTICULO']}: ${o.rule} ${o.field}=${o.value} (${o.severity}) — ${o.detail}`);
    }

    return {
      text: lines.join('\n'),
      success: true,
      data: {
        summary,
        outliers: outliers.slice(0, limite),
        total_outliers: outliers.length,
      },
    };
  } catch (err: any) {
    return { text: `Error leyendo outliers: ${err.message}`, success: false, error: 'READ_ERROR' };
  }
}

function handleVerProductosSinMedidas(params: Record<string, any>): AgentResponse {
  const { jobId } = params;
  if (!jobId) {
    return { text: 'Se requiere el parámetro jobId', success: false, error: 'MISSING_PARAM' };
  }

  // Try stage5 first (cleaned data), then stage4, then stage3
  const files = ['stage5_cleaned.json', 'stage4_enriched.json', 'stage3_normalized.json'];
  let products: any[] = [];

  for (const f of files) {
    const fp = path.join(DATA_DIR, jobId, f);
    if (fs.existsSync(fp)) {
      const data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
      products = data.products || [];
      break;
    }
  }

  if (products.length === 0) {
    return {
      text: `No hay datos procesados para el job '${jobId}'. Ejecuta el pipeline primero.`,
      success: false,
      error: 'NO_DATA',
    };
  }

  const limite = params.limite || 20;
  const sinMedidas = products.filter((p: any) =>
    p.measures?.ancho_cm === null && p.measures?.alto_cm === null && p.measures?.profundidad_cm === null
  );

  const sample = sinMedidas.slice(0, limite).map((p: any) => ({
    cod: p['COD.ARTICULO'],
    descripcion: p.original?.['Descripcion del proveedor'] || '',
    familia: p.original?.['FAMILIA'] || '',
    category: p.category || '',
  }));

  const lines = [
    `**Productos sin medidas del Job ${jobId}:**`,
    `- Total sin medidas: ${sinMedidas.length} de ${products.length} (${Math.round(sinMedidas.length / products.length * 1000) / 10}%)`,
    '',
    `**Primeros ${sample.length}:**`,
  ];

  for (const p of sample) {
    lines.push(`- ${p.cod}: ${p.descripcion.substring(0, 60)} (${p.category})`);
  }

  return {
    text: lines.join('\n'),
    success: true,
    data: {
      total_sin_medidas: sinMedidas.length,
      total_productos: products.length,
      productos: sample,
    },
  };
}

export { router as agentRouter };
