"""
Token-Aware TPM Dashboard — FastMCP server + FastAPI HTTP bridge.

Run with:
    uvicorn main:app --reload --port 8000

MCP endpoint  (Streamable HTTP):  http://localhost:8000/mcp
REST endpoint (React dashboard):  http://localhost:8000/api/telemetry
"""

from __future__ import annotations

import asyncio
import copy
import pathlib
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from fastmcp import FastMCP
from git import InvalidGitRepositoryError
from pydantic import BaseModel

from metrics_analyzer import CommitNotFoundError, calculate_commit_efficiency
from telemetry_store import SPRINT_TELEMETRY

# ── configuration ──────────────────────────────────────────────────────────

# Absolute path to the repository root, one level above this file.
REPO_PATH: str = str(pathlib.Path(__file__).parent.parent)

SPRINT_TOKEN_BUDGETS: dict[str, int] = {
    "Sprint 7": 1_000_000,
}

# Alert thresholds — centralised so the dashboard can surface them as config
_HITL_WARN_HOURS: float = 1.0
_HITL_CRIT_HOURS: float = 4.0
_CACHE_HIT_FLOOR: float = 0.30
_REASONING_SPIKE_LOOPS: int = 30
_DISCOVERY_RW_RATIO: float = 8.0
_DISCOVERY_MIN_LOOPS: int = 20
_FAILURE_CRIT_COUNT: int = 3


# ── response models ────────────────────────────────────────────────────────

class CommitModel(BaseModel):
    sha: str
    message: str
    timestamp: str
    tokens_input: int
    tokens_output: int
    reasoning_loops: int
    tool_calls: int
    files_read: int
    files_written: int
    verification_failures: int
    ci_status: str
    notes: str = ""
    efficiency_score: float
    efficiency_source: Literal["git_analysis", "telemetry_fallback"]


class TicketModel(BaseModel):
    ticket_id: str
    summary: str
    sprint: str
    story_points: int
    assignee: str
    status: str
    diagnostic_label: str
    cycle_time_hours: float
    hitl_delay_hours: float
    total_tokens_input: int
    total_tokens_output: int
    total_tokens: int
    cache_hit_rate: float
    total_reasoning_loops: int
    total_tool_calls: int
    total_files_read: int
    total_files_written: int
    total_verification_failures: int
    efficiency_score: float
    commits: list[CommitModel]


# ── efficiency helpers ──────────────────────────────────────────────────────

def _efficiency_from_telemetry(commit: dict) -> float:
    """Derive an efficiency proxy from telemetry when the SHA isn't in the repo.

    Uses reasoning-loop intensity and CI failure count as inverse signals:
    more loops and more failures both lower the score.

    Formula:
        loop_penalty    = min(0.5, reasoning_loops / 100)
        failure_penalty = min(0.4, verification_failures × 0.15)
        score           = clamp(1 − loop_penalty − failure_penalty, 0.0, 1.0)
    """
    loop_penalty = min(0.5, commit["reasoning_loops"] / 100)
    failure_penalty = min(0.4, commit["verification_failures"] * 0.15)
    return round(max(0.0, min(1.0, 1.0 - loop_penalty - failure_penalty)), 4)


def _build_enriched_telemetry() -> list[dict]:
    """Synchronous worker: augment every commit with a live efficiency score.

    Attempts git analysis via calculate_commit_efficiency for each SHA.
    Falls back to _efficiency_from_telemetry when the SHA is not present in
    the local repository (e.g. mock/fictional SHAs in the telemetry store).
    """
    result: list[dict] = []
    for ticket in SPRINT_TELEMETRY:
        enriched = copy.deepcopy(ticket)
        commit_scores: list[float] = []

        for commit in enriched["commits"]:
            try:
                score = calculate_commit_efficiency(REPO_PATH, commit["sha"])
                source: Literal["git_analysis", "telemetry_fallback"] = "git_analysis"
            except (CommitNotFoundError, InvalidGitRepositoryError):
                score = _efficiency_from_telemetry(commit)
                source = "telemetry_fallback"

            commit["efficiency_score"] = round(score, 4)
            commit["efficiency_source"] = source
            commit_scores.append(score)

        enriched["efficiency_score"] = round(
            sum(commit_scores) / len(commit_scores) if commit_scores else 0.0, 4
        )
        result.append(enriched)

    return result


# ── shared helpers ─────────────────────────────────────────────────────────

def _tickets_for_sprint(sprint_id: str) -> list[dict]:
    return [t for t in SPRINT_TELEMETRY if t["sprint"] == sprint_id]


