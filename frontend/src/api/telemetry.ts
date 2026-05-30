import type { AgentDiagnostic, Alert, Commit, SprintStats, TokenDataPoint } from '../types';
import type { CommitTelemetry, TicketTelemetry } from './types';

// Mirror the thresholds from main.py so UI alerts match backend diagnostics.
const HITL_WARN_HOURS = 1.0;
const HITL_CRIT_HOURS = 4.0;
const CACHE_HIT_FLOOR = 0.30;
const REASONING_SPIKE_LOOPS = 30;
const DISCOVERY_RW_RATIO = 8.0;
const DISCOVERY_MIN_LOOPS = 20;
const FAILURE_CRIT_COUNT = 3;

function isAnomaly(c: CommitTelemetry): boolean {
  return c.verification_failures > 0 || c.reasoning_loops >= REASONING_SPIKE_LOOPS;
}

function debtScore(c: CommitTelemetry): number {
  return Math.min(100, c.reasoning_loops * 2 + c.verification_failures * 25);
}

export function buildSprintStats(tickets: TicketTelemetry[]): SprintStats {
  const allCommits = tickets.flatMap((t) => t.commits);
  const timestamps = allCommits.map((c) => c.timestamp).sort();
  const totalTokens = tickets.reduce((s, t) => s + t.total_tokens, 0);
  const anomalyCount = allCommits.filter(isAnomaly).length;

  // Prefer the backend-computed efficiency_score (git churn + radon complexity).
  // Fall back to avg cache hit rate when the field is absent (e.g. older API).
  const ticketsWithScore = tickets.filter((t) => t.efficiency_score != null);
  const efficiency =
    ticketsWithScore.length > 0
      ? Math.round(
          (ticketsWithScore.reduce((s, t) => s + t.efficiency_score!, 0) /
            ticketsWithScore.length) *
            100,
        ) / 100
      : Math.round(
          (tickets.reduce((s, t) => s + t.cache_hit_rate, 0) / tickets.length) * 100,
        ) / 100;

  return {
    sprintName: tickets[0]?.sprint ?? 'Sprint',
    startDate: timestamps[0]?.slice(0, 10) ?? '',
    endDate: timestamps.at(-1)?.slice(0, 10) ?? '',
    totalTokens,
    anomalyCount,
    contextDebtPct: Math.round((anomalyCount / allCommits.length) * 100),
    efficiency,
  };
}

function rootCauseFromLabel(label: string): string {
  if (label.includes('Context Rot') || label.includes('HITL')) return 'Context Debt';
  if (label.includes('Discovery')) return 'Confluence Gap';
  return label;
}

function diagnosticFor(
  commit: CommitTelemetry,
  ticket: TicketTelemetry,
): AgentDiagnostic | undefined {
  if (!isAnomaly(commit)) return undefined;
  if (commit.verification_failures > 0) {
    return { type: 'verification_loop', rootCause: rootCauseFromLabel(ticket.diagnostic_label) };
  }
  return { type: 'reasoning_loop', rootCause: rootCauseFromLabel(ticket.diagnostic_label) };
}

export function buildCommits(tickets: TicketTelemetry[]): Commit[] {
  // Pre-compute which SHA receives the HITL annotation per ticket.
  // Assign the full HITL block to the last commit with a CI failure —
  // that is the commit that exhausted local heuristics and stalled.
  const hitlBySha = new Map<string, number>();
  for (const ticket of tickets) {
    if (ticket.hitl_delay_hours <= 0) continue;
    const lastFailing = [...ticket.commits]
      .reverse()
      .find((c) => c.verification_failures > 0);
    if (lastFailing) {
      hitlBySha.set(lastFailing.sha, Math.round(ticket.hitl_delay_hours * 60));
    }
  }

  const flat = tickets.flatMap((ticket) =>
    ticket.commits.map((c) => ({
      ticket,
      commit: c,
      totalTokens: c.tokens_input + c.tokens_output,
    }))
  );

  flat.sort((a, b) => b.commit.timestamp.localeCompare(a.commit.timestamp));

  return flat.map(({ ticket, commit, totalTokens }, idx) => {
    const prevTokens = flat[idx + 1]?.totalTokens ?? totalTokens;
    const hitlMins = hitlBySha.get(commit.sha);
    return {
      sha: commit.sha,
      message: `${ticket.ticket_id}: ${commit.message}`,
      author: ticket.assignee.replace('agent:', ''),
      authorIsBot: ticket.assignee.startsWith('agent:'),
      timestamp: commit.timestamp,
      tokens: totalTokens,
      deltaTokens: totalTokens - prevTokens,
      isAnomaly: isAnomaly(commit),
      debtScore: debtScore(commit),
      efficiencyScore: commit.efficiency_score,
      diagnostic: diagnosticFor(commit, ticket),
      hitlBlockMinutes: hitlMins,
    };
  });
}

