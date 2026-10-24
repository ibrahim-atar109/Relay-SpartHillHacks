import type { CallMessage, CallResponse } from '../../shared/contracts';
import { askBedrock } from './bedrock';
import { InputError, object, text } from '../validation';
export function validateConversation(value: unknown): CallMessage[] {
  if (!Array.isArray(value) || value.length > 24) throw new InputError('A call supports at most 24 messages. Finish this call before continuing.');
  let total = 0;
  const messages = value.map((entry, index) => {
    const m = object(entry);
    const expected = index % 2 === 0 ? 'assistant' : 'user';
    if (m.role !== expected) throw new InputError('Conversation messages must alternate assistant and caller.');
    const content = text(m.text, 'conversation message', 2000); total += content.length;
    return { role: expected, text: content } as CallMessage;
  });
  if (total > 7000 || (messages.length && messages.at(-1)!.role !== 'user')) throw new InputError('Send a caller reply, or finish the call if the transcript is too long.');
  return messages;
}
export async function converse911(value: unknown): Promise<CallResponse> {
  const messages = validateConversation(value);
  // Bedrock conversations begin with a user message. This is an application instruction,
  // not a fabricated caller transcript. Every later user turn is actual caller input.
  const conversation: CallMessage[] = [{ role: 'user', text: 'Begin an AI emergency-intake training simulation. Identify yourself as AI, clarify that no real emergency services are connected, and ask your first brief intake question.' }, ...messages];
  const result = await askBedrock(`You are an AI emergency intake operator in a training simulation, never a real 911 dispatcher.
Return {"message":"your spoken reply"}. Speak naturally and concisely, usually one or two questions per turn, adapting to what the caller says rather than using a rigid script.
Collect reported location including city/region, incident details, immediate threats, injuries (unknown is not zero), and access obstacles. Do not invent addresses, injuries, facts or completed actions.
Ask for clarification when uncertain. Do not claim to locate, call, dispatch or contact anyone. Do not request unnecessary names or phone numbers. Do not give specialized medical, rescue or hazardous-action instructions. For an actual emergency, tell the caller this simulation cannot help and to contact their real local emergency service.
When enough information is available, briefly summarize for human review and invite correction or finishing the training call. Do not force a supply request or assume supply tote counts.`, {}, undefined, conversation);
  try { return { message: text(object(result.value).message, 'operator response', 2000), ai: result.ai }; }
  catch { throw new Error('Bedrock returned an invalid operator response.'); }
}
