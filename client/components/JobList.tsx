import { Inbox, ChevronRight } from 'lucide-react';
import type { Job } from '../types';
import StageTimeline from './StageTimeline';

interface Props {
  jobs: Job[];
  loading: boolean;
  onSelectJob: (id: string) => void;
}

const statusBadge: Record<string, { style: string; label: string }> = {
  created: { style: 'bg-blue-50 text-blue-700', label: 'Creado' },
  ingested: { style: 'bg-purple-50 text-purple-700', label: 'Ingestado' },
  processing: { style: 'bg-amber-50 text-amber-700', label: 'Procesando' },
  completed: { style: 'bg-emerald-50 text-emerald-700', label: 'Completado' },
  error: { style: 'bg-red-50 text-red-700', label: 'Error' },
};

const statusDot: Record<string, string> = {
  created: 'bg-blue-500',
  ingested: 'bg-purple-500',
  processing: 'bg-amber-500',
  completed: 'bg-emerald-500',
  error: 'bg-red-500',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function JobList({ jobs, loading, onSelectJob }: Props) {
  if (loading) {
    return (
      <div className="bg-surface-card border border-border rounded-lg shadow-sm p-12 text-center">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-chs-primary rounded-full mx-auto mb-3" style={{ animation: 'spin 1s linear infinite' }} />
        <p className="text-text-secondary text-sm">Cargando jobs...</p>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="bg-surface-card border border-border rounded-lg shadow-sm p-12 text-center">
        <Inbox className="w-16 h-16 mx-auto text-gray-300 mb-3" strokeWidth={1} />
        <p className="text-text-secondary text-sm">No hay jobs. Sube un archivo Excel para empezar.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-card border border-border rounded-lg shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-base font-bold text-text-primary" style={{ fontFamily: 'var(--font-inter)' }}>
          Jobs ({jobs.length})
        </h2>
      </div>
      <div className="divide-y divide-gray-50">
        {jobs.map((job, i) => {
          const badge = statusBadge[job.status] || { style: 'bg-gray-100 text-gray-600', label: job.status };
          const dot = statusDot[job.status] || 'bg-gray-400';
          return (
            <div
              key={job.id}
              onClick={() => onSelectJob(job.id)}
              className={`chs-card px-5 py-4 cursor-pointer hover:bg-gray-50 animate-fade-in-up`}
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <code className="text-sm font-mono font-semibold text-chs-hover" style={{ fontFamily: 'var(--font-inter)' }}>
                    {job.id.length > 12 ? job.id.slice(0, 12) + '…' : job.id}
                  </code>
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[10px] font-semibold uppercase ${badge.style}`}
                    style={{ fontFamily: 'var(--font-inter)', letterSpacing: '0.5px' }}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                    {badge.label}
                  </span>
                </div>
                <span className="text-xs text-text-secondary">{formatDate(job.created_at)}</span>
              </div>
              <div className="flex items-center justify-between">
                <StageTimeline stages={job.stages} compact />
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
