export interface CommitTelemetry {
  sha: string;
  message: string;
  timestamp: string;
  tokens_input: number;
  tokens_output: number;
  reasoning_loops: number;
  tool_calls: number;
  files_read: number;
  files_written: number;
  verification_failures: number;
  ci_status: 'pass' | 'fail' | 'skipped';
  notes?: string;
  efficiency_score?: number;
  efficiency_source?: 'git_analysis' | 'telemetry_fallback';
}

export interface TicketTelemetry {
  ticket_id: string;
  summary: string;
  sprint: string;
  story_points: number;
  assignee: string;
  status: 'done' | 'in_progress' | 'blocked';
  diagnostic_label: string;
  cycle_time_hours: number;
  hitl_delay_hours: number;
  total_tokens_input: number;
  total_tokens_output: number;
  total_tokens: number;
  cache_hit_rate: number;
  total_reasoning_loops: number;
  total_tool_calls: number;
  total_files_read: number;
  total_files_written: number;
  total_verification_failures: number;
  efficiency_score?: number;
  commits: CommitTelemetry[];
}
