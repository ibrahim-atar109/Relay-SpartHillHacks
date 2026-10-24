import type { Board, ExtractionResponse, RoutePlan } from '../../shared/contracts';
import { nodes } from '../../src/data/network';
import { askBedrock } from './bedrock';
import { attachRoadGeometry, prepareRoadPlan } from './roads';
import { object, text, validateExtraction } from '../validation';

export async function extractReport(report: string, followUp?: string, live = false): Promise<ExtractionResponse> {
  const result = await askBedrock(`Extract a relief supply report for human review. Output this exact JSON shape:
{"title":"short title","summary":"factual summary","category":null,"priority":null,"locationLabel":null,"nodeId":null,"people":null,"quantity":null,"missingInfo":[],"clarificationQuestions":[]}.
category must be water, food, medicine, or null. priority must be critical, high, normal, or null. Counts must be positive integers or null.
quantity means standardized supply totes ONLY: do not convert bottles, meals, doses or people into totes. Unknown counts are null.
Do not infer coordinates. ${live ? 'Preserve the full reported address, city and region in locationLabel when provided. nodeId must be null; a coordinator will geocode and confirm the address.' : 'nodeId may only be one of the supplied fictional network nodes when the report explicitly identifies that place; otherwise null.'}
Preserve ambiguity and conflicts, especially conflicting follow-up statements. Add missing/conflicting facts to missingInfo and specific questions to clarificationQuestions. Unsupported categories remain null. This is extraction, not medical advice or dispatch.`, { report, followUp, ...(!live ? { knownLocations: nodes } : {}) });
  let extraction;
  try { extraction = validateExtraction(result.value); } catch { throw new Error('Bedrock returned invalid report fields.'); }
  if (live) extraction.nodeId = null;
  const gaps = [...extraction.missingInfo];
  if (!extraction.category) gaps.push('Confirm a supported supply category.');
  if (!extraction.priority) gaps.push('Confirm urgency.');
  if (live || !extraction.nodeId) gaps.push(live ? 'Look up and confirm the real address and access point.' : 'Confirm a location on the scenario network.');
  if (!extraction.people) gaps.push('Confirm the number of people.');
  if (!extraction.quantity) gaps.push('Confirm quantity in standardized supply totes.');
  extraction.missingInfo = [...new Set(gaps)];
  return { extraction, ai: result.ai };
}
export async function reviewRoadPlan(board: Board): Promise<RoutePlan> {
  const signal = AbortSignal.timeout(25000);
  const proposed = await prepareRoadPlan(board, signal);
  const [plan, result] = await Promise.all([attachRoadGeometry(board, proposed, signal), askBedrock(`Explain the computed relief plan for its coordinator. Output {"explanation":"brief explanation","reviewNotes":["review item"]}.
The solver checks capacity, capability and road reachability. For up to 8 requests it maximizes served urgency weight then minimizes weighted arrival time (critical 8, high 3, normal 1). Larger plans use a bounded greedy urgency-first heuristic, not a guarantee of optimality.
Use only the supplied computed plan and inputs. Never invent routes, travel times, causes of non-service, weather, road conditions, or deliveries. Do not change assignments.
Identify unserved IDs, tradeoffs, and matters needing human review. Travel times come from Amazon Location's driving matrix with traffic disabled; road geometry is loaded separately. Reported addresses and access points require human confirmation. Demo facility names are fictional. Fictional network closures are not applied to real roads. Supplies are assumed preloaded, stops take 2 minutes and return trips are excluded.`, { plan: proposed, incidents: board.incidents.filter(i => i.status === 'verified').map(({ id, category, priority, quantity, people, location }) => ({ id, category, priority, quantity, people, location })), teams: board.teams }, signal)]);
  try {
    const v = object(result.value);
    const explanation = text(v.explanation, 'explanation', 4000);
    if (!Array.isArray(v.reviewNotes) || v.reviewNotes.length > 10) throw new Error();
    const reviewNotes = v.reviewNotes.map(n => text(n, 'review note', 600));
    return { ...plan, ai: result.ai, aiExplanation: explanation, reviewNotes };
  } catch { throw new Error('Bedrock returned invalid plan commentary.'); }
}
