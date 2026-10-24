import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../services/api';
import { nodes } from '../../data/network';
import { applyAction, planRoutes } from '../operations/rules';
const { extract } = vi.hoisted(() => ({ extract: vi.fn() }));
vi.mock('../../services/ai', () => ({ aiConfigured: true, bedrock: { extract, plan: vi.fn() } }));
afterEach(async () => { await api.reset(); vi.restoreAllMocks(); });

describe('911 simulation integrated from andrew01', () => {
  it('retains voice evidence and requires coordinator corrections before routing', async () => {
    const recordings = [{ text: 'Six people near downtown need food.', audioUrl: 'blob:test' }];
    const board = await api.submitVoiceReport('  Caller: Six people near downtown need food.  ', 'blob:test', recordings);
    const report = board.incidents[0];
    expect(report.originalReport).toBe('Caller: Six people near downtown need food.');
    expect(report.origin).toBe('participant');
    expect(report.status).toBe('needs_review');
    expect(report.location.coordinates).toBeNull();
    expect(report.people).toBe(0);
    expect(report.recordings).toEqual(recordings);
    expect(() => planRoutes(board)).toThrow();
    expect(() => applyAction(board, report.id, { type: 'verify', corrections: { nodeId: 'c', people: 6, quantity: 2, priority: 'high' } })).toThrow('category');
    const verified = applyAction(board, report.id, { type: 'verify', corrections: { nodeId: 'c', people: 6, quantity: 2, priority: 'high', category: 'food' } });
    expect(verified.incidents[0].category).toBe('food');
    expect(verified.incidents[0].location.coordinates).toEqual(nodes.c.coordinates);
    expect(planRoutes(verified).plan?.routes.flatMap(r => r.stops).map(s => s.incidentId)).toEqual([report.id]);
  });
  it('supports typed calls without pretending they contain recorded audio', async () => {
    const board = await api.submitVoiceReport('Caller: I need water.');
    expect(board.incidents[0].audioUrl).toBeUndefined();
    expect(board.incidents[0].recordings).toEqual([]);
    expect(board.incidents[0].status).toBe('needs_review');
  });
  it('rejects empty, oversized and externally linked recordings', async () => {
    await expect(api.submitVoiceReport(' ', 'blob:test')).rejects.toThrow('transcript');
    await expect(api.submitVoiceReport('x'.repeat(8001))).rejects.toThrow('transcript');
    await expect(api.submitVoiceReport('Hello', 'https://untrusted.example/audio')).rejects.toThrow('browser session');
    await expect(api.submitVoiceReport('Hello', '', [{ text: 'Hello', audioUrl: 'https://untrusted.example/audio' }])).rejects.toThrow('browser session');
  });
  it('keeps original audio and transcript when Bedrock analyzes a call', async () => {
    const before = await api.submitVoiceReport('Caller: Water for two people.', 'blob:original');
    extract.mockResolvedValue({ ai: { provider: 'bedrock', modelId: 'test', requestId: 'id', at: new Date().toISOString() }, extraction: {
      title: 'Water requested', summary: 'Two people request water.', category: 'water', priority: 'normal', nodeId: 'n', locationLabel: 'Northside shelter', people: 2, quantity: null, missingInfo: ['Confirm tote count.'], clarificationQuestions: ['How many totes?'],
    } });
    const after = await api.analyzeReport(before.incidents[0].id, 'At Northside shelter.');
    expect(after.incidents[0].audioUrl).toBe('blob:original');
    expect(after.incidents[0].originalReport).toBe('Caller: Water for two people.');
    expect(after.incidents[0].status).toBe('needs_review');
    expect(after.incidents[0].location.coordinates).toBeNull();
    expect(after.incidents[0].ai?.provider).toBe('bedrock');
  });
  it('assigns unique IDs and releases each recording once on reset', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    await api.submitVoiceReport('First call', 'blob:first', [{ text: 'First call', audioUrl: 'blob:first' }]);
    const board = await api.submitVoiceReport('Second call', 'blob:second');
    expect(new Set(board.incidents.map(i => i.id)).size).toBe(8);
    const reset = await api.reset();
    expect(reset.incidents).toHaveLength(6);
    expect(reset.incidents.every(i => i.origin !== 'participant')).toBe(true);
    expect(revoke.mock.calls.filter(([url]) => url === 'blob:first')).toHaveLength(1);
    expect(revoke.mock.calls.filter(([url]) => url === 'blob:second')).toHaveLength(1);
  });
});
