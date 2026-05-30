import { Fragment, useMemo, useState } from 'react';
import { AlertTriangle, Bot, ChevronDown, ChevronRight, Clock, User } from 'lucide-react';
import type { AgentDiagnostic, Commit } from '../types';

// ── formatters ────────────────────────────────────────────────────────────────

function fmtTokens(n: number): string {
  return `${(n / 1_000).toFixed(1)}k`;
}

function fmtDelta(n: number): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${(n / 1_000).toFixed(1)}k`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function fmtHitl(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── grouping ──────────────────────────────────────────────────────────────────

interface CommitGroup {
  jiraId: string;
  commits: Commit[];
  totalTokens: number;
  avgEfficiency: number;
  hasAnomalies: boolean;
}

function parseJiraId(message: string): string {
  const m = message.match(/^(JIRA-\d+):/);
  return m ? m[1] : 'Other';
}

function groupCommits(commits: Commit[]): CommitGroup[] {
  const order: string[] = [];
  const buckets = new Map<string, Commit[]>();

  for (const c of commits) {
    const id = parseJiraId(c.message);
    if (!buckets.has(id)) {
      order.push(id);
      buckets.set(id, []);
    }
    buckets.get(id)!.push(c);
  }

  return order.map((id) => {
    const cs = buckets.get(id)!;
    const effs = cs.map((c) => c.efficiencyScore ?? Math.max(0, 1 - c.debtScore / 100));
    return {
      jiraId: id,
      commits: cs,
      totalTokens: cs.reduce((s, c) => s + c.tokens, 0),
      avgEfficiency: effs.reduce((s, e) => s + e, 0) / effs.length,
      hasAnomalies: cs.some((c) => c.isAnomaly),
    };
  });
}

// ── sub-components ────────────────────────────────────────────────────────────

function AuthorAvatar({ author, isBot }: { author: string; isBot: boolean }) {
  return (
    <div
      title={author}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
        isBot ? 'bg-violet-100' : 'bg-slate-100'
      }`}
    >
      {isBot ? (
        <Bot className="h-3.5 w-3.5 text-violet-600" />
      ) : (
        <User className="h-3.5 w-3.5 text-slate-500" />
      )}
    </div>
  );
}

