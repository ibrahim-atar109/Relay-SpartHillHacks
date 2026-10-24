# SpartHill-Hacks-Project

Team: Andrew Liu, Cody, Johnny, Ibrahim

andrews change

Team: Andrew Liu, Cody, Johnny, Ibrahim




test commit 1
test commit 2

## Relay demo

The working React/TypeScript demo lives in this repository. Run `pnpm install`, then `pnpm dev` and open http://127.0.0.1:5173 in Chrome.

For one-button startup, open Run and Debug in VS Code, select **Relay demo · Chrome**, and press **F5**. If Vite is already running, choose **Relay demo · Chrome (server already running)**.

The workflow is: review synthetic collected data → verify it onto the map → generate routes → verify the route plan → explicitly alert rescuers. The outbox is simulated and sends no real messages. The local optimizer uses a fictional network; AWS/Bedrock and real routing/notification integrations remain separate.

See [running the demo](docs/RUN_DEMO.md), [API contract](docs/API.md), and [team workflow](docs/TEAM_WORKFLOW.md).

### Katrina / Fort Lauderdale voice-report exercise

The default simulation is set in **Fort Lauderdale, Florida, August 25, 2005**. Katrina's Florida landfall provides historical context ([National Weather Service](https://www.weather.gov/mfl/katrina)); all calls, facilities, closures, travel times, and routes are fictional. Map tiles use OpenStreetMap and require an internet connection.

Choose **New voice report** at the top, then **Start recording** and allow microphone access. Use the optional call guide or speak freely. Stop, listen back, review the read-only transcript, and submit it to the queue. Browser Web Speech recognition supplies the transcript; MediaRecorder captures playback audio. No application API key is needed, but the browser may send speech to its recognition service and require connectivity. Use a supported browser such as Chrome on localhost or HTTPS. Unsupported browsers, denied permissions, and missing transcripts show an explicit error; no fake transcript is substituted. Calls stop after two minutes.

Participant reports are labeled separately from synthetic reports. Their details are not automatically extracted. A coordinator must confirm location, supply category, people, tote count, and urgency before mapping. The current planner supports water, food, and medicine only; other needs can remain in review. The transcript cannot be typed into, so voice remains the participant intake method. Coordinator corrections are separate from the original transcript.

Reports and recording blob URLs live in memory for this tab only. Reset/reload clears them; closing an unsubmitted recording discards it. No emergency calls or alerts are sent. The initial six synthetic calls are static; continuous random arrivals are a future step.
