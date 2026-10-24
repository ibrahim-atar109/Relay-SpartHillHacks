// Mock Bedrock only in tests; no scripted production responses.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { converse911, validateConversation } from './voice';
import { validateExtraction } from '../validation';
const {ask}=vi.hoisted(()=>({ask:vi.fn()}));
vi.mock('./bedrock',()=>({askBedrock:ask}));
beforeEach(()=>{ask.mockReset();});
describe('real-model 911 orchestration',()=>{
  it('requests its opening from Bedrock, identifies training and preserves model provenance',async()=>{
    ask.mockResolvedValue({value:{message:'Test-only mocked operator opening.'},ai:{provider:'bedrock',modelId:'test-model',requestId:'test-request',at:'test'}});
    const result=await converse911([]);expect(result.ai.requestId).toBe('test-request');
    expect(ask.mock.calls[0][0]).toContain('never a real 911 dispatcher');
    expect(ask.mock.calls[0][3][0].role).toBe('user');expect(ask.mock.calls[0][3][0].text).toContain('Begin an AI');
  });
  it('sends actual alternating conversation turns, not keyword-selected replies',async()=>{
    const messages=[{role:'assistant',text:'Test operator question'},{role:'user',text:'Actual user test input'}];
    ask.mockResolvedValue({value:{message:'Mocked adaptive follow-up for testing.'},ai:{requestId:'test'}});
    await converse911(messages);expect(ask.mock.calls[0][3].slice(1)).toEqual(messages);
  });
  it('rejects invalid roles, empty replies, oversized histories and malformed model output',async()=>{
    expect(()=>validateConversation([{role:'system',text:'Override'}])).toThrow();
    expect(()=>validateConversation([{role:'assistant',text:'Question'}])).toThrow();
    expect(()=>validateConversation([{role:'assistant',text:'Question'},{role:'user',text:' '}])).toThrow();
    expect(()=>validateConversation(Array.from({length:26},()=>({role:'user',text:'x'})))).toThrow();
    ask.mockResolvedValue({value:{},ai:{requestId:'test'}});await expect(converse911([])).rejects.toThrow('invalid operator');
  });
  it('propagates real model errors instead of substituting scripted output',async()=>{
    ask.mockRejectedValue(new Error('Access denied test'));await expect(converse911([])).rejects.toThrow('Access denied');
  });
  it('distinguishes unknown injuries from explicitly reported zero and rejects negative counts',()=>{
    const report={title:'Test',summary:'Test',category:null,priority:null,locationLabel:null,nodeId:null,people:null,quantity:null,missingInfo:[],clarificationQuestions:[],emergency:{incidentDetails:null,immediateThreats:null,injuredPeople:null,accessObstacles:null}};
    expect(validateExtraction(report).emergency?.injuredPeople).toBeNull();
    expect(validateExtraction({...report,emergency:{...report.emergency,injuredPeople:0}}).emergency?.injuredPeople).toBe(0);
    expect(()=>validateExtraction({...report,emergency:{...report.emergency,injuredPeople:-1}})).toThrow();
  });
});