def _ticket_by_id(story_id: str) -> dict | None:
    return next((t for t in SPRINT_TELEMETRY if t["ticket_id"] == story_id), None)


# ── MCP server ─────────────────────────────────────────────────────────────

mcp = FastMCP(
    name="tpm-telemetry",
    instructions=(
        "Sprint telemetry server for a token-aware TPM dashboard. "
        "Use get_sprint_summary for budget health, get_story_traces to drill into "
        "a specific ticket's commit-level detail, and get_context_debt_alerts to "
        "surface systemic diagnostic issues across the whole sprint."
    ),
)


@mcp.tool()
def get_sprint_summary(sprint_id: str) -> dict:
    """Return high-level token usage vs. budget for a sprint.

    Aggregates total tokens burned across all tickets in the sprint and
    computes each ticket's share of the budget so a TPM can see at a glance
    which stories are outliers.

    Args:
        sprint_id: Sprint name as it appears in the telemetry store, e.g. "Sprint 7".
    """
    tickets = _tickets_for_sprint(sprint_id)
    if not tickets:
        return {"error": f"No telemetry found for sprint '{sprint_id}'"}

    budget = SPRINT_TOKEN_BUDGETS.get(sprint_id, 1_000_000)
    used = sum(t["total_tokens"] for t in tickets)
    avg_cache = round(sum(t["cache_hit_rate"] for t in tickets) / len(tickets), 3)
    total_failures = sum(t["total_verification_failures"] for t in tickets)
    total_hitl = round(sum(t["hitl_delay_hours"] for t in tickets), 2)

    return {
        "sprint_id": sprint_id,
        "budget_tokens": budget,
        "used_tokens": used,
        "utilization_pct": round(used / budget * 100, 1),
        "over_budget": used > budget,
        "ticket_count": len(tickets),
        "sprint_totals": {
            "total_verification_failures": total_failures,
            "total_hitl_delay_hours": total_hitl,
            "avg_cache_hit_rate": avg_cache,
        },
        "tickets": [
            {
                "ticket_id": t["ticket_id"],
                "summary": t["summary"],
                "diagnostic_label": t["diagnostic_label"],
                "story_points": t["story_points"],
                "status": t["status"],
                "total_tokens": t["total_tokens"],
                "pct_of_budget": round(t["total_tokens"] / budget * 100, 1),
                "cache_hit_rate": t["cache_hit_rate"],
                "total_reasoning_loops": t["total_reasoning_loops"],
                "total_verification_failures": t["total_verification_failures"],
                "hitl_delay_hours": t["hitl_delay_hours"],
                "cycle_time_hours": t["cycle_time_hours"],
            }
            for t in tickets
        ],
    }


@mcp.tool()
def get_story_traces(story_id: str) -> dict:
    """Drill down from a story through linked pull requests to individual commits.

    Returns full token and reasoning-loop breakdowns per commit so an agent
    or dashboard can pinpoint exactly where cost was incurred within a ticket.
    Each commit is surfaced as its own pull-request node to mirror a realistic
    PR → commit hierarchy.

    Args:
        story_id: Jira ticket key, e.g. "JIRA-103".
    """
    ticket = _ticket_by_id(story_id)
    if ticket is None:
        return {"error": f"Story '{story_id}' not found in telemetry store"}

    pull_requests = [
        {
            "pr_ref": commit["sha"],
            "title": commit["message"],
            "timestamp": commit["timestamp"],
            "ci_status": commit["ci_status"],
            "commits": [
                {
                    "sha": commit["sha"],
                    "message": commit["message"],
                    "timestamp": commit["timestamp"],
                    "tokens_input": commit["tokens_input"],
                    "tokens_output": commit["tokens_output"],
                    "total_tokens": commit["tokens_input"] + commit["tokens_output"],
                    "reasoning_loops": commit["reasoning_loops"],
                    "tool_calls": commit["tool_calls"],
                    "files_read": commit["files_read"],
                    "files_written": commit["files_written"],
                    "read_write_ratio": round(
                        commit["files_read"] / max(commit["files_written"], 1), 1
                    ),
                    "verification_failures": commit["verification_failures"],
                    "ci_status": commit["ci_status"],
                    "notes": commit.get("notes", ""),
                }
            ],
        }
        for commit in ticket["commits"]
    ]

    return {
        "story": {
            "ticket_id": ticket["ticket_id"],
            "summary": ticket["summary"],
            "sprint": ticket["sprint"],
            "story_points": ticket["story_points"],
            "assignee": ticket["assignee"],
            "status": ticket["status"],
            "diagnostic_label": ticket["diagnostic_label"],
            "cycle_time_hours": ticket["cycle_time_hours"],
            "hitl_delay_hours": ticket["hitl_delay_hours"],
            "totals": {
                "tokens": ticket["total_tokens"],
                "tokens_input": ticket["total_tokens_input"],
                "tokens_output": ticket["total_tokens_output"],
                "cache_hit_rate": ticket["cache_hit_rate"],
                "reasoning_loops": ticket["total_reasoning_loops"],
                "tool_calls": ticket["total_tool_calls"],
                "files_read": ticket["total_files_read"],
                "files_written": ticket["total_files_written"],
                "verification_failures": ticket["total_verification_failures"],
            },
        },
        "pull_requests": pull_requests,
    }


