import type { Job } from '../types';

interface Props {
  jobs: Job[];
}

export default function StatsCards({ jobs }: Props) {
  const total = jobs.length;
  const completed = jobs.filter((j) => j.status === 'completed').length;
  const processing = jobs.filter((j) => j.status === 'processing' || j.status === 'ingested').length;
  const errors = jobs.filter((j) => j.status === 'error').length;
  const created = jobs.filter((j) => j.status === 'created').length;

  const cards = [
    {
      label: 'Total Jobs',
      value: total,
      bg: 'bg-white',
      text: 'text-gray-800',
      accent: 'text-chs-primary',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
    },
    {
      label: 'Completados',
      value: completed,
      bg: 'bg-white',
      text: 'text-gray-800',
      accent: 'text-chs-success',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: 'En Proceso',
      value: processing + created,
      bg: 'bg-white',
      text: 'text-gray-800',
      accent: 'text-chs-warning',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: 'Con Error',
      value: errors,
      bg: 'bg-white',
      text: 'text-gray-800',
      accent: 'text-chs-error',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div key={card.label} className={`${card.bg} rounded-xl p-4 shadow-sm`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`${card.accent}`}>{card.icon}</span>
          </div>
          <p className={`text-3xl font-bold ${card.text}`}>{card.value}</p>
          <p className="text-gray-500 text-sm mt-1">{card.label}</p>
        </div>
      ))}
    </div>
  );
}
