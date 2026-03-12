import type { Stages, StageName } from '../types';
import { STAGE_NAMES, STAGE_LABELS } from '../types';

interface Props {
  stages: Stages;
  compact?: boolean;
}

const statusConfig = {
  pending: { color: 'bg-gray-200', ring: 'ring-gray-300', text: 'text-gray-500', label: 'Pendiente' },
  processing: { color: 'bg-chs-warning', ring: 'ring-chs-warning/30', text: 'text-chs-warning', label: 'Procesando' },
  success: { color: 'bg-chs-success', ring: 'ring-chs-success/30', text: 'text-chs-success', label: 'Completado' },
  error: { color: 'bg-chs-error', ring: 'ring-chs-error/30', text: 'text-chs-error', label: 'Error' },
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
              className={`w-3 h-3 rounded-full ${cfg.color} ${stage.status === 'processing' ? 'animate-pulse' : ''}`}
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
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-600">Progreso del Pipeline</span>
        <span className="text-sm text-gray-500">{completedCount}/{STAGE_NAMES.length} stages</span>
      </div>

      <div className="space-y-2">
        {STAGE_NAMES.map((name, i) => {
          const stage = stages[name];
          const cfg = statusConfig[stage.status];
          return (
            <div key={name} className="flex items-center gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-6 h-6 rounded-full ${cfg.color} ${cfg.ring} ring-2 flex items-center justify-center flex-shrink-0`}>
                  {stage.status === 'success' && (
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {stage.status === 'error' && (
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  {stage.status === 'processing' && (
                    <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse" />
                  )}
                </div>
                {i < STAGE_NAMES.length - 1 && (
                  <div className={`w-0.5 h-3 ${stage.status === 'success' ? 'bg-chs-success' : 'bg-gray-200'}`} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${stage.status === 'pending' ? 'text-gray-400' : 'text-gray-700'}`}>
                    {i + 1}. {STAGE_LABELS[name]}
                  </span>
                  <span className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</span>
                </div>
                {stage.error && (
                  <p className="text-xs text-chs-error mt-0.5 truncate">{stage.error}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
