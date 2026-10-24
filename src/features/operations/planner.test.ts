import { describe, it, expect } from 'vitest';
import { createDemoBoard } from '../../data/fixtures';
import { generatePlan } from './planner';
describe('bounded larger-volume planning', () => {
  it('routes more than eight requests without bitmask search and enforces capacity and capability', () => {
    const board = createDemoBoard(); const source = board.incidents[0];
    board.incidents = Array.from({length: 30}, (_,i) => ({ ...source, id: `report-${i}`, status: 'verified', missingInfo: [], quantity: 1, nodeId: 'c', location: { label: 'Test', coordinates: [-121.88,37.33] } }));
    board.teams = [{ ...board.teams[0], capacity: 20, capabilities: ['water'] }];
    const result = generatePlan(board);
    expect(result.routes[0].load).toBe(20); expect(result.routes[0].stops).toHaveLength(20); expect(result.unservedIds).toHaveLength(10);
    expect(result.explanation).toContain('not guaranteed'); expect(new Set(result.routes.flatMap(r => r.stops.map(s => s.incidentId))).size).toBe(20);
  });
});
