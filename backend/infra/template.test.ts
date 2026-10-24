import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
const document = parseDocument(readFileSync(new URL('./template.yaml', import.meta.url), 'utf8'));
const template = document.toJS();
describe('SAM persistence deployment contract', () => {
  it('is valid YAML and retains five encrypted, on-demand, recoverable tables', () => {
    expect(document.errors).toEqual([]);
    const tables = Object.values(template.Resources).filter((r: any) => r.Type === 'AWS::DynamoDB::Table') as any[];
    expect(tables).toHaveLength(5);
    for (const table of tables) { expect(table.DeletionPolicy).toBe('Retain'); expect(table.Properties).toMatchObject({ BillingMode:'PAY_PER_REQUEST', SSESpecification:{SSEEnabled:true}, PointInTimeRecoverySpecification:{PointInTimeRecoveryEnabled:true} }); }
  });
  it('protects the proxy API with JWT and enables browser GET/POST without unauthenticated overrides', () => {
    expect(template.Resources.Api.Properties.Auth.DefaultAuthorizer).toBe('Coordinator');
    expect(template.Resources.Api.Properties.CorsConfiguration.AllowMethods).toContain('GET');
    expect(template.Resources.WorkspaceFunction.Properties.Events.Workspace.Properties).toMatchObject({Path:'/{proxy+}',Method:'ANY'});
    expect(template.Resources.WorkspaceFunction.Properties.Events.Workspace.Properties.Auth).toBeUndefined();
    expect(template.Resources.WorkspaceFunction.Properties.Events.Preflight.Properties).toMatchObject({Method:'OPTIONS',Auth:{Authorizer:'NONE'}});
    const events=template.Resources.AiFunction.Properties.Events;
    expect(events.VoiceConversation.Properties.Path).toBe('/ai/voice/converse');expect(events.VoiceConversation.Properties.Auth).toBeUndefined();
    expect(events.SimulationAnalysis.Properties.Path).toBe('/ai/simulation/analyze');expect(events.SimulationPlan.Properties.Path).toBe('/ai/simulation/plan');
  });
  it('keeps uploads private, encrypted, origin-restricted and short-lived', () => {
    const bucket = template.Resources.Uploads.Properties;
    expect(Object.values(bucket.PublicAccessBlockConfiguration).every(Boolean)).toBe(true);
    expect(bucket.BucketEncryption).toBeDefined(); expect(bucket.LifecycleConfiguration.Rules[0].ExpirationInDays).toBe(1);
    expect(bucket.CorsConfiguration.CorsRules[0].AllowedMethods).toEqual(['POST']);
    const policy = template.Resources.WorkspaceFunction.Properties.Policies[0].Statement;
    expect(policy.some((s: any) => s.Action === 'geo-places:Geocode')).toBe(true);
    expect(policy.some((s: any) => s.Action === '*' || s.Resource === '*')).toBe(false);
  });
});
