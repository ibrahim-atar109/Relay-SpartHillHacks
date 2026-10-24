# Connect Relay to Amazon Bedrock

## What the implementation does

- Text messages, pasted voice transcripts, and form text are submitted to Bedrock for extraction. It returns a summary, supply category, urgency, people/tote counts, missing information and clarification questions.
- Every extracted report starts in `needs_review`, off the map. Unknown values stay unknown until the coordinator confirms them. Supply totes are not inferred from people, bottles or medical doses.
- The report detail panel can reanalyze seeded reports or new reports with additional answers from the reporter. Original text and follow-up evidence stay available for review.
- Route generation calls the Lambda backend. Amazon Location Routes V2 supplies a directed driving-time matrix for optimization, then road geometry and driving instructions for each chosen leg. The exact optimizer computes feasible assignments and stop order; Bedrock adds a separate explanation and review checklist. AI cannot overwrite computed routes. Review, approval and simulated alerts remain explicit steps. Road routing requires `geo-routes:CalculateRouteMatrix` and `geo-routes:CalculateRoutes` on the Region's `provider/default` ARN, included in the SAM template.
- Responses record the Bedrock model ID, AWS request ID and time. Invalid model output or failed inference produces a visible error; there is no silent mock AI response.

Architecture: Amplify React frontend → API Gateway with Cognito JWT authentication → Lambda → Bedrock Converse. Backend SDK credentials come from the Lambda execution role. No Bedrock API key or AWS secret is required in the frontend.

There are now two modes: **demo** keeps the browser-memory sample scenario; **live** uses the persistent DynamoDB workspace with real addresses and editable depots. Follow [the persistence deployment and switch-over steps](../backend/README.md) for live mode. The remaining steps below describe optional AI setup and demo use. Both modes are hackathon prototypes: alerts remain simulated; traffic, verified hazard avoidance, live audio uploads and inbound messaging are not implemented.

## Updating an existing stack for AI call intake

The AI function now also serves `POST /ai/call-turn` and `POST /ai/call-report`. These are new API Gateway routes, so **uploading Lambda code alone is not enough**: run `pnpm run build:backend` and `sam deploy` with your existing parameters (same `BedrockModelId`/`BedrockResourceArns`). No new IAM permissions are needed beyond `bedrock:InvokeModel` on the model already configured. Verify by signing in on the site and opening **Simulate 911 call**: the first assistant message must arrive from Bedrock (the call shows an error, never a scripted reply, if it fails).

## 1. Choose a Region and confirm a model works

Use the AWS account supplied by the hackathon. In the console, record the Region in the top right. Keep Bedrock, Lambda, API Gateway and Cognito in that Region for this setup.

Open Bedrock's model playground and test a text model that supports **Converse**. Copy its model ID or inference profile ID. For example, `amazon.nova-lite-v1:0` is an example model ID, not a guarantee your account/Region permits it. Use the actual ID shown by your playground's API example.

For direct model invocation, the resource ARN generally looks like:

```text
arn:aws:bedrock:REGION::foundation-model/MODEL_ID
```

For a cross-Region inference profile, provide the profile ARN plus all required model ARNs in source/destination Regions. Global profiles have additional resource requirements. Copy these from the profile/official IAM instructions; do not put a profile ID into a foundation-model ARN. The template accepts these as a comma-separated `BedrockResourceArns` parameter.

If the playground itself fails, ask the hackathon AWS administrator to enable the selected model and inference permissions before deploying this app's backend. Model access in the console alone does not prove your session can create Lambda/IAM/Cognito resources.

## 2. Build and deploy the backend

The backend template is `backend/infra/template.yaml`. It creates a Cognito user pool/client, authenticated AI and board endpoints, two Lambda functions, scoped AWS permissions, five DynamoDB tables, private S3 text staging, Cognito groups and seven-day log groups. Only administrators can create coordinator accounts. API throttles and a Lambda concurrency limit bound concurrent inference.

Use Node.js 24, pnpm, the AWS CLI and AWS SAM CLI. Authenticate the CLI to the hackathon account using the organizer's method (for example `aws configure sso` then `aws sso login`). Never commit temporary access keys. Run `aws sts get-caller-identity` to verify the intended account. If you use a named CLI profile, pass it to AWS/SAM commands or select it in your shell.

From the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm run build:backend
sam validate --lint --template-file backend/infra/template.yaml
sam deploy --guided --template-file backend/infra/template.yaml
```

In the guided deployment, select:

- Stack name: `relay-bedrock`
- AWS Region: your tested Bedrock Region
- `FrontendOrigin`: your exact Amplify origin, such as `https://your-branch.your-app-id.amplifyapp.com`, without a trailing slash
- `BedrockModelId`: the exact tested model or inference profile ID
- `BedrockResourceArns`: the model/profile resource ARN(s) from step 1, separated by commas
- Allow SAM to create the execution role when it asks about IAM capabilities
- Keep API authorization enabled; the template defines a Cognito JWT authorizer

This creates AWS resources and incurs normal AWS/Bedrock usage against the account's credits. IAM/CloudFormation deployment privileges must come from the hackathon organizer; having Bedrock playground access does not grant them automatically.

SAM uploads `backend/dist/index.js`, which bundles the actual SDK and shared route solver. Building only the frontend (`pnpm run build`) does not deploy Lambda. After backend code changes, run `pnpm run build:backend` and redeploy the SAM stack separately. Amplify's existing build continues to deploy just the frontend.

