import type { Board, Incident, IncidentAction, Team } from '../../shared/contracts';
import { applyAction, approveRoutes, alertRescuers } from '../../src/features/operations/rules';
import { extractReport, reviewRoadPlan } from '../services/intelligence';
import { loadBoard, saveBoard, ConflictError } from '../services/store';
import { confirmedLocation, geocode } from '../services/places';
import { readDocument, uploadUrl } from '../services/documents';
import { InputError, object, text } from '../validation';
import { type Event, parseBody, reply, failure } from './ai';

function number(value: unknown, name: string, max = 10000) {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > max) throw new InputError(`${name} must be a whole number from 1 to ${max}.`);
  return value as number;
}
function category(value: unknown): Incident['category'] {
  if (!['water','food','medicine'].includes(value as string)) throw new InputError('Choose water, food or medicine.');
  return value as Incident['category'];
}
function audit(board: Board, message: string): Board {
  return { ...board, activity: [{ id: crypto.randomUUID(), message, at: new Date().toISOString() }, ...board.activity] };
}
function mutate(operation: () => Board) {
  try { return operation(); } catch (error) { throw new ConflictError(error instanceof Error ? error.message : 'Invalid workflow state.'); }
}
export async function handler(event: Event) {
  // Preflight contains no credentials or data; API Gateway supplies configured CORS headers.
  if (event.requestContext?.http?.method === 'OPTIONS') return { statusCode: 204, headers: { 'Cache-Control': 'no-store' }, body: '' };
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  if (!claims?.sub) return reply(401, { error: 'Sign in to the connected workspace.' });
  const method = event.requestContext?.http?.method;
  const path = event.rawPath ?? '';
  try {
    if (method === 'GET' && path === '/board') return reply(200, (await loadBoard()).board);
    if (method !== 'POST') return reply(404, { error: 'Unknown endpoint.' });
    const groups = (claims['cognito:groups'] ?? '').split(/[\s,\[\]"]+/);
    if (!groups.includes('Coordinators')) return reply(403, { error: 'A coordinator role is required. Ask your administrator to add you to the Coordinators Cognito group, then sign in again.' });
    const body = parseBody(event);
    if (path === '/locations/geocode') return reply(200, { candidates: await geocode(text(body.address, 'address including city/region', 500)) });
    if (path === '/uploads') return reply(200, await uploadUrl(claims.sub));
    const snapshot = await loadBoard();
    let board = snapshot.board;
    // Retrying alert creation is safe even if the client did not receive the first response.
    const alertMatch = path.match(/^\/plans\/([^/]+)\/alerts$/);
    if (alertMatch && ((board.plan?.id === alertMatch[1] && board.plan.status === 'alerted') || board.alerts.some(a => a.planId === alertMatch[1]))) return reply(200, board);
    if (body.expectedVersion !== snapshot.version) throw new ConflictError('This board has changed. Refresh before making changes.');
    if (path === '/incidents' || path === '/incidents/import') {
      if (board.incidents.length >= 200) throw new InputError('This hackathon workspace supports 200 reports. Use a new workspace for additional reports.');
      const report = path.endsWith('/import') ? await readDocument(claims.sub, text(body.key, 'upload key', 500)) : text(body.report, 'report');
      const source = path.endsWith('/import') ? 'text' : body.source;
      if (!['text','voice','form'].includes(source as string)) throw new InputError('Invalid report source.');
      const result = await extractReport(report, undefined, true);
      const e = result.extraction;
      const normalized = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
      const duplicateOf = board.incidents.filter(i => normalized(i.originalReport) === normalized(report)).map(i => i.id);
      const incident: Incident = {
        id: `REQ-${crypto.randomUUID()}`, title: e.title, summary: e.summary, category: e.category ?? 'water', categoryNeedsReview: !e.category,
        priority: e.priority ?? 'normal', status: 'needs_review', location: { label: e.locationLabel ?? 'Unconfirmed address', coordinates: null },
        people: e.people ?? 0, quantity: e.quantity ?? 0, unit: 'supply totes', source: source as Incident['source'], origin: 'participant', originalReport: report,
        missingInfo: e.missingInfo, clarificationQuestions: e.clarificationQuestions, ai: result.ai, updatedAt: result.ai.at, duplicateOf,
      };
      board = audit({ ...board, incidents: [...board.incidents, incident] }, `${incident.id} · Report collected; human verification required${duplicateOf.length ? ' · Possible duplicate flagged' : ''}`);
    } else if (/^\/incidents\/[^/]+\/analyze$/.test(path)) {
      const id = path.split('/')[2];
      const before = board.incidents.find(i => i.id === id);
      if (!before || before.status !== 'needs_review') throw new ConflictError('Only unverified reports can be analyzed.');
      const followUps = [...(before.followUps ?? []), ...(body.followUp ? [text(body.followUp, 'follow-up', 2000)] : [])];
      if (followUps.join('\n').length > 4000) throw new InputError('Follow-up history exceeds 4,000 characters.');
      const result = await extractReport(before.originalReport, followUps.join('\n') || undefined, true); const e = result.extraction;
      board = audit({ ...board, incidents: board.incidents.map(i => i.id !== id ? i : { ...i, title: e.title, summary: e.summary, category: e.category ?? 'water', categoryNeedsReview: !e.category, priority: e.priority ?? 'normal', location: { label: e.locationLabel ?? 'Unconfirmed address', coordinates: null }, nodeId: undefined, people: e.people ?? 0, quantity: e.quantity ?? 0, missingInfo: e.missingInfo, clarificationQuestions: e.clarificationQuestions, followUps, ai: result.ai, updatedAt: result.ai.at }) }, `${id} · Bedrock analysis updated; human verification required`);
    } else if (/^\/incidents\/[^/]+\/actions$/.test(path)) {
      const id = path.split('/')[2];
      let action: IncidentAction;
      if (body.type === 'deliver') action = { type: 'deliver' };
      else if (body.type === 'verify') {
        if (board.incidents.filter(i => i.status === 'verified').length >= 40) throw new InputError('Route and assign the current 40 verified requests before verifying more.');
        const c = object(body.corrections); const location = confirmedLocation(c.location);
        if (!['critical','high','normal'].includes(c.priority as string)) throw new InputError('Invalid urgency.');
        action = { type: 'verify', corrections: { nodeId: `incident:${id}`, location, people: number(c.people, 'people'), quantity: number(c.quantity, 'totes'), priority: c.priority as Incident['priority'], category: category(c.category) } };
      } else throw new InputError('Invalid incident action.');
      board = mutate(() => applyAction(board, id, action, true));
    } else if (path === '/teams' || /^\/teams\/[^/]+$/.test(path)) {
      const id = path === '/teams' ? `TEAM-${crypto.randomUUID()}` : path.split('/')[2];
      const existing = board.teams.find(t => t.id === id);
      if (path !== '/teams' && !existing) throw new InputError('Team not found.');
      if (!existing && board.teams.length >= 20) throw new InputError('This workspace supports up to 20 teams.');
      if (existing?.status === 'assigned') throw new ConflictError('Complete assigned deliveries before editing this team.');
      const location = confirmedLocation(body.location);
      if (body.status !== 'available' && body.status !== 'offline') throw new InputError('Choose available or offline.');
      if (!Array.isArray(body.capabilities) || !body.capabilities.length || body.capabilities.length > 3) throw new InputError('Choose at least one supply capability.');
      const team: Team = { id, nodeId: `team:${id}`, name: text(body.name, 'team name', 100), members: number(body.members, 'members', 100), capacity: number(body.capacity, 'capacity'), status: body.status, capabilities: [...new Set(body.capabilities.map(category))], coordinates: location.coordinates, depotLabel: location.label };
      board = audit({ ...board, revision: board.revision + 1, plan: board.plan?.status === 'alerted' ? board.plan : null, teams: existing ? board.teams.map(t => t.id === id ? team : t) : [...board.teams, team] }, `${id} · Team and depot ${existing ? 'updated' : 'added'}; unsent plans invalidated`);
    } else if (path === '/plans') {
      if (board.incidents.filter(i => i.status === 'verified').length > 40) throw new InputError('Route at most 40 verified reports at a time.');
      board = audit({ ...board, plan: await reviewRoadPlan(board) }, 'Road routes generated and reviewed by Bedrock; awaiting human approval');
    } else if (/^\/plans\/[^/]+\/approve$/.test(path)) board = mutate(() => approveRoutes(board, path.split('/')[2]));
    else if (alertMatch) board = mutate(() => alertRescuers(board, alertMatch[1]));
    else return reply(404, { error: 'Unknown endpoint.' });
    return reply(200, await saveBoard(snapshot, board, claims.sub));
  } catch (error) {
    if (error instanceof ConflictError) return reply(409, { error: error.message });
    return failure(error);
  }
}
