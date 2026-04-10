import { useState, useEffect, useCallback } from 'react';
import { Play, Zap, Download, FileJson, Loader, Settings2 } from 'lucide-react';
import type { Job } from '../types';
import { STAGE_NAMES, STAGE_LABELS } from '../types';
import { fetchJob, runStage1, runPipeline, getExportUrl } from '../api';
import StageTimeline from './StageTimeline';
import ExportDialog from './ExportDialog';

interface Props {
  jobId: string;
  onBack: () => void;
  onJobUpdated: (job: Job) => void;
}

const statusBadge: Record<string, { style: string; label: string }> = {
  created: { style: 'bg-blue-50 text-blue-700', label: 'Creado' },
  ingested: { style: 'bg-purple-50 text-purple-700', label: 'Ingestado' },
  processing: { style: 'bg-amber-50 text-amber-700', label: 'Procesando' },
  completed: { style: 'bg-emerald-50 text-emerald-700', label: 'Completado' },
  error: { style: 'bg-red-50 text-red-700', label: 'Error' },
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
    <div className="mt-2 bg-surface rounded-md p-3 border border-border">
      <p className="text-[10px] font-semibold text-text-secondary uppercase mb-2"
        style={{ fontFamily: 'var(--font-inter)', letterSpacing: '1px' }}
      >
        Métricas
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {Object.entries(metrics).map(([key, value]) => (
          <div key={key} className="text-sm">
            <span className="text-text-secondary">{key}: </span>
            <span className="font-medium text-text-primary">
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
  const [showExportDialog, setShowExportDialog] = useState(false);

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
      <div className="bg-surface-card border border-border rounded-lg shadow-sm p-12 text-center">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-chs-primary rounded-full mx-auto mb-3" style={{ animation: 'spin 1s linear infinite' }} />
        <p className="text-text-secondary text-sm">Cargando job...</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="bg-surface-card border border-border rounded-lg shadow-sm p-8 text-center">
        <p className="text-text-secondary">Job no encontrado</p>
        <button onClick={onBack} className="mt-3 text-chs-hover text-sm font-medium hover:underline">
          Volver al dashboard
        </button>
      </div>
    );
  }

  const isRunning = running !== null;
  const canRunPipeline = job.status !== 'completed' && !isRunning;
  const canExport = job.status === 'completed' || job.stages.stage1_ingest_normalize.status === 'success';
  const badge = statusBadge[job.status] || { style: 'bg-gray-100 text-gray-600', label: job.status };

  return (
    <div className="space-y-4">
      {/* Job Header Card */}
      <div className="bg-surface-card border border-border rounded-lg shadow-sm p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl font-bold text-text-primary" style={{ fontFamily: 'var(--font-inter)' }}>
                Job {job.id}
              </h2>
              <span className={`px-2.5 py-0.5 rounded-sm text-[10px] font-bold uppercase ${badge.style}`}
                style={{ fontFamily: 'var(--font-inter)', letterSpacing: '0.5px' }}
              >
                {badge.label}
              </span>
            </div>
            <p className="text-sm text-text-secondary">{formatDate(job.created_at)}</p>
            {job.input_file_path && (
              <p className="text-xs text-text-muted mt-0.5">
                Archivo: {job.input_file_path.split('/').pop()}
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-md px-4 py-2 text-sm">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleRunStage1}
            disabled={isRunning || job.stages.stage1_ingest_normalize.status === 'success'}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              fontFamily: 'var(--font-inter)',
              background: 'linear-gradient(135deg, #0891B2, #0e7490)',
            }}
          >
            {running === 'stage1' ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {running === 'stage1' ? 'Ejecutando...' : 'Stage 1'}
          </button>

          <button
            onClick={handleRunPipeline}
            disabled={!canRunPipeline}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              fontFamily: 'var(--font-inter)',
              background: 'linear-gradient(135deg, #1565C0, #1976D2)',
              border: '1px solid rgba(21, 101, 192, 0.6)',
            }}
          >
            {running === 'pipeline' ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            {running === 'pipeline' ? 'Ejecutando...' : 'Pipeline Completo'}
          </button>

          {canExport && (
            <>
              <a
                href={getExportUrl(job.id, 'csv')}
                download
                className="inline-flex items-center gap-2 px-4 py-2 bg-surface border border-border text-text-primary rounded-md text-sm font-medium hover:bg-gray-100 transition-colors"
                style={{ fontFamily: 'var(--font-inter)' }}
              >
                <Download className="w-4 h-4" />
                CSV
              </a>
              <a
                href={getExportUrl(job.id, 'json')}
                download
                className="inline-flex items-center gap-2 px-4 py-2 bg-surface border border-border text-text-primary rounded-md text-sm font-medium hover:bg-gray-100 transition-colors"
                style={{ fontFamily: 'var(--font-inter)' }}
              >
                <FileJson className="w-4 h-4" />
                JSON
              </a>
              {job.stages.stage8_logistics?.status === 'success' && (
                <button
                  onClick={() => setShowExportDialog(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white transition-colors"
                  style={{
                    fontFamily: 'var(--font-inter)',
                    background: 'linear-gradient(135deg, #0891B2, #0e7490)',
                  }}
                >
                  <Settings2 className="w-4 h-4" />
                  Exportar personalizado
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {showExportDialog && (
        <ExportDialog jobId={job.id} onClose={() => setShowExportDialog(false)} />
      )}

      {/* Stage Progress */}
      <div className="bg-surface-card border border-border rounded-lg shadow-sm p-6">
        <StageTimeline stages={job.stages} />
      </div>

      {/* Stage Details */}
      <div className="bg-surface-card border border-border rounded-lg shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-base font-bold text-text-primary" style={{ fontFamily: 'var(--font-inter)' }}>
            Detalle de Stages
          </h3>
        </div>
        <div className="divide-y divide-gray-50">
          {STAGE_NAMES.map((name, i) => {
            const stage = job.stages[name];
            const statusColor = stage.status === 'success' ? 'bg-emerald-50 text-emerald-700' :
              stage.status === 'error' ? 'bg-red-50 text-red-700' :
              stage.status === 'processing' ? 'bg-amber-50 text-amber-700' :
              'bg-gray-100 text-gray-500';
            return (
              <div key={name} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-primary" style={{ fontFamily: 'var(--font-inter)' }}>
                    {i + 1}. {STAGE_LABELS[name]}
                  </span>
                  <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-sm ${statusColor}`}
                    style={{ fontFamily: 'var(--font-inter)', letterSpacing: '0.5px' }}
                  >
                    {stage.status}
                  </span>
                </div>
                {stage.error && (
                  <p className="mt-1 text-sm text-red-600">{stage.error}</p>
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
