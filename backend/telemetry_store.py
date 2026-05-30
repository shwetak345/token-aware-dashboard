"""
Mock database layer — sprint telemetry for the token-aware TPM dashboard.

Schema per ticket:
  ticket_id              str   — Jira issue key
  summary                str   — one-line description
  sprint                 str   — sprint name
  story_points           int   — estimated complexity
  assignee               str   — human or agent identifier
  status                 str   — done | in_progress | blocked
  diagnostic_label       str   — human-readable TPM scenario tag
  cycle_time_hours       float — wall-clock time from ticket open → merge
  hitl_delay_hours       float — cumulative hours waiting on human review/input
  total_tokens_input     int   — prompt tokens across all commits
  total_tokens_output    int   — completion tokens across all commits
  total_tokens           int   — sum of input + output
  cache_hit_rate         float — fraction of input tokens served from cache
  total_reasoning_loops  int   — sum of internal agent reasoning iterations
  total_tool_calls       int   — total tool invocations (read, search, bash, …)
  total_files_read       int   — unique files opened during the task
  total_files_written    int   — files created or modified
  total_verification_failures int — CI/test/lint failures before green
  commits                list  — ordered list of commit-level telemetry dicts

Each commit dict:
  sha                    str
  message                str
  timestamp              str   — ISO-8601
  tokens_input           int
  tokens_output          int
  reasoning_loops        int
  tool_calls             int
  files_read             int
  files_written          int
  verification_failures  int   — failures triggered by THIS commit
  ci_status              str   — pass | fail | skipped
  notes                  str   — optional diagnostic annotation
"""

