import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TokenDataPoint } from '../types';

function fmt(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

interface Props {
  data: TokenDataPoint[];
}

export function AnomalyChart({ data }: Props) {
  const anomalies = data.filter((d) => d.isAnomaly);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Token Usage per Commit</h2>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-4 rounded-sm bg-violet-500 opacity-70" />
            Tokens
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 bg-violet-400" />
            Rolling avg
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
            Anomaly
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="tokenGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="commit"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={fmt}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip
            contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#64748b' }}
            itemStyle={{ color: '#0f172a' }}
            formatter={(val: number) => [`${(val / 1000).toFixed(1)}k tokens`, '']}
          />
          <Area
            type="monotone"
            dataKey="tokens"
            stroke="#7c3aed"
            strokeWidth={2}
            fill="url(#tokenGrad)"
            dot={false}
            activeDot={{ r: 4, fill: '#7c3aed' }}
            name="Tokens"
          />
          <Area
            type="monotone"
            dataKey="rolling"
            stroke="#a78bfa"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            fill="none"
            dot={false}
            name="Rolling avg"
          />
          {anomalies.map((point) => (
            <ReferenceDot
              key={point.commit}
              x={point.commit}
              y={point.tokens}
              r={6}
              fill="#f59e0b"
              stroke="#ffffff"
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
