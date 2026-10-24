// MOCKED: Bedrock is replaced by a vi.fn stub. These tests check validation and traceability only;
// they do not prove a real model invocation.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handler } from './ai';

const { ask } = vi.hoisted(() => ({ ask: vi.fn() }));
vi.mock('../services/bedrock', () => ({ askBedrock: ask }));
const ai = { provider: 'bedrock', modelId: 'mock-model', requestId: 'mock-request', at: '2026-10-24T00:00:00Z' };
const event = (path: string, body: unknown) => ({ rawPath: path, body: JSON.stringify(body), requestContext: { http: { method: 'POST' }, authorizer: { jwt: { claims: { sub: 'coordinator' } } } } });
const transcript = [
  { speaker: 'assistant', text: 'This is an AI assistant in a training simulation. Where are you?' },
  { speaker: 'caller', text: 'I am at the Parish Government Complex in Chalmette. Water is coming in fast.' },
  { speaker: 'assistant', text: 'Is anyone hurt?' },
  { speaker: 'caller', text: 'My neighbor maybe broke his arm, I think. There are six of us.' },
];
const report = { title: 'Flooding at government complex', summary: 'Caller reports rising water.', category: null, priority: 'critical', locationLabel: 'Parish Government Complex, Chalmette', nodeId: 'c', people: 6, quantity: null, missingInfo: [], clarificationQuestions: [] };
beforeEach(() => ask.mockReset());

describe('AI call intake endpoints (mocked Bedrock)', () => {
  it('returns the model reply for a new call and sends the history as data', async () => {
    ask.mockResolvedValue({ value: { reply: 'Hello, I am an AI assistant in a training simulation.', readyToFile: false }, ai });
    const response = await handler(event('/ai/call-turn', { transcript: [] }));
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ reply: expect.stringContaining('AI assistant'), readyToFile: false, ai });
    expect(ask.mock.calls[0][1]).toEqual({ transcript: [] });
    expect(ask.mock.calls[0][0]).toContain('TRAINING SIMULATION');
  });
  it('rejects malformed transcripts without invoking the model', async () => {
    for (const bad of [{ transcript: 'hi' }, { transcript: [{ speaker: 'operator', text: 'x' }] }, { transcript: [{ speaker: 'caller', text: 'x'.repeat(2001) }] }, { transcript: Array(41).fill({ speaker: 'caller', text: 'x' }) }])
      expect((await handler(event('/ai/call-turn', bad))).statusCode).toBe(400);
    expect((await handler(event('/ai/call-report', { transcript: [transcript[0]] }))).statusCode).toBe(400);
    expect(ask).not.toHaveBeenCalled();
  });
  it('fails visibly on invalid model output instead of substituting a reply', async () => {
    ask.mockResolvedValue({ value: { text: 'no reply field' }, ai });
    expect((await handler(event('/ai/call-turn', { transcript }))).statusCode).toBe(502);
  });
  it('keeps only facts traceable to caller words and marks the rest unknown', async () => {
    ask.mockResolvedValue({ value: { report, facts: [
      { field: 'location', value: 'Parish Government Complex, Chalmette', certainty: 'stated', turnIndex: 1, quote: 'at the Parish Government Complex in Chalmette' },
      { field: 'injuries', value: 'Possible broken arm (neighbor)', certainty: 'uncertain', turnIndex: 3, quote: 'My neighbor maybe broke his arm, I think.' },
      { field: 'people_affected', value: '6 people', certainty: 'stated', turnIndex: 3, quote: 'six of us' },
      { field: 'immediate_threats', value: 'Fire', certainty: 'stated', turnIndex: 1, quote: 'the building is on fire' },
      { field: 'access_obstacles', value: 'Assistant claim', certainty: 'stated', turnIndex: 0, quote: 'Where are you?' },
    ] }, ai });
    const response = await handler(event('/ai/call-report', { transcript }));
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.facts.map((f: { field: string }) => f.field)).toEqual(['location', 'injuries', 'people_affected']);
    expect(body.facts[1].certainty).toBe('uncertain');
    expect(body.unknowns).toEqual(['what_happened', 'immediate_threats', 'access_obstacles']);
    expect(body.extraction.missingInfo.join(' ')).toContain('2 AI-extracted detail(s) could not be traced');
    expect(body.extraction.missingInfo).toContain('Confirm a supported supply category.');
    expect(body.extraction.category).toBeNull();
  });
  it('rejects invented network locations', async () => {
    ask.mockResolvedValue({ value: { report: { ...report, nodeId: 'made-up' }, facts: [] }, ai });
    expect((await handler(event('/ai/call-report', { transcript }))).statusCode).toBe(502);
  });
});
