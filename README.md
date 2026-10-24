# SpartHill-Hacks-Project

Team: Andrew Liu, Cody, Johnny, Ibrahim

andrews change

Team: Andrew Liu, Cody, Johnny, Ibrahim




test commit 1
test commit 2

## Relay demo

### Simulated 911 calls and voice input

Choose **Simulate 911 call** to open the training conversation integrated from `andrew01`. Speak a reply, stop to send it, and answer the rules-based dispatcher's follow-up questions. You can also type replies if speech recognition is unavailable. Microphone input requires a supported browser (such as Chrome), HTTPS or localhost, and your permission; the browser's speech service may process audio online. No emergency service is contacted.

Finishing a call adds its transcript and session-only audio playback to the report queue, awaiting human review. Use **Analyze with Bedrock** to extract details after signing in, then verify the report before including it in road routing. Audio blob references are excluded from backend requests and released when the scenario resets. The current San José scenario, iOS-inspired layout, Nova/Bedrock integration and Amazon Location road routes are preserved.

The working React/TypeScript demo lives in this repository. Run `pnpm install`, then `pnpm dev` and open http://127.0.0.1:5173 in Chrome.

For one-button startup, open Run and Debug in VS Code, select **Relay demo · Chrome**, and press **F5**. If Vite is already running, choose **Relay demo · Chrome (server already running)**.

The workflow is: collect reports → verify them onto the map → generate routes → verify the route plan → explicitly create simulated rescuer alerts. Amazon Bedrock extracts reports, asks clarification questions, and reviews server-computed routes. Amazon Location provides road travel times, street-following geometry and driving directions between the sample locations. See [Bedrock setup](docs/BEDROCK_SETUP.md) for backend deployment and Amplify configuration. The board remains a browser-memory scenario; persistence, arbitrary-address geocoding, audio transcription and notifications require separate integrations.

See [running the demo](docs/RUN_DEMO.md), [API contract](docs/API.md), and [team workflow](docs/TEAM_WORKFLOW.md).
