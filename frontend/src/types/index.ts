export type DiagnosticType = 'verification_loop' | 'reasoning_loop';

export interface AgentDiagnostic {
  type: DiagnosticType;
  rootCause: string;
}

export interface Commit {
  sha: string;
  message: string;
  author: string;
  authorIsBot: boolean;
  timestamp: string;
  tokens: number;
  deltaTokens: number;
  isAnomaly: boolean;
  debtScore: number;
  efficiencyScore?: number;
  diagnostic?: AgentDiagnostic;
  hitlBlockMinutes?: number;
}

export interface Alert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  commits: string[];
  timestamp: string;
}

export interface SprintStats {
  sprintName: string;
  startDate: string;
  endDate: string;
  totalTokens: number;
  anomalyCount: number;
  contextDebtPct: number;
  efficiency: number;
}

export interface TokenDataPoint {
  commit: string;
  tokens: number;
  rolling: number;
  isAnomaly: boolean;
}
