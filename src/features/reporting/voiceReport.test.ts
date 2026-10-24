import { afterEach, describe, expect, it } from 'vitest';
import { nodes } from '../../data/network';
import { api } from '../../services/api';
import { applyAction, planRoutes } from '../operations/rules';

afterEach(async () => { await api.reset(); });
describe('participant voice intake', () => {
  it('preserves the transcript and keeps unknown details off the map and routes', async () => {
    const board = await api.submitVoiceReport('  Six people near downtown need food.  ', 'blob:test');
    const report = board.incidents[0];
    expect(report.originalReport).toBe('Six people near downtown need food.');
    expect(report.origin).toBe('participant');
    expect(report.status).toBe('needs_review');
    expect(report.location.coordinates).toBeNull();
    expect(report.people).toBe(0);
    expect(() => planRoutes(board)).toThrow();
    expect(() => applyAction(board, report.id, { type: 'verify', corrections: { nodeId: 'c', people: 6, quantity: 2, priority: 'high' } })).toThrow('category');
    const verified = applyAction(board, report.id, { type: 'verify', corrections: { nodeId: 'c', people: 6, quantity: 2, priority: 'high', category: 'food' } });
    expect(verified.incidents[0].category).toBe('food');
    expect(verified.incidents[0].summary).toContain('food');
    expect(verified.incidents[0].location.coordinates).toEqual(nodes.c.coordinates);
  });
  it('rejects missing recordings and empty transcripts', async () => {
    await expect(api.submitVoiceReport(' ', 'blob:test')).rejects.toThrow();
    await expect(api.submitVoiceReport('Hello', '')).rejects.toThrow();
  });
  it('assigns unique IDs and reset clears participant reports', async () => {
    await api.submitVoiceReport('First call', 'blob:first');
    const board = await api.submitVoiceReport('Second call', 'blob:second');
    expect(new Set(board.incidents.map(item => item.id)).size).toBe(8);
    expect((await api.reset()).incidents.every(item => item.origin === 'synthetic')).toBe(true);
  });
});
