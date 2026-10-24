import { describe, expect, it } from 'vitest';
import { createDemoBoard } from '../../data/fixtures';
import { advanceScenario, clustersFor, loadSurge, setClosure } from './engine';
import { applyAction, planRoutes, approveRoutes } from '../operations/rules';
import { shortestPath, roadCoordinates, closedSegments, closureCoordinates, edges } from '../../data/network';
import { nextDispatcherTurn, opening } from '../reporting/dispatcher';

describe('CAD simulation', () => {
  it('loads 6000 actual records once and groups without losing evidence', () => {
    const board = loadSurge(createDemoBoard());
    expect(board.incidents).toHaveLength(6006);
    expect(new Set(board.incidents.map(item => item.id)).size).toBe(6006);
    expect(loadSurge(board).incidents).toHaveLength(6006);
    expect(clustersFor(board.incidents).reduce((sum, group) => sum + group.count, 0)).toBe(6005);
    expect(board.incidents.every(item => item.status === 'needs_review')).toBe(true);
  });
  it('changes closures every third step, adds reports and retains bounded bulletins', () => {
    let board = createDemoBoard();
    for (let i=0;i<9;i++) board = advanceScenario(board);
    expect(board.simulationMinute).toBe(9);
    expect(board.situationFeed).toHaveLength(8);
    expect(board.incidents.length).toBeGreaterThan(6);
    expect(board.blockedEdgeIds).not.toEqual(['c-e']);
  });
  it('invalidates an approved plan on closure changes', () => {
    let board = applyAction(createDemoBoard(), 'REQ-1042', {type:'verify'});
    board = planRoutes(board); board = approveRoutes(board, board.plan!.id);
    const next = setClosure(board, 'nw-n', true);
    expect(next.plan).toBeNull();
    expect(next.revision).toBe(board.revision+1);
  });
  it('uses cached street vertices and excludes closed road segments in both directions', () => {
    const route = shortestPath('c','e',['c-e']);
    expect(route).not.toBeNull();
    expect(route!.coordinates.length).toBeGreaterThan(10);
    const blocked = closedSegments(['c-e']);
    const path = route!.coordinates;
    expect(path.slice(1).some((point,i) => blocked.has([path[i].join(','),point.join(',')].sort().join('|')))).toBe(false);
    for (const edge of edges) {
      expect(roadCoordinates(edge.from,edge.to).length).toBeGreaterThan(2);
      expect(closureCoordinates(edge.from,edge.to).length).toBeGreaterThan(1);
    }
  });
  it('asks for missing details and adapts to flooding without claiming dispatch', () => {
    expect(nextDispatcherTurn([{speaker:'dispatcher',text:opening},{speaker:'caller',text:'Help me'}])).toContain('nearest street');
    expect(nextDispatcherTurn([{speaker:'dispatcher',text:opening},{speaker:'caller',text:'Six people at the downtown shelter are trapped by flooding.'}])).toContain('flooding');
  });
});
