# Relay · Relief operations

SpartHill Hacks — Andrew Liu, Cody, Johnny, Ibrahim.

A React/TypeScript foundation for reviewing relief requests, mapping locations and coordinating essential deliveries.

## Run
Install Node.js 22.12+ or 24 LTS and pnpm:
```sh
pnpm install
pnpm dev
```
Open the Vite URL. Demo mode needs no AWS credentials. Copy .env.example to .env.local to configure live APIs or maps. Reloading resets demo state.

## Checks
```sh
pnpm typecheck
pnpm test
pnpm build
```

## Structure
```text
src/
  App.tsx                Dashboard composition
  styles.css             Design and responsive layout
  components/            Shared UI components
  data/fixtures.ts       Simulated scenario
  features/
    incidents/           Inbox and review panel
    map/                 MapLibre markers and selection
    operations/          Demo constraints and tests
    reporting/           Future report/clarification UI
  services/api.ts        Demo/live API boundary
shared/contracts.ts      Types shared with AWS
backend/
  handlers/              Future Lambda handlers
  services/              Future AWS clients
  infra/                 Future SAM/CDK infrastructure
docs/
  API.md                 API contract
  TEAM_WORKFLOW.md       Ownership and Git workflow
```

Working: searchable/filterable inbox, map selection, source review, simulated report arrival, verification gates, eligible-team recommendations, approval/delivery actions, team reservation/release, metrics and activity.

Integration points: AWS deployment, AI, phone calls, transcription, route calculation and factual verification are not implemented. Prepared summaries and rule-based matches are explicitly labeled. The AWS team should implement the documented backend before enabling live mode. Keep AWS credentials out of VITE_* variables.

The map uses OpenStreetMap tiles for light development with attribution. Use Amazon Location for deployment. Tiles and optional Google Fonts require internet; the inbox remains usable when tiles fail.

Start with [team workflow](docs/TEAM_WORKFLOW.md) and [API contract](docs/API.md).
