/** Fictional travel network over San José. Edges are schematic, not real roads. */
export const nodes: Record<string, { label: string; coordinates: [number, number] }> = {
  nw: { label: 'North depot', coordinates: [-121.904, 37.352] },
  n: { label: 'Northside shelter', coordinates: [-121.889, 37.352] },
  ne: { label: 'Eastside library', coordinates: [-121.874, 37.352] },
  w: { label: 'Westside senior housing', coordinates: [-121.904, 37.339] },
  c: { label: 'Downtown community center', coordinates: [-121.889, 37.339] },
  e: { label: 'East depot', coordinates: [-121.874, 37.339] },
  sw: { label: 'South depot', coordinates: [-121.904, 37.326] },
  s: { label: 'Southside clinic', coordinates: [-121.889, 37.326] },
  se: { label: 'Riverside apartments', coordinates: [-121.874, 37.326] },
};
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

export function shortestPath(start: string, end: string, blocked: string[]) {
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
      return { minutes: distances[end], edgeIds, coordinates: path.map(id => nodes[id].coordinates) };
    }
    for (const edge of edges) {
      if (blocked.includes(edge.id)) continue;
      const next = edge.from === current ? edge.to : edge.to === current ? edge.from : null;
      if (!next || !remaining.has(next)) continue;
      const distance = distances[current] + edge.minutes;
      if (distance < (distances[next] ?? Infinity)) { distances[next] = distance; previous[next] = { node: current, edge: edge.id }; }
    }
  }
  return null;
}
