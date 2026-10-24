import type { CallMessage } from '../../../shared/contracts';
export interface CallTurn { speaker: 'dispatcher' | 'caller'; text: string; audioUrl?: string }
export function conversationMessages(turns: CallTurn[]): CallMessage[] {
  return turns.map(t => ({ role: t.speaker === 'caller' ? 'user' : 'assistant', text: t.text }));
}
