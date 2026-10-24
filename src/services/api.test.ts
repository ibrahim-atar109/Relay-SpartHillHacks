import { beforeEach, describe, expect, it, vi } from 'vitest';
const { extract, plan } = vi.hoisted(() => ({ extract: vi.fn(), plan: vi.fn() }));
vi.mock('./ai', () => ({ aiConfigured: true, bedrock: { extract, plan } }));
const ai = { provider: 'bedrock', modelId: 'test', requestId: '1', at: new Date().toISOString() };
beforeEach(() => { vi.resetModules(); vi.stubEnv('VITE_DATA_MODE', 'demo'); extract.mockReset(); plan.mockReset(); });
describe('Bedrock scenario adapter', () => {
  it('collects unknown fields without putting a report on the map or accepting an implicit category', async () => {
    extract.mockResolvedValue({ ai, extraction: { title: 'Help', summary: 'Needs assistance', category: null, priority: null, people: null, quantity: null, nodeId: null, locationLabel: null, missingInfo: ['Confirm details'], clarificationQuestions: ['Which supplies?'] } });
    const { api } = await import('./api');
    const b = await api.collectReport('Help please', 'text');
    const i = b.incidents.at(-1)!;
    expect(i.status).toBe('needs_review'); expect(i.people).toBe(0); expect(i.location.coordinates).toBeNull();
    expect(i.categoryNeedsReview).toBe(true);
    await expect(api.act(i.id, { type: 'verify', corrections: { nodeId: 'n', people: 12, quantity: 2, priority: 'high' } })).rejects.toThrow('category');
    const verified = await api.act(i.id, { type: 'verify', corrections: { nodeId: 'n', people: 12, quantity: 2, priority: 'high', category: 'food' } });
    expect(verified.incidents.at(-1)?.category).toBe('food');
  });
  it('preserves original and follow-up evidence across repeated analysis', async () => {
    extract.mockResolvedValue({ ai, extraction: { title: 'Water', summary: 'Water report', category: 'water', priority: 'normal', people: 2, quantity: 1, nodeId: 'n', locationLabel: 'Northside shelter', missingInfo: [], clarificationQuestions: [] } });
    const { api } = await import('./api');
    const initial = await api.getBoard(); const id = initial.incidents[0].id;
    await api.analyzeReport(id, 'First clarification');
    const updated = await api.analyzeReport(id, 'Second clarification');
    expect(extract.mock.calls[1]).toEqual([initial.incidents[0].originalReport, 'First clarification\nSecond clarification']);
    expect(updated.incidents[0].originalReport).toBe(initial.incidents[0].originalReport);
    expect(updated.incidents[0].location.coordinates).toBeNull();
    expect(updated.incidents[0].status).toBe('needs_review');
  });
  it('preserves board state when the model fails rather than generating local fallback routes', async () => {
    const { api } = await import('./api');
    await api.act('REQ-1042', { type: 'verify' });
    plan.mockRejectedValue(new Error('Bedrock unavailable'));
    await expect(api.plan()).rejects.toThrow('Bedrock unavailable');
    expect((await api.getBoard()).plan).toBeNull();
  });
});
