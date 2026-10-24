# Relay API contract

Canonical types: shared/contracts.ts. Coordinates are [longitude, latitude]. All routes require a Cognito ID token in Authorization: Bearer <token>, checked by API Gateway and Lambda. No AWS credentials belong in the frontend.

## Connected workspace (implemented)

One shared workspace per deployed stack. All authenticated pool users can read it; only users in the **Coordinators** Cognito group can mutate it or invoke geocoding/uploads. The **Viewers** group is a convenient read-only designation. This is not per-tenant or per-report authorization.

| Method | Path | Body | Result |
| --- | --- | --- | --- |
| GET | /board | — | Board with persistence version |
| POST | /incidents | report, source, expectedVersion | Board; extracted report needs review |
| POST | /incidents/import | key, expectedVersion | Board; private S3 UTF-8 text extracted with Bedrock |
| POST | /incidents/:id/analyze | followUp, expectedVersion | Board; original report preserved |
| POST | /incidents/:id/actions | IncidentAction, expectedVersion | Board |
| POST | /teams | name, members, capacity, capabilities, status, location, expectedVersion | Board |
| POST | /teams/:id | same team fields, expectedVersion | Board |
| POST | /locations/geocode | address | candidates; no automatic selection |
| POST | /uploads | {} | key, url, fields for a signed S3 POST |
| POST | /plans | expectedVersion | Board containing server-computed proposed plan |
| POST | /plans/:id/approve | expectedVersion | Board containing approved plan |
| POST | /plans/:id/alerts | expectedVersion | Board with assignments and **simulated** outbox messages |

The frontend automatically includes the version from its last loaded board. Stale versions and changed workflow state return 409; invalid input returns 400; missing login 401; missing coordinator role 403. Errors have an error string. Never retry an unreviewed mutation automatically.

Live verification example:
```json
{"expectedVersion":3,"type":"verify","corrections":{"nodeId":"","location":{"label":"Confirmed street address, city, state","coordinates":[-121.889,37.339]},"people":6,"quantity":2,"priority":"high","category":"water"}}
```
The live server ignores browser node IDs and assigns unique routing keys. Geocoding uses Amazon Location Places with IntendedUse=Storage. A coordinator must explicitly select a result and confirm the address/access point; an address match does not establish that a report is true or access is safe. Team locations use the same coordinate convention.

## Storage and lifecycle

Five encrypted, pay-per-request DynamoDB tables hold reports, teams, plans, simulated alerts, and activity. Plans also holds the board metadata/version record. No seed data is inserted into live mode. Current entities are queried using a fixed workspace partition, pagination, strongly consistent reads and a version fence. All changed entities, the new actor-attributed audit entry and a conditional version increment are committed in one transaction. Historical plans and audit entries remain stored; the board returns the latest 100 activity events.

Workflow rules are shared with the demo but enforced inside Lambda against persisted state: report verification, explicit route approval, capacity/capability/availability checks, assignments, completion, stale plan rejection and idempotent alert retries. Browser-submitted plans/teams/status/AI metadata are not trusted. Changing routing data invalidates unsent plans. Only completing all assigned stops releases a team. No external SMS, email or emergency service is contacted.

The UI polls every 15 seconds while visible and idle, and refreshes after actions. Report IDs and timestamps are server-generated. Exact normalized-text duplicates are flagged for review, not merged or suppressed; semantic duplicate detection is not implemented.

## Planning and limits

Live mode uses confirmed report coordinates and real team/depot coordinates, not the nine demo nodes. Amazon Location supplies directed car travel times, then street-following geometry and instructions. For <=8 verified requests the solver is exact under its model; 9–40 use urgency-first greedy assignment plus up to three adjacent-stop improvement passes, without a global optimality claim. Capacity, supply compatibility and reachability remain hard constraints. Bedrock only explains computed routes.

Hackathon guardrails: 200 total reports per stack, 20 teams, 40 verified requests per planning batch, 8,000 report characters, 4,000 total follow-up characters, one day for S3 uploads. Dispatch the current verified batch before verifying further requests. Oversized DynamoDB records/transactions fail explicitly. High-volume production needs archiving, paginated board APIs and asynchronous plan jobs; this is not an unlimited-volume emergency system.

Travel excludes live traffic, verified hazard avoidance, return trips, loading and depot inventory; supplies are assumed preloaded, departure simultaneous, and each stop takes two minutes. The fictional c-e closure is never applied to real road routing. Coordinate snapping does not confirm an accessible entrance.

## Text and audio evidence

Read .txt locally fills the report editor for review. The optional S3 action uploads the original file privately using a signed POST policy limited to 32KB, text/plain, a per-user random key and a 120-second expiry; server import validates UTF-8 and the 8,000-character cap. Report text is then passed to Bedrock extraction and retained in DynamoDB; S3 is temporary staging, not permanent document evidence. Uploads cannot be read through a public URL. PDFs, images, OCR and automatic multi-report splitting are not implemented.

Voice simulation uses browser speech recognition. Live submission persists the transcript, not audio. Blob URLs/recordings never go to AWS and playback is session-only. Transcribe, inbound SMS/email, external notifications, acknowledgement/delivery receipts and AppSync are not implemented.

## Demo compatibility

VITE_DATA_MODE=demo retains browser-memory fixtures, the fictional location selector, local reset, and optional authenticated POST /ai/extract and POST /ai/plan. Those AI endpoints have strict demo-network validation and are not persistence endpoints. Live uses the workspace endpoints instead. Both modes require human review before routing/assignment.

## Personal information

Use fictional reports for the hackathon. All signed-in users in this stack can see report text and addresses. Tokens stay in memory, API responses use no-store, logs exclude report bodies/model output, tables are encrypted and retained on stack deletion with point-in-time recovery enabled. Reports, historical plans and audit entries have no automatic expiry or erasure endpoint; backups can retain prior values. This is baseline protection, not a production privacy/compliance solution. Define consent, access boundaries, retention/erasure, redaction and an operational security process before using real personal information.
