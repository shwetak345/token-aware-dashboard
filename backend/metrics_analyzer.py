"""
Commit-level code efficiency analysis.

Combines git churn statistics (via GitPython) with cyclomatic complexity
analysis (via radon) to produce a normalised efficiency score in [0.0, 1.0]
that reflects both how much the agent rewrote existing code and how complex
the code it introduced was.
"""
from __future__ import annotations

import radon.complexity as radon_cc
from git import BadName, InvalidGitRepositoryError, Repo

# Radon cyclomatic-complexity threshold above which a per-unit penalty applies.
# Radon scale: A=1-5 (low), B=6-10 (moderate), C=11-15 (high), D=16-20, E=21-25, F=26+.
# We begin penalising at the B→C boundary (CC > 10).
_CC_THRESHOLD: int = 10
_CC_PENALTY_RATE: float = 0.05  # efficiency deduction per CC unit above threshold


class CommitNotFoundError(ValueError):
    """Raised when a commit SHA cannot be resolved in the repository."""


def calculate_commit_efficiency(repo_path: str, commit_sha: str) -> float:
    """Compute a normalised efficiency score in [0.0, 1.0] for a single commit.

    The score captures two independent signals:

    1. **Churn ratio** — the fraction of touched lines that were *deletions*
       rather than additions.  High churn (lots of rewriting) implies the agent
       is spending tokens reworking prior output rather than making forward
       progress.

    2. **Cyclomatic complexity penalty** — for every modified Python file in the
       commit, radon computes the average cyclomatic complexity (CC) of all
       defined blocks (functions, methods, class bodies).  Each CC unit above
       ``_CC_THRESHOLD`` subtracts ``_CC_PENALTY_RATE`` from the base score,
       so code that is structurally tangled hurts efficiency more than code that
       is clean and easy to reason about.

    Mathematical formula
    --------------------
    ::

        churn_ratio    = deletions / (insertions + deletions)   ∈ [0, 1]
        cc_penalty     = max(0, avg_cc − CC_THRESHOLD) × CC_PENALTY_RATE  ≥ 0
        efficiency     = clamp(1 − churn_ratio − cc_penalty, 0.0, 1.0)

    Worked examples
    ---------------
    * Pure additions, low CC (avg_cc = 4):  ``1 − 0 − 0 = 1.00``
    * 50 % churn, moderate CC (avg_cc = 8): ``1 − 0.5 − 0 = 0.50``
    * 30 % churn, high CC (avg_cc = 16):    ``1 − 0.3 − (16−10)×0.05 = 0.40``

    Parameters
    ----------
    repo_path:
        Filesystem path to the root of the git repository that contains the
        commit.  The path is passed directly to ``git.Repo``; it must be the
        repository's working-tree root or bare-repo directory.
    commit_sha:
        Full (40-char) or abbreviated SHA of the commit to analyse.  GitPython
        resolves abbreviated SHAs using the same rules as ``git rev-parse``.

    Returns
    -------
    float
        Efficiency score in the closed interval [0.0, 1.0]:

        * ``1.0`` — maximally efficient: purely additive commit with low
          cyclomatic complexity in all modified files.
        * ``0.5`` — neutral sentinel returned for **merge commits** (≥ 2
          parents); the diff in a merge is not attributable to a single
          agent turn so no score is computed.
        * ``0.0`` — highly inefficient: heavy rewriting *and* highly complex
          introduced code.

    Raises
    ------
    CommitNotFoundError
        When ``commit_sha`` cannot be resolved in the repository.  Callers
        should catch this and apply a telemetry-based fallback score rather
        than surfacing the error to the end user.
    git.InvalidGitRepositoryError
        When ``repo_path`` is not a valid git repository (configuration error,
        not a per-commit condition).

    Edge-case handling
    ------------------
    * **Empty commit** (no file changes, insertions + deletions == 0):
      returns ``1.0`` immediately — the absence of code changes carries no
      evidence of inefficiency.
    * **Root commit** (no parent to diff against): same as empty commit —
      returns ``1.0``.
    * **Merge commit** (≥ 2 parents): returns the neutral sentinel ``0.5``
      rather than attempting a potentially misleading diff against one parent.
    * **Non-Python files only**: the complexity term is ``0.0``, so only the
      churn component contributes to the score.
    * **Unparseable Python files** (syntax errors, binary content): the file is
      silently skipped from the complexity average; other files still
      contribute.
    * **Division-by-zero** on total lines: guarded by the ``total_lines == 0``
      early-return before any division is attempted.
    """
    repo = Repo(repo_path)  # raises InvalidGitRepositoryError if path is wrong

    try:
        commit = repo.commit(commit_sha)
    except BadName as exc:
        raise CommitNotFoundError(
            f"Commit '{commit_sha}' not found in repository at {repo_path!r}"
        ) from exc

    # ── merge commits: neutral sentinel ───────────────────────────────────
    if len(commit.parents) >= 2:
        return 0.5

    # ── churn ratio ───────────────────────────────────────────────────────
    # GitPython's commit.stats runs `git diff --stat` against the parent(s)
    # and exposes the aggregated insertion/deletion counts directly.
    insertions: int = commit.stats.total["insertions"]
    deletions: int = commit.stats.total["deletions"]
    total_lines = insertions + deletions

    if total_lines == 0:
        return 1.0  # empty or root commit — no evidence of inefficiency

    churn_ratio = deletions / total_lines  # ∈ [0, 1]

    # ── cyclomatic complexity of modified Python files ─────────────────────
    cc_values: list[float] = []

    if commit.parents:
        parent = commit.parents[0]
        for diff_item in parent.diff(commit):
            b_path: str | None = diff_item.b_path
            b_blob = diff_item.b_blob
            if not (b_path and b_path.endswith(".py") and b_blob):
                continue
            try:
                source = b_blob.data_stream.read().decode(errors="replace")
                blocks = radon_cc.cc_visit(source)
                if blocks:
                    file_avg = sum(b.complexity for b in blocks) / len(blocks)
                    cc_values.append(file_avg)
            except Exception:  # noqa: BLE001 — skip unparseable files silently
                continue

    avg_cc = sum(cc_values) / len(cc_values) if cc_values else 0.0
    cc_penalty = max(0.0, avg_cc - _CC_THRESHOLD) * _CC_PENALTY_RATE

    return max(0.0, min(1.0, (1.0 - churn_ratio) - cc_penalty))
