import type { Board, CallReportResponse, CallTurn, Incident, IncidentAction, PlaceCandidate, Team } from '../../shared/contracts';
import { feedIncident, type FeedEvent } from '../data/katrinaFeed';
import { nodes } from '../data/network';
import { aiConfigured, bedrock, authorizationHeaders, signOutAi } from './ai';
import { createDemoBoard, syntheticIncident } from '../data/fixtures';
import { alertRescuers, applyAction, approveRoutes, planRoutes } from '../features/operations/rules';

export const isDemo = import.meta.env.VITE_DATA_MODE !== 'live';
let demoBoard = createDemoBoard();
const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
let version: number | undefined;
const localAudio = new Map<string, { audioUrl?: string; recordings: { text: string; audioUrl: string }[] }>();

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!base) throw new Error('Set VITE_API_BASE_URL to connect the AWS API.');
  const response = await fetch(`${base}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...authorizationHeaders(), ...init?.headers }, signal: AbortSignal.timeout(35000) });
  if (response.status === 401) { signOutAi(); throw new Error('Your session expired. Sign in again.'); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `API request failed (${response.status}). Please retry.`);
  if (typeof data.version === 'number' && Array.isArray(data.incidents)) {
    version = Math.max(version ?? 0, data.version);
    data.incidents = data.incidents.map((i: Incident) => ({ ...i, ...localAudio.get(i.id) }));
  }
  return data as T;
}
const liveWrite = (path: string, body: object = {}, expectedVersion = version) => request<Board>(path, { method: 'POST', body: JSON.stringify({ ...body, expectedVersion }) });
function update(operation: (board: Board) => Board) {
  demoBoard = operation(demoBoard);
  return structuredClone(demoBoard);
}
export const api = {
  clearLocalSession: () => {
    const urls = new Set([...localAudio.values()].flatMap(a => [a.audioUrl, ...a.recordings.map(r => r.audioUrl)]).filter((v): v is string => !!v));
    urls.forEach(url => URL.revokeObjectURL(url)); localAudio.clear(); version = undefined;
  },
  /**
   * File a finished call. With `call`, the incident is built from the Bedrock call report
   * (structured fields plus transcript-traceable facts); without it, the transcript awaits analysis.
   */
  submitVoiceReport: async (transcript: string, audioUrl = '', recordings: { text: string; audioUrl: string }[] = [], call?: { turns: CallTurn[]; report: CallReportResponse }): Promise<Board> => {
    const originalReport = transcript.trim();
    // The live workspace accepts 8,000 characters; demo AI-call transcripts may be longer (backend caps calls at 16,000).
    const limit = call && isDemo ? 20000 : 8000;
    if (!originalReport || originalReport.length > limit) throw new Error(`A call needs a transcript of 1–${limit.toLocaleString()} characters.`);
    if ((audioUrl && !audioUrl.startsWith('blob:')) || recordings.some(r => !r.text.trim() || !r.audioUrl.startsWith('blob:'))) throw new Error('Only recordings made in this browser session can be attached.');
    if (!isDemo) {
      // The live workspace re-extracts the transcript with Bedrock server-side and persists it.
      const next = await liveWrite('/incidents', { report: originalReport, source: 'voice' });
      const incident = next.incidents.at(-1)!;
      localAudio.set(incident.id, { audioUrl: audioUrl || undefined, recordings });
      return { ...next, incidents: next.incidents.map(i => i.id === incident.id ? { ...i, ...localAudio.get(i.id) } : i) };
    }
    if (demoBoard.incidents.length >= 40) throw new Error('Reset the scenario before collecting more than 40 reports.');
    const at = new Date().toISOString();
    const base: Incident = {
      id: `CALL-${crypto.randomUUID().slice(0, 8)}`, title: 'Simulated 911 call', origin: 'participant', channel: 'ai-call',
      source: 'voice', audioUrl: audioUrl || undefined, recordings, originalReport,
      status: 'needs_review', category: 'water', categoryNeedsReview: true, priority: 'normal', people: 0, quantity: 0,
      unit: 'supply totes', location: { label: 'Caller location unconfirmed', coordinates: null },
      summary: 'Participant call transcript. Supply category, urgency, location and counts need review. Use Analyze with Bedrock for AI extraction.',
      missingInfo: ['Confirm the supply category, urgency, location and counts. This training call has not been sent to emergency services.'],
      updatedAt: at,
    };
    const e = call?.report.extraction;
    const incident: Incident = !call || !e ? base : {
      ...base, title: e.title, summary: e.summary, transcript: call.turns, callFacts: call.report.facts,
      category: e.category ?? 'water', categoryNeedsReview: e.category === null, priority: e.priority ?? 'normal',
      // A model-suggested node is kept as a suggestion only; coordinates appear after human verification.
      nodeId: e.nodeId ?? undefined, location: { label: e.locationLabel ?? 'Caller location unconfirmed', coordinates: null },
      people: e.people ?? 0, quantity: e.quantity ?? 0, missingInfo: e.missingInfo,
      clarificationQuestions: e.clarificationQuestions, ai: call.report.ai, updatedAt: call.report.ai.at,
    };
    const message = call ? `${incident.id} · AI call intake filed a report; awaiting human verification` : `${incident.id} · Simulated call received; awaiting review`;
    return update(board => ({ ...board, incidents: [incident, ...board.incidents], activity: [{ id: crypto.randomUUID(), message, at }, ...board.activity] }));
  },
  /** Demo only: apply one simulated scenario-feed event (new report and/or road closure). */
  applyFeedEvent: async (event: FeedEvent): Promise<Board> => {
    if (!isDemo) throw new Error('The scenario feed is only available in demo mode.');
    return update(board => {
      const incidents = event.report && !board.incidents.some(i => i.id === feedIncident(event).id) && board.incidents.length < 40 ? [...board.incidents, feedIncident(event)] : board.incidents;
      const blockedEdgeIds = event.blocksEdgeId && !board.blockedEdgeIds.includes(event.blocksEdgeId) ? [...board.blockedEdgeIds, event.blocksEdgeId] : board.blockedEdgeIds;
      // A new closure invalidates any plan not yet dispatched, so routes must be re-planned and re-verified.
      const closed = blockedEdgeIds !== board.blockedEdgeIds;
      const plan = closed && board.plan?.status !== 'alerted' ? null : board.plan;
      return { ...board, incidents, blockedEdgeIds, plan, revision: closed ? board.revision + 1 : board.revision, activity: [{ id: crypto.randomUUID(), message: `${event.time} · ${event.channel.toUpperCase()} · ${event.headline}`, at: new Date().toISOString() }, ...board.activity] };
    });
  },
  collectReport: async (report: string, source: Incident['source']): Promise<Board> => {
    if (!isDemo) return liveWrite('/incidents', { report, source });
    if (demoBoard.incidents.length >= 40) throw new Error('Reset the scenario before collecting more than 40 reports.');
    const result = await bedrock.extract(report);
    const e = result.extraction;
    const incident: Incident = {
      id: `REQ-${crypto.randomUUID().slice(0, 8)}`, title: e.title, summary: e.summary,
      category: e.category ?? 'water', categoryNeedsReview: e.category === null,
      priority: e.priority ?? 'normal', status: 'needs_review',
      location: { label: e.locationLabel ?? 'Unconfirmed location', coordinates: null },
      nodeId: e.nodeId ?? undefined, people: e.people ?? 0, quantity: e.quantity ?? 0,
      unit: 'supply totes', source, originalReport: report, updatedAt: result.ai.at,
      missingInfo: e.missingInfo, clarificationQuestions: e.clarificationQuestions, ai: result.ai,
    };
    return update(board => ({ ...board, incidents: [...board.incidents, incident], activity: [{ id: crypto.randomUUID(), message: `${incident.id} · Bedrock extracted report; awaiting verification`, at: result.ai.at }, ...board.activity] }));
  },
  analyzeReport: async (id: string, followUp: string): Promise<Board> => {
    if (!isDemo) return liveWrite(`/incidents/${encodeURIComponent(id)}/analyze`, { followUp });
    const before = demoBoard.incidents.find(i => i.id === id);
    if (!before || before.status !== 'needs_review') throw new Error('Only reports awaiting review can be analyzed.');
    const followUps = [...(before.followUps ?? []), ...(followUp.trim() ? [followUp.trim()] : [])];
    if (followUps.join('\n').length > 4000) throw new Error('Follow-up history exceeds 4,000 characters.');
    const result = await bedrock.extract(before.originalReport, followUps.join('\n') || undefined);
    if (demoBoard.incidents.find(i => i.id === id) !== before) throw new Error('The report changed during analysis. Try again.');
    const e = result.extraction;
    return update(board => ({ ...board, incidents: board.incidents.map(i => i.id !== id ? i : {
      ...i, title: e.title, summary: e.summary, category: e.category ?? i.category, categoryNeedsReview: e.category === null,
      priority: e.priority ?? 'normal', nodeId: e.nodeId ?? undefined,
      location: { label: e.locationLabel ?? 'Unconfirmed location', coordinates: null },
      people: e.people ?? 0, quantity: e.quantity ?? 0, missingInfo: e.missingInfo,
      clarificationQuestions: e.clarificationQuestions, followUps, ai: result.ai, updatedAt: result.ai.at,
    }), activity: [{ id: crypto.randomUUID(), message: `${id} · Bedrock analysis updated; human review required`, at: result.ai.at }, ...board.activity] }));
  },
  getBoard: async (): Promise<Board> => isDemo ? structuredClone(demoBoard) : request('/board'),
  act: async (id: string, action: IncidentAction): Promise<Board> => isDemo
    ? update(board => applyAction(board, id, action))
    : liveWrite(`/incidents/${encodeURIComponent(id)}/actions`, action),
  plan: async (): Promise<Board> => {
    if (!isDemo) return liveWrite('/plans');
    if (aiConfigured) {
      const before = demoBoard;
      const { plan } = await bedrock.plan(before);
      if (demoBoard !== before || plan.revision !== demoBoard.revision) throw new Error('The board changed during planning. Generate routes again.');
      return update(board => ({ ...board, plan, activity: [{ id: crypto.randomUUID(), message: 'Bedrock reviewed the optimized scenario routes · awaiting coordinator approval', at: new Date().toISOString() }, ...board.activity] }));
    }
    // Yield once so the UI can display its working state before local optimization.
    await new Promise(resolve => setTimeout(resolve, 100));
    return update(planRoutes);
  },
  approvePlan: async (id: string): Promise<Board> => isDemo
    ? update(board => approveRoutes(board, id))
    : liveWrite(`/plans/${encodeURIComponent(id)}/approve`),
  alertRescuers: async (id: string): Promise<Board> => isDemo
    ? update(board => alertRescuers(board, id))
    : liveWrite(`/plans/${encodeURIComponent(id)}/alerts`),
  geocode: async (address: string): Promise<PlaceCandidate[]> => {
    const result = await request<{ candidates: PlaceCandidate[] }>('/locations/geocode', { method: 'POST', body: JSON.stringify({ address }) });
    return result.candidates;
  },
  saveTeam: async (team: Pick<Team, 'name' | 'members' | 'capacity' | 'capabilities' | 'status'> & { location: Incident['location']; id?: string }, expectedVersion?: number): Promise<Board> => liveWrite(team.id ? `/teams/${encodeURIComponent(team.id)}` : '/teams', team, expectedVersion),
  importDocument: async (file: File): Promise<Board> => {
    if (isDemo) throw new Error('Private S3 import requires the connected workspace. Use Read .txt locally in demo mode.');
    if (!file.name.toLowerCase().endsWith('.txt') || file.size > 32768) throw new Error('Choose a UTF-8 .txt file of at most 32KB and 8,000 characters.');
    const upload = await request<{ key: string; url: string; fields: Record<string,string> }>('/uploads', { method: 'POST', body: '{}' });
    const form = new FormData(); Object.entries(upload.fields).forEach(([key,value]) => form.append(key,value)); form.append('file', file);
    const sent = await fetch(upload.url, { method: 'POST', body: form, signal: AbortSignal.timeout(20000) });
    if (!sent.ok) throw new Error('Private upload failed. Check S3 CORS and permissions.');
    return liveWrite('/incidents/import', { key: upload.key });
  },
  simulateReport: async (): Promise<Board> => {
    if (!isDemo) throw new Error('Simulation is only available in demo mode.');
    if (demoBoard.incidents.length >= 7) throw new Error('All synthetic reports are loaded. Reset to replay.');
    return update(board => ({
      ...board, incidents: [...board.incidents, syntheticIncident(6)],
      activity: [{ id: crypto.randomUUID(), message: 'New synthetic text report collected · Awaiting verification', at: new Date().toISOString() }, ...board.activity],
    }));
  },
  reset: async (): Promise<Board> => {
    if (!isDemo) throw new Error('Reset is only available in demo mode.');
    const urls = new Set(demoBoard.incidents.flatMap(i => [i.audioUrl, ...(i.recordings?.map(r => r.audioUrl) ?? [])]).filter((u): u is string => !!u));
    urls.forEach(url => URL.revokeObjectURL(url));
    demoBoard = createDemoBoard(); return structuredClone(demoBoard);
  },
};
