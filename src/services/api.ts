import type { Board, IncidentAction, Recommendation } from '../../shared/contracts';
import { createDemoBoard } from '../data/fixtures';
import { applyAction, recommend } from '../features/operations/rules';

export const isDemo = import.meta.env.VITE_DATA_MODE !== 'live';
let demoBoard = createDemoBoard();
const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!base) throw new Error('Set VITE_API_BASE_URL to connect the AWS API.');
  const response = await fetch(`${base}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  if (!response.ok) throw new Error(`API request failed (${response.status}). Please retry.`);
  return response.json() as Promise<T>;
}

export const api = {
  getBoard: async (): Promise<Board> => isDemo ? structuredClone(demoBoard) : request('/board'),
  getRecommendation: async (id: string): Promise<Recommendation | null> => {
    if (!isDemo) return request(`/incidents/${encodeURIComponent(id)}/recommendation`, { method: 'POST' });
    const incident = demoBoard.incidents.find(item => item.id === id);
    return incident ? recommend(incident, demoBoard.teams) : null;
  },
  act: async (id: string, action: IncidentAction): Promise<Board> => {
    if (!isDemo) return request(`/incidents/${encodeURIComponent(id)}/actions`, { method: 'POST', body: JSON.stringify(action) });
    demoBoard = applyAction(demoBoard, id, action);
    return structuredClone(demoBoard);
  },
  simulateReport: async (): Promise<Board> => {
    if (!isDemo) throw new Error('Simulation is available only in demo mode.');
    if (demoBoard.incidents.some(item => item.id === 'REQ-1046')) return structuredClone(demoBoard);
    const at = new Date().toISOString();
    demoBoard.incidents.unshift({ id: 'REQ-1046', title: 'New water request at the library', category: 'water', priority: 'high', status: 'needs_review', location: { label: 'Eastside library · demo location', coordinates: [-121.871, 37.345] }, people: 12, quantity: 3, unit: 'cases', source: 'voice', originalReport: 'We are twelve people at the library. Please bring three cases of water. Use the main entrance.', summary: 'Three cases of water requested for twelve people. Coordinator verification required.', missingInfo: [], updatedAt: at });
    demoBoard.activity.unshift({ id: crypto.randomUUID(), message: 'REQ-1046 · Simulated voice transcript received', at });
    return structuredClone(demoBoard);
  },
  reset: async (): Promise<Board> => {
    if (!isDemo) throw new Error('Reset is available only in demo mode.');
    demoBoard = createDemoBoard(); return structuredClone(demoBoard);
  },
};
