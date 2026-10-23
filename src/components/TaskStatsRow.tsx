import React from 'react';
import { TaskStats } from '../types/ibadat';

interface TaskStatsRowProps {
  stats: TaskStats;
}

export const TaskStatsRow: React.FC<TaskStatsRowProps> = ({ stats }) => {
  const weekPct = stats.totalWeekDays > 0 ? stats.week / stats.totalWeekDays : 0;
  const weekClass = weekPct >= 0.5 ? 'text-green-600' : 'text-red-500';

  const monthPct = stats.totalMonthDays > 0 ? stats.month / stats.totalMonthDays : 0;
  const monthClass = monthPct >= 0.5 ? 'text-green-600' : 'text-red-500';

  const lifePct = stats.totalLifetimeDays > 0 ? stats.lifetime / stats.totalLifetimeDays : 0;
  const lifeClass = lifePct >= 0.5 ? 'text-green-600' : 'text-red-500';

  const weekRank = stats.weekRank ?? 1;
  const monthRank = stats.monthRank ?? 1;
  const lifetimeRank = stats.lifetimeRank ?? 1;

  const renderBadge = (rank: number, label: string) => {
    let icon = '';
    let badgeStyle = 'bg-gray-100 text-gray-600 border-gray-200';

    if (rank === 1) {
      icon = '👑';
      badgeStyle = 'bg-amber-100 text-amber-800 border-amber-300';
    } else if (rank === 2) {
      icon = '🥈';
      badgeStyle = 'bg-slate-100 text-slate-700 border-slate-300';
    } else if (rank === 3) {
      icon = '🥉';
      badgeStyle = 'bg-orange-100 text-orange-800 border-orange-300';
    }

    return (
      <span
        className={`inline-flex items-center ml-0.5 px-1 py-0 rounded-full text-[8px] sm:text-[8.5px] font-extrabold border shadow-2xs leading-none ${badgeStyle}`}
        title={`${label}: #${rank}`}
      >
        {icon}#{rank}
      </span>
    );
  };

  return (
    <div className="flex items-center flex-nowrap whitespace-nowrap gap-x-1 sm:gap-x-1.5 pt-1 text-[8.5px] sm:text-[9.5px] font-bold tracking-tight overflow-hidden">
      <span className={`inline-flex items-center flex-shrink-0 ${weekClass}`}>
        <span>Week({stats.week}/{stats.totalWeekDays})</span>
        {renderBadge(weekRank, 'সাপ্তাহিক র‍্যাংক')}
      </span>

      <span className={`inline-flex items-center flex-shrink-0 ${monthClass}`}>
        <span>Month({stats.month}/{stats.totalMonthDays})</span>
        {renderBadge(monthRank, 'মাসিক র‍্যাংক')}
      </span>

      <span className={`inline-flex items-center flex-shrink-0 ${lifeClass}`}>
        <span>Lifetime({stats.lifetime}/{stats.totalLifetimeDays})</span>
        {renderBadge(lifetimeRank, 'লাইফটাইম র‍্যাংক')}
      </span>
    </div>
  );
};
