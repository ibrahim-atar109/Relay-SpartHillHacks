import { describe, expect, it } from 'vitest';
import { createDemoBoard } from '../../data/fixtures';
import { alertRescuers, applyAction, approveRoutes, planRoutes } from './rules';
import { generatePlan } from './planner';
import { shortestPath } from '../../data/network';
import type { Board } from '../../../shared/contracts';

function verifiedBoard() {
  let board = createDemoBoard();
  for (const item of board.incidents) board = applyAction(board, item.id, { type: 'verify', corrections: { nodeId: item.nodeId || 'ne', quantity: item.quantity, people: item.people, priority: item.priority } });
  return board;
}
describe('verified data → routes → route approval → rescuer alerts', () => {
  it('starts with only unverified reports and refuses routing', () => {
    const board = createDemoBoard();
    expect(board.incidents.every(item => item.status === 'needs_review')).toBe(true);
    expect(() => generatePlan(board)).toThrow('Verify');
    expect(board.alerts).toEqual([]);
  });
  it('requires missing location resolution and rejects invalid counts', () => {
    let board = createDemoBoard();
    expect(() => applyAction(board, 'REQ-1047', { type: 'verify' })).toThrow();
    expect(() => applyAction(board, 'REQ-1042', { type: 'verify', corrections: { nodeId: 'c', people: 0, quantity: 2, priority: 'high' } })).toThrow();
    board = applyAction(board, 'REQ-1047', { type: 'verify', corrections: { nodeId: 'ne', people: 12, quantity: 3, priority: 'normal' } });
    expect(board.incidents[5].status).toBe('verified');
    expect(board.incidents[5].missingInfo).toEqual([]);
  });
  it('only routes verified requests, without dispatching them', () => {
    let board = applyAction(createDemoBoard(), 'REQ-1042', { type: 'verify' });
    board = planRoutes(board);
    expect(board.plan!.routes.flatMap(route => route.stops).map(stop => stop.incidentId)).toEqual(['REQ-1042']);
    expect(board.teams.every(team => team.status === 'available')).toBe(true);
    expect(board.alerts).toHaveLength(0);
  });
  it('avoids the closure and respects total load, supply compatibility and unique assignment', () => {
    const board = verifiedBoard(); const plan = generatePlan(board);
    const ids = plan.routes.flatMap(route => route.stops.map(stop => stop.incidentId));
    expect(ids).toHaveLength(6); expect(new Set(ids).size).toBe(6);
    for (const route of plan.routes) {
      const team = board.teams.find(item => item.id === route.teamId)!;
      expect(route.load).toBeLessThanOrEqual(team.capacity);
      expect(route.edgeIds).not.toContain('c-e');
      for (const stop of route.stops) expect(team.capabilities).toContain(board.incidents.find(item => item.id === stop.incidentId)!.category);
    }
    expect(shortestPath('c', 'e', ['c-e'])!.minutes).toBe(12);
  });
  it('minimizes weighted arrival time, rather than always visiting the closest request', () => {
    const source = verifiedBoard();
    const board: Board = { ...source, teams: [{ ...source.teams[0], capacity: 100 }], incidents: [
      { ...source.incidents[0], nodeId: 'c', priority: 'critical' },
      { ...source.incidents[1], nodeId: 'n', priority: 'normal' },
    ] };
    const plan = generatePlan(board);
    expect(plan.routes[0].stops.map(stop => stop.incidentId)).toEqual(['REQ-1042', 'REQ-1043']);
    expect(plan.weightedArrivalMinutes).toBe(68);
  });
  it('blocks alerts before route approval and makes repeated alerts idempotent', () => {
    let board = planRoutes(verifiedBoard()); const id = board.plan!.id;
    expect(() => alertRescuers(board, id)).toThrow();
    board = approveRoutes(board, id);
    expect(board.alerts).toHaveLength(0);
    expect(board.incidents.every(item => item.status === 'verified')).toBe(true);
    board = alertRescuers(board, id);
    expect(board.alerts).toHaveLength(board.plan!.routes.length);
    expect(board.incidents.every(item => item.status === 'assigned')).toBe(true);
    expect(alertRescuers(board, id)).toEqual(board);
  });
  it('invalidates unsent plans when more data is verified', () => {
    let board = planRoutes(applyAction(createDemoBoard(), 'REQ-1042', { type: 'verify' }));
    const id = board.plan!.id;
    board = approveRoutes(board, id);
    board = applyAction(board, 'REQ-1043', { type: 'verify' });
    expect(board.plan).toBeNull();
    expect(() => alertRescuers(board, id)).toThrow();
  });
  it('rejects a changed revision or unavailable team after approval', () => {
    let board = planRoutes(verifiedBoard()); board = approveRoutes(board, board.plan!.id);
    expect(() => alertRescuers({ ...board, revision: board.revision + 1 }, board.plan!.id)).toThrow();
    expect(() => alertRescuers({ ...board, teams: board.teams.map(team => ({ ...team, status: 'offline' })) }, board.plan!.id)).toThrow();
  });
  it('keeps a team busy until all of its stops are completed', () => {
    let board = planRoutes(verifiedBoard()); board = approveRoutes(board, board.plan!.id); board = alertRescuers(board, board.plan!.id);
    const route = board.plan!.routes.find(item => item.stops.length > 1)!;
    board = applyAction(board, route.stops[0].incidentId, { type: 'deliver' });
    expect(board.teams.find(team => team.id === route.teamId)!.status).toBe('assigned');
    for (const stop of route.stops.slice(1)) board = applyAction(board, stop.incidentId, { type: 'deliver' });
    expect(board.teams.find(team => team.id === route.teamId)!.status).toBe('available');
  });
  it('surfaces unserved requests when supplies cannot fit', () => {
    const board = verifiedBoard();
    board.incidents[0].quantity = 100;
    expect(generatePlan(board).unservedIds).toContain('REQ-1042');
  });
});