If the local AWS/SAM CLI is unavailable, AWS CloudShell can be used to clone the pushed branch and run these commands. Check `node --version`, `pnpm --version`, `aws --version` and `sam --version` first; install the missing tools per the AWS documentation and use Node.js 24 for this project's pnpm version. For private repositories, use your normal authenticated GitHub workflow.

After deployment, the stack outputs give you `AiApiUrl`, `CognitoClientId`, `CognitoUserPoolId`, and `AwsRegion`. They are also visible in CloudFormation → `relay-bedrock` → Outputs.

## 3. Create a coordinator account

In Amazon Cognito → User pools → the pool created by this stack → Users → Create user:

1. Choose a username for the coordinator.
2. Set a temporary password. Do not request an email invitation unless you have configured email delivery and the corresponding attributes.
3. Give the temporary password to your teammate privately.

On first sign-in the Relay form asks the coordinator to choose a permanent password (at least 12 characters, uppercase, lowercase, number and symbol). The public app client has no secret. Tokens stay in memory in the tab, not in source code or persistent browser storage. A reload/session expiry requires sign-in again.

## 4. Plug the backend into Amplify

Amplify → your app → Hosting/Environment variables (the exact navigation label varies by console version). Set:

```text
VITE_DATA_MODE=demo
VITE_AI_API_URL=<AiApiUrl output>
VITE_AWS_REGION=<AwsRegion output>
VITE_COGNITO_CLIENT_ID=<CognitoClientId output>
```

These values are public identifiers. Never add `AWS_SECRET_ACCESS_KEY`, Bedrock API keys, account passwords or coordinator passwords to any `VITE_*` value.

Rebuild/redeploy the latest frontend commit: Vite embeds these settings at build time. No value for `VITE_API_BASE_URL` is required while the scenario board is used.

For local development, copy `.env.example` to `.env.local`, set the same values and restart Vite. The API CORS origin currently permits only your configured Amplify origin; to test browser API calls locally, add `http://127.0.0.1:5173` to `AllowOrigins` in the backend template and redeploy. CORS is not authentication; JWT verification controls access.

## 5. Verify the deployed integration

1. Open the Amplify site and sign in to AI features using the coordinator account.
2. Submit: `Northside shelter needs 4 supply totes of water for 16 people. Supplies are running low.`
3. Confirm the new report shows **Bedrock extraction**, model/time, and remains off the map.
4. Submit an ambiguous report such as `We are at the library and need water.` Confirm unknown counts/location produce missing information and questions.
5. In the report detail, add `Eastside library. 12 people need 3 standardized supply totes of water.` and click **Analyze with Bedrock**. Review the original and follow-up evidence before confirming fields.
6. Verify one or more reports, then click **Optimize routes & review with Bedrock**. The plan should show exact solver assumptions and a separate **Bedrock plan review** section.
7. Confirm the road polylines follow streets, expand the driving directions for each stop, and check capacity/capability and exclusion of unverified reports. The synthetic `c-e` closure is not a real road closure and does not apply to this road plan. Approve the plan to enable simulated alerts. No external messages are sent.
8. Sign out and confirm AI actions require sign-in.

## Troubleshooting

- Setup pending: all three AI configuration values must be present when Amplify builds the site. Keep `VITE_DATA_MODE=demo`.
- Sign-in access error: verify the stack's client ID and Region, and create the user in that stack's user pool. Follow the first-login new-password flow.
- HTTP 401/403: sign in again; check API JWT issuer/audience match the pool/client from this stack.
- Browser CORS error: `FrontendOrigin` must exactly match the browser origin, with no path or trailing slash. Changing branches changes the origin.
- HTTP 502: inspect Lambda → Monitor → CloudWatch logs. Check `BEDROCK_MODEL_ID`, Region, account access and the Lambda execution role's model/profile resource ARNs. The logs exclude report text/model output. AWS metadata can be used to correlate model failures.
- HTTP 429: model quota or API throttling; wait briefly and retry. A failed AI request does not silently enable a local plan.
- Road routing permission error: redeploy the updated SAM template, which grants `geo-routes:CalculateRouteMatrix` and `geo-routes:CalculateRoutes` on `arn:aws:geo-routes:REGION::provider/default`. Uploading Lambda code alone cannot add these permissions. Both APIs incur normal Amazon Location usage charges.
- Real place cannot be mapped: this prototype requires the coordinator to select a sample location. Arbitrary addresses require geocoding and confirmed access coordinates. Amazon Location road geometry does not verify that a sample point is an actual shelter or clinic.

## Validation performed in the repository

`pnpm run build`, `pnpm run typecheck:backend`, `pnpm run build:backend` and `pnpm test` check compilation, packaging, validation, authenticated API behavior, unknown model fields, constrained routes and the approval lifecycle. Tests mock AWS responses. A successful real Bedrock call still needs your account, model access and deployed stack; no AWS inference has been made from this workspace.

AWS references:

- [Bedrock Converse API](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html)
- [Geographic inference-profile permissions](https://docs.aws.amazon.com/bedrock/latest/userguide/geographic-cross-region-inference.html)
- [Global inference-profile permissions](https://docs.aws.amazon.com/bedrock/latest/userguide/global-cross-region-inference.html)
- [SAM CLI guided deployment](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/sam-cli-command-reference-sam-deploy.html)
- [API Gateway JWT authorization](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html)
