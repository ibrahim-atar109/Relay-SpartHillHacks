import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { Board } from '../../shared/contracts';
import { InputError } from '../validation';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({ maxAttempts: 3 }), { marshallOptions: { removeUndefinedValues: true } });
const workspace = 'operations'; // One shared workspace per deployed stack, never chosen by the browser.
const table = (kind: string) => {
  const name = process.env[`${kind.toUpperCase()}_TABLE`];
  if (!name) throw new Error(`Missing ${kind} table configuration.`);
  return name;
};
export class ConflictError extends Error {}
type State = { version: number; revision: number; planId: string | null };
export interface Snapshot { board: Board; version: number }
const empty = (): Board => ({ incidents: [], teams: [], alerts: [], activity: [], plan: null, revision: 0, blockedEdgeIds: [] });
async function meta(): Promise<State> {
  const response = await db.send(new GetCommand({ TableName: table('plans'), Key: { pk: workspace, sk: '!state' }, ConsistentRead: true }));
  return response.Item?.data ?? { version: 0, revision: 0, planId: null };
}
async function records<T>(kind: string, limit?: number): Promise<T[]> {
  const result: T[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const page = await db.send(new QueryCommand({ TableName: table(kind), KeyConditionExpression: 'pk = :pk', ExpressionAttributeValues: { ':pk': workspace }, ConsistentRead: true, ScanIndexForward: kind !== 'activity', ExclusiveStartKey: cursor, ...(limit ? { Limit: limit - result.length } : {}) }));
    result.push(...(page.Items ?? []).map(i => i.data as T));
    cursor = page.LastEvaluatedKey;
  } while (cursor && (!limit || result.length < limit));
  return result;
}
/** A version fence prevents mixed snapshots across table queries during a concurrent transaction. */
export async function loadBoard(): Promise<Snapshot> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await meta();
    const [incidents, teams, alerts, activity, planItem] = await Promise.all([
      records<Board['incidents'][number]>('reports'), records<Board['teams'][number]>('teams'),
      records<Board['alerts'][number]>('alerts'), records<Board['activity'][number]>('activity', 100),
      before.planId ? db.send(new GetCommand({ TableName: table('plans'), Key: { pk: workspace, sk: before.planId }, ConsistentRead: true })) : Promise.resolve(null),
    ]);
    const after = await meta();
    if (before.version === after.version) return { version: after.version, board: { ...empty(), version: after.version, incidents: incidents.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id)), teams, alerts: alerts.sort((a,b) => b.at.localeCompare(a.at)), activity, revision: after.revision, plan: planItem?.Item?.data ?? null } };
  }
  throw new ConflictError('The board is changing. Refresh and retry.');
}
export async function saveBoard(snapshot: Snapshot, next: Board, actorId: string): Promise<Board> {
  const items: NonNullable<ConstructorParameters<typeof TransactWriteCommand>[0]['TransactItems']> = [];
  function put(kind: string, sk: string, data: unknown) {
    // Leave margin below DynamoDB's 400KB item limit, including attribute/key overhead.
    if (Buffer.byteLength(JSON.stringify(data)) > 340000) throw new InputError('This record is too large to save. Split the report or plan into smaller groups.');
    items.push({ Put: { TableName: table(kind), Item: { pk: workspace, sk, data } } });
  }
  for (const [kind, oldRows, newRows] of [
    ['reports', snapshot.board.incidents, next.incidents], ['teams', snapshot.board.teams, next.teams], ['alerts', snapshot.board.alerts, next.alerts],
  ] as const) {
    const prior = new Map(oldRows.map(r => [r.id, JSON.stringify(r)]));
    for (const row of newRows) if (prior.get(row.id) !== JSON.stringify(row)) put(kind, row.id, row);
  }
  if (next.plan && JSON.stringify(next.plan) !== JSON.stringify(snapshot.board.plan)) put('plans', next.plan.id, next.plan);
  const priorActivity = new Set(snapshot.board.activity.map(a => a.id));
  next = { ...next, activity: next.activity.map(a => priorActivity.has(a.id) ? a : { ...a, actorId }) };
  for (const entry of next.activity) if (!priorActivity.has(entry.id)) {
    items.push({ Put: { TableName: table('activity'), Item: { pk: workspace, sk: `${entry.at}#${entry.id}`, data: entry }, ConditionExpression: 'attribute_not_exists(pk)' } });
  }
  items.push({ Put: { TableName: table('plans'), Item: { pk: workspace, sk: '!state', data: { version: snapshot.version + 1, revision: next.revision, planId: next.plan?.id ?? null } }, ConditionExpression: snapshot.version ? '#data.#version = :version' : 'attribute_not_exists(pk)', ...(snapshot.version ? { ExpressionAttributeNames: { '#data': 'data', '#version': 'version' }, ExpressionAttributeValues: { ':version': snapshot.version } } : {}) } });
  if (items.length > 100) throw new InputError('Too many changes in one operation. Use a smaller plan.');
  if (Buffer.byteLength(JSON.stringify(items)) > 3500000) throw new InputError('This operation exceeds the safe transaction size. Use a smaller plan.');
  try { await db.send(new TransactWriteCommand({ TransactItems: items })); }
  catch (error) {
    if (error instanceof Error && error.name === 'TransactionCanceledException' && 'CancellationReasons' in error && (error.CancellationReasons as { Code?: string }[] | undefined)?.some(r => ['ConditionalCheckFailed','TransactionConflict'].includes(r.Code ?? ''))) throw new ConflictError('Another coordinator changed the board. Refresh and retry.');
    throw error;
  }
  return { ...next, version: snapshot.version + 1 };
}
