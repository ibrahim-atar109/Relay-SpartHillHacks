import type { Board, Incident, IncidentAction } from '../../shared/contracts';
import { nodes } from '../data/network';
import { aiConfigured, bedrock } from './ai';
import { createDemoBoard, syntheticIncident } from '../data/fixtures';
import { alertRescuers, applyAction, approveRoutes, planRoutes } from '../features/operations/rules';

export const isDemo = import.meta.env.VITE_DATA_MODE !== 'live';
let demoBoard = createDemoBoard();
const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!base) throw new Error('Set VITE_API_BASE_URL to connect the AWS API.');
  const response = await fetch(`${base}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  if (!response.ok) throw new Error(`API request failed (${response.status}). Please retry.`);
  return response.json() as Promise<T>;
}
function update(operation: (board: Board) => Board) {
  demoBoard = operation(demoBoard);
  return structuredClone(demoBoard);
}
export const api = {
  submitVoiceReport: async (transcript: string, audioUrl = '', recordings: { text: string; audioUrl: string }[] = []): Promise<Board> => {
    if (!isDemo) throw new Error('Simulated calls are available only in the scenario workspace.');
    const originalReport = transcript.trim();
    if (!originalReport || originalReport.length > 8000) throw new Error('A call needs a transcript of 1–8,000 characters.');
    if ((audioUrl && !audioUrl.startsWith('blob:')) || recordings.some(r => !r.text.trim() || !r.audioUrl.startsWith('blob:'))) throw new Error('Only recordings made in this browser session can be attached.');
    if (demoBoard.incidents.length >= 40) throw new Error('Reset the scenario before collecting more than 40 reports.');
    const at = new Date().toISOString();
    const incident: Incident = {
      id: `VOICE-${crypto.randomUUID().slice(0, 8)}`, title: 'Simulated 911 call', origin: 'participant',
      source: 'voice', audioUrl: audioUrl || undefined, recordings, originalReport,
      status: 'needs_review', category: 'water', categoryNeedsReview: true, priority: 'normal', people: 0, quantity: 0,
      unit: 'supply totes', location: { label: 'Caller location unconfirmed', coordinates: null },
      summary: 'Participant call transcript. Supply category, urgency, location and counts need review. Use Analyze with Bedrock for AI extraction.',
      missingInfo: ['Confirm the supply category, urgency, location and counts. This training call has not been sent to emergency services.'],
      updatedAt: at,
    };
    return update(board => ({ ...board, incidents: [incident, ...board.incidents], activity: [{ id: crypto.randomUUID(), message: `${incident.id} · Simulated call received; awaiting review`, at }, ...board.activity] }));
  },
  collectReport: async (report: string, source: Incident['source']): Promise<Board> => {
    if (!isDemo) throw new Error('Bedrock intake currently uses the scenario board. Set VITE_DATA_MODE=demo.');
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
    if (!isDemo) throw new Error('Bedrock analysis currently uses the scenario board.');
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
    : request(`/incidents/${encodeURIComponent(id)}/actions`, { method: 'POST', body: JSON.stringify(action) }),
  plan: async (): Promise<Board> => {
    if (!isDemo) return request('/plans', { method: 'POST' });
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
    : request(`/plans/${encodeURIComponent(id)}/approve`, { method: 'POST' }),
  alertRescuers: async (id: string): Promise<Board> => isDemo
    ? update(board => alertRescuers(board, id))
    : request(`/plans/${encodeURIComponent(id)}/alerts`, { method: 'POST' }),
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
