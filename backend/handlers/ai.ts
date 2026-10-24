import { InputError, object, text, validateBoard } from '../validation';
import { RoadRoutingError } from '../services/roads';
import { extractReport, reviewRoadPlan } from '../services/intelligence';
export type Event = { body?: string; isBase64Encoded?: boolean; rawPath?: string; requestContext?: { http?: { method?: string }; authorizer?: { jwt?: { claims?: Record<string, string> } } } };
export const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });
export function parseBody(event: Event): Record<string, unknown> {
  if (!event.body || event.body.length > 100000) throw new InputError('Request is empty or too large.');
  try { return object(JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body)); }
  catch { throw new InputError('Request must contain a valid JSON object.'); }
}
export function failure(error: unknown) {
  if (error instanceof InputError) return reply(400, { error: error.message });
  if (error instanceof RoadRoutingError) {
    console.error('Road routing failed', { name: error.cause instanceof Error ? error.cause.name : error.name });
    return reply(502, { error: error.message });
  }
  const name = error instanceof Error ? error.name : 'UnknownError';
  const metadata = error && typeof error === 'object' && '$metadata' in error ? error.$metadata as { requestId?: string } : undefined;
  console.error('AI request failed', {
    name, requestId: metadata?.requestId,
    ...(name === 'AccessDeniedException' && error instanceof Error ? { message: error.message.slice(0, 4000), modelId: process.env.BEDROCK_MODEL_ID, region: process.env.AWS_REGION } : {}),
  });
  if (name === 'ThrottlingException') return reply(429, { error: 'AWS is busy. Wait a moment and try again.' });
  return reply(502, { error: 'AWS request failed. Check the backend model, Region, permissions and CloudWatch logs.' });
}
export async function handler(event: Event) {
  if (!event.requestContext?.authorizer?.jwt?.claims?.sub) return reply(401, { error: 'Sign in before using Bedrock.' });
  try {
    if (event.requestContext.http?.method !== 'POST') return reply(405, { error: 'Use POST.' });
    const body = parseBody(event);
    if (event.rawPath === '/ai/extract') return reply(200, await extractReport(text(body.report, 'report'), body.followUp === undefined ? undefined : text(body.followUp, 'follow-up', 4000)));
    if (event.rawPath === '/ai/plan') return reply(200, { plan: await reviewRoadPlan(validateBoard(body.board)) });
    return reply(404, { error: 'Unknown AI endpoint.' });
  } catch (error) { return failure(error); }
}
