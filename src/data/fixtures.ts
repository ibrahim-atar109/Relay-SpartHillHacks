import type { Board, Incident } from '../../shared/contracts';
import { nodes } from './network';

export function syntheticIncident(index: number): Incident {
  const samples: Array<{ title: string; node: string; category: Incident['category']; priority: Incident['priority']; people: number; quantity: number; source: Incident['source']; report: string }> = [
    { title: 'Water for the community center', node: 'c', category: 'water', priority: 'critical', people: 24, quantity: 6, source: 'voice', report: 'This is the downtown community center. We have 24 people and no drinking water. Please bring 6 supply totes of water. Use the main entrance.' },
    { title: 'Food at the northside shelter', node: 'n', category: 'food', priority: 'high', people: 30, quantity: 5, source: 'text', report: 'Northside shelter needs 5 supply totes of prepared food for 30 residents before tonight.' },
    { title: 'Medicine delivery to the clinic', node: 's', category: 'medicine', priority: 'critical', people: 8, quantity: 2, source: 'form', report: 'Southside clinic requests 2 supply totes of prepared medication packages for 8 residents. Clinic staff will receive them.' },
    { title: 'Water for senior housing', node: 'w', category: 'water', priority: 'high', people: 16, quantity: 4, source: 'voice', report: 'Westside senior housing has 16 residents. We need 4 supply totes of water. Building manager is at the front door.' },
    { title: 'Food for riverside residents', node: 'se', category: 'food', priority: 'normal', people: 18, quantity: 3, source: 'text', report: 'Riverside apartments: 18 people remain here and we need 3 supply totes of food.' },
    { title: 'Library location needs confirmation', node: 'ne', category: 'water', priority: 'normal', people: 12, quantity: 3, source: 'voice', report: 'We are twelve people at the library, but I am not sure which branch. We need 3 supply totes of water. Follow-up from the caller: yes, Eastside library.' },
    { title: 'Additional water request at the clinic', node: 's', category: 'water', priority: 'high', people: 10, quantity: 2, source: 'text', report: 'Southside clinic has ten additional people waiting. Please bring 2 supply totes of water.' },
  ];
  const sample = samples[index % samples.length];
  const unresolved = index === 5;
  return {
    id: `REQ-${1042 + index}`, title: sample.title, category: sample.category,
    priority: sample.priority, status: 'needs_review', people: sample.people,
    quantity: sample.quantity, unit: 'supply totes', source: sample.source,
    nodeId: unresolved ? undefined : sample.node,
    location: unresolved ? { label: 'Library branch not yet confirmed', coordinates: null } : nodes[sample.node],
    origin: 'synthetic', originalReport: `Hurricane Katrina exercise, Fort Lauderdale: ${sample.report}`, summary: `${sample.quantity} supply totes of ${sample.category} requested for ${sample.people} people. Confirm the extracted fields against the source.`,
    missingInfo: unresolved ? ['Use the caller’s follow-up to confirm the library branch.'] : [],
    updatedAt: new Date().toISOString(),
  };
}

export function createDemoBoard(): Board {
  return {
    incidents: Array.from({ length: 6 }, (_, index) => syntheticIncident(index)),
    teams: [
      { id: 'team-a', name: 'Team Alder', members: 3, status: 'available', capacity: 12, capabilities: ['water', 'food'], nodeId: 'nw', coordinates: nodes.nw.coordinates },
      { id: 'team-b', name: 'Team Birch', members: 2, status: 'available', capacity: 8, capabilities: ['medicine', 'water'], nodeId: 'e', coordinates: nodes.e.coordinates },
      { id: 'team-c', name: 'Team Cedar', members: 2, status: 'available', capacity: 10, capabilities: ['water', 'food'], nodeId: 'sw', coordinates: nodes.sw.coordinates },
    ],
    revision: 0, blockedEdgeIds: ['c-e'], plan: null, alerts: [],
    activity: [{ id: 'seed', message: '6 synthetic reports collected · awaiting your verification', at: new Date().toISOString() }],
  };
}
