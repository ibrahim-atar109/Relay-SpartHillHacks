import { describe, expect, it } from 'vitest';
import { createDemoBoard } from '../../data/fixtures';
import { applyAction, recommend } from './rules';

describe('dispatch constraints', () => {
  it('blocks unresolved locations', () => {
    const board = createDemoBoard();
    expect(() => applyAction(board, 'REQ-1044', { type: 'verify' })).toThrow();
    expect(recommend(board.incidents[2], board.teams)).toBeNull();
  });
  it('reserves a team and prevents double assignment', () => {
    const board = applyAction(createDemoBoard(), 'REQ-1042', { type: 'assign', teamId: 'team-a' });
    expect(board.teams[0].status).toBe('assigned');
    expect(() => applyAction(board, 'REQ-1043', { type: 'assign', teamId: 'team-a' })).toThrow();
  });
  it('rejects incompatible or undersized teams', () => {
    expect(() => applyAction(createDemoBoard(), 'REQ-1043', { type: 'assign', teamId: 'team-b' })).toThrow();
  });
  it('releases a team after delivery and rejects repeated completion', () => {
    const board = applyAction(createDemoBoard(), 'REQ-1045', { type: 'deliver' });
    expect(board.teams[2].status).toBe('available');
    expect(board.incidents[3].status).toBe('delivered');
    expect(() => applyAction(board, 'REQ-1045', { type: 'deliver' })).toThrow();
  });
});
