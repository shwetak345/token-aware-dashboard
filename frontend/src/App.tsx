import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { AnomalyChart } from './components/AnomalyChart';
import { CommitTrace } from './components/CommitTrace';
import { DebtAlerts } from './components/DebtAlerts';
import { SprintSummary } from './components/SprintSummary';
import { useTelemetry } from './hooks/useTelemetry';
import './index.css';

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 rounded-xl bg-slate-200" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 h-72 rounded-xl bg-slate-200" />
        <div className="lg:col-span-1 h-72 rounded-xl bg-slate-200" />
      </div>
      <div className="h-64 rounded-xl bg-slate-200" />
    </div>
  );
}

interface ErrorBannerProps {
  message: string;
  onRetry: () => void;
}

function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-rose-200 bg-rose-50 px-6 py-10 text-center">
      <AlertCircle className="h-8 w-8 text-rose-500" />
      <div>
        <p className="font-semibold text-rose-700">Could not reach the backend</p>
        <p className="mt-1 text-sm text-slate-500">{message}</p>
      </div>
      <button
        onClick={onRetry}
        className="flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-200"
      >
        <RefreshCw className="h-4 w-4" />
        Retry
      </button>
    </div>
  );
}

export default function App() {
  const { data, loading, error, refetch } = useTelemetry();

  const connected = !loading && !error && data !== null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white/80 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-sm font-bold text-white">
              T
            </span>
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">
              Token-Aware Dashboard
            </h1>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
            {loading ? (
              <Loader2 className="h-2 w-2 animate-spin text-slate-400" />
            ) : (
              <span
                className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-rose-500'}`}
              />
            )}
            {loading
              ? 'Connecting…'
              : connected
                ? 'API connected · localhost:8000'
                : 'API unreachable · localhost:8000'}
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
        {loading && <LoadingSkeleton />}

        {!loading && error && (
          <ErrorBanner message={error} onRetry={refetch} />
        )}

        {data && (
          <>
            <SprintSummary stats={data.stats} />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <AnomalyChart data={data.chartData} />
              </div>
              <div className="lg:col-span-1">
                <DebtAlerts alerts={data.alerts} />
              </div>
            </div>
            <CommitTrace commits={data.commits} />
          </>
        )}
      </main>
    </div>
  );
}