export function buildChartData(commits: Commit[]): TokenDataPoint[] {
  const asc = [...commits].reverse();
  return asc.map((c, idx) => {
    const window = asc.slice(Math.max(0, idx - 2), idx + 1);
    return {
      commit: c.sha,
      tokens: c.tokens,
      rolling: Math.round(window.reduce((s, p) => s + p.tokens, 0) / window.length),
      isAnomaly: c.isAnomaly,
    };
  });
}

export function buildAlerts(tickets: TicketTelemetry[]): Alert[] {
  const alerts: Alert[] = [];
  let id = 1;

  for (const ticket of tickets) {
    const tid = ticket.ticket_id;

    if (ticket.hitl_delay_hours >= HITL_WARN_HOURS) {
      alerts.push({
        id: String(id++),
        severity: ticket.hitl_delay_hours >= HITL_CRIT_HOURS ? 'critical' : 'warning',
        message: `${tid}: blocked ${ticket.hitl_delay_hours}h waiting on human review — design constraints were absent from agent context.`,
        commits: [],
        timestamp: ticket.commits.at(-1)?.timestamp ?? new Date().toISOString(),
      });
    }

    if (ticket.total_verification_failures > 0) {
      const failingShas = ticket.commits
        .filter((c) => c.verification_failures > 0)
        .map((c) => c.sha);
      alerts.push({
        id: String(id++),
        severity: ticket.total_verification_failures >= FAILURE_CRIT_COUNT ? 'critical' : 'warning',
        message: `${tid}: ${ticket.total_verification_failures} CI failure(s) — agent operated on a stale API contract.`,
        commits: failingShas,
        timestamp: ticket.commits.find((c) => c.verification_failures > 0)?.timestamp ?? '',
      });
    }

    const rwRatio = ticket.total_files_read / Math.max(ticket.total_files_written, 1);
    if (rwRatio >= DISCOVERY_RW_RATIO && ticket.total_reasoning_loops >= DISCOVERY_MIN_LOOPS) {
      alerts.push({
        id: String(id++),
        severity: 'warning',
        message: `${tid}: ${ticket.total_files_read} files read / ${ticket.total_files_written} written (${rwRatio.toFixed(1)}× ratio) — discovery friction from stale docs.`,
        commits: ticket.commits.filter((c) => c.files_read >= 10).map((c) => c.sha),
        timestamp: ticket.commits[0]?.timestamp ?? '',
      });
    }

    if (ticket.cache_hit_rate < CACHE_HIT_FLOOR) {
      alerts.push({
        id: String(id++),
        severity: 'warning',
        message: `${tid}: cache hit rate ${Math.round(ticket.cache_hit_rate * 100)}% — context mutating too fast for prefix caching to hold.`,
        commits: [],
        timestamp: ticket.commits[0]?.timestamp ?? '',
      });
    }

    for (const commit of ticket.commits) {
      if (commit.reasoning_loops >= REASONING_SPIKE_LOOPS) {
        alerts.push({
          id: String(id++),
          severity: 'warning',
          message: `${tid}: ${commit.reasoning_loops} reasoning loops on ${commit.sha} — agent cycling on an unresolvable ambiguity.`,
          commits: [commit.sha],
          timestamp: commit.timestamp,
        });
      }
    }
  }

  return alerts.sort((a, b) => {
    const rank = { critical: 0, warning: 1, info: 2 };
    return rank[a.severity] - rank[b.severity];
  });
}

export async function fetchTelemetry(signal: AbortSignal): Promise<TicketTelemetry[]> {
  const res = await fetch('/api/telemetry', { signal });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<TicketTelemetry[]>;
}