@mcp.tool()
def get_context_debt_alerts() -> dict:
    """Scan all sprint telemetry and return structured alerts for context-debt patterns.

    Detects five diagnostic signal types:

    - HIGH_HITL_LATENCY      Task stalled waiting on human input (missing constraints).
    - VERIFICATION_FAILURES  Repeated CI failures before a green build (stale spec).
    - DISCOVERY_FRICTION     High file-read : file-write ratio with elevated loop counts
                             (agent navigating by trial-and-error due to stale docs).
    - LOW_CACHE_HIT_RATE     Prompt caching largely ineffective (context mutating too fast).
    - REASONING_SPIKE        Single commit with an abnormally high reasoning-loop count
                             (agent cycling on an unresolvable ambiguity).

    Each alert includes a 'diagnostic' field naming the root cause and a concrete
    remediation suggestion.
    """
    alerts: list[dict] = []

    for ticket in SPRINT_TELEMETRY:
        tid = ticket["ticket_id"]

        # ── HIGH_HITL_LATENCY ──────────────────────────────────────────
        if ticket["hitl_delay_hours"] >= _HITL_WARN_HOURS:
            alerts.append(
                {
                    "ticket_id": tid,
                    "alert_type": "HIGH_HITL_LATENCY",
                    "severity": (
                        "critical"
                        if ticket["hitl_delay_hours"] >= _HITL_CRIT_HOURS
                        else "warning"
                    ),
                    "message": (
                        f"{tid}: task blocked {ticket['hitl_delay_hours']}h "
                        "waiting on human review or missing design input"
                    ),
                    "hitl_delay_hours": ticket["hitl_delay_hours"],
                    "diagnostic": (
                        "Design constraints were absent from agent context. "
                        "Pre-load the relevant spec or Notion page as an MCP resource "
                        "so the agent can self-resolve without stalling."
                    ),
                }
            )

        # ── VERIFICATION_FAILURES ──────────────────────────────────────
        if ticket["total_verification_failures"] > 0:
            failing_shas = [
                c["sha"] for c in ticket["commits"] if c["verification_failures"] > 0
            ]
            alerts.append(
                {
                    "ticket_id": tid,
                    "alert_type": "VERIFICATION_FAILURES",
                    "severity": (
                        "critical"
                        if ticket["total_verification_failures"] >= _FAILURE_CRIT_COUNT
                        else "warning"
                    ),
                    "message": (
                        f"{tid}: {ticket['total_verification_failures']} CI failure(s) "
                        f"on commits {failing_shas} before reaching green"
                    ),
                    "verification_failures": ticket["total_verification_failures"],
                    "failing_commit_shas": failing_shas,
                    "diagnostic": (
                        "Agent was operating on a stale or missing API contract. "
                        "Inject the authoritative design doc as an MCP resource and "
                        "add a pre-task hook that fetches the latest spec before coding begins."
                    ),
                }
            )

        # ── DISCOVERY_FRICTION ─────────────────────────────────────────
        rw_ratio = ticket["total_files_read"] / max(ticket["total_files_written"], 1)
        if (
            rw_ratio >= _DISCOVERY_RW_RATIO
            and ticket["total_reasoning_loops"] >= _DISCOVERY_MIN_LOOPS
        ):
            high_read_commits = [
                {
                    "sha": c["sha"],
                    "files_read": c["files_read"],
                    "reasoning_loops": c["reasoning_loops"],
                    "notes": c.get("notes", ""),
                }
                for c in ticket["commits"]
                if c["files_read"] >= 10
            ]
            alerts.append(
                {
                    "ticket_id": tid,
                    "alert_type": "DISCOVERY_FRICTION",
                    "severity": "warning",
                    "message": (
                        f"{tid}: agent read {ticket['total_files_read']} files "
                        f"but wrote only {ticket['total_files_written']} "
                        f"({rw_ratio:.1f}x ratio) across "
                        f"{ticket['total_reasoning_loops']} reasoning loops"
                    ),
                    "files_read": ticket["total_files_read"],
                    "files_written": ticket["total_files_written"],
                    "read_write_ratio": round(rw_ratio, 1),
                    "high_read_commits": high_read_commits,
                    "diagnostic": (
                        "Stale documentation or ambiguous module structure forced "
                        "the agent to navigate by trial-and-error. "
                        "Add path hints to CLAUDE.md, archive deprecated adapter files, "
                        "and ensure README pointers reflect the current module layout."
                    ),
                }
            )

        # ── LOW_CACHE_HIT_RATE ─────────────────────────────────────────
        if ticket["cache_hit_rate"] < _CACHE_HIT_FLOOR:
            alerts.append(
                {
                    "ticket_id": tid,
                    "alert_type": "LOW_CACHE_HIT_RATE",
                    "severity": "warning",
                    "message": (
                        f"{tid}: cache hit rate {ticket['cache_hit_rate'] * 100:.0f}% "
                        "— prompt caching largely ineffective"
                    ),
                    "cache_hit_rate": ticket["cache_hit_rate"],
                    "diagnostic": (
                        "The agent context mutated too rapidly between turns, "
                        "breaking cache-prefix stability. "
                        "Pin static system-prompt content (personas, tool schemas) "
                        "at the top of the prompt; keep dynamic content at the tail."
                    ),
                }
            )

        # ── REASONING_SPIKE (per-commit) ───────────────────────────────
        for commit in ticket["commits"]:
            if commit["reasoning_loops"] >= _REASONING_SPIKE_LOOPS:
                alerts.append(
                    {
                        "ticket_id": tid,
                        "alert_type": "REASONING_SPIKE",
                        "severity": "warning",
                        "commit_sha": commit["sha"],
                        "message": (
                            f"{tid} / {commit['sha']}: "
                            f"{commit['reasoning_loops']} reasoning loops in a single pass"
                        ),
                        "reasoning_loops": commit["reasoning_loops"],
                        "files_read_in_commit": commit["files_read"],
                        "notes": commit.get("notes", ""),
                        "diagnostic": (
                            "The agent cycled on an unresolvable ambiguity — "
                            "likely a missing constraint or contradictory context. "
                            "Review the commit notes for the friction source and "
                            "surface the missing information as a pre-loaded MCP resource."
                        ),
                    }
                )

    critical = [a for a in alerts if a.get("severity") == "critical"]
    warnings = [a for a in alerts if a.get("severity") == "warning"]

    alert_types: dict[str, list[dict]] = {}
    for alert in alerts:
        alert_types.setdefault(alert["alert_type"], []).append(alert)

    return {
        "total_alerts": len(alerts),
        "critical_count": len(critical),
        "warning_count": len(warnings),
        "alerts_by_type": alert_types,
        "alerts": alerts,
    }


