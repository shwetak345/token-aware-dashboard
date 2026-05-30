# Token-Aware Dashboard — Architecture & Coding Standards

## Project Structure

```
token-aware-dashboard/
├── backend/          # FastAPI + FastMCP server (Python 3.13)
│   ├── .venv/        # Virtual environment (managed by uv, never commit)
│   └── ...
└── CLAUDE.md
```

## Architecture Boundaries

| Layer | Location | Responsibility |
|-------|----------|----------------|
| MCP Server | `backend/` | Exposes tools/resources via FastMCP |
| API | `backend/` | HTTP endpoints via FastAPI |
| Frontend | TBD | Dashboard UI |

**Rules:**
- The MCP layer must not import from the API layer; data flows one way.
- No business logic in route handlers — delegate to service modules.
- Never commit `.venv/`, secrets, or `.env` files.

## Environment Setup

```powershell
# Backend (uses uv — no need to activate manually for installs)
cd backend
uv venv .venv
.venv\Scripts\activate
uv pip install fastapi uvicorn fastmcp
uvicorn main:app --reload
```

## Coding Standards

### Python
- **Style:** Follow PEP 8; use `ruff` for linting and formatting.
- **Type hints:** Required on all public function signatures.
- **Pydantic models:** Use for all request/response schemas — no raw `dict` at boundaries.
- **Async:** Prefer `async def` for all FastAPI route handlers.
- **Imports:** Stdlib → third-party → local, separated by blank lines.
- **No comments** unless the *why* is non-obvious (hidden constraints, workarounds).

### FastMCP
- Each MCP tool must have a clear docstring describing its purpose and parameters (FastMCP surfaces these to clients).
- Tools should be pure functions where possible; side effects belong in service modules.

### FastAPI
- Version all API routes under `/api/v1/`.
- Return typed response models (`response_model=`) on every route.
- Use `HTTPException` with specific status codes — no bare 500s.

## Dependencies

Managed with `uv`. To add a package:
```powershell
uv pip install <package>
uv pip freeze > requirements.txt
```
