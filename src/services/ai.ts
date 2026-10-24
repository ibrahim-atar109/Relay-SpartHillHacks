import type { Board, ExtractionResponse, PlanResponse, CallMessage, CallResponse } from '../../shared/contracts';
import type { SimulationEvent, SimulationAnalysis, SimulationPlanResponse, VerifiedSimulationEvent } from '../../shared/simulation';

const base = (import.meta.env.VITE_AI_API_URL || '').replace(/\/$/, '');
const region = import.meta.env.VITE_AWS_REGION || '';
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID || '';
export const aiConfigured = !!(base && region && clientId);
let session: { token: string; expiresAt: number } | null = null;
let pendingChallenge: { username: string; session: string } | null = null;
export const aiSignedIn = () => !!session && session.expiresAt > Date.now();
export const aiPasswordPending = () => pendingChallenge !== null;
export function signOutAi() { session = null; pendingChallenge = null; }

async function cognito(target: string, body: unknown) {
  if (!aiConfigured) throw new Error('Configure the AI API URL, AWS Region and Cognito client ID in Amplify.');
  const response = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}` },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Sign-in failed.');
  return data;
}
function acceptAuth(data: { AuthenticationResult?: { IdToken?: string; ExpiresIn?: number } }) {
  const result = data.AuthenticationResult;
  if (!result?.IdToken) throw new Error('Sign-in did not return a token. Ask the account administrator to check the user.');
  session = { token: result.IdToken, expiresAt: Date.now() + (result.ExpiresIn || 3600) * 1000 - 30000 };
  pendingChallenge = null;
}
export async function signInAi(username: string, password: string): Promise<'signed_in' | 'new_password'> {
  const data = await cognito('InitiateAuth', { ClientId: clientId, AuthFlow: 'USER_PASSWORD_AUTH', AuthParameters: { USERNAME: username, PASSWORD: password } });
  if (data.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
    pendingChallenge = { username: data.ChallengeParameters?.USER_ID_FOR_SRP || username, session: data.Session };
    return 'new_password';
  }
  acceptAuth(data);
  return 'signed_in';
}
export async function setAiPassword(password: string) {
  if (!pendingChallenge) throw new Error('Sign in again to change your temporary password.');
  const data = await cognito('RespondToAuthChallenge', {
    ClientId: clientId, ChallengeName: 'NEW_PASSWORD_REQUIRED', Session: pendingChallenge.session,
    ChallengeResponses: { USERNAME: pendingChallenge.username, NEW_PASSWORD: password },
  });
  acceptAuth(data);
}
export function authorizationHeaders(): Record<string, string> {
  if (!aiSignedIn()) {
    const expired = session !== null;
    session = null;
    // An AI action during first login must not erase the Cognito password challenge.
    throw new Error(pendingChallenge ? 'Finish setting your new password above before using AI features.' : expired ? 'Your AI session expired. Sign in above to continue.' : 'Sign in above to use AI features.');
  }
  return { Authorization: `Bearer ${session!.token}` };
}
async function request<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...authorizationHeaders() },
    body: JSON.stringify(body), signal: AbortSignal.timeout(35000),
  });
  if (response.status === 401) { signOutAi(); throw new Error('AI session expired or access denied. Sign in again.'); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'AI request failed.');
  return data as T;
}
export const bedrock = {
  converse: (messages: CallMessage[]) => request<CallResponse>('/ai/voice/converse', { messages }),
  analyzeSimulation: (event: SimulationEvent) => request<SimulationAnalysis>('/ai/simulation/analyze', { eventId: event.id }),
  planSimulation: (events: VerifiedSimulationEvent[]) => request<SimulationPlanResponse>('/ai/simulation/plan', { events }),
  extract: (report: string, followUp?: string) => request<ExtractionResponse>('/ai/extract', { report, followUp }),
  plan: (board: Board) => request<PlanResponse>('/ai/plan', { board: {
    ...board,
    // Browser blob references are useful only in this tab and must not go to AWS.
    incidents: board.incidents.map(({ audioUrl: _audio, recordings: _recordings, ...incident }) => incident),
  } }),
};
