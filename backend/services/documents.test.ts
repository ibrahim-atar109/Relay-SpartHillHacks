import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readDocument, uploadUrl } from './documents';
const {send,sign}=vi.hoisted(()=>({send:vi.fn(),sign:vi.fn()}));
vi.mock('@aws-sdk/client-s3',async original=>({...await original<typeof import('@aws-sdk/client-s3')>(),S3Client:class{send=send;}}));
vi.mock('@aws-sdk/s3-presigned-post',()=>({createPresignedPost:sign}));
beforeEach(()=>{send.mockReset();sign.mockReset();vi.stubEnv('UPLOAD_BUCKET','private-bucket');});
function body(value:string){return (async function*(){yield Buffer.from(value);})();}
describe('private text uploads',()=>{
  it('limits signed uploads to a user-specific key, 32KB, text and a two-minute expiry',async()=>{
    sign.mockResolvedValue({url:'https://s3.example',fields:{}});const result=await uploadUrl('user-a');
    expect(result.key).toMatch(/^incoming\/user-a\/.+\.txt$/);
    expect(sign.mock.calls[0][1]).toMatchObject({Expires:120,Bucket:'private-bucket'});
    expect(sign.mock.calls[0][1].Conditions).toContainEqual(['content-length-range',1,32768]);
  });
  it('rejects other users’ keys and validates content size before reading',async()=>{
    await expect(readDocument('user-a','incoming/user-b/doc.txt')).rejects.toThrow('belong');expect(send).not.toHaveBeenCalled();
    send.mockResolvedValue({ContentType:'text/plain',ContentLength:40000,Body:body('Report')});
    await expect(readDocument('user-a','incoming/user-a/1234-abcd.txt')).rejects.toThrow('32KB');
  });
  it('retains original UTF-8 text and rejects binary and overlong content',async()=>{
    send.mockResolvedValue({ContentType:'text/plain',ContentLength:10,Body:body('Report')});
    expect(await readDocument('user-a','incoming/user-a/1234-abcd.txt')).toBe('Report');
    send.mockResolvedValue({ContentType:'text/plain',ContentLength:10,Body:body('a\u0000b')});
    await expect(readDocument('user-a','incoming/user-a/1234-abcd.txt')).rejects.toThrow('binary');
    send.mockResolvedValue({ContentType:'text/plain',ContentLength:8001,Body:body('a'.repeat(8001))});
    await expect(readDocument('user-a','incoming/user-a/1234-abcd.txt')).rejects.toThrow('8,000');
  });
});
