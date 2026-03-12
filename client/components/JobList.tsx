import type { Job } from '../types';
import StageTimeline from './StageTimeline';

interface Props {
  jobs: Job[];
  loading: boolean;
  onSelectJob: (id: string) => void;
}

const statusStyles: Record<string, string> = {
  created: 'bg-chs-light text-chs-primary',
  ingested: 'bg-chs-purple-light text-chs-purple',
  processing: 'bg-chs-warning-light text-chs-warning',
  completed: 'bg-chs-success-light text-chs-success',
  error: 'bg-chs-error-light text-chs-error',
};

const statusLabels: Record<string, string> = {
  created: 'Creado',
  ingested: 'Ingestado',
  processing: 'Procesando',
  completed: 'Completado',
  error: 'Error',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', {
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
      <div className="bg-white rounded-xl shadow-sm p-12 text-center">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-chs-primary rounded-full mx-auto mb-3" style={{ animation: 'spin 1s linear infinite' }} />
        <p className="text-gray-500 text-sm">Cargando jobs...</p>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-12 text-center">
        <svg className="w-16 h-16 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <p className="text-gray-500 text-sm">No hay jobs. Sube un archivo Excel para empezar.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-lg font-semibold text-gray-800">Jobs ({jobs.length})</h2>
      </div>
      <div className="divide-y divide-gray-50">
        {jobs.map((job) => (
          <div
            key={job.id}
            onClick={() => onSelectJob(job.id)}
            className="px-5 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <code className="text-sm font-mono text-chs-primary font-semibold">
                  {job.id.slice(0, 12)}
                </code>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusStyles[job.status] || 'bg-gray-100 text-gray-600'}`}>
                  {statusLabels[job.status] || job.status}
                </span>
              </div>
              <span className="text-xs text-gray-400">{formatDate(job.created_at)}</span>
            </div>
            <div className="flex items-center justify-between">
              <StageTimeline stages={job.stages} compact />
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
