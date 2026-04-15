import { useState, useEffect, useCallback } from 'react';
import { Ruler, Activity, ArrowLeft } from 'lucide-react';
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
    <div className="min-h-screen bg-surface">
      {/* CHS Platform home button — fixed, always visible */}
      <a
        href="https://platform.centrohogarsanchez.es"
        title="Volver a CHS Platform"
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          padding: '8px 14px',
          background: '#fff',
          border: '1.5px solid #E2E8F0',
          borderRadius: '10px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.09)',
          textDecoration: 'none',
          fontFamily: "'Outfit', 'Inter', Arial, sans-serif",
          fontSize: '13px',
          fontWeight: 600,
          color: '#1E3A5F',
          letterSpacing: '0.01em',
          transition: 'all 0.18s',
        }}
        onMouseOver={e => {
          const el = e.currentTarget;
          el.style.background = '#EFF6FF';
          el.style.borderColor = '#2563EB';
          el.style.boxShadow = '0 4px 14px rgba(37,99,235,0.16)';
        }}
        onMouseOut={e => {
          const el = e.currentTarget;
          el.style.background = '#fff';
          el.style.borderColor = '#E2E8F0';
          el.style.boxShadow = '0 2px 10px rgba(0,0,0,0.09)';
        }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        CHS
      </a>

      {/* Hero Header */}
      <div className="chs-hero-gradient relative overflow-hidden">
        <div className="dot-pattern absolute inset-0" />
        <div className="relative max-w-7xl mx-auto px-6 pt-8 pb-14">
          <div className="flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-4">
              {view.type === 'detail' ? (
                <button
                  onClick={() => setView({ type: 'dashboard' })}
                  className="w-12 h-12 rounded-md flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-white" />
                </button>
              ) : (
                <div
                  className="w-12 h-12 rounded-md flex items-center justify-center shadow-lg"
                  style={{ background: 'linear-gradient(135deg, #22d3ee 0%, #0e7490 100%)' }}
                >
                  <Ruler className="w-6 h-6 text-white" />
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'var(--font-inter)' }}>
                  {view.type === 'detail' ? 'Detalle de Job' : 'Procesador de Medidas'}
                </h1>
                <p className="text-white/60 text-sm mt-0.5">
                  Pipeline de procesamiento Excel — CHS Platform
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                {serverUp && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                )}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${serverUp ? 'bg-green-500' : 'bg-red-500'}`} />
              </span>
              <span className="text-white/60 text-xs font-medium" style={{ fontFamily: 'var(--font-inter)', letterSpacing: '0.5px' }}>
                {serverUp ? 'Servidor activo' : 'Sin conexión'}
              </span>
            </div>
          </div>

          {/* Glass Stats (only on dashboard) */}
          {view.type === 'dashboard' && (
            <div className="mt-6 animate-fade-in-up stagger-2">
              <StatsCards jobs={jobs} />
            </div>
          )}
        </div>
      </div>

      {/* Content - overlaps hero */}
      <main className="max-w-7xl mx-auto px-6 -mt-6 relative z-20 pb-8">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm animate-slide-down" style={{ fontFamily: 'var(--font-inter)' }}>
            {error}
          </div>
        )}

        {view.type === 'dashboard' ? (
          <div className="space-y-5">
            <div className="animate-fade-in-up stagger-3">
              <UploadForm onJobCreated={handleJobCreated} />
            </div>
            <div className="animate-fade-in-up stagger-4">
              <JobList
                jobs={jobs}
                loading={loading}
                onSelectJob={(id) => setView({ type: 'detail', jobId: id })}
              />
            </div>
          </div>
        ) : (
          <div className="animate-fade-in-up">
            <JobDetail
              jobId={view.jobId}
              onBack={() => setView({ type: 'dashboard' })}
              onJobUpdated={handleJobUpdated}
            />
          </div>
        )}
      </main>
    </div>
  );
}
