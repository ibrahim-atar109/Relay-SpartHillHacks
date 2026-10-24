// All model/routing responses below are test-only mocks.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeSimulation,planSimulation } from './simulation';
const {ask,prepare,geometry}=vi.hoisted(()=>({ask:vi.fn(),prepare:vi.fn(),geometry:vi.fn()}));
vi.mock('./bedrock',()=>({askBedrock:ask}));
vi.mock('./roads',()=>({prepareRoadPlan:prepare,attachRoadGeometry:geometry}));
beforeEach(()=>{vi.clearAllMocks();});
describe('Katrina training intelligence',()=>{
  it('analyzes only canonical explicitly fictional bulletins through Bedrock',async()=>{
    ask.mockResolvedValue({value:{kind:'road_blockage',priority:'high',summary:'Mock test analysis',missingInfo:['Extent unknown']},ai:{requestId:'test'}});
    const result=await analyzeSimulation('K-01');expect(result.kind).toBe('road_blockage');expect(ask.mock.calls[0][1].text).toContain('FICTIONAL TRAINING');
    await expect(analyzeSimulation('injected-report')).rejects.toThrow('Unknown');
  });
  it('fails closed on invalid model classes and denied inference',async()=>{
    ask.mockResolvedValue({value:{kind:'invented',priority:'high',summary:'test',missingInfo:[]},ai:{}});
    await expect(analyzeSimulation('K-01')).rejects.toThrow('invalid');ask.mockRejectedValue(new Error('Denied'));await expect(analyzeSimulation('K-01')).rejects.toThrow('Denied');
  });
  it('uses human-confirmed priorities, hazard boxes and artificial assessment units, not invented victim facts',async()=>{
    prepare.mockResolvedValue({id:'test-plan',routes:[],unservedIds:[]});geometry.mockImplementation(async(_board,plan)=>plan);
    ask.mockResolvedValue({value:{explanation:'Test-only commentary',reviewNotes:['Review staging']},ai:{requestId:'test'}});
    const result=await planSimulation([{id:'K-01',kind:'road_blockage',priority:'high'},{id:'K-02',kind:'fire',priority:'critical'}]);
    const board=prepare.mock.calls[0][0];expect(board.avoidAreas).toHaveLength(2);expect(board.incidents).toHaveLength(1);expect(board.incidents[0].priority).toBe('critical');
    expect(ask.mock.calls[0][1].incidents).toBeUndefined();expect(ask.mock.calls[0][0]).toContain('NOT victims');expect(result.plan.ai?.requestId).toBe('test');
  });
  it('rejects duplicate, unknown and unconfirmed priorities before routing',async()=>{
    await expect(planSimulation([{id:'K-02',kind:'fire',priority:null}])).rejects.toThrow();
    await expect(planSimulation([{id:'K-02',kind:'fire',priority:'high'},{id:'K-02',kind:'fire',priority:'high'}])).rejects.toThrow('Duplicate');
    expect(prepare).not.toHaveBeenCalled();
  });
});
