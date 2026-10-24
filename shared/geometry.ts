/** Inclusive line/box intersection, including segments whose endpoints are outside. */
export function crossesBox(a: [number,number], b: [number,number], box: [number,number,number,number]): boolean {
  let low=0,high=1;
  const delta=[b[0]-a[0],b[1]-a[1]];
  for(let axis=0;axis<2;axis++) {
    if(Math.abs(delta[axis])<1e-12){if(a[axis]<box[axis]||a[axis]>box[axis+2])return false;continue;}
    let enter=(box[axis]-a[axis])/delta[axis],exit=(box[axis+2]-a[axis])/delta[axis];
    if(enter>exit)[enter,exit]=[exit,enter];low=Math.max(low,enter);high=Math.min(high,exit);if(low>high)return false;
  }
  return true;
}
