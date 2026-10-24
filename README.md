# SpartHill-Hacks-Project

Team: Andrew Liu, Cody, Johnny, Ibrahim

andrews change

Team: Andrew Liu, Cody, Johnny, Ibrahim




test commit 1
test commit 2

## Relay demo

### Simulated 911 calls and voice input

Choose **Simulate 911 call** to open the training conversation integrated from `andrew01`. Sign in, speak a reply, stop to send it, and answer the configured Bedrock model’s follow-up questions. The scripted dispatcher has been removed; real model replies are read aloud when browser TTS is available, with microphone capture blocked during playback. You can also type replies if speech recognition is unavailable. Microphone input requires a supported browser (such as Chrome), HTTPS or localhost, and your permission; the browser's speech service may process audio online. No emergency service is contacted.

Finishing a call adds its transcript and session-only audio playback to the report queue, awaiting human review. Finishing automatically extracts structured reported facts with Bedrock, including threats, injuries and access obstacles with unknown values preserved; verify the report before including it in road routing. Audio blob references are excluded from backend requests and released when the scenario resets. The current San José scenario, iOS-inspired layout, Nova/Bedrock integration and Amazon Location road routes are preserved.

The working React/TypeScript demo lives in this repository. Run `pnpm install`, then `pnpm dev` and open http://127.0.0.1:5173 in Chrome.

For one-button startup, open Run and Debug in VS Code, select **Relay demo · Chrome**, and press **F5**. If Vite is already running, choose **Relay demo · Chrome (server already running)**.

The workflow is: collect reports → verify them onto the map → generate routes → verify the route plan → explicitly create simulated rescuer alerts. Amazon Bedrock extracts reports, asks clarification questions, and reviews server-computed routes. Amazon Location provides road travel times, street-following geometry and driving directions between the sample locations. See [Bedrock setup](docs/BEDROCK_SETUP.md) for backend deployment and Amplify configuration. Demo mode remains browser-memory. Live mode now has DynamoDB persistence, authenticated board APIs, real-address geocoding, editable teams/depots, 15-second polling, actor-attributed activity, exact-text duplicate warnings and optional private S3 .txt extraction. See [deploying persistence and switching to live mode](backend/README.md). External notifications and AWS Transcribe are not implemented; alerts remain explicitly simulated, and browser audio is session-only.

See [running the demo](docs/RUN_DEMO.md), [API contract](docs/API.md), and [team workflow](docs/TEAM_WORKFLOW.md).

## Katrina-inspired training exercise and dark interface

The initial view opens an isolated St. Bernard Parish exercise with clearly fictional news, 911 intake bulletins (not fabricated call transcripts), and police reports. Start the feed to run actual Bedrock analysis, review uncertainty, confirm urgency, and verify each bulletin. Pause before generating Amazon Location assessment routes; review and approve before simulated deployment. Fire and road-blockage boxes become exercise avoidance constraints; intersecting road polylines are rejected. Assessment slots are explicitly artificial scheduling units, not victim or tote estimates. Present-day map/road data is not a 2005 historical replay. Reset/reload clears the drill without changing the DynamoDB board; Saved operations preserves the existing workflow.

A professional dark theme and reduced-motion-aware Relay logo opening animation are included. No mock AI responses or keyword dispatcher rules are used in production; test mocks remain in test files. The source bulletins are intentionally fictional exercise fixtures, not claims of real events.
