import roadData from './roadGeometry.json';
/** Bounded demo corridors with cached, directional OSRM/OSM street geometry. */
export const nodes: Record<string, { label: string; coordinates: [number, number] }> = {
  nw: { label: 'North depot', coordinates: [-80.160, 26.137] },
  n: { label: 'Northside shelter', coordinates: [-80.143, 26.137] },
  ne: { label: 'Eastside library', coordinates: [-80.126, 26.137] },
  w: { label: 'Westside senior housing', coordinates: [-80.160, 26.122] },
  c: { label: 'Downtown community center', coordinates: [-80.143, 26.122] },
  e: { label: 'East depot', coordinates: [-80.126, 26.122] },
  sw: { label: 'South depot', coordinates: [-80.160, 26.107] },
  s: { label: 'Southside clinic', coordinates: [-80.143, 26.107] },
  se: { label: 'Riverside apartments', coordinates: [-80.126, 26.107] },
};
for (const [id, point] of Object.entries(roadData.nodes)) nodes[id].coordinates = point as [number, number];
export const edges = [
  { id: 'nw-n', from: 'nw', to: 'n', minutes: 4 },
  { id: 'n-ne', from: 'n', to: 'ne', minutes: 5 },
  { id: 'w-c', from: 'w', to: 'c', minutes: 4 },
  { id: 'c-e', from: 'c', to: 'e', minutes: 3 },
  { id: 'sw-s', from: 'sw', to: 's', minutes: 5 },
  { id: 's-se', from: 's', to: 'se', minutes: 4 },
  { id: 'nw-w', from: 'nw', to: 'w', minutes: 4 },
  { id: 'w-sw', from: 'w', to: 'sw', minutes: 5 },
  { id: 'n-c', from: 'n', to: 'c', minutes: 3 },
  { id: 'c-s', from: 'c', to: 's', minutes: 4 },
  { id: 'ne-e', from: 'ne', to: 'e', minutes: 4 },
  { id: 'e-se', from: 'e', to: 'se', minutes: 6 },
];

export function roadCoordinates(from: string, to: string): [number, number][] {
  return (roadData.routes as Record<string, number[][]>)[`${from}-${to}`] as [number, number][];
}
function segments(points: [number, number][]) {
  return points.slice(1).map((point,i) => [points[i].join(','), point.join(',')].sort().join('|'));
}
const segmentCache = new Map<string, string[]>();
for (const edge of edges) for (const [from,to] of [[edge.from,edge.to],[edge.to,edge.from]]) segmentCache.set(`${from}-${to}`, segments(roadCoordinates(from,to)));
export function closureCoordinates(from: string, to: string) {
  const coordinates = roadCoordinates(from,to);
  const middle = Math.floor(coordinates.length / 2);
  return coordinates.slice(Math.max(0, middle - 2), middle + 3);
}
export function closedSegments(blocked: string[]) {
  return new Set(blocked.flatMap(id => { const edge = edges.find(item => item.id === id); return edge ? [...segments(closureCoordinates(edge.from,edge.to)), ...segments(closureCoordinates(edge.to,edge.from))] : []; }));
}
export function corridorBlocked(from: string, to: string, blocked: Set<string>) {
  return segmentCache.get(`${from}-${to}`)!.some(segment => blocked.has(segment));
}

export function shortestPath(start: string, end: string, blocked: string[]) {
  const closed = closedSegments(blocked);
  const distances: Record<string, number> = { [start]: 0 };
  const previous: Record<string, { node: string; edge: string }> = {};
  const remaining = new Set(Object.keys(nodes));
  while (remaining.size) {
    const current = [...remaining].sort((a, b) => (distances[a] ?? Infinity) - (distances[b] ?? Infinity))[0];
    if (!Number.isFinite(distances[current])) return null;
    remaining.delete(current);
    if (current === end) {
      const path = [end]; const edgeIds: string[] = [];
      let cursor = end;
      while (cursor !== start) { const step = previous[cursor]; edgeIds.unshift(step.edge); path.unshift(step.node); cursor = step.node; }
      return { minutes: distances[end], edgeIds, coordinates: path.length === 1 ? [nodes[start].coordinates] : path.slice(1).flatMap((id,i) => roadCoordinates(path[i],id).slice(i === 0 ? 0 : 1)) };
    }
    for (const edge of edges) {
      if (blocked.includes(edge.id)) continue;
      const next = edge.from === current ? edge.to : edge.to === current ? edge.from : null;
      if (!next || !remaining.has(next) || corridorBlocked(current, next, closed)) continue;
      const distance = distances[current] + edge.minutes;
      if (distance < (distances[next] ?? Infinity)) { distances[next] = distance; previous[next] = { node: current, edge: edge.id }; }
    }
  }
  return null;
}
