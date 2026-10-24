import { describe, expect, it } from 'vitest';
import { nextDispatcherTurn, opening, type CallTurn } from './dispatcher';
const begin = (text: string): CallTurn[] => [{ speaker: 'dispatcher', text: opening }, { speaker: 'caller', text }];
describe('rules-based simulated dispatcher', () => {
  it('asks for a location without changing the main scenario city', () => {
    expect(nextDispatcherTurn(begin('Please help us.'))).toContain('San José');
  });
  it('asks about observable danger after receiving a location', () => {
    expect(nextDispatcherTurn(begin('I am at the downtown shelter.'))).toContain('immediate danger');
  });
  it('asks for missing people counts', () => {
    expect(nextDispatcherTurn(begin('I am near the clinic. Everyone is safe.'))).toContain('how many');
  });
  it('acknowledges flooding while asking about access', () => {
    expect(nextDispatcherTurn(begin('Near the shelter, six people are trapped by rising floodwater.'))).toContain('access your location');
  });
  it('ends repeated follow-ups without claiming responders were dispatched', () => {
    const turns = begin('At the downtown shelter, six people need water. Everyone is safe.');
    for (let i = 0; i < 6; i++) {
      turns.push({ speaker: 'dispatcher', text: nextDispatcherTurn(turns) }, { speaker: 'caller', text: 'That is all I know.' });
    }
    expect(nextDispatcherTurn(turns)).toContain('no responders have been dispatched');
  });
});
