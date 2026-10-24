import { describe, expect, it } from 'vitest';
import { createDemoBoard } from '../../data/fixtures';
import { applyAction } from '../operations/rules';
import { generatePlan } from '../operations/planner';
import { roadFeatures } from './routeGeometry';
describe('road-only map geometry', () => {
  it('does not draw the old synthetic lines', () => {
    const b = applyAction(createDemoBoard(), 'REQ-1042', { type: 'verify' });
    expect(roadFeatures(generatePlan(b)).features).toEqual([]);
    expect(roadFeatures(null).features).toEqual([]);
  });
  it('keeps separate road segments separate, never bridging a gap through a building', () => {
    const b = applyAction(createDemoBoard(), 'REQ-1042', { type: 'verify' });
    const plan = generatePlan(b);
    plan.routing = { provider: 'amazon-location', travelMode: 'Car', calculatedAt: '', traffic: 'disabled', notices: [] };
    const lines: [number, number][][] = [[[-121.9, 37.35], [-121.89, 37.35]], [[-121.889, 37.349], [-121.88, 37.34]]];
    plan.routes[0].roadLegs = [{ incidentId: b.incidents[0].id, lines, distanceMeters: 2000, durationMinutes: 5, directions: [] }];
    const data = roadFeatures(plan);
    expect(data.features[0].geometry.type).toBe('MultiLineString');
    expect(data.features[0].geometry.coordinates).toEqual(lines);
  });
});
