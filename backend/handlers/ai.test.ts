import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoBoard } from '../../src/data/fixtures';
import { applyAction } from '../../src/features/operations/rules';
import { generatePlan } from '../../src/features/operations/planner';
import { handler } from './ai';
import { validateBoard } from '../validation';

const { ask } = vi.hoisted(() => ({ ask: vi.fn() }));
vi.mock('../services/bedrock', () => ({ askBedrock: ask }));
const ai = { provider: 'bedrock', modelId: 'test-model', requestId: 'test-request', at: '2026-10-24T00:00:00Z' };
const extraction = {
  title: 'Water needed', summary: 'A caller requests water.', category: 'water', priority: null,
  locationLabel: null, nodeId: null, people: null, quantity: null, missingInfo: [], clarificationQuestions: ['Where are you?'],
};
function event(path: string, body: unknown) {
  return { rawPath: path, body: JSON.stringify(body), requestContext: { http: { method: 'POST' }, authorizer: { jwt: { claims: { sub: 'coordinator' } } } } };
}
function board() {
  return applyAction(createDemoBoard(), 'REQ-1042', { type: 'verify' });
}
beforeEach(() => { ask.mockReset(); });
describe('authenticated Bedrock handlers', () => {
  it('rejects unauthenticated requests without invoking a model', async () => {
    expect((await handler({ body: '{}' })).statusCode).toBe(401);
    expect(ask).not.toHaveBeenCalled();
  });
  it('rejects malformed JSON and oversized reports before calling Bedrock', async () => {
    expect((await handler({ ...event('/ai/extract', {}), body: '{' })).statusCode).toBe(400);
    expect((await handler(event('/ai/extract', { report: 'x'.repeat(8001) }))).statusCode).toBe(400);
    expect(ask).not.toHaveBeenCalled();
  });
  it('preserves unknown fields and adds required review gaps', async () => {
    ask.mockResolvedValue({ value: extraction, ai });
    const response = await handler(event('/ai/extract', { report: 'We need water.', followUp: 'Location still unknown.' }));
    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.body);
    expect(data.extraction.quantity).toBeNull();
    expect(data.extraction.missingInfo).toContain('Confirm urgency.');
    expect(data.extraction.missingInfo).toContain('Confirm quantity in standardized supply totes.');
    expect(data.ai.requestId).toBe('test-request');
    expect(ask.mock.calls[0][1].followUp).toBe('Location still unknown.');
  });
  it('rejects hallucinated nodes, categories, and invalid counts', async () => {
    for (const fields of [{ nodeId: 'imaginary-road' }, { category: 'boats' }, { people: -2 }, { quantity: 1.5 }]) {
      ask.mockResolvedValue({ value: { ...extraction, ...fields }, ai });
      expect((await handler(event('/ai/extract', { report: 'Please help.' }))).statusCode).toBe(502);
    }
  });
  it('uses calculated routes, not model-supplied assignments or times', async () => {
    const b = board(); const expected = generatePlan(b);
    ask.mockResolvedValue({ value: { explanation: 'Review the scenario route.', reviewNotes: ['Confirm supplies.'], routes: [{ teamId: 'invented' }] }, ai });
    const response = await handler(event('/ai/plan', { board: b }));
    expect(response.statusCode).toBe(200);
    const { plan } = JSON.parse(response.body);
    expect(plan.routes).toEqual(expected.routes);
    expect(plan.aiExplanation).toBe('Review the scenario route.');
    expect(plan.status).toBe('proposed');
    expect(ask.mock.calls[0][1].incidents.every((i: { status: string }) => i.status === 'verified')).toBe(true);
  });
  it('rejects duplicate IDs, non-finite counts and excessive search sizes', () => {
    const b = board();
    expect(() => validateBoard({ ...b, teams: [b.teams[0], b.teams[0]] })).toThrow('unique');
    expect(() => validateBoard({ ...b, teams: [{ ...b.teams[0], capacity: Infinity }] })).toThrow('capacity');
    expect(() => validateBoard({ ...b, incidents: Array.from({ length: 9 }, (_, n) => ({ ...b.incidents[0], id: `id-${n}` })) })).toThrow('eight');
  });
  it('reconstructs coordinates from known nodes rather than trusting browser coordinates', () => {
    const b = structuredClone(board()); b.teams[0].coordinates = [0, 0]; b.incidents[0].location.coordinates = [0, 0];
    const validated = validateBoard(b);
    expect(validated.teams[0].coordinates).not.toEqual([0, 0]);
    expect(validated.incidents[0].location.coordinates).not.toEqual([0, 0]);
  });
  it('rejects plans without verified requests before invoking Bedrock', async () => {
    expect((await handler(event('/ai/plan', { board: createDemoBoard() }))).statusCode).toBe(400);
    expect(ask).not.toHaveBeenCalled();
  });
  it('does not silently replace a failed Bedrock review with a successful plan', async () => {
    ask.mockRejectedValue(Object.assign(new Error('busy'), { name: 'ThrottlingException' }));
    expect((await handler(event('/ai/plan', { board: board() }))).statusCode).toBe(429);
    ask.mockResolvedValue({ value: { explanation: 'partial' }, ai });
    expect((await handler(event('/ai/plan', { board: board() }))).statusCode).toBe(502);
  });
});