function EfficiencyPill({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const style =
    pct > 70
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : pct >= 40
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-rose-200 bg-rose-50 text-rose-700';
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums ${style}`}
    >
      {pct}%
    </span>
  );
}

function DiagnosticCell({ diagnostic }: { diagnostic?: AgentDiagnostic }) {
  if (!diagnostic) return <span className="text-slate-300">—</span>;
  const isVerification = diagnostic.type === 'verification_loop';
  const badgeStyle = isVerification
    ? 'border-rose-200 bg-rose-50 text-rose-700'
    : 'border-amber-200 bg-amber-50 text-amber-700';
  return (
    <div className="flex flex-col gap-1">
      <span
        className={`inline-flex w-fit items-center rounded border px-1.5 py-0.5 text-xs font-medium ${badgeStyle}`}
      >
        {isVerification ? '🔄 Verification Loop' : '🧠 Reasoning Loop'}
      </span>
      <span className="text-xs text-slate-400">{diagnostic.rootCause}</span>
    </div>
  );
}

function HitlCell({ minutes }: { minutes?: number }) {
  if (!minutes) return <span className="text-slate-300">—</span>;
  return (
    <div className="flex items-center gap-1.5">
      <Clock className="h-3 w-3 shrink-0 text-slate-400" />
      <span className="text-xs tabular-nums text-slate-500">{fmtHitl(minutes)}</span>
    </div>
  );
}

// ── group header row ──────────────────────────────────────────────────────────

interface GroupHeaderRowProps {
  group: CommitGroup;
  isExpanded: boolean;
  onToggle: () => void;
  hasSeparator: boolean;
}

function GroupHeaderRow({ group, isExpanded, onToggle, hasSeparator }: GroupHeaderRowProps) {
  const Chevron = isExpanded ? ChevronDown : ChevronRight;
  return (
    <tr
      onClick={onToggle}
      className={`cursor-pointer bg-slate-50 transition-colors hover:bg-slate-100 ${
        hasSeparator ? 'border-t-2 border-slate-200' : ''
      }`}
    >
      {/* JIRA ID + chevron */}
      <td className="py-2.5 pr-4">
        <div className="flex items-center gap-1.5">
          <Chevron className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="font-mono text-xs font-semibold text-slate-800">
            {group.jiraId}
          </span>
          {group.hasAnomalies && (
            <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />
          )}
        </div>
      </td>

      {/* Commit count */}
      <td className="py-2.5 pr-4 text-xs text-slate-400">
        {group.commits.length} commit{group.commits.length !== 1 ? 's' : ''}
      </td>

      {/* By — blank at group level */}
      <td className="py-2.5 pr-3 text-slate-300">—</td>

      {/* Total tokens */}
      <td className="py-2.5 pr-4 text-right tabular-nums text-sm font-semibold text-slate-800">
        {fmtTokens(group.totalTokens)}
      </td>

      {/* Δ — not meaningful at group level */}
      <td className="py-2.5 pr-4 text-slate-300">—</td>

      {/* Average efficiency */}
      <td className="py-2.5 pr-4">
        <EfficiencyPill score={group.avgEfficiency} />
      </td>

      {/* Diagnostics — kept clean at group level */}
      <td className="py-2.5 pr-4 text-slate-300">—</td>

      {/* HITL — blank */}
      <td className="py-2.5 pr-4 text-slate-300">—</td>

      {/* Time — blank */}
      <td className="py-2.5 text-slate-300">—</td>
    </tr>
  );
}

// ── child commit row ──────────────────────────────────────────────────────────

function CommitRow({ commit, isBaseline }: { commit: Commit; isBaseline?: boolean }) {
  const eff = commit.efficiencyScore ?? Math.max(0, 1 - commit.debtScore / 100);
  return (
    <tr
      className={`border-b border-slate-100 transition-colors last:border-b-0 ${
        commit.isAnomaly ? 'bg-amber-50 hover:bg-amber-100/70' : 'bg-white hover:bg-slate-50'
      }`}
    >
      {/* SHA — indented to nest visually under the group header */}
      <td className="py-3 pl-8 pr-4">
        <div className="flex items-center gap-1.5">
          {commit.isAnomaly && (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          )}
          <code className="font-mono text-xs text-violet-600">{commit.sha}</code>
        </div>
      </td>

      {/* Message — strip the JIRA prefix for cleaner reading at child level */}
      <td
        className="max-w-xs truncate py-3 pr-4 text-slate-700"
        title={commit.message}
      >
        {commit.message.replace(/^JIRA-\d+:\s*/, '')}
      </td>

      {/* Author avatar */}
      <td className="py-3 pr-3">
        <AuthorAvatar author={commit.author} isBot={commit.authorIsBot} />
      </td>

      {/* Tokens */}
      <td className="py-3 pr-4 text-right tabular-nums text-slate-600">
        {fmtTokens(commit.tokens)}
      </td>

      {/* Δ Tokens */}
      <td className="py-3 pr-4 text-right tabular-nums">
        {isBaseline ? (
          <span className="text-slate-300">—</span>
        ) : (
          <span
            className={
              commit.deltaTokens > 0
                ? 'text-rose-600'
                : commit.deltaTokens < 0
                  ? 'text-emerald-600'
                  : 'text-slate-400'
            }
          >
            {fmtDelta(commit.deltaTokens)}
          </span>
        )}
      </td>

      {/* Efficiency pill */}
      <td className="py-3 pr-4">
        <EfficiencyPill score={eff} />
      </td>

      {/* Agent diagnostics */}
      <td className="py-3 pr-4">
        <DiagnosticCell diagnostic={commit.diagnostic} />
      </td>

      {/* HITL block */}
      <td className="py-3 pr-4">
        <HitlCell minutes={commit.hitlBlockMinutes} />
      </td>

      {/* Timestamp */}
      <td className="py-3 text-xs text-slate-400">{fmtTime(commit.timestamp)}</td>
    </tr>
  );
}

// ── main component ────────────────────────────────────────────────────────────

interface Props {
  commits: Commit[];
}

export function CommitTrace({ commits }: Props) {
  const groups = useMemo(() => groupCommits(commits), [commits]);

  // Start with all groups expanded so the full detail is visible on first load.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(groups.map((g) => g.jiraId)),
  );

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">JIRA-by-JIRA Trace</h2>
        <span className="text-xs text-slate-400">
          {groups.length} tickets · {commits.length} commits
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
              <th className="pb-2 pr-4 font-medium">SHA / Ticket</th>
              <th className="pb-2 pr-4 font-medium">Message</th>
              <th className="pb-2 pr-3 font-medium">By</th>
              <th className="pb-2 pr-4 text-right font-medium">Tokens</th>
              <th className="pb-2 pr-4 text-right font-medium">Δ Tokens</th>
              <th className="pb-2 pr-4 font-medium">Efficiency</th>
              <th className="pb-2 pr-4 font-medium">Agent Diagnostics</th>
              <th className="pb-2 pr-4 font-medium">HITL Block</th>
              <th className="pb-2 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group, groupIdx) => (
              <Fragment key={group.jiraId}>
                <GroupHeaderRow
                  group={group}
                  isExpanded={expanded.has(group.jiraId)}
                  onToggle={() => toggle(group.jiraId)}
                  hasSeparator={groupIdx > 0}
                />
                {expanded.has(group.jiraId) &&
                  group.commits.map((c, idx) => (
                    <CommitRow
                      key={c.sha}
                      commit={c}
                      isBaseline={idx === group.commits.length - 1}
                    />
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
