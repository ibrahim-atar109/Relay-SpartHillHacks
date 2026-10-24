export type CallTurn = { speaker: 'dispatcher' | 'caller'; text: string; audioUrl?: string };
export const opening = '911, how can I help you? What is the location of your emergency?';
/** Deliberately bounded, deterministic stand-in for a future server-side conversation provider. */
export function nextDispatcherTurn(turns: CallTurn[]): string {
  const callers = turns.filter(turn => turn.speaker === 'caller');
  const text = callers.map(turn => turn.text).join(' ').toLowerCase();
  const asked = turns.filter(turn => turn.speaker === 'dispatcher').map(turn => turn.text).join(' ');
  if (!/(street|avenue|road|downtown|shelter|clinic|library|housing|apartments|boulevard|near|at \d)/i.test(text) && !asked.includes('nearest street')) return 'I heard your report. What is the nearest street, intersection, or landmark in Fort Lauderdale? It is okay if you do not know the address.';
  if (!asked.includes('immediate danger') && !/(injur|trapped|breath|unconscious|immediate danger|everyone is safe|no one is hurt)/.test(text)) return 'Is anyone injured, trapped, or in immediate danger? Tell me what you can observe.';
  if (!asked.includes('how many') && !/(\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve) (of us|people|residents|adults|children)/.test(text)) return 'About how many people need help? Are there children, older adults, or anyone with medical needs?';
  if (!asked.includes('access your location')) return /flood|water is rising|trapped/.test(text)
    ? 'You mentioned flooding or someone being trapped. Can responders access your location? Describe any blocked roads or nearby landmarks. Do not enter floodwater to check.'
    : 'Can responders access your location? Describe any blocked roads, fallen trees, or power lines you can already see.';
  if (!asked.includes('most urgent need')) return 'What is your most urgent need right now, and is there anything else a dispatcher should know?';
  return 'Thank you. Your statements are captured for coordinator review. This is a training call; no responders have been dispatched. You can add another detail or finish the call.';
}
