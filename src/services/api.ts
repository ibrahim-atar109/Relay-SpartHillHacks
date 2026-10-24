import type { Board, IncidentAction } from '../../shared/contracts';
import { advanceScenario, loadSurge, setClosure } from '../features/simulation/engine';
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
  advance: async (): Promise<Board> => { if (!isDemo) throw new Error('Demo only'); return update(advanceScenario); },
  surge: async (): Promise<Board> => { if (!isDemo) throw new Error('Demo only'); return update(loadSurge); },
  closure: async (id: string, closed: boolean): Promise<Board> => { if (!isDemo) throw new Error('Demo only'); return update(board => setClosure(board, id, closed)); },
  getBoard: async (): Promise<Board> => isDemo ? structuredClone(demoBoard) : request('/board'),
  act: async (id: string, action: IncidentAction): Promise<Board> => isDemo
    ? update(board => applyAction(board, id, action))
    : request(`/incidents/${encodeURIComponent(id)}/actions`, { method: 'POST', body: JSON.stringify(action) }),
  plan: async (): Promise<Board> => {
    if (!isDemo) return request('/plans', { method: 'POST' });
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
  submitVoiceReport: async (transcript: string, audioUrl: string, recordings?: { text: string; audioUrl: string }[]): Promise<Board> => {
    if (!isDemo) throw new Error('Voice intake is available only in the local simulation.');
    const text = transcript.trim();
    if (!text || !audioUrl.startsWith('blob:')) throw new Error('Record a voice report with a transcript first.');
    return update(board => ({
      ...board,
      incidents: [{
        id: `VOICE-${crypto.randomUUID().slice(0, 8)}`, title: 'Participant voice report',
        origin: 'participant', source: 'voice', audioUrl, recordings, originalReport: text,
        status: 'needs_review', category: 'water', priority: 'normal', people: 0, quantity: 0,
        unit: 'supply totes', location: { label: 'Caller location unconfirmed', coordinates: null },
        summary: 'Original participant transcript. No automatic extraction: category and urgency are placeholders until reviewed.',
        missingInfo: ['Confirm location, supply category, urgency, and counts from the caller. Unsupported needs should remain in review.'],
        updatedAt: new Date().toISOString(),
      }, ...board.incidents],
      activity: [{ id: crypto.randomUUID(), message: 'Participant voice report received · Awaiting review', at: new Date().toISOString() }, ...board.activity],
    }));
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
    demoBoard.incidents.forEach(item => { if (item.audioUrl) URL.revokeObjectURL(item.audioUrl); item.recordings?.forEach(recording => URL.revokeObjectURL(recording.audioUrl)); });
    demoBoard = createDemoBoard(); return structuredClone(demoBoard);
  },
};
