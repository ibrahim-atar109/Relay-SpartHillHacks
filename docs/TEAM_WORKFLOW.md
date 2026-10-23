# Team handoff

## Start together
1. Install Node.js 22.12+ or 24 LTS and pnpm.
2. Run pnpm install and pnpm dev. Try simulated report → verification → assignment → delivery.
3. Agree on shared/contracts.ts and docs/API.md with the AWS pair.
4. Merge the baseline before creating feature branches.

## Frontend A: Claude Pro user
Own src/App.tsx, src/services/, src/features/operations/, src/features/map/, and shared/contracts.ts (coordinate changes with AWS).

Use the higher reasoning budget for state transitions, stale approvals, duplicate reports, geographic selection, route overlays and API integration. Keep a single incident/selection state. First connect the board API, then implement editable verification, then route geometry and disruption handling. Check backend errors and stale recommendations.

Prompt:
> Read docs/API.md and shared/contracts.ts. Work in my owned paths. Implement [one behavior] through the existing API adapter while preserving demo mode. Explain the state transitions, implement them, and check missing locations, stale approvals and failed requests. Coordinate prop changes with the UI owner. Do not edit global styles.

## Frontend B: dashboard and interaction polish
Own src/features/incidents/, src/features/reporting/, src/components/ and src/styles.css. Receive data and action callbacks through props.

Build the report/clarification form and a mobile team acknowledgment screen. Improve review cards, responsive layout, keyboard access, loading/empty/error states and presentation. Preserve the muted green/cream visual system. Agree on component props with Frontend A before integration.

Prompt:
> Build [one component] for the existing Relay React/TypeScript app using shared types and props. Preserve the established design. Implement keyboard access, loading, empty, error and disabled states. Edit only my owned UI paths. Do not create another app, change the API adapter or embed new mock datasets in components.

## Git workflow
One small feature per branch; keep main runnable. Example:
```sh
git switch main
git pull --ff-only
git switch -c codex/map-interactions
# Implement a focused change.
git diff
pnpm typecheck
pnpm test
pnpm build
git add src/features/map
git commit -m "Add incident selection to the map"
git push -u origin codex/map-interactions
```
Frontend B can use codex/report-review-ui. Open PRs into main, have one teammate check the diff and behavior, then merge. Aim for small integrations every 30–60 minutes. Before continuing an unmerged branch, commit your work, then:
```sh
git fetch origin
git merge origin/main
```
Read both sides of conflicts and preserve intended combined behavior; rerun checks. Do not blindly accept all incoming changes or force push main. One integrator owns package.json, pnpm-lock.yaml and App.tsx. Everyone runs pnpm install after dependency changes. Keep AWS work under backend/ and coordinate shared contract changes.

## Map and dashboard
- MapLibre renders map data. Unknown locations stay in the inbox. Map selection and list selection share one ID.
- Configure the AWS team's Amazon Location MapLibre style URL in VITE_MAP_STYLE_URL. Restrict public map keys. Keep attribution. Current OpenStreetMap tiles are for light local development; do not bulk download or prefetch them.
- Layout: inbox → map → review panel, counts above, teams/activity below. Show a clear next action for each status.
- Use trusted route geometry and travel-time calculations. Label any schematic straight lines as schematic. AI must not invent coordinates, road safety or arrival times.
- Demo state is memory-only. Prepared summaries and simulated transcripts are labeled; do not present them as live AI/calls.

## Checkpoints
1. Both frontend developers run the same fixture scenario.
2. GET /board replaces fixtures without component rewrites.
3. A real text report passes through Bedrock into the dashboard.
4. Verification and assignment persist through the API.
5. Add voice and disruption behavior only after the core loop works.
6. Freeze features, verify deployment, record and package the submission.

Demo: approve Team Alder for the critical water request; simulate a report; verify it; assign Team Birch; confirm delivery. Observe counts, availability and activity update. The unresolved medicine request demonstrates dispatch blocked by missing location.
