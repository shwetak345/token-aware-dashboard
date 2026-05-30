import { Activity, AlertTriangle, BarChart2, Zap } from 'lucide-react';
import type { SprintStats } from '../types';

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent: string;
}

function StatCard({ label, value, sub, icon, accent }: StatCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

interface Props {
  stats: SprintStats;
}

export function SprintSummary({ stats }: Props) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">{stats.sprintName} — Summary</h2>
        <span className="text-xs text-slate-500">
          {stats.startDate} → {stats.endDate}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total Tokens"
          value={fmt(stats.totalTokens)}
          sub="across all commits"
          icon={<BarChart2 className="h-5 w-5 text-violet-600" />}
          accent="bg-violet-50"
        />
        <StatCard
          label="Anomalies"
          value={String(stats.anomalyCount)}
          sub="token burst events"
          icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
          accent="bg-amber-50"
        />
        <StatCard
          label="Context Debt"
          value={`${stats.contextDebtPct}%`}
          sub="of budget consumed"
          icon={<Activity className="h-5 w-5 text-rose-600" />}
          accent="bg-rose-50"
        />
        <StatCard
          label="Efficiency"
          value={stats.efficiency.toFixed(2)}
          sub="output/token ratio"
          icon={<Zap className="h-5 w-5 text-emerald-600" />}
          accent="bg-emerald-50"
        />
      </div>
    </section>
  );
}
