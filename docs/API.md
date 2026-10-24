# Pipeline API contract

Canonical types: shared/contracts.ts. Coordinates are [longitude, latitude]; unknown location is null. Timestamps use ISO 8601. Responses use application/json.

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| GET | /board | — | Board |
| POST | /incidents/:id/actions | IncidentAction | Updated Board |
| POST | /plans | — | Board containing a proposed RoutePlan |
| POST | /plans/:id/approve | — | Board containing an approved plan |
| POST | /plans/:id/alerts | — | Board with alert records and assigned requests |

Verify data:
```json
{"type":"verify","corrections":{"nodeId":"c","people":24,"quantity":6,"priority":"critical"}}
```
Complete an already dispatched request:
```json
{"type":"deliver"}
```

## Required lifecycle
1. Collected reports start as needs_review. They must not become incident pins before verification.
2. The coordinator reviews original evidence and corrects extracted fields. Verification records verifiedAt and increments board.revision.
3. The planner uses only verified, undispatched requests and available teams. Generating a plan creates no assignments or alerts.
4. Route approval records approvedAt. It creates no alerts.
5. Explicit alerting reserves teams, assigns requests and creates messages. The demo stores simulated messages only. Production must use an authenticated backend delivery integration and actual queued/sent/failed/acknowledged statuses; extend RescuerAlert accordingly.
6. Repeated alerting for the same plan must be idempotent. Use the plan ID as the backend idempotency key.

Reject stale plan/revision combinations and infeasible assignments. Verify availability, total capacity, supply capability and route constraints again when alerting, in one authoritative backend transaction. Verifying additional data or completing an assignment invalidates an unsent plan. Return 409 for stale plans and 400 for invalid inputs.

## Demo assumptions
Six initial fictional reports, one optional additional report, three teams and a 3×3 weighted network with one closed link. Quantities use standardized supply totes. Supplies are assumed preloaded; depot inventory is not modeled. Each team starts at its depot. Each stop takes 2 minutes; return travel is excluded. The optimizer supports at most eight verified requests, enumerates feasible stop orders, then chooses disjoint team routes using dynamic programming. It first maximizes served urgency weight, then minimizes weighted arrival time (critical 8, high 3, normal 1). This is exact for those assumptions, not a real road routing claim.

## AWS handoff
Keep Bedrock responsible for intake, clarification and explanation; use verified coordinates and trusted routing data for real routes. The current location selector is limited to demo network nodes. Replace it with backend geocoding/confirmed place IDs alongside a live routing implementation. Replace synthetic network overlays in OperationsMap when doing so.

Adapter: src/services/api.ts. Set VITE_DATA_MODE=live and VITE_API_BASE_URL in .env.local and restart Vite. API errors stay visible; no silent demo fallback. Live mode requires all revised endpoints. The initial load and explicit refresh retrieve server state; polling/streaming is a future integration.

Keep AWS credentials server-side. Add source provenance, reviewer identity, authorization, inventory, request versions and delivery acknowledgments when connecting live operations.