# ── FastAPI app ────────────────────────────────────────────────────────────

app = FastAPI(
    title="Token-Aware Dashboard API",
    version="1.0.0",
    description="REST + MCP interface for sprint token telemetry",
)


@app.get("/api/telemetry", response_model=list[TicketModel])
async def get_telemetry() -> list[dict]:
    """Return sprint telemetry enriched with per-commit and per-ticket efficiency scores.

    Each commit is augmented with:
    - ``efficiency_score`` — float in [0.0, 1.0] computed by
      ``calculate_commit_efficiency`` when the SHA exists in the local git
      repository, or derived from telemetry metrics as a fallback.
    - ``efficiency_source`` — ``"git_analysis"`` or ``"telemetry_fallback"``.

    Each ticket receives an aggregate ``efficiency_score`` averaged across its
    commits.  Git operations are blocking so this handler offloads them to a
    thread to avoid blocking the event loop.
    """
    return await asyncio.to_thread(_build_enriched_telemetry)


@app.get("/api/telemetry/{ticket_id}", response_model=dict[str, Any])
async def get_ticket_telemetry(ticket_id: str) -> dict:
    """Return telemetry for a single ticket by ID."""
    ticket = _ticket_by_id(ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail=f"Ticket '{ticket_id}' not found")
    return ticket


# Mount the MCP server under /mcp using the Streamable HTTP transport.
# MCP clients connect to: http://localhost:8000/mcp
app.mount("/mcp", mcp.http_app())
