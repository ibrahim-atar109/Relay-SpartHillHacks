import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Board } from '../../shared/contracts';
import { handler } from './workspace';
import { createDemoBoard } from '../../src/data/fixtures';
import { ConflictError } from '../services/store';
const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), extract: vi.fn(), plan: vi.fn(), geocode: vi.fn(), read: vi.fn(), upload: vi.fn() }));
vi.mock('../services/store', () => ({ loadBoard: mocks.load, saveBoard: mocks.save, ConflictError: class extends Error {} }));
vi.mock('../services/intelligence', () => ({ extractReport: mocks.extract, reviewRoadPlan: mocks.plan }));
vi.mock('../services/documents', () => ({ readDocument: mocks.read, uploadUrl: mocks.upload }));
vi.mock('../services/places', async original => ({ ...await original<typeof import('../services/places')>(), geocode: mocks.geocode }));
let board: Board;
function event(path: string, body: object = {}, group = 'Coordinators', method = 'POST') {
  return { rawPath: path, body: JSON.stringify({ expectedVersion: 3, ...body }), requestContext: { http: { method }, authorizer: { jwt: { claims: { sub: 'coordinator-id', 'cognito:groups': `[${group}]` } } } } };
}
beforeEach(() => {
  vi.clearAllMocks(); board = { incidents: [], teams: [], activity: [], alerts: [], plan: null, revision: 0, blockedEdgeIds: [], version: 3 };
  mocks.load.mockImplementation(async () => ({ board: structuredClone(board), version: 3 }));
  mocks.save.mockImplementation(async (_snapshot, next) => ({ ...next, version: 4 }));
  mocks.extract.mockResolvedValue({ ai: { provider: 'bedrock', modelId: 'test', requestId: 'id', at: new Date().toISOString() }, extraction: { title: 'Water requested', summary: 'Caller requests water.', category: 'water', priority: 'high', people: 6, quantity: 2, locationLabel: '123 Main Street, San José, CA', nodeId: null, missingInfo: ['Confirm address.'], clarificationQuestions: [] } });
});
describe('persistent workspace API', () => {
  it('allows only empty CORS preflight without authentication and never reads data', async () => {
    const response = await handler({ rawPath: '/board', requestContext: { http: { method: 'OPTIONS' } } });
    expect(response.statusCode).toBe(204); expect(response.body).toBe(''); expect(mocks.load).not.toHaveBeenCalled();
  });
  it('requires authentication and rejects read-only writes before reading storage or invoking AI', async () => {
    expect((await handler({ rawPath: '/board' })).statusCode).toBe(401);
    expect((await handler(event('/incidents', { report: 'Private report', source: 'text' }, 'Viewers'))).statusCode).toBe(403);
    expect(mocks.load).not.toHaveBeenCalled(); expect(mocks.extract).not.toHaveBeenCalled();
    expect((await handler(event('/board', {}, 'Viewers', 'GET'))).statusCode).toBe(200);
  });
  it('starts empty and never seeds fictional reports or teams', async () => {
    const response = await handler(event('/board', {}, 'Coordinators', 'GET'));
    expect(JSON.parse(response.body).incidents).toEqual([]); expect(JSON.parse(response.body).teams).toEqual([]);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('rejects stale clients before AI and converts storage conflicts to 409', async () => {
    expect((await handler(event('/incidents', { expectedVersion: 2, report: 'Water', source: 'text' }))).statusCode).toBe(409);
    expect(mocks.extract).not.toHaveBeenCalled();
    mocks.save.mockRejectedValueOnce(new ConflictError('Concurrent write'));
    expect((await handler(event('/incidents', { report: 'Water', source: 'text' }))).statusCode).toBe(409);
  });
  it('collects server-extracted reports, flags exact duplicates and discards browser status, coordinates and blob references', async () => {
    board.incidents = [{ ...createDemoBoard().incidents[0], originalReport: 'WATER   please', id: 'existing' }];
    const response = await handler(event('/incidents', { report: 'water please', source: 'voice', status: 'verified', location: { coordinates: [0,0] }, audioUrl: 'blob:private', ai: { modelId: 'fake' } }));
    expect(response.statusCode).toBe(200);
    const next = JSON.parse(response.body); const incident = next.incidents.at(-1);
    expect(incident.status).toBe('needs_review'); expect(incident.location.coordinates).toBeNull(); expect(incident.ai.modelId).toBe('test');
    expect(incident.duplicateOf).toEqual(['existing']); expect(incident.audioUrl).toBeUndefined();
    expect(mocks.extract).toHaveBeenCalledWith('water please', undefined, true);
    expect(mocks.save.mock.calls[0][2]).toBe('coordinator-id');
  });
  it('requires explicit corrected real coordinates and rejects unknown actions', async () => {
    board.incidents = [createDemoBoard().incidents[0]];
    const corrections = { nodeId: 'invented', category: 'water', priority: 'high', people: 6, quantity: 2, location: { label: '123 Main Street', coordinates: [-121.88,37.33] } };
    expect((await handler(event('/incidents/REQ-1042/actions', { type: 'verify', corrections: { ...corrections, location: { label: 'Bad', coordinates: [200,99] } } }))).statusCode).toBe(400);
    const response = await handler(event('/incidents/REQ-1042/actions', { type: 'verify', corrections }));
    expect(response.statusCode).toBe(200);
    const incident = JSON.parse(response.body).incidents[0];
    expect(incident.nodeId).toBe('incident:REQ-1042'); expect(incident.location.coordinates).toEqual([-121.88,37.33]); expect(incident.status).toBe('verified');
    expect((await handler(event('/incidents/REQ-1042/actions', { type: 'delete' }))).statusCode).toBe(400);
  });
  it('validates teams, forbids editing assigned teams, and invalidates unsent plans on changes', async () => {
    const team = { name: 'Solo', members: 2, capacity: 10, capabilities: ['water'], status: 'available', location: { label: 'Depot', coordinates: [-122,37] } };
    expect((await handler(event('/teams', { ...team, capacity: 1.5 }))).statusCode).toBe(400);
    const response = await handler(event('/teams', team));
    expect(response.statusCode).toBe(200); const next = JSON.parse(response.body);
    expect(next.teams[0].depotLabel).toBe('Depot'); expect(next.revision).toBe(1);
    board.teams = [{ ...next.teams[0], status: 'assigned' }];
    expect((await handler(event(`/teams/${next.teams[0].id}`, team))).statusCode).toBe(409);
  });
  it('rejects approval/dispatch without the required persisted workflow state and makes alerts idempotent', async () => {
    expect((await handler(event('/plans/missing/approve'))).statusCode).toBe(409);
    expect((await handler(event('/plans/missing/alerts'))).statusCode).toBe(409);
    board.plan = { id: 'sent', status: 'alerted', revision: 0, routes: [], unservedIds: [], weightedArrivalMinutes: 0, explanation: 'Test' };
    mocks.save.mockClear();
    expect((await handler(event('/plans/sent/alerts', { expectedVersion: 0 }))).statusCode).toBe(200);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('uses the saved board for planning, never a submitted browser board', async () => {
    mocks.plan.mockResolvedValue({ id: 'server-plan', status: 'proposed' });
    const response = await handler(event('/plans', { board: { incidents: ['injected'] } }));
    expect(response.statusCode).toBe(200); expect(mocks.plan.mock.calls[0][0].incidents).toEqual([]);
    expect(JSON.parse(response.body).plan.id).toBe('server-plan');
  });
  it('reads private S3 text under the authenticated user and saves extracted original text', async () => {
    mocks.read.mockResolvedValue('Private uploaded report');
    const response = await handler(event('/incidents/import', { key: 'incoming/coordinator-id/test.txt' }));
    expect(response.statusCode).toBe(200); expect(mocks.read).toHaveBeenCalledWith('coordinator-id', 'incoming/coordinator-id/test.txt');
    expect(JSON.parse(response.body).incidents[0].originalReport).toBe('Private uploaded report');
  });
});
