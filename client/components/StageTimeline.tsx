import { Check, X, Loader } from 'lucide-react';
import type { Stages } from '../types';
import { STAGE_NAMES, STAGE_LABELS } from '../types';

interface Props {
  stages: Stages;
  compact?: boolean;
}

const statusConfig = {
  pending: { dot: 'bg-gray-300', text: 'text-text-secondary', label: 'Pendiente', badge: 'bg-gray-100 text-gray-600' },
  processing: { dot: 'bg-amber-500', text: 'text-amber-600', label: 'Procesando', badge: 'bg-amber-50 text-amber-700' },
  success: { dot: 'bg-emerald-500', text: 'text-emerald-600', label: 'Completado', badge: 'bg-emerald-50 text-emerald-700' },
  error: { dot: 'bg-red-500', text: 'text-red-600', label: 'Error', badge: 'bg-red-50 text-red-700' },
};

export default function StageTimeline({ stages, compact = false }: Props) {
  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {STAGE_NAMES.map((name) => {
          const stage = stages[name];
          const cfg = statusConfig[stage.status];
          return (
            <div
              key={name}
              className={`w-2.5 h-2.5 rounded-full ${cfg.dot} ${stage.status === 'processing' ? 'animate-pulse' : ''}`}
              title={`${STAGE_LABELS[name]}: ${cfg.label}`}
            />
          );
        })}
      </div>
    );
  }

  const completedCount = STAGE_NAMES.filter((n) => stages[n].status === 'success').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-text-primary" style={{ fontFamily: 'var(--font-inter)' }}>
          Progreso del Pipeline
        </span>
        <span className="text-xs font-medium text-text-secondary" style={{ fontFamily: 'var(--font-inter)' }}>
          {completedCount}/{STAGE_NAMES.length} completados
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-100 rounded-full mb-5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${(completedCount / STAGE_NAMES.length) * 100}%`,
            background: 'linear-gradient(90deg, #0891B2, #22d3ee)',
          }}
        />
      </div>

      <div className="space-y-1">
        {STAGE_NAMES.map((name, i) => {
          const stage = stages[name];
          const cfg = statusConfig[stage.status];
          return (
            <div
              key={name}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                stage.status === 'success' ? 'bg-emerald-50/50' :
                stage.status === 'error' ? 'bg-red-50/50' :
                stage.status === 'processing' ? 'bg-amber-50/50' :
                'bg-transparent'
              }`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                stage.status === 'success' ? 'bg-emerald-500' :
                stage.status === 'error' ? 'bg-red-500' :
                stage.status === 'processing' ? 'bg-amber-500' :
                'bg-gray-200'
              }`}>
                {stage.status === 'success' && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                {stage.status === 'error' && <X className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                {stage.status === 'processing' && <Loader className="w-3.5 h-3.5 text-white animate-spin" />}
                {stage.status === 'pending' && (
                  <span className="text-xs font-bold text-gray-500" style={{ fontFamily: 'var(--font-inter)' }}>{i + 1}</span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <span
                  className={`text-sm font-medium ${stage.status === 'pending' ? 'text-text-muted' : 'text-text-primary'}`}
                  style={{ fontFamily: 'var(--font-inter)' }}
                >
                  {STAGE_LABELS[name]}
                </span>
              </div>

              <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-sm ${cfg.badge}`}
                style={{ fontFamily: 'var(--font-inter)', letterSpacing: '0.5px' }}
              >
                {cfg.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
