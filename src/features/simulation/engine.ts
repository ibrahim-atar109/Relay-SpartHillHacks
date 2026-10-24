import type { Board, Incident } from '../../../shared/contracts';
import { nodes, edges } from '../../data/network';
export type SignalCluster = { key: string; nodeId: string; label: string; count: number; critical: number; high: number; samples: string[]; categories: string[] };
export const exerciseStart = Date.parse('2005-08-25T22:30:00Z');
export function exerciseTime(minute: number) { return new Date(exerciseStart + minute * 60000).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' }); }
export function clustersFor(incidents: Incident[]): SignalCluster[] {
  const groups = new Map<string, SignalCluster>();
  for (const item of incidents) {
    if (!item.nodeId || item.status === 'delivered') continue;
    let group = groups.get(item.nodeId);
    if (!group) { group = { key: item.nodeId, nodeId: item.nodeId, label: nodes[item.nodeId].label, count: 0, critical: 0, high: 0, samples: [], categories: [] }; groups.set(item.nodeId, group); }
    group.count++; group.critical += Number(item.priority === 'critical'); group.high += Number(item.priority === 'high');
    if (group.samples.length < 3) group.samples.push(item.id);
    if (!group.categories.includes(item.category)) group.categories.push(item.category);
  }
  return [...groups.values()].sort((a,b) => b.critical - a.critical || b.high - a.high || b.count - a.count);
}
export function makeSignal(index: number, minute: number): Incident {
  const nodeId = Object.keys(nodes)[index % 9];
  const category = (['water','food','medicine'] as const)[Math.floor(index / 9) % 3];
  const priority = (['normal','high','critical','high','normal','critical','normal'] as const)[(index * 13 + minute) % 7];
  const people = 2 + index % 27;
  const title = priority === 'critical' ? 'Urgent need · ' + nodes[nodeId].label : category === 'water' ? 'Drinking water request' : category === 'medicine' ? 'Medication supply interrupted' : 'Shelter food request';
  return { id: `SIM-${index}`, origin: 'synthetic', title, nodeId, category, priority, status: 'needs_review', people, quantity: 1 + index % 4, unit: 'supply totes', source: 'voice', location: nodes[nodeId], originalReport: `Synthetic caller ${index}: At ${nodes[nodeId].label}, ${people} people need ${category}. ${priority === 'critical' ? 'Floodwater is rising and access is getting difficult.' : 'Power is out after the storm.'}`, summary: 'Scripted scenario fields; not an AI assessment. Verify before dispatch.', missingInfo: [], updatedAt: new Date(exerciseStart + minute * 60000).toISOString() };
}
export function setClosure(board: Board, id: string, closed: boolean): Board {
  if (!edges.some(edge => edge.id === id)) throw new Error('Unknown road corridor.');
  const blockedEdgeIds = closed ? [...new Set([...board.blockedEdgeIds, id])] : board.blockedEdgeIds.filter(key => key !== id);
  if (blockedEdgeIds.join() === board.blockedEdgeIds.join()) return board;
  return { ...board, blockedEdgeIds, revision: board.revision + 1, plan: null, activity: [{ id: crypto.randomUUID(), at: new Date().toISOString(), message: `Road ${id} ${closed ? 'closed' : 'reopened'} · Route plan cleared; dispatched teams require coordinator review` }, ...board.activity].slice(0, 100) };
}
export function loadSurge(board: Board): Board {
  const existing = board.incidents.filter(item => item.id.startsWith('SIM-')).length;
  const count = Math.max(0, 6000 - existing);
  return { ...board, incidents: [...board.incidents, ...Array.from({length: count}, (_,i) => makeSignal(existing + i, board.simulationMinute || 0))], activity: [{id: crypto.randomUUID(), at: new Date().toISOString(), message: `${count.toLocaleString()} synthetic calls loaded · Grouped by location, not confirmed as duplicates`}, ...board.activity].slice(0,100) };
}
export function advanceScenario(board: Board): Board {
  const minute = (board.simulationMinute || 0) + 1;
  const count = 8 + minute % 13;
  const start = board.incidents.filter(item => item.id.startsWith('SIM-')).length;
  const room = Math.max(0, 10000 - board.incidents.length);
  let next: Board = { ...board, simulationMinute: minute, incidents: [...board.incidents, ...Array.from({length: Math.min(count, room)}, (_,i) => makeSignal(start+i, minute))] };
  if (minute % 3 === 0) {
    const edge = edges[Math.floor(minute / 3) % edges.length];
    next = setClosure(next, edge.id, !next.blockedEdgeIds.includes(edge.id));
  }
  const stories = ['Local radio exercise: widespread outages reported; independent confirmation pending.', 'Public works exercise: crews surveying fallen trees. No road status changes implied by this bulletin.', 'Weather bulletin exercise: heavy rain continues. Scenario context only; not a live forecast.'];
  return { ...next, situationFeed: [{id: `feed-${minute}`, minute, text: stories[minute % stories.length]}, ...(board.situationFeed || [])].slice(0,8) };
}
