import type { Board, Incident, ReportChannel } from '../../shared/contracts';
import { nodes } from './network';

export function syntheticIncident(index: number): Incident {
  const samples: Array<{ title: string; node: string; category: Incident['category']; priority: Incident['priority']; people: number; quantity: number; source: Incident['source']; channel: ReportChannel; report: string }> = [
    { title: 'No drinking water at the Parish Government Complex', node: 'c', category: 'water', priority: 'critical', people: 24, quantity: 6, source: 'voice', channel: '911', report: '911 transcript, Aug 29 2005 09:12: We are 24 people sheltering on the second floor of the parish government complex on Judge Perez. Water is over the first floor and we have no drinking water. We need about 6 supply totes of water.' },
    { title: 'Food for Paris Rd shelter point', node: 'n', category: 'food', priority: 'high', people: 30, quantity: 5, source: 'text', channel: 'police', report: 'Sheriff\'s office radio log, Aug 29 2005 10:40: Deputies report 30 residents at the Paris Rd shelter point with no food since last night. Request 5 supply totes of prepared food.' },
    { title: 'Medication for riverfront clinic point', node: 's', category: 'medicine', priority: 'critical', people: 8, quantity: 2, source: 'form', channel: '911', report: '911 transcript, Aug 29 2005 11:05: Nurse at the St. Bernard Hwy clinic point says 8 patients need insulin and prescription refills. Requesting 2 supply totes of prepared medication packages.' },
    { title: 'Water for Arabi senior housing', node: 'w', category: 'water', priority: 'high', people: 16, quantity: 4, source: 'voice', channel: '911', report: '911 transcript, Aug 29 2005 08:20: St. Claude Ave senior housing in Arabi. 16 elderly residents moved upstairs, power is out, water is rising in the street. Need 4 supply totes of water.' },
    { title: 'Food for Violet apartments', node: 'se', category: 'food', priority: 'normal', people: 18, quantity: 3, source: 'text', channel: 'news', report: 'Local radio listener relay, Aug 29 2005 13:30: 18 people stayed at apartments on St. Bernard Hwy in Violet and are asking for 3 supply totes of food.' },
    { title: 'Meraux shelter location needs confirmation', node: 'ne', category: 'water', priority: 'normal', people: 12, quantity: 3, source: 'voice', channel: '911', report: '911 transcript, Aug 29 2005 12:15: We are twelve people at a shelter in Meraux, I think near Mehle, I am not sure exactly. We need 3 supply totes of water. Follow-up from the caller: yes, the Mehle Ave shelter point.' },
    { title: 'Additional water at the riverfront clinic point', node: 's', category: 'water', priority: 'high', people: 10, quantity: 2, source: 'text', channel: 'police', report: 'Mutual-aid police log, Aug 29 2005 14:10: Ten more evacuees arrived at the St. Bernard Hwy clinic point. Request 2 supply totes of water.' },
  ];
  const sample = samples[index % samples.length];
  const unresolved = index === 5;
  return {
    id: `REQ-${1042 + index}`, title: sample.title, category: sample.category,
    priority: sample.priority, status: 'needs_review', people: sample.people,
    quantity: sample.quantity, unit: 'supply totes', source: sample.source,
    nodeId: unresolved ? undefined : sample.node,
    location: unresolved ? { label: 'Meraux shelter point not yet confirmed', coordinates: null } : nodes[sample.node],
    originalReport: sample.report, summary: `${sample.quantity} supply totes of ${sample.category} requested for ${sample.people} people. Confirm the extracted fields against the source.`,
    missingInfo: unresolved ? ['Use the caller’s follow-up to confirm which Meraux shelter point.'] : [],
    updatedAt: new Date().toISOString(), channel: sample.channel,
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
    activity: [{ id: 'seed', message: 'Scenario start · 6 simulated Katrina reports (911, police, news) awaiting verification', at: new Date().toISOString() }],
  };
}