SPRINT_TELEMETRY: list[dict] = [
    # ------------------------------------------------------------------ #
    #  JIRA-101 — Healthy Baseline                                        #
    #  Clean implementation: agent found context quickly, wrote tight     #
    #  code, CI passed first time on both commits.                        #
    # ------------------------------------------------------------------ #
    {
        "ticket_id": "JIRA-101",
        "summary": "Add /health endpoint to FastAPI server",
        "sprint": "Sprint 7",
        "story_points": 2,
        "assignee": "agent:claude-sonnet-4-6",
        "status": "done",
        "diagnostic_label": "Healthy Baseline",
        "cycle_time_hours": 1.2,
        "hitl_delay_hours": 0.0,
        "total_tokens_input": 14_820,
        "total_tokens_output": 3_105,
        "total_tokens": 17_925,
        "cache_hit_rate": 0.71,
        "total_reasoning_loops": 5,
        "total_tool_calls": 9,
        "total_files_read": 4,
        "total_files_written": 2,
        "total_verification_failures": 0,
        "commits": [
            {
                "sha": "a1b2c3d",
                "message": "feat: add GET /health with uptime and version fields",
                "timestamp": "2026-05-12T09:14:22Z",
                "tokens_input": 8_210,
                "tokens_output": 1_740,
                "reasoning_loops": 3,
                "tool_calls": 5,
                "files_read": 3,
                "files_written": 1,
                "verification_failures": 0,
                "ci_status": "pass",
                "notes": "Agent located main.py and schemas in first two reads; no exploratory detours.",
            },
            {
                "sha": "e4f5a6b",
                "message": "test: add integration test for /health endpoint",
                "timestamp": "2026-05-12T09:58:07Z",
                "tokens_input": 6_610,
                "tokens_output": 1_365,
                "reasoning_loops": 2,
                "tool_calls": 4,
                "files_read": 1,
                "files_written": 1,
                "verification_failures": 0,
                "ci_status": "pass",
                "notes": "Reused cached system prompt context from prior commit; low incremental cost.",
            },
        ],
    },

    # ------------------------------------------------------------------ #
    #  JIRA-102 — Discovery Friction                                      #
    #  Agent spent thousands of tokens reading stale docs and grepping    #
    #  the wrong directories before finding the correct module boundary.  #
    #  No CI failures once it finally wrote the code; friction was pure   #
    #  pre-coding discovery overhead.                                     #
    # ------------------------------------------------------------------ #
    {
        "ticket_id": "JIRA-102",
        "summary": "Integrate Anthropic token-usage API into telemetry collector",
        "sprint": "Sprint 7",
        "story_points": 5,
        "assignee": "agent:claude-sonnet-4-6",
        "status": "done",
        "diagnostic_label": "Discovery Friction",
        "cycle_time_hours": 6.8,
        "hitl_delay_hours": 0.25,
        "total_tokens_input": 198_440,
        "total_tokens_output": 19_320,
        "total_tokens": 217_760,
        "cache_hit_rate": 0.38,
        "total_reasoning_loops": 74,
        "total_tool_calls": 112,
        "total_files_read": 41,
        "total_files_written": 4,
        "total_verification_failures": 0,
        "commits": [
            {
                "sha": "c7d8e9f",
                "message": "chore: exploratory read of legacy collector module",
                "timestamp": "2026-05-13T10:02:11Z",
                "tokens_input": 52_100,
                "tokens_output": 4_880,
                "reasoning_loops": 21,
                "tool_calls": 34,
                "files_read": 18,
                "files_written": 0,
                "verification_failures": 0,
                "ci_status": "skipped",
                "notes": (
                    "Agent read outdated README, three deprecated adapter files, and two stale "
                    "architecture docs before locating the active collector in services/. "
                    "High loop count driven by repeated glob/grep retries on wrong paths."
                ),
            },
            {
                "sha": "1a2b3c4",
                "message": "chore: trace API client import chain across packages",
                "timestamp": "2026-05-13T11:45:33Z",
                "tokens_input": 48_750,
                "tokens_output": 4_100,
                "reasoning_loops": 18,
                "tool_calls": 29,
                "files_read": 14,
                "files_written": 0,
                "verification_failures": 0,
                "ci_status": "skipped",
                "notes": (
                    "Agent attempted to follow import chain through three layers of re-exports "
                    "from an old sdk/ directory that had been superseded by the anthropic package."
                ),
            },
            {
                "sha": "5d6e7f8",
                "message": "feat: wire Anthropic usage response into TelemetryCollector",
                "timestamp": "2026-05-13T13:22:48Z",
                "tokens_input": 52_990,
                "tokens_output": 6_490,
                "reasoning_loops": 22,
                "tool_calls": 31,
                "files_read": 7,
                "files_written": 3,
                "verification_failures": 0,
                "ci_status": "pass",
                "notes": (
                    "Once the correct module was identified, implementation was straightforward. "
                    "Loops here reflect schema validation reasoning, not discovery."
                ),
            },
            {
                "sha": "9a0b1c2",
                "message": "test: unit tests for TelemetryCollector.record_usage()",
                "timestamp": "2026-05-13T14:05:19Z",
                "tokens_input": 44_600,
                "tokens_output": 3_850,
                "reasoning_loops": 13,
                "tool_calls": 18,
                "files_read": 2,
                "files_written": 1,
                "verification_failures": 0,
                "ci_status": "pass",
                "notes": "Nominal test-writing cost; discovery friction fully resolved by this commit.",
            },
        ],
    },

    # ------------------------------------------------------------------ #
    #  JIRA-103 — Context Rot & High HITL Latency                        #
    #  Agent had no access to the current design doc. It repeatedly       #
    #  inferred wrong API contracts, triggering 3 CI failures. After the  #
    #  third failure it stalled and waited 4.5 h for a human to paste    #
    #  the missing constraint. Extremely high token burn throughout.      #
    # ------------------------------------------------------------------ #
    {
        "ticket_id": "JIRA-103",
        "summary": "Implement multi-model token budget enforcer with per-model caps",
        "sprint": "Sprint 7",
        "story_points": 8,
        "assignee": "agent:claude-sonnet-4-6",
        "status": "done",
        "diagnostic_label": "Context Rot & High HITL Latency",
        "cycle_time_hours": 18.3,
        "hitl_delay_hours": 4.5,
        "total_tokens_input": 521_880,
        "total_tokens_output": 48_640,
        "total_tokens": 570_520,
        "cache_hit_rate": 0.19,
        "total_reasoning_loops": 189,
        "total_tool_calls": 247,
        "total_files_read": 88,
        "total_files_written": 9,
        "total_verification_failures": 3,
        "commits": [
            {
                "sha": "3f4a5b6",
                "message": "feat: initial budget enforcer scaffold with hard-coded caps",
                "timestamp": "2026-05-14T08:11:05Z",
                "tokens_input": 87_320,
                "tokens_output": 9_410,
                "reasoning_loops": 34,
                "tool_calls": 45,
                "files_read": 22,
                "files_written": 2,
                "verification_failures": 1,
                "ci_status": "fail",
                "notes": (
                    "Agent read a design doc that was 6 months old and no longer reflected the "
                    "current per-model cap contract. Implemented wrong field names; mypy CI step "
                    "failed on BudgetConfig schema mismatch."
                ),
            },
            {
                "sha": "7c8d9e0",
                "message": "fix: correct BudgetConfig field names per assumed schema",
                "timestamp": "2026-05-14T09:44:52Z",
                "tokens_input": 96_450,
                "tokens_output": 10_220,
                "reasoning_loops": 41,
                "tool_calls": 58,
                "files_read": 24,
                "files_written": 2,
                "verification_failures": 1,
                "ci_status": "fail",
                "notes": (
                    "Agent attempted self-correction by re-reading all config files, but the "
                    "authoritative constraint (a Notion design doc) was never in context. "
                    "Guessed a second field mapping; integration test for cap enforcement failed "
                    "because the enforcement direction (inclusive vs exclusive upper bound) was wrong."
                ),
            },
            {
                "sha": "1f2a3b4",
                "message": "fix: invert cap comparison operator — attempt 2",
                "timestamp": "2026-05-14T10:58:14Z",
                "tokens_input": 102_670,
                "tokens_output": 11_390,
                "reasoning_loops": 47,
                "tool_calls": 63,
                "files_read": 19,
                "files_written": 2,
                "verification_failures": 1,
                "ci_status": "fail",
                "notes": (
                    "Third consecutive CI failure. Agent exhausted local heuristics; emitted a "
                    "HITL signal asking for the design doc. Task stalled for 4.5 hours until a "
                    "human pasted the Notion spec into the thread."
                ),
            },
            {
                "sha": "5c6d7e8",
                "message": "fix: align enforcer with Notion spec — inclusive cap, model-id keying",
                "timestamp": "2026-05-14T16:01:39Z",  # 4.5 h later
                "tokens_input": 121_980,
                "tokens_output": 11_660,
                "reasoning_loops": 44,
                "tool_calls": 58,
                "files_read": 14,
                "files_written": 2,
                "verification_failures": 0,
                "ci_status": "pass",
                "notes": (
                    "Human provided the design doc. Agent re-implemented correctly in one pass. "
                    "High token count reflects the full Notion spec being injected into context."
                ),
            },
            {
                "sha": "9f0a1b2",
                "message": "test: comprehensive budget enforcer tests across 4 model tiers",
                "timestamp": "2026-05-14T17:22:05Z",
                "tokens_input": 113_460,
                "tokens_output": 5_960,
                "reasoning_loops": 23,
                "tool_calls": 23,
                "files_read": 9,
                "files_written": 3,
                "verification_failures": 0,
                "ci_status": "pass",
                "notes": "Elevated token count; full spec still in context window from prior commit.",
            },
        ],
    },
]
