import { useState, useEffect, useCallback } from 'react';
import type { Job } from '../types';
import { STAGE_NAMES, STAGE_LABELS } from '../types';
import { fetchJob, runStage1, runPipeline, getExportUrl } from '../api';
import StageTimeline from './StageTimeline';

interface Props {
  jobId: string;
  onBack: () => void;
  onJobUpdated: (job: Job) => void;
}

const statusStyles: Record<string, string> = {
  created: 'bg-chs-light text-chs-primary',
  ingested: 'bg-chs-purple-light text-chs-purple',
  processing: 'bg-chs-warning-light text-chs-warning',
  completed: 'bg-chs-success-light text-chs-success',
  error: 'bg-chs-error-light text-chs-error',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function MetricsDisplay({ metrics }: { metrics: Record<string, any> | null }) {
  if (!metrics || Object.keys(metrics).length === 0) return null;
  return (
    <div className="mt-2 bg-gray-50 rounded-lg p-3">
      <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Métricas</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {Object.entries(metrics).map(([key, value]) => (
          <div key={key} className="text-sm">
            <span className="text-gray-500">{key}: </span>
            <span className="font-medium text-gray-800">
              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function JobDetail({ jobId, onBack, onJobUpdated }: Props) {
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadJob = useCallback(async () => {
    try {
      const data = await fetchJob(jobId);
      setJob(data);
      onJobUpdated(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [jobId, onJobUpdated]);

  useEffect(() => {
    loadJob();
    const interval = setInterval(loadJob, 3000);
    return () => clearInterval(interval);
  }, [loadJob]);

  const handleRunStage1 = async () => {
    if (!job) return;
    setRunning('stage1');
    setError(null);
    try {
      const updated = await runStage1(job.id);
      setJob(updated);
      onJobUpdated(updated);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(null);
    }
  };

  const handleRunPipeline = async () => {
    if (!job) return;
    setRunning('pipeline');
    setError(null);
    try {
      const updated = await runPipeline(job.id);
      setJob(updated);
      onJobUpdated(updated);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-12 text-center">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-chs-primary rounded-full mx-auto mb-3" style={{ animation: 'spin 1s linear infinite' }} />
        <p className="text-gray-500 text-sm">Cargando job...</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-8 text-center">
        <p className="text-gray-500">Job no encontrado</p>
        <button onClick={onBack} className="mt-3 text-chs-primary text-sm font-medium hover:underline">
          Volver al dashboard
        </button>
      </div>
    );
  }

  const isRunning = running !== null;
  const canRunPipeline = job.status !== 'completed' && !isRunning;
  const canExport = job.status === 'completed' || job.stages.stage1_ingest_normalize.status === 'success';

  return (
    <div className="space-y-4">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-white/80 hover:text-white text-sm font-medium transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Volver al dashboard
      </button>

      {/* Job Header */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl font-bold text-gray-800">Job {job.id}</h2>
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${statusStyles[job.status] || 'bg-gray-100 text-gray-600'}`}>
                {job.status}
              </span>
            </div>
            <p className="text-sm text-gray-500">Creado: {formatDate(job.created_at)}</p>
            {job.input_file_path && (
              <p className="text-sm text-gray-400 mt-0.5">Archivo: {job.input_file_path.split('/').pop()}</p>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 bg-chs-error-light border border-chs-error/20 text-chs-error rounded-lg px-4 py-2 text-sm">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleRunStage1}
            disabled={isRunning || job.stages.stage1_ingest_normalize.status === 'success'}
            className="px-4 py-2 bg-chs-primary text-white rounded-lg text-sm font-medium hover:bg-chs-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {running === 'stage1' ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full" style={{ animation: 'spin 1s linear infinite' }} />
                Ejecutando Stage 1...
              </span>
            ) : (
              'Ejecutar Stage 1'
            )}
          </button>

          <button
            onClick={handleRunPipeline}
            disabled={!canRunPipeline}
            className="px-4 py-2 bg-chs-success text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {running === 'pipeline' ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full" style={{ animation: 'spin 1s linear infinite' }} />
                Ejecutando Pipeline...
              </span>
            ) : (
              'Ejecutar Pipeline Completo'
            )}
          </button>

          {canExport && (
            <>
              <a
                href={getExportUrl(job.id, 'csv')}
                download
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                Exportar CSV
              </a>
              <a
                href={getExportUrl(job.id, 'json')}
                download
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                Exportar JSON
              </a>
            </>
          )}
        </div>
      </div>

      {/* Stage Progress */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <StageTimeline stages={job.stages} />
      </div>

      {/* Stage Details */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800">Detalle de Stages</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {STAGE_NAMES.map((name, i) => {
            const stage = job.stages[name];
            return (
              <div key={name} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    {i + 1}. {STAGE_LABELS[name]}
                  </span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    stage.status === 'success' ? 'bg-chs-success-light text-chs-success' :
                    stage.status === 'error' ? 'bg-chs-error-light text-chs-error' :
                    stage.status === 'processing' ? 'bg-chs-warning-light text-chs-warning' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {stage.status}
                  </span>
                </div>
                {stage.error && (
                  <p className="mt-1 text-sm text-chs-error">{stage.error}</p>
                )}
                <MetricsDisplay metrics={stage.metrics} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
