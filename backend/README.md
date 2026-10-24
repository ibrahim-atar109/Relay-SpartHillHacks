# Persistent AWS workspace

The backend now implements the authenticated board API, DynamoDB storage, server-enforced workflow rules, real-address geocoding, editable teams/depots, and private S3 plain-text intake. Demo mode remains available. Nothing is deployed until the SAM stack is updated.

## Update the existing stack

From the repository root:
```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm build:backend
sam validate --lint --template-file backend/infra/template.yaml
sam deploy --guided --template-file backend/infra/template.yaml
```

Use the **existing relay-bedrock stack**, us-east-1, the exact current Amplify origin (no trailing slash), and your already-working Nova model ID and resource ARNs. Do not create a new stack/user pool unnecessarily. Inspect the changeset before approval; do not approve unexpected replacements of existing Cognito resources. New resources are five DynamoDB tables, a workspace Lambda/log group, private upload bucket/policy and Cognito groups. Both Lambda bundles in backend/dist must be deployed.

For the prebuilt ZIP, upload relay-persistence-backend.zip through CloudShell Actions > Upload file, extract into a NEW folder, then run:
```bash
unzip relay-persistence-backend.zip -d relay-persistence-backend
cd relay-persistence-backend
sam validate --lint --template-file infra/template.yaml
sam deploy --guided --template-file infra/template.yaml
```
At the config filename prompt, press Enter for samconfig.toml; do not type y. Re-enter the existing stack/model parameters if the new folder has no saved SAM config. Keep rollback enabled. Building/deploying only the Amplify frontend does not deploy Lambda.

The deployment identity needs CloudFormation, Lambda, API Gateway, IAM role creation/pass-role, Cognito (including groups), DynamoDB tables/backups and S3 permissions. The template grants runtime Bedrock, Routes, Places, scoped DynamoDB and scoped S3 access. Hackathon organization policies can still deny these actions; do not try to bypass them.

## Assign coordinator access

CloudFormation > relay-bedrock > Outputs gives CognitoUserPoolId, CognitoClientId, AwsRegion and WorkspaceApiUrl. The existing pool/client are retained when updating the same stack.

Cognito > User pools > that pool > Groups > Coordinators > Add user to group. Select your existing username and add it. Alternatively:
```bash
aws cognito-idp admin-add-user-to-group --user-pool-id YOUR_POOL_ID --username YOUR_USERNAME --group-name Coordinators --region us-east-1
```
Sign out and back in after adding membership so the token contains the new group. Other authenticated pool users have read-only board access. There is no unauthenticated public ingestion.

## Connect Amplify

Set these public build variables in Amplify:
```text
VITE_DATA_MODE=live
VITE_API_BASE_URL=<WorkspaceApiUrl>
VITE_AI_API_URL=<WorkspaceApiUrl>
VITE_AWS_REGION=us-east-1
VITE_COGNITO_CLIENT_ID=<CognitoClientId>
```
Redeploy/rebuild the frontend after saving. Never put AWS keys/passwords in VITE_* variables. Keep VITE_DATA_MODE=demo until the backend deployment and coordinator membership are complete. If any AWS deployment fails, leave demo mode enabled.

## First-use smoke test

1. Sign in. A new live board is empty; browser-memory demo data is not migrated.
2. Under Your response teams, expand Manage teams and depots. Add a name, capacity, capabilities, availability and a real depot address; look it up and choose the correct candidate.
3. Create a fictional test report mentioning a real public address with city/state, people and standardized supply totes. Or read a .txt file; optionally import the original text through private S3.
4. Look up and confirm the reported address, category, urgency and counts. Verify it onto the map.
5. Plan roads, review and approve the plan, then explicitly assign teams/create simulated alerts. No external message is sent.
6. Refresh, sign in again and confirm the saved data remains. A second signed-in tab should see changes within 15 seconds while idle/visible.
7. Test a read-only user: GET /board succeeds, writes return 403. Attempting a stale version should return 409, not overwrite another coordinator's update.

## Limits and data protection

This is one shared hackathon workspace per stack, with 200 reports, 20 teams and up to 40 verified reports per plan. Browser audio remains local; voice transcripts persist. .txt documents only, no PDF/OCR or Transcribe. SNS/SES and inbound messaging are not connected; outbox messages remain simulated in live mode too.

DynamoDB is encrypted with point-in-time recovery and Retain policies. It and backups incur AWS charges and are not automatically deleted with the stack. S3 staging objects expire after one day; lifecycle expiry is asynchronous. Report text remains in DynamoDB. Geocoding uses IntendedUse=Storage, which has its own pricing. Use fictional personal details until you define retention, deletion, consent, least-privilege access and redaction; the current application has no erasure/archive workflow or tenant isolation.

See ../docs/API.md for endpoint bodies, concurrency behavior, routing assumptions, and the explicit production gaps.
