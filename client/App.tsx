import { useState, useEffect, useCallback } from 'react';
import type { Job } from './types';
import { fetchJobs, fetchHealth } from './api';
import StatsCards from './components/StatsCards';
import UploadForm from './components/UploadForm';
import JobList from './components/JobList';
import JobDetail from './components/JobDetail';

type View = { type: 'dashboard' } | { type: 'detail'; jobId: string };

export default function App() {
  const [view, setView] = useState<View>({ type: 'dashboard' });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverUp, setServerUp] = useState(true);

  const loadJobs = useCallback(async () => {
    try {
      const data = await fetchJobs();
      setJobs(data);
      setError(null);
      setServerUp(true);
    } catch (e: any) {
      setError(e.message);
      setServerUp(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
    const interval = setInterval(loadJobs, 5000);
    return () => clearInterval(interval);
  }, [loadJobs]);

  useEffect(() => {
    fetchHealth().then(() => setServerUp(true)).catch(() => setServerUp(false));
  }, []);

  const handleJobCreated = (job: Job) => {
    setJobs((prev) => [job, ...prev]);
  };

  const handleJobUpdated = (updated: Job) => {
    setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-chs-primary to-chs-dark">
      {/* Header */}
      <header className="px-4 pt-6 pb-2">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div
              className="flex items-center gap-3 cursor-pointer"
              onClick={() => setView({ type: 'dashboard' })}
            >
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Procesador de Medidas</h1>
                <p className="text-white/70 text-sm">Pipeline de Procesamiento Excel — CHS Platform</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${serverUp ? 'bg-green-400' : 'bg-red-400'}`} />
              <span className="text-white/80 text-sm">{serverUp ? 'Servidor activo' : 'Sin conexión'}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="px-4 py-4 pb-8">
        <div className="max-w-7xl mx-auto">
          {error && (
            <div className="mb-4 bg-chs-error-light border border-chs-error/20 text-chs-error rounded-xl px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {view.type === 'dashboard' ? (
            <div className="space-y-4">
              <StatsCards jobs={jobs} />
              <UploadForm onJobCreated={handleJobCreated} />
              <JobList
                jobs={jobs}
                loading={loading}
                onSelectJob={(id) => setView({ type: 'detail', jobId: id })}
              />
            </div>
          ) : (
            <JobDetail
              jobId={view.jobId}
              onBack={() => setView({ type: 'dashboard' })}
              onJobUpdated={handleJobUpdated}
            />
          )}
        </div>
      </main>
    </div>
  );
}
