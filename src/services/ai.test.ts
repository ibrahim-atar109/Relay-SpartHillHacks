import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_AI_API_URL', 'https://test.example');
  vi.stubEnv('VITE_AWS_REGION', 'us-east-1');
  vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'test-client');
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
describe('AI session and authenticated calls', () => {
  it('requires sign-in before sending a report', async () => {
    const { bedrock } = await import('./ai');
    await expect(bedrock.extract('report')).rejects.toThrow('Sign in');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('handles first-login password replacement and clears the session on 401', async () => {
    const mock = vi.mocked(fetch);
    const auth = await import('./ai');
    mock.mockResolvedValueOnce(response({ ChallengeName: 'NEW_PASSWORD_REQUIRED', Session: 'challenge', ChallengeParameters: { USER_ID_FOR_SRP: 'user' } }));
    expect(await auth.signInAi('user', 'temporary')).toBe('new_password');
    mock.mockResolvedValueOnce(response({ AuthenticationResult: { IdToken: 'jwt', ExpiresIn: 3600 } }));
    await auth.setAiPassword('NewPassword123!');
    expect(auth.aiSignedIn()).toBe(true);
    mock.mockResolvedValueOnce(response({}, 401));
    await expect(auth.bedrock.extract('help')).rejects.toThrow('expired');
    expect(auth.aiSignedIn()).toBe(false);
    expect(mock.mock.calls[2][1]?.headers).toMatchObject({ Authorization: 'Bearer jwt' });
  });
});
