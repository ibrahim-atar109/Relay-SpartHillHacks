# Run Relay in VS Code and Chrome

## One-time setup
1. Open S:\Dev\SpartHill-Hacks-Project using VS Code → File → Open Folder.
2. Install Node.js 24 LTS if needed. In a new VS Code terminal, check node --version.
3. If pnpm is unavailable, run npm install -g pnpm, then restart the terminal.
4. Run pnpm install from the project folder. Dependencies are already installed in this checkout.

## Start and open directly in Chrome
Choose Run and Debug → **Relay demo · Chrome**, then press F5. The included .vscode/tasks.json starts Vite on port 5173, and .vscode/launch.json opens Chrome. Chrome must be installed. VS Code includes the browser debugger; no separate Chrome debugging extension is needed.

If the server is already running, choose **Relay demo · Chrome (server already running)**. This opens Chrome without trying to start another server.

Alternatively:
```powershell
cd S:\Dev\SpartHill-Hacks-Project
pnpm dev
```
Open http://127.0.0.1:5173 in Chrome. Keep the terminal running; Ctrl+C stops Vite. Do not open index.html directly or use Live Server.

If port 5173 is busy, use the already-running configuration or stop your old Vite terminal. strictPort prevents the app silently moving to another port.

## Demo walkthrough
1. Start with six unverified reports. There are no report pins on the map yet. Team locations and schematic network links are still visible.
2. Select a report, compare the synthetic source with the extracted fields, and correct location/people/totes/urgency if needed.
3. Check the confirmation checkbox and click **Verify data & add to map**.
4. Repeat for other reports. For the library request, use the caller's follow-up and select **Eastside library**.
5. Below the map, click **Generate optimal routes**. Review each team's load, ordered stops, estimated arrivals and any unserved requests. The map displays matching colored schematic routes.
6. Check the route review checkbox, then click **Verify routes**.
7. Click **Alert rescuers · demo**. Inspect the simulated outbox. Teams become assigned only at this step. No external messages are sent.
8. Optionally select an assigned request and confirm delivery. A team becomes available once all its assigned requests are complete.
9. **Reset scenario** or a page reload restarts the demo.

Generating routes before all reports are verified is allowed; unverified reports are explicitly excluded. Verifying another report invalidates any unsent plan, requiring another route review.

The local planning agent uses an exact optimizer on the synthetic network. It is not a Bedrock invocation. Internet is used for basemap tiles and optional fonts; all scenario/optimization logic runs locally. Map paths are schematic, not real-road directions.

## Validate
```sh
pnpm typecheck
pnpm test
pnpm build
```

Official VS Code browser debugging reference: https://code.visualstudio.com/docs/nodejs/browser-debugging
