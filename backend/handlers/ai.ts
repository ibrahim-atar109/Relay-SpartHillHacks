import { askBedrock } from '../services/bedrock';
import { InputError, object, text, validateBoard, validateExtraction } from '../validation';
import { nodes } from '../../src/data/network';
import { generatePlan } from '../../src/features/operations/planner';

type Event = { body?: string; isBase64Encoded?: boolean; rawPath?: string; requestContext?: { http?: { method?: string }; authorizer?: { jwt?: { claims?: Record<string, string> } } } };
const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });

export async function handler(event: Event) {
  // API Gateway verifies the JWT. Also reject direct invocations without authenticated context.
  if (!event.requestContext?.authorizer?.jwt?.claims?.sub) return reply(401, { error: 'Sign in before using Bedrock.' });
  try {
    if (event.requestContext.http?.method !== 'POST') return reply(405, { error: 'Use POST.' });
    if (!event.body || event.body.length > 100000) throw new InputError('Request is empty or too large.');
    let parsed: unknown;
    try { parsed = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body); }
    catch { throw new InputError('Request must contain valid JSON.'); }
    const body = object(parsed);
    if (event.rawPath === '/ai/extract') {
      const report = text(body.report, 'report');
      const followUp = body.followUp === undefined ? undefined : text(body.followUp, 'follow-up', 4000);
      const result = await askBedrock(`Extract a relief supply report for human review. Output this exact JSON shape:
{"title":"short title","summary":"factual summary","category":null,"priority":null,"locationLabel":null,"nodeId":null,"people":null,"quantity":null,"missingInfo":[],"clarificationQuestions":[]}.
category must be water, food, medicine, or null. priority must be critical, high, normal, or null. Counts must be positive integers or null.
quantity means standardized supply totes ONLY: do not convert bottles, meals, doses or people into totes. Unknown counts are null.
Do not infer coordinates. nodeId may only be one of the supplied fictional network nodes when the report explicitly identifies that place; otherwise null.
Preserve ambiguity and conflicts, especially conflicting follow-up statements. Add missing/conflicting facts to missingInfo and specific questions to clarificationQuestions. Unsupported categories remain null. This is extraction, not medical advice or dispatch.`, { report, followUp, knownLocations: nodes });
      let extraction;
      try { extraction = validateExtraction(result.value); }
      catch { throw new Error('Bedrock returned invalid report fields.'); }
      const gaps = [...extraction.missingInfo];
      if (!extraction.category) gaps.push('Confirm a supported supply category.');
      if (!extraction.priority) gaps.push('Confirm urgency.');
      if (!extraction.nodeId) gaps.push('Confirm a location on the scenario network.');
      if (!extraction.people) gaps.push('Confirm the number of people.');
      if (!extraction.quantity) gaps.push('Confirm quantity in standardized supply totes.');
      extraction.missingInfo = [...new Set(gaps)];
      return reply(200, { extraction, ai: result.ai });
    }
    if (event.rawPath === '/ai/plan') {
      const board = validateBoard(body.board);
      let plan;
      try { plan = generatePlan(board); }
      catch (error) { throw new InputError(error instanceof Error ? error.message : 'Cannot generate routes.'); }
      const result = await askBedrock(`Explain the computed relief plan for its coordinator. Output {"explanation":"brief explanation","reviewNotes":["review item"]}.
The solver first maximizes served urgency weight, then minimizes weighted arrival time (critical 8, high 3, normal 1). It checks capacity, capability and closures.
Use only the supplied computed plan and inputs. Never invent routes, travel times, causes of non-service, weather, road conditions, or deliveries. Do not change assignments.
Identify unserved IDs, tradeoffs, and matters needing human review. State that the network is fictional, supplies are assumed preloaded, stops take 2 minutes and return trips are excluded.`, { plan, incidents: board.incidents.filter(i => i.status === 'verified'), teams: board.teams, blockedEdgeIds: board.blockedEdgeIds });
      let explanation: string; let reviewNotes: string[];
      try {
        const v = object(result.value);
        explanation = text(v.explanation, 'explanation', 4000);
        if (!Array.isArray(v.reviewNotes) || v.reviewNotes.length > 10) throw new Error();
        reviewNotes = v.reviewNotes.map(n => text(n, 'review note', 600));
      } catch { throw new Error('Bedrock returned invalid plan commentary.'); }
      return reply(200, { plan: { ...plan, ai: result.ai, aiExplanation: explanation, reviewNotes } });
    }
    return reply(404, { error: 'Unknown AI endpoint.' });
  } catch (error) {
    if (error instanceof InputError) return reply(400, { error: error.message });
    const name = error instanceof Error ? error.name : 'UnknownError';
    // Do not log report bodies or model output.
    const metadata = error && typeof error === 'object' && '$metadata' in error ? error.$metadata as { requestId?: string } : undefined;
    console.error('AI request failed', { name, requestId: metadata?.requestId });
    if (name === 'ThrottlingException') return reply(429, { error: 'Bedrock is busy. Wait a moment and try again.' });
    return reply(502, { error: 'Bedrock request failed. Check the backend model, Region, permissions and CloudWatch logs.' });
  }
}
