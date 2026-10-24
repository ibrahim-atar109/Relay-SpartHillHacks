# SpartHill-Hacks-Project

Team: Andrew Liu, Cody, Johnny, Ibrahim

andrews change

Team: Andrew Liu, Cody, Johnny, Ibrahim




test commit 1
test commit 2

## Relay demo

The working React/TypeScript demo lives in this repository. Run `pnpm install`, then `pnpm dev` and open http://127.0.0.1:5173 in Chrome.

For one-button startup, open Run and Debug in VS Code, select **Relay demo · Chrome**, and press **F5**. If Vite is already running, choose **Relay demo · Chrome (server already running)**.

The workflow is: collect reports → verify them onto the map → generate routes → verify the route plan → explicitly create simulated rescuer alerts. Amazon Bedrock extracts reports, asks clarification questions, and reviews server-computed routes. Amazon Location provides road travel times, street-following geometry and driving directions between the sample locations. See [Bedrock setup](docs/BEDROCK_SETUP.md) for backend deployment and Amplify configuration. The board remains a browser-memory scenario; persistence, arbitrary-address geocoding, audio transcription and notifications require separate integrations.

See [running the demo](docs/RUN_DEMO.md), [API contract](docs/API.md), and [team workflow](docs/TEAM_WORKFLOW.md).
