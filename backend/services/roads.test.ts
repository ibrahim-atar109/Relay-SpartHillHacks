import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoBoard } from '../../src/data/fixtures';
import { applyAction } from '../../src/features/operations/rules';
import { nodes } from '../../src/data/network';
import { attachRoadGeometry, prepareRoadPlan } from './roads';
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@aws-sdk/client-geo-routes', async original => ({
  ...await original<typeof import('@aws-sdk/client-geo-routes')>(),
  GeoRoutesClient: class { send = send; },
}));
const signal = () => AbortSignal.timeout(10000);
function board() {
  return applyAction(createDemoBoard(), 'REQ-1042', { type: 'verify' });
}
beforeEach(() => { send.mockReset(); });
describe('Amazon Location road planning', () => {
  it('passes exercise avoid boxes to both routing calls and rejects geometry crossing them', async () => {
    const b=board();b.avoidAreas=[{id:'test-hazard',bounds:[-121.9005,37.3495,-121.8995,37.3505]}];
    send.mockImplementation(async command=>({RouteMatrix:command.input.Origins.map(()=>[{Duration:600,Distance:3000}])}));
    const plan=await prepareRoadPlan(b,signal());expect(send.mock.calls[0][0].input.Avoid.Areas[0].Geometry.BoundingBox).toEqual(b.avoidAreas[0].bounds);
    send.mockResolvedValue({Routes:[{Summary:{Distance:3000,Duration:600},Legs:[{Geometry:{LineString:[[-121.901,37.351],[-121.899,37.349]]}}]}]});
    await expect(attachRoadGeometry(b,plan,signal())).rejects.toThrow('intersects');
    expect(send.mock.calls.at(-1)![0].input.Avoid.Areas).toHaveLength(1);
  });
  it('optimizes with provider road costs, rather than the schematic grid', async () => {
    const b = board();
    send.mockImplementation(async command => ({ RouteMatrix: command.input.Origins.map(() => [{ Duration: 600, Distance: 3000 }]) }));
    const plan = await prepareRoadPlan(b, signal());
    expect(plan.routing?.provider).toBe('amazon-location');
    expect(plan.routes[0].travelMinutes).toBe(10);
    expect(plan.routes[0].edgeIds).toEqual([]);
    expect(plan.weightedArrivalMinutes).toBe(80);
    expect(send.mock.calls[0][0].input.Traffic.Usage).toBe('IgnoreTrafficData');
  });
  it('fails visibly when routing is denied, without falling back to straight lines', async () => {
    send.mockRejectedValue(Object.assign(new Error('denied'), { name: 'AccessDeniedException' }));
    await expect(prepareRoadPlan(board(), signal())).rejects.toThrow('Check Amazon Location permissions');
  });
  it('rejects incomplete matrices and bad-location errors', async () => {
    send.mockResolvedValue({ RouteMatrix: [] });
    await expect(prepareRoadPlan(board(), signal())).rejects.toThrow('incomplete');
    send.mockImplementation(async command => ({ RouteMatrix: command.input.Origins.map(() => [{ Error: 'NoMatchOrigin' }]) }));
    await expect(prepareRoadPlan(board(), signal())).rejects.toThrow('match a sample location');
  });
  it('does not serve requests when no provider road path exists', async () => {
    send.mockImplementation(async command => ({ RouteMatrix: command.input.Origins.map(() => [{ Error: 'NoRoute' }]) }));
    await expect(prepareRoadPlan(board(), signal())).rejects.toThrow('No feasible routes');
  });
  it('uses full provider geometry, distances, and directions without adding off-road endpoints', async () => {
    const b = board();
    send.mockImplementation(async command => ({ RouteMatrix: command.input.Origins.map(() => [{ Duration: 600, Distance: 3000 }]) }));
    const plan = await prepareRoadPlan(b, signal());
    const line = [[-121.901, 37.351], [-121.900, 37.350], [-121.895, 37.345], [-121.890, 37.340]];
    send.mockResolvedValue({ Routes: [{ Summary: { Distance: 3200, Duration: 660 }, Legs: [{ Geometry: { LineString: line }, VehicleLegDetails: { TravelSteps: [{ Instruction: 'Turn right onto Market Street.', Distance: 120 }] } }] }] });
    const result = await attachRoadGeometry(b, plan, signal());
    expect(result.routes[0].coordinates).toEqual(line);
    expect(result.routes[0].coordinates[0]).not.toEqual(nodes[b.teams[0].nodeId].coordinates);
    expect(result.routes[0].roadLegs?.[0].directions[0].instruction).toContain('Market Street');
    expect(result.routes[0].distanceMeters).toBe(3200);
    expect(result.routes[0].stops[0].arrivalMinutes).toBe(11);
    expect(result.weightedArrivalMinutes).toBe(88);
  });
  it('rejects missing road geometry rather than drawing a direct connector', async () => {
    send.mockImplementation(async command => ({ RouteMatrix: command.input.Origins.map(() => [{ Duration: 600, Distance: 3000 }]) }));
    const b = board(); const plan = await prepareRoadPlan(b, signal());
    send.mockResolvedValue({ Routes: [{ Summary: { Distance: 3200, Duration: 660 }, Legs: [{ Geometry: {} }] }] });
    await expect(attachRoadGeometry(b, plan, signal())).rejects.toThrow('incomplete road geometry');
  });
});
