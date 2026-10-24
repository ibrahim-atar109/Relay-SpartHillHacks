import type { Board, Incident, ReportExtraction } from '../shared/contracts';
import { edges, nodes } from '../src/data/network';

export class InputError extends Error {}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('Expected a JSON object.');
  return value as Record<string, unknown>;
}
export function text(value: unknown, name: string, max = 8000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new InputError(`${name} must contain 1–${max} characters.`);
  return value.trim();
}
function integer(value: unknown, name: string, min = 1, max = 10000): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw new InputError(`Invalid ${name}.`);
  return value as number;
}
function choice<const T extends string>(value: unknown, choices: readonly T[], name: string): T {
  if (!choices.includes(value as T)) throw new InputError(`Invalid ${name}.`);
  return value as T;
}
function list(value: unknown, max: number, name: string): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new InputError(`Invalid ${name}; maximum ${max} entries.`);
  return value;
}
const nullableText = (v: unknown, name: string) => v === null ? null : text(v, name, 1000);
const nullableCount = (v: unknown, name: string) => v === null ? null : integer(v, name);
export function validateExtraction(value: unknown): ReportExtraction {
  const v = object(value);
  const nodeId = v.nodeId === null ? null : choice(v.nodeId, Object.keys(nodes), 'location node');
  return {
    title: text(v.title, 'title', 160), summary: text(v.summary, 'summary', 2000),
    category: v.category === null ? null : choice(v.category, ['water', 'food', 'medicine'], 'category'),
    priority: v.priority === null ? null : choice(v.priority, ['critical', 'high', 'normal'], 'priority'),
    locationLabel: nullableText(v.locationLabel, 'location label'), nodeId,
    people: nullableCount(v.people, 'people'), quantity: nullableCount(v.quantity, 'supply totes'),
    missingInfo: list(v.missingInfo, 12, 'missing information').map(x => text(x, 'missing detail', 400)),
    clarificationQuestions: list(v.clarificationQuestions, 8, 'questions').map(x => text(x, 'question', 400)),
  };
}

/** Reconstruct only the bounded, trusted-network inputs used by the exact solver. */
export function validateBoard(value: unknown): Board {
  const v = object(value);
  const incidents: Incident[] = list(v.incidents, 40, 'incidents').map(value => {
    const i = object(value);
    const nodeId = i.nodeId === undefined ? undefined : choice(i.nodeId, Object.keys(nodes), 'node');
    const status = choice(i.status, ['needs_review', 'verified', 'assigned', 'delivered'], 'status');
    const missingInfo = list(i.missingInfo, 20, 'missing information').map(x => text(x, 'detail', 400));
    if (status === 'verified' && (!nodeId || missingInfo.length)) throw new InputError('Verified requests need confirmed routing fields.');
    return {
      id: text(i.id, 'incident ID', 100), title: text(i.title, 'title', 160),
      category: choice(i.category, ['water', 'food', 'medicine'], 'category'),
      priority: choice(i.priority, ['critical', 'high', 'normal'], 'priority'), status,
      nodeId, location: nodeId ? nodes[nodeId] : { label: 'Unconfirmed', coordinates: null },
      people: integer(i.people, 'people', status === 'needs_review' ? 0 : 1),
      quantity: integer(i.quantity, 'quantity', status === 'needs_review' ? 0 : 1),
      unit: 'supply totes', source: 'text', originalReport: '', summary: '', missingInfo, updatedAt: '',
    };
  });
  if (incidents.filter(i => i.status === 'verified').length > 8) throw new InputError('Plan at most eight verified requests at a time.');
  const teams = list(v.teams, 6, 'teams').map(value => {
    const t = object(value);
    const nodeId = choice(t.nodeId, Object.keys(nodes), 'team node');
    return {
      id: text(t.id, 'team ID', 100), name: text(t.name, 'team name', 160),
      status: choice(t.status, ['available', 'assigned', 'offline'], 'team status'),
      members: integer(t.members, 'members', 1, 100), capacity: integer(t.capacity, 'capacity', 1, 10000),
      capabilities: list(t.capabilities, 3, 'capabilities').map(x => choice(x, ['water', 'food', 'medicine'], 'capability')),
      nodeId, coordinates: nodes[nodeId].coordinates,
    };
  });
  if (new Set(incidents.map(i => i.id)).size !== incidents.length || new Set(teams.map(t => t.id)).size !== teams.length) throw new InputError('IDs must be unique.');
  return {
    incidents, teams, revision: integer(v.revision, 'revision', 0, 1000000),
    blockedEdgeIds: list(v.blockedEdgeIds, edges.length, 'blocked edges').map(x => choice(x, edges.map(e => e.id), 'edge')),
    plan: null, activity: [], alerts: [],
  };
}
