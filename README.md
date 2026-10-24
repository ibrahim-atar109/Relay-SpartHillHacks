# SpartHill-Hacks-Project

Team: Andrew Liu, Cody, Johnny, Ibrahim

andrews change

Team: Andrew Liu, Cody, Johnny, Ibrahim




test commit 1
test commit 2

## Relay demo

### Scenario: Hurricane Katrina, St. Bernard Parish (Aug 29–30, 2005)

The demo plays a **simulated** incoming-information feed (news, 911 calls, police reports) modeled on publicly documented Katrina conditions in Arabi, Chalmette, Meraux and Violet: levee overtopping, Industrial Canal flooding, parish-wide outages, fires, road closures and the Meraux oil spill. Feed items are training content, not archival quotes or live data. Hazards appear on the map; road closures are drawn as dashed red lines, are applied to the local planner, and invalidate any plan not yet dispatched. Amazon Location driving routes do **not** know about simulated closures, so the plan panel asks the coordinator to check routes against them.

The website explains the two AI roles:

1. **Overflow call intake.** When human 911 operators are unavailable, an AI assistant talks with the caller and files a report.
2. **Dispatch decision support.** AI analyzes reports and proposes routes. Humans verify reports, verify routes and decide every deployment.

Pipeline: collect → AI analysis + human verification → optimal routes → human route verification → humans deploy (alerts remain simulated).

### Simulated 911 call (Amazon Bedrock)

**Simulate 911 call** starts a real conversation with the configured Bedrock model through `POST /ai/call-turn` (Cognito-authenticated Lambda, Bedrock Converse via the same `BEDROCK_MODEL_ID`). The assistant identifies itself as an AI in a training simulation and asks adaptive follow-up questions. There is no scripted fallback: if the backend isn't configured or signed in, the call can't start, and a failed reply shows an error with a retry button. Caller speech is transcribed in the browser. Each finalized turn is sent with the conversation history. Assistant replies are read aloud, and the microphone stays off during playback.

**End call & file report** calls `POST /ai/call-report`. The model returns validated structured fields plus facts, each citing the caller turn and a verbatim quote. Any fact whose quote isn't found in that caller turn is discarded and counted. Location, what happened, threats, people, injuries and access that weren't established are listed as unknown. The report joins the review queue with its full transcript and stays off the map until a human verifies it. In live mode the transcript is stored through `/incidents`, which re-extracts it server-side; the per-fact quotes are shown only in demo mode for now.

The working React/TypeScript demo lives in this repository. Run `pnpm install`, then `pnpm dev` and open http://127.0.0.1:5173 in Chrome.

For one-button startup, open Run and Debug in VS Code, select **Relay demo · Chrome**, and press **F5**. If Vite is already running, choose **Relay demo · Chrome (server already running)**.

The workflow is: collect reports → verify them onto the map → generate routes → verify the route plan → explicitly create simulated rescuer alerts. Amazon Bedrock extracts reports, asks clarification questions, and reviews server-computed routes. Amazon Location provides road travel times, street-following geometry and driving directions between the sample locations. See [Bedrock setup](docs/BEDROCK_SETUP.md) for backend deployment and Amplify configuration. Demo mode remains browser-memory. Live mode now has DynamoDB persistence, authenticated board APIs, real-address geocoding, editable teams/depots, 15-second polling, actor-attributed activity, exact-text duplicate warnings and optional private S3 .txt extraction. See [deploying persistence and switching to live mode](backend/README.md). External notifications and AWS Transcribe are not implemented; alerts remain explicitly simulated, and browser audio is session-only.

See [running the demo](docs/RUN_DEMO.md), [API contract](docs/API.md), and [team workflow](docs/TEAM_WORKFLOW.md).
