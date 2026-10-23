import type { Board, Incident } from '../../shared/contracts';

const incident = (values: Partial<Incident> & Pick<Incident, 'id' | 'title' | 'location'>): Incident => ({
  category: 'water', priority: 'high', status: 'verified', people: 24, quantity: 6, unit: 'cases',
  source: 'text', originalReport: 'We have 24 people at the community center. Six cases of drinking water would get us through tonight. The entrance on 4th Street is open.',
  summary: 'Drinking water requested for 24 residents. Access through the 4th Street entrance.',
  missingInfo: [], updatedAt: new Date().toISOString(), ...values,
});

export function createDemoBoard(): Board {
  return {
    incidents: [
      incident({ id: 'REQ-1042', title: 'Water for the community center', location: { label: 'Downtown Community Center', coordinates: [-121.889, 37.337] }, priority: 'critical' }),
      incident({ id: 'REQ-1043', title: 'Evening meals at the shelter', category: 'food', quantity: 30, unit: 'meal packs', people: 30, location: { label: 'Northside shelter', coordinates: [-121.884, 37.350] }, summary: 'Thirty meal packs requested for the evening shelter service.', originalReport: 'Thirty people are staying here tonight. We need thirty meal packs. Delivery entrance is on the north side.' }),
      incident({ id: 'REQ-1044', title: 'Prescription pickup assistance', category: 'medicine', quantity: 2, unit: 'packages', people: 2, status: 'needs_review', location: { label: 'Location awaiting confirmation', coordinates: null }, summary: 'Two residents request help collecting prepared prescriptions. Confirm delivery location.', missingInfo: ['Confirm the delivery address'], originalReport: 'Can someone bring our two prepared prescription packages? We are staying near the park.', source: 'voice' }),
      incident({ id: 'REQ-1045', title: 'Water delivery to senior housing', priority: 'normal', status: 'assigned', teamId: 'team-c', quantity: 4, people: 16, location: { label: 'Westside senior housing', coordinates: [-121.907, 37.331] }, summary: 'Four cases of water assigned to Team Cedar.', originalReport: 'We need four cases of drinking water for sixteen residents. The building manager can meet the driver.' }),
    ],
    teams: [
      { id: 'team-a', name: 'Team Alder', members: 3, status: 'available', capacity: 40, capabilities: ['water', 'food'], coordinates: [-121.899, 37.342] },
      { id: 'team-b', name: 'Team Birch', members: 2, status: 'available', capacity: 12, capabilities: ['medicine', 'water'], coordinates: [-121.876, 37.333] },
      { id: 'team-c', name: 'Team Cedar', members: 2, status: 'assigned', capacity: 20, capabilities: ['water', 'food'], coordinates: [-121.901, 37.327] },
    ],
    activity: [{ id: 'seed', message: 'Demo scenario loaded · San José flood response', at: new Date().toISOString() }],
  };
}
