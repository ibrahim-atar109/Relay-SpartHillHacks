import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBoard, saveBoard } from './store';
import type { Board } from '../../shared/contracts';
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@aws-sdk/lib-dynamodb', async original => ({ ...await original<typeof import('@aws-sdk/lib-dynamodb')>(), DynamoDBDocumentClient: { from: () => ({ send }) } }));
const board = (): Board => ({ incidents: [], teams: [], activity: [], alerts: [], revision: 0, blockedEdgeIds: [], plan: null });
beforeEach(() => { send.mockReset(); for (const k of ['REPORTS','TEAMS','PLANS','ALERTS','ACTIVITY']) vi.stubEnv(`${k}_TABLE`, k); });
describe('DynamoDB persistence and version fencing', () => {
  it('returns an empty unseeded board when no state exists and uses strongly consistent reads', async () => {
    send.mockResolvedValue({}); const result = await loadBoard();
    expect(result.version).toBe(0); expect(result.board.incidents).toEqual([]);
    expect(send.mock.calls.every(([command]) => command.input.ConsistentRead === true)).toBe(true);
  });
  it('paginates record queries and loads the persisted plan', async () => {
    let reportPage = 0;
    send.mockImplementation(async command => {
      if (command.constructor.name === 'GetCommand') return command.input.Key.sk === '!state' ? { Item: { data: { version: 2, revision: 1, planId: 'p' } } } : { Item: { data: { id: 'p' } } };
      if (command.input.TableName === 'REPORTS') return ++reportPage === 1 ? { Items: [{ data: { id: 'a', updatedAt: 'a' } }], LastEvaluatedKey: { pk: 'operations', sk: 'a' } } : { Items: [{ data: { id: 'b', updatedAt: 'b' } }] };
      return { Items: [] };
    });
    const result = await loadBoard(); expect(result.board.incidents).toHaveLength(2); expect(result.board.plan?.id).toBe('p');
  });
  it('does not return mixed snapshots when the metadata version changes mid-read', async () => {
    let version = 0;
    send.mockImplementation(async command => command.input.Key ? { Item: { data: { version: ++version, revision: 0, planId: null } } } : { Items: [] });
    await expect(loadBoard()).rejects.toThrow('changing');
  });
  it('writes changed entities, audit actor and the version condition atomically', async () => {
    send.mockResolvedValue({});
    const prior = board(); const next = { ...prior, activity: [{ id: 'event', at: 'time', message: 'Verified' }] };
    const saved = await saveBoard({ board: prior, version: 7 }, next, 'trusted-sub');
    const writes = send.mock.calls[0][0].input.TransactItems;
    expect(writes).toHaveLength(2); expect(writes[0].Put.Item.data.actorId).toBe('trusted-sub');
    expect(writes[1].Put.ExpressionAttributeValues).toEqual({ ':version': 7 }); expect(saved.version).toBe(8);
    send.mockRejectedValueOnce(Object.assign(new Error('collision'), { name: 'TransactionCanceledException', CancellationReasons: [{ Code: 'ConditionalCheckFailed' }] }));
    await expect(saveBoard({ board: prior, version: 7 }, next, 'trusted-sub')).rejects.toThrow('Another coordinator');
  });
});
