import {describe,it,expect} from 'vitest';
import {crossesBox} from './geometry';
describe('exercise exclusion geometry',()=>{
  it('detects crossings with both endpoints outside the box',()=>{expect(crossesBox([-2,0],[2,0],[-1,-1,1,1])).toBe(true);});
  it('detects endpoints inside and boundary touches',()=>{expect(crossesBox([0,0],[2,2],[-1,-1,1,1])).toBe(true);expect(crossesBox([-2,1],[2,1],[-1,-1,1,1])).toBe(true);});
  it('accepts disjoint parallel and diagonal segments',()=>{expect(crossesBox([-2,2],[2,2],[-1,-1,1,1])).toBe(false);expect(crossesBox([2,2],[3,3],[-1,-1,1,1])).toBe(false);});
});
