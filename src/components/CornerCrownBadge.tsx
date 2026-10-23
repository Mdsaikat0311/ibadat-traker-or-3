import React from 'react';
import { Crown } from 'lucide-react';

interface CornerCrownBadgeProps {
  rank?: number;
  count?: number;
  className?: string;
  compact?: boolean;
}

export const CornerCrownBadge: React.FC<CornerCrownBadgeProps> = ({
  rank,
  count,
  className = '',
  compact = false
}) => {
  // Only show badge if rank is 1, 2, or 3 and user has performed the deed at least once
  if (!rank || rank < 1 || rank > 3) return null;
  if (count !== undefined && count <= 0) return null;

  const config = {
    1: {
      label: '1st',
      title: 'লাইফটাইম ১ম স্থান (1st Rank)',
      bg: 'bg-gradient-to-r from-amber-50/95 via-yellow-50/95 to-amber-100/85',
      border: 'border border-amber-200/90 ring-1 ring-amber-300/40',
      text: 'text-amber-800',
      crownStyle: 'fill-amber-300/70 text-amber-600',
      shadow: 'shadow-xs shadow-amber-200/50',
    },
    2: {
      label: '2nd',
      title: 'লাইফটাইম ২য় স্থান (2nd Rank)',
      bg: 'bg-gradient-to-r from-slate-50/95 via-gray-50/95 to-slate-100/85',
      border: 'border border-slate-200/90 ring-1 ring-slate-300/40',
      text: 'text-slate-700',
      crownStyle: 'fill-slate-300/70 text-slate-500',
      shadow: 'shadow-xs shadow-slate-200/50',
    },
    3: {
      label: '3rd',
      title: 'লাইফটাইম ৩য় স্থান (3rd Rank)',
      bg: 'bg-gradient-to-r from-orange-50/95 via-amber-50/95 to-orange-100/85',
      border: 'border border-orange-200/90 ring-1 ring-amber-300/40',
      text: 'text-amber-800',
      crownStyle: 'fill-amber-400/60 text-amber-700',
      shadow: 'shadow-xs shadow-orange-200/50',
    },
  }[rank as 1 | 2 | 3];

  const defaultPos = compact ? '-top-2.5 -right-1' : '-top-2.5 -right-1 sm:-right-1.5';
  const paddingClass = compact ? 'px-1.5 py-0.5' : 'px-2 sm:px-2.5 py-0.5';
  const iconSize = compact ? 'w-3 h-3' : 'w-3.5 h-3.5';
  const textSize = compact ? 'text-[9px]' : 'text-[10px] sm:text-[10.5px]';

  return (
    <div
      className={`absolute ${defaultPos} z-20 pointer-events-none select-none transition-transform duration-200 ${className}`}
      title={config.title}
    >
      <div
        className={`flex items-center gap-0.5 sm:gap-1 ${paddingClass} rounded-full backdrop-blur-xs ${config.bg} ${config.border} ${config.shadow} transform rotate-[22deg]`}
      >
        <Crown className={`${iconSize} ${config.crownStyle} shrink-0 drop-shadow-2xs`} />
        <span className={`${textSize} font-black tracking-tight leading-none ${config.text}`}>
          {config.label}
        </span>
      </div>
    </div>
  );
};
