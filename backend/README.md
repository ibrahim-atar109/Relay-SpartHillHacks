# AWS team workspace

The Bedrock implementation is ready to build in `handlers/ai.ts`, with `services/bedrock.ts`, input validation, and the deployable SAM template in `infra/template.yaml`. Run `pnpm run build:backend` from the repository root. See [the complete deployment guide](../docs/BEDROCK_SETUP.md).

It provides authenticated `/ai/extract` and `/ai/plan` endpoints independently of the full board API below. The scenario board stays in browser memory; no AWS resources are deployed until you deploy the SAM stack.

Place Lambda handlers in handlers/, Bedrock/Transcribe/Location clients in services/, and SAM/CDK infrastructure in infra/.

For future shared persistence, implement ../docs/API.md using ../shared/contracts.ts.

- AWS person 1: account/model access, infrastructure, DynamoDB and HTTP endpoints.
- AWS person 2: intake extraction/clarification, Bedrock recommendations, Transcribe and Location.

Backend validation is authoritative. Check inputs, verification state, availability and capacity. Use conditional/transactional writes when reserving teams. The demo capacity field uses simplified units; agree on inventory and units before live dispatch. Preserve provenance; valid JSON does not mean factually verified data.

Keep AWS credentials out of browser code and VITE_* variables. Configure CORS for the frontend origin. Add authentication before exposing real reports or dispatch actions publicly.
