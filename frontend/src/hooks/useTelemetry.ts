import { useCallback, useEffect, useState } from 'react';
import {
  buildAlerts,
  buildChartData,
  buildCommits,
  buildSprintStats,
  fetchTelemetry,
} from '../api/telemetry';
import type { Alert, Commit, SprintStats, TokenDataPoint } from '../types';

export interface TelemetryData {
  stats: SprintStats;
  commits: Commit[];
  chartData: TokenDataPoint[];
  alerts: Alert[];
}

interface UseTelemetryResult {
  data: TelemetryData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useTelemetry(): UseTelemetryResult {
  const [data, setData] = useState<TelemetryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchTelemetry(controller.signal)
      .then((tickets) => {
        const commits = buildCommits(tickets);
        setData({
          stats: buildSprintStats(tickets),
          commits,
          chartData: buildChartData(commits),
          alerts: buildAlerts(tickets),
        });
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        const msg =
          err instanceof Error ? err.message : 'Failed to reach the backend.';
        setError(msg);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [tick]);

  return { data, loading, error, refetch };
}
