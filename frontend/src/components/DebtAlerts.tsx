import { AlertTriangle, Info, XCircle } from 'lucide-react';
import type { Alert } from '../types';

const CONFIG = {
  critical: {
    border: 'border-rose-200',
    bg: 'bg-rose-50',
    icon: <XCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />,
    badge: 'bg-rose-100 text-rose-700',
  },
  warning: {
    border: 'border-amber-200',
    bg: 'bg-amber-50',
    icon: <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />,
    badge: 'bg-amber-100 text-amber-700',
  },
  info: {
    border: 'border-slate-200',
    bg: 'bg-slate-50',
    icon: <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />,
    badge: 'bg-slate-100 text-slate-600',
  },
} as const;

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

interface Props {
  alerts: Alert[];
}

export function DebtAlerts({ alerts }: Props) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Context Debt Alerts</h2>
      <ul className="flex flex-col gap-3 overflow-y-auto" style={{ maxHeight: 340 }}>
        {alerts.map((alert) => {
          const cfg = CONFIG[alert.severity];
          return (
            <li
              key={alert.id}
              className={`flex gap-2.5 rounded-lg border p-3 ${cfg.border} ${cfg.bg}`}
            >
              {cfg.icon}
              <div className="flex flex-col gap-1.5">
                <p className="text-sm leading-snug text-slate-700">{alert.message}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {alert.commits.map((sha) => (
                    <code
                      key={sha}
                      className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600"
                    >
                      {sha}
                    </code>
                  ))}
                  <span className={`ml-auto rounded px-1.5 py-0.5 text-xs font-medium capitalize ${cfg.badge}`}>
                    {alert.severity}
                  </span>
                  <span className="text-xs text-slate-400">{timeAgo(alert.timestamp)}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
