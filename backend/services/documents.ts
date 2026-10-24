import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { InputError } from '../validation';
const client = new S3Client({ maxAttempts: 2 });
const bucket = () => { if (!process.env.UPLOAD_BUCKET) throw new Error('Upload bucket not configured.'); return process.env.UPLOAD_BUCKET; };
const prefix = (subject: string) => `incoming/${encodeURIComponent(subject)}/`;
export async function uploadUrl(subject: string) {
  const key = `${prefix(subject)}${crypto.randomUUID()}.txt`;
  const signed = await createPresignedPost(client, { Bucket: bucket(), Key: key, Expires: 120, Fields: { 'Content-Type': 'text/plain', 'x-amz-server-side-encryption': 'AES256' }, Conditions: [['content-length-range', 1, 32768], ['eq', '$Content-Type', 'text/plain'], ['eq', '$x-amz-server-side-encryption', 'AES256']] });
  return { key, ...signed };
}
export async function readDocument(subject: string, key: string): Promise<string> {
  if (!key.startsWith(prefix(subject)) || !/^incoming\/[^/]+\/[0-9a-f-]+\.txt$/.test(key)) throw new InputError('Upload key does not belong to this user.');
  const response = await client.send(new GetObjectCommand({ Bucket: bucket(), Key: key }), { abortSignal: AbortSignal.timeout(10000) });
  if (response.ContentType !== 'text/plain' || !response.ContentLength || response.ContentLength > 32768 || !response.Body) throw new InputError('Upload a plain UTF-8 .txt document of at most 32KB.');
  const chunks: Uint8Array[] = []; let size = 0;
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    size += chunk.length;
    if (size > 32768) throw new InputError('Text document exceeds 32KB.');
    chunks.push(chunk);
  }
  let value: string;
  try { value = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); }
  catch { throw new InputError('The document must use UTF-8 text.'); }
  if (value.includes('\u0000') || !value.trim() || value.length > 8000) throw new InputError('Text documents must contain 1–8,000 characters without binary content.');
  return value.trim();
}
