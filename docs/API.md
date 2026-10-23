# Frontend and AWS API contract

Canonical types: shared/contracts.ts. Coordinates are [longitude, latitude]; unknown location is null. Timestamps are ISO 8601. Responses use application/json.

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| GET | /board | — | Board |
| POST | /incidents/:id/recommendation | — | Recommendation or null |
| POST | /incidents/:id/actions | IncidentAction | Updated Board |

Actions: `{"type":"verify"}`, `{"type":"assign","teamId":"team-a"}`, `{"type":"deliver"}`.

Recommendations do not assign anything. The action endpoint rechecks feasibility at approval time. Return 409 for stale/infeasible actions and 400 for invalid inputs. Missing addresses remain unverified and unplotted. Summaries must not invent evidence.

Adapter: src/services/api.ts. Set VITE_DATA_MODE=live and VITE_API_BASE_URL in .env.local, then restart Vite. Live failures remain visible; there is no silent demo fallback. The current frontend loads once and refreshes on demand or after an action.

Agree on these next endpoints before implementing them: report submission, clarification replies, editable verification, audio uploads/jobs, route geometry, and disruption/replanning. They are not implemented in this scaffold.

Current lifecycle: needs_review → verified → assigned → delivered. Required fields being present permits human review; it does not prove truth. Add reviewer identity/time, evidence, versions and idempotency keys as the live implementation develops.
