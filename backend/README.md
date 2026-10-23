# AWS team workspace

Place Lambda handlers in handlers/, Bedrock/Transcribe/Location clients in services/, and SAM/CDK infrastructure in infra/.

Implement ../docs/API.md using ../shared/contracts.ts. No AWS resources are deployed by this scaffold.

- AWS person 1: account/model access, infrastructure, DynamoDB and HTTP endpoints.
- AWS person 2: intake extraction/clarification, Bedrock recommendations, Transcribe and Location.

Backend validation is authoritative. Check inputs, verification state, availability and capacity. Use conditional/transactional writes when reserving teams. The demo capacity field uses simplified units; agree on inventory and units before live dispatch. Preserve provenance; valid JSON does not mean factually verified data.

Keep AWS credentials out of browser code and VITE_* variables. Configure CORS for the frontend origin. Add authentication before exposing real reports or dispatch actions publicly.
