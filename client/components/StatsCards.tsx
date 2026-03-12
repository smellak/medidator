import { Box, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import type { Job } from '../types';

interface Props {
  jobs: Job[];
}

export default function StatsCards({ jobs }: Props) {
  const total = jobs.length;
  const completed = jobs.filter((j) => j.status === 'completed').length;
  const inProgress = jobs.filter((j) => j.status === 'processing' || j.status === 'ingested' || j.status === 'created').length;
  const errors = jobs.filter((j) => j.status === 'error').length;

  const cards = [
    { label: 'TOTAL JOBS', value: total, Icon: Box },
    { label: 'COMPLETADOS', value: completed, Icon: CheckCircle },
    { label: 'EN PROCESO', value: inProgress, Icon: Clock },
    { label: 'CON ERROR', value: errors, Icon: AlertTriangle },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card, i) => (
        <div
          key={card.label}
          className={`glass-card rounded-md px-4 py-3 animate-fade-in-up stagger-${i + 1}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <card.Icon className="w-3.5 h-3.5 text-white/50" />
            <span
              className="text-white/50 text-[10px] font-semibold uppercase"
              style={{ fontFamily: 'var(--font-inter)', letterSpacing: '1px' }}
            >
              {card.label}
            </span>
          </div>
          <p className="text-white text-lg font-bold leading-tight" style={{ fontFamily: 'var(--font-inter)' }}>
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}
