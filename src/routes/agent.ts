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
      default:
        result = {
          text: `Capability '${capability}' no reconocida. Capabilities disponibles: listar_jobs, ver_job, ver_metricas_stage1, estadisticas_generales`,
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
      stages_total: 7,
    };
  });

  const lines = jobSummaries.map(j =>
    `- Job ${j.id}: ${j.status} (${j.stages_completados}/7 stages) - Creado: ${new Date(j.created_at).toLocaleString('es-ES')}`
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

export { router as agentRouter };
