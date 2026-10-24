import type { CallFact, CallFactField, CallReportResponse, CallTurn, CallTurnResponse } from '../../shared/contracts';
import { nodes } from '../../src/data/network';
import { askBedrock } from './bedrock';
import { InputError, object, text, validateExtraction } from '../validation';

export const callFactFields: readonly CallFactField[] = ['location', 'what_happened', 'immediate_threats', 'people_affected', 'injuries', 'access_obstacles', 'other'];
const requiredFields: readonly CallFactField[] = ['location', 'what_happened', 'immediate_threats', 'people_affected', 'injuries', 'access_obstacles'];
const MAX_TURNS = 40;
const MAX_TRANSCRIPT_CHARS = 16000;

/** Validate the browser-supplied conversation. Caller text is untrusted and passed to the model only as data. */
export function validateTranscript(value: unknown, allowEmpty: boolean): CallTurn[] {
  if (!Array.isArray(value) || value.length > MAX_TURNS) throw new InputError(`transcript must be a list of at most ${MAX_TURNS} turns.`);
  const turns = value.map(entry => {
    const turn = object(entry);
    if (turn.speaker !== 'assistant' && turn.speaker !== 'caller') throw new InputError('Each turn needs speaker "assistant" or "caller".');
    return { speaker: turn.speaker, text: text(turn.text, 'turn text', 2000) } as CallTurn;
  });
  if (!allowEmpty && !turns.some(turn => turn.speaker === 'caller')) throw new InputError('The call has no caller statements yet.');
  if (turns.reduce((sum, turn) => sum + turn.text.length, 0) > MAX_TRANSCRIPT_CHARS) throw new InputError('The call transcript is too long. Finish the call to file the report.');
  return turns;
}

const intakeRole = `You are the AI intake assistant in a hurricane-response TRAINING SIMULATION for the St. Bernard Parish, Louisiana scenario. You take overflow 911 calls when human operators are unavailable. Nothing you say contacts emergency services, and no responders are dispatched by you.`;

export async function nextCallTurn(transcript: CallTurn[]): Promise<CallTurnResponse> {
  const result = await askBedrock(`${intakeRole}
Write the assistant's next spoken line in the call. Output {"reply":"what you say next","readyToFile":false}.
- If the transcript is empty, greet the caller, say clearly that you are an AI assistant in a training simulation, and ask where they are and what is happening.
- Otherwise respond to what the caller just said, then ask at most one or two short follow-up questions about the most important missing detail. Priorities: exact location or nearest landmark; what happened; immediate threats (rising water, fire, gas, downed lines); how many people, including children, elderly or people with medical needs; injuries; access obstacles for responders.
- Adapt to the caller; do not run a fixed checklist and do not re-ask what was already answered. If they describe immediate danger, give brief, widely accepted safety guidance (e.g. move to higher ground, avoid floodwater and downed lines) without medical diagnosis.
- Keep replies under 60 words, calm and plain, suitable for being read aloud.
- Never claim help is on the way, that anyone was dispatched, or that you verified anything. Say the report goes to human coordinators for review.
- Set readyToFile to true only when the critical details are gathered or the caller has nothing more to add; then tell them the report will be filed for human review and they may end the call.`, { transcript });
  try {
    const v = object(result.value);
    if (typeof v.readyToFile !== 'boolean') throw new Error();
    return { reply: text(v.reply, 'reply', 1200), readyToFile: v.readyToFile, ai: result.ai };
  } catch { throw new Error('Bedrock returned an invalid call reply.'); }
}

const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Keep only facts whose quote appears verbatim (ignoring case/punctuation) in the cited caller turn. */
export function traceFacts(value: unknown, transcript: CallTurn[]): { facts: CallFact[]; discarded: number } {
  if (!Array.isArray(value) || value.length > 30) throw new Error('Invalid facts list.');
  const facts: CallFact[] = [];
  let discarded = 0;
  for (const entry of value) {
    const f = object(entry);
    const turn = Number.isSafeInteger(f.turnIndex) ? transcript[f.turnIndex as number] : undefined;
    const quote = typeof f.quote === 'string' ? f.quote.trim() : '';
    const valid = turn?.speaker === 'caller' && quote.length > 0 && normalize(turn.text).includes(normalize(quote))
      && callFactFields.includes(f.field as CallFactField) && (f.certainty === 'stated' || f.certainty === 'uncertain')
      && typeof f.value === 'string' && f.value.trim().length > 0 && f.value.length <= 400;
    if (!valid) { discarded++; continue; }
    facts.push({ field: f.field as CallFactField, value: (f.value as string).trim(), certainty: f.certainty as CallFact['certainty'], turnIndex: f.turnIndex as number, quote: quote.slice(0, 600) });
  }
  return { facts, discarded };
}

export async function buildCallReport(transcript: CallTurn[]): Promise<CallReportResponse> {
  const result = await askBedrock(`${intakeRole}
The call has ended. Produce a structured report for human coordinators. Output exactly:
{"report":{"title":"short title","summary":"factual summary","category":null,"priority":null,"locationLabel":null,"nodeId":null,"people":null,"quantity":null,"missingInfo":[],"clarificationQuestions":[]},
 "facts":[{"field":"location","value":"short normalized fact","certainty":"stated","turnIndex":1,"quote":"exact words from that caller turn"}]}
Rules:
- Use only what the CALLER said. Assistant turns are context, never evidence.
- Every fact must cite turnIndex (the 0-based index of a caller turn in the transcript) and quote copied verbatim from that turn. Facts without exact support will be discarded.
- field is one of ${callFactFields.join(', ')}. certainty is "uncertain" when the caller hedged, guessed or contradicted themselves.
- Never invent addresses, coordinates, injuries, counts, or dispatch status. Unknown values are null and belong in missingInfo.
- category is water, food or medicine only if the caller clearly needs that supply; otherwise null. priority is critical (life threat), high, normal, or null.
- people and quantity are positive integers only when explicitly stated; quantity means standardized supply totes only, otherwise null.
- nodeId may only be one of the supplied knownLocations when the caller explicitly identifies that place; otherwise null.
- Add specific follow-up questions a coordinator should ask to clarificationQuestions.`, { transcript, knownLocations: nodes });
  let extraction, traced;
  try {
    const v = object(result.value);
    extraction = validateExtraction(v.report);
    traced = traceFacts(v.facts, transcript);
  } catch { throw new Error('Bedrock returned an invalid call report.'); }
  const unknowns = requiredFields.filter(field => !traced.facts.some(fact => fact.field === field));
  const gaps = [...extraction.missingInfo];
  if (traced.discarded) gaps.push(`${traced.discarded} AI-extracted detail(s) could not be traced to the caller's words and were discarded.`);
  if (unknowns.length) gaps.push(`Not established in the call: ${unknowns.map(f => f.replace(/_/g, ' ')).join(', ')}.`);
  if (!extraction.category) gaps.push('Confirm a supported supply category.');
  if (!extraction.priority) gaps.push('Confirm urgency.');
  if (!extraction.nodeId) gaps.push('Confirm a location on the scenario network.');
  if (!extraction.people) gaps.push('Confirm the number of people.');
  if (!extraction.quantity) gaps.push('Confirm quantity in standardized supply totes.');
  extraction.missingInfo = [...new Set(gaps)];
  return { extraction, facts: traced.facts, unknowns, ai: result.ai };
}
