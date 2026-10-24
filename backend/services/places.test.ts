import { describe, expect, it, vi } from 'vitest';
import { geocode } from './places';
const {send} = vi.hoisted(()=>({send:vi.fn()}));
vi.mock('@aws-sdk/client-geo-places',async original=>({...await original<typeof import('@aws-sdk/client-geo-places')>(),GeoPlacesClient:class{send=send;}}));
describe('real-address geocoding',()=>{
  it('requests storage rights and returns choices without automatically selecting one',async()=>{
    send.mockResolvedValue({ResultItems:[{PlaceId:'address-a',Position:[-121.9,37.3],Address:{Label:'123 Main Street, San José, CA'}},{PlaceId:'address-b',Position:[-121.8,37.4],Address:{Label:'123 Main Street, another city'}}]});
    const results=await geocode('123 Main Street'); expect(results).toHaveLength(2);
    expect(send.mock.calls[0][0].input.IntendedUse).toBe('Storage'); expect(results[0].coordinates).toEqual([-121.9,37.3]);
  });
});
