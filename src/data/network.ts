/**
 * Scenario network over St. Bernard Parish, Louisiana (Arabi · Chalmette · Meraux · Violet).
 * Points are approximate staging/shelter points chosen for the Hurricane Katrina training scenario;
 * facility names are illustrative, and edges are schematic connections, not surveyed roads.
 */
export const nodes: Record<string, { label: string; coordinates: [number, number] }> = {
  nw: { label: 'Arabi staging depot · Judge Perez Dr', coordinates: [-89.9965, 29.9583] },
  n: { label: 'Chalmette · Paris Rd shelter point', coordinates: [-89.9585, 29.9515] },
  ne: { label: 'Meraux · Mehle Ave shelter point', coordinates: [-89.9235, 29.9395] },
  w: { label: 'Arabi · St. Claude Ave senior housing', coordinates: [-89.9985, 29.9518] },
  c: { label: 'Chalmette · Parish Government Complex', coordinates: [-89.9632, 29.9427] },
  e: { label: 'Meraux staging depot · Judge Perez Dr', coordinates: [-89.9282, 29.9325] },
  sw: { label: 'Arabi riverfront depot · St. Bernard Hwy', coordinates: [-89.9905, 29.9452] },
  s: { label: 'Chalmette riverfront clinic point · St. Bernard Hwy', coordinates: [-89.9545, 29.9362] },
  se: { label: 'Violet · St. Bernard Hwy apartments', coordinates: [-89.8975, 29.8955] },
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
  { id: 'e-se', from: 'e', to: 'se', minutes: 9 },
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
