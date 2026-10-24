import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const board = (version: number) => ({ version, revision: 0, incidents: [], teams: [], plan: null, activity: [], alerts: [], blockedEdgeIds: [] });
beforeEach(() => {
  vi.resetModules(); vi.stubEnv('VITE_DATA_MODE','live'); vi.stubEnv('VITE_API_BASE_URL','https://workspace.example'); vi.stubEnv('VITE_AI_API_URL','https://workspace.example'); vi.stubEnv('VITE_AWS_REGION','us-east-1'); vi.stubEnv('VITE_COGNITO_CLIENT_ID','client'); vi.stubGlobal('fetch',vi.fn());
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function signedIn() {
  const auth = await import('./ai'); vi.mocked(fetch).mockResolvedValueOnce(response({ AuthenticationResult: { IdToken:'jwt', ExpiresIn:3600 } })); await auth.signInAi('user','password'); return auth;
}
describe('live authenticated adapter', () => {
  it('preserves an explicitly captured edit version even after polling a newer board', async () => {
    await signedIn(); const {api} = await import('./api');
    vi.mocked(fetch).mockResolvedValueOnce(response(board(9))); await api.getBoard();
    vi.mocked(fetch).mockResolvedValueOnce(response({error:'Draft is stale'},409));
    await expect(api.saveTeam({id:'team',name:'Solo',members:2,capacity:10,status:'available',capabilities:['water'],location:{label:'Depot',coordinates:[-122,37]}},7)).rejects.toThrow('stale');
    expect(JSON.parse(vi.mocked(fetch).mock.calls.at(-1)![1]?.body as string).expectedVersion).toBe(7);
  });
  it('requires authentication, loads persisted data and attaches the current version to writes', async () => {
    const { api } = await import('./api'); await expect(api.getBoard()).rejects.toThrow('Sign in'); expect(fetch).not.toHaveBeenCalled();
    await signedIn(); vi.mocked(fetch).mockResolvedValueOnce(response(board(7))); await api.getBoard();
    vi.mocked(fetch).mockResolvedValueOnce(response(board(8))); await api.act('request/id', {type:'deliver'});
    const call = vi.mocked(fetch).mock.calls.at(-1)!;
    expect(call[0]).toBe('https://workspace.example/incidents/request%2Fid/actions');
    expect(call[1]?.headers).toMatchObject({ Authorization:'Bearer jwt' }); expect(JSON.parse(call[1]?.body as string)).toEqual({type:'deliver',expectedVersion:7});
  });
  it('does not sign out for a missing coordinator role and never silently falls back to demo data', async () => {
    const auth = await signedIn(); const {api} = await import('./api');
    vi.mocked(fetch).mockResolvedValueOnce(response({error:'Coordinator role required'},403));
    await expect(api.plan()).rejects.toThrow('Coordinator role'); expect(auth.aiSignedIn()).toBe(true);
    vi.mocked(fetch).mockResolvedValueOnce(response({error:'Stale board'},409)); await expect(api.act('request',{type:'deliver'})).rejects.toThrow('Stale board');
    vi.mocked(fetch).mockResolvedValueOnce(response({},401)); await expect(api.getBoard()).rejects.toThrow('expired'); expect(auth.aiSignedIn()).toBe(false);
  });
  it('persists voice text but never uploads browser blob references', async () => {
    await signedIn(); const {api} = await import('./api');
    vi.mocked(fetch).mockResolvedValueOnce(response(board(2))); await api.getBoard();
    vi.mocked(fetch).mockResolvedValueOnce(response({...board(3),incidents:[{id:'voice',originalReport:'Caller report'}]}));
    const result = await api.submitVoiceReport('Caller report','blob:local',[{text:'Caller report',audioUrl:'blob:local'}]);
    expect(result.incidents[0].audioUrl).toBe('blob:local');
    const payload = vi.mocked(fetch).mock.calls.at(-1)![1]?.body as string;
    expect(payload).not.toContain('blob:'); expect(JSON.parse(payload)).toEqual({report:'Caller report',source:'voice',expectedVersion:2});
    api.clearLocalSession();
  });
  it('uploads only through a signed S3 form without leaking Cognito tokens to S3', async () => {
    await signedIn(); const {api} = await import('./api');
    vi.mocked(fetch).mockResolvedValueOnce(response(board(5))); await api.getBoard();
    vi.mocked(fetch).mockResolvedValueOnce(response({key:'incoming/user/doc.txt',url:'https://private-s3.example',fields:{key:'incoming/user/doc.txt',policy:'signed'}}));
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null,{status:204}));
    vi.mocked(fetch).mockResolvedValueOnce(response(board(6)));
    await api.importDocument(new File(['Report'],'report.txt',{type:'text/plain'}));
    const upload = vi.mocked(fetch).mock.calls.find(([url])=>url==='https://private-s3.example')!;
    expect(upload[1]?.body).toBeInstanceOf(FormData); expect(upload[1]?.headers).toBeUndefined();
    expect(JSON.parse(vi.mocked(fetch).mock.calls.at(-1)![1]?.body as string)).toEqual({key:'incoming/user/doc.txt',expectedVersion:5});
  });
});
