import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MapInstance, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Incident, Team, RoutePlan } from '../../../shared/contracts';
import type { SignalCluster } from '../simulation/engine';
import { edges, nodes, roadCoordinates, closureCoordinates } from '../../data/network';
import type * as GeoJSON from 'geojson';

const fallbackStyle: StyleSpecification = {
  version: 8,
  sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' } },
  layers: [{ id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-saturation': -0.85, 'raster-opacity': 0.8 } }],
};

export function OperationsMap({ incidents, teams, plan, blockedEdgeIds, selectedId, onSelect, clusters, onCluster }: { clusters: SignalCluster[]; onCluster: (id: string) => void; incidents: Incident[]; teams: Team[]; plan: RoutePlan | null; blockedEdgeIds: string[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapInstance | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    try {
      const instance = new maplibregl.Map({ container: container.current, style: import.meta.env.VITE_MAP_STYLE_URL || fallbackStyle, center: [-80.143, 26.122], zoom: 12.5, attributionControl: { compact: true } });
      map.current = instance;
      instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
      instance.on('error', () => setError(true));
      const observer = new ResizeObserver(() => instance.resize());
      observer.observe(container.current);
      return () => { observer.disconnect(); instance.remove(); map.current = null; };
    } catch { setError(true); }
  }, []);

  useEffect(() => {
    if (!map.current) return;
    const markers: maplibregl.Marker[] = [];
    for (const item of incidents) {
      if (item.status === 'needs_review' || !item.location.coordinates) continue;
      const button = document.createElement('button');
      button.className = `map-pin ${item.priority} ${item.status === 'delivered' ? 'completed' : ''} ${selectedId === item.id ? 'selected' : ''}`;
      button.textContent = item.category === 'water' ? 'W' : item.category === 'food' ? 'F' : 'M';
      button.setAttribute('aria-label', `${item.title}, ${item.priority} priority`);
      button.onclick = () => onSelect(item.id);
      markers.push(new maplibregl.Marker({ element: button }).setLngLat(item.location.coordinates).addTo(map.current));
    }
    for (const team of teams) {
      const el = document.createElement('div'); el.className = 'team-pin'; el.textContent = team.name.split(' ')[1][0]; el.title = `${team.name} · ${team.status}`;
      markers.push(new maplibregl.Marker({ element: el }).setLngLat(team.coordinates).addTo(map.current));
    }
    return () => markers.forEach(marker => marker.remove());
  }, [incidents, teams, selectedId, onSelect]);

  useEffect(() => {
    const selected = incidents.find(item => item.id === selectedId);
    if (selected?.status !== 'needs_review' && selected?.location.coordinates) map.current?.easeTo({ center: selected.location.coordinates, duration: 650 });
  }, [selectedId, incidents]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    function draw() {
      if (!instance) return;
      const features: GeoJSON.Feature<GeoJSON.LineString>[] = edges.flatMap(edge => [[edge.from,edge.to], [edge.to,edge.from]].map(([from,to]) => ({
        type: 'Feature' as const, properties: { color: blockedEdgeIds.includes(edge.id) ? '#ce5045' : '#477d71', kind: blockedEdgeIds.includes(edge.id) ? 'closed' : 'network' },
        geometry: { type: 'LineString' as const, coordinates: blockedEdgeIds.includes(edge.id) ? closureCoordinates(from,to) : roadCoordinates(from,to) },
      })));
      plan?.routes.forEach((route, index) => {
        if (route.coordinates.length > 1) features.push({ type: 'Feature', properties: { color: ['#336e91', '#8d649b', '#bc8038'][index % 3], kind: 'route' }, geometry: { type: 'LineString', coordinates: route.coordinates } });
      });
      const data: GeoJSON.FeatureCollection<GeoJSON.LineString> = { type: 'FeatureCollection', features };
      const source = instance.getSource('demo-network') as maplibregl.GeoJSONSource | undefined;
      if (source) source.setData(data);
      else {
        instance.addSource('demo-network', { type: 'geojson', data });
        instance.addLayer({ id: 'network-links', type: 'line', source: 'demo-network', filter: ['==', ['get', 'kind'], 'network'], paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [3, 2], 'line-opacity': 0.24 } });
        instance.addLayer({ id: 'closed-roads', type: 'line', source: 'demo-network', filter: ['==', ['get', 'kind'], 'closed'], paint: { 'line-color': '#ce5045', 'line-width': 5, 'line-dasharray': [2,1] } });
        instance.addLayer({ id: 'planned-routes', type: 'line', source: 'demo-network', filter: ['==', ['get', 'kind'], 'route'], paint: { 'line-color': ['get', 'color'], 'line-width': 5, 'line-opacity': 0.85 } });
      }
    }
    if (instance.isStyleLoaded()) draw();
    instance.on('load', draw);
    if (plan?.routes.length) {
      const bounds = new maplibregl.LngLatBounds();
      plan.routes.forEach(route => route.coordinates.forEach(point => bounds.extend(point)));
      if (!bounds.isEmpty()) instance.fitBounds(bounds, { padding: 85, maxZoom: 13.5, duration: 650 });
    }
    return () => { instance.off('load', draw); };
  }, [plan, blockedEdgeIds]);

  useEffect(() => {
    if (!map.current) return;
    const markers = clusters.map(group => {
      const button = document.createElement('button');
      button.className = `hotspot ${group.critical ? 'hotspot-critical' : ''}`;
      button.textContent = group.count.toLocaleString();
      const size = Math.min(88, 34 + Math.log2(group.count + 1) * 4);
      button.style.width = `${size}px`; button.style.height = `${size}px`;
      button.setAttribute('aria-label', `${group.label}: ${group.count} reports, ${group.critical} critical, unverified area group`);
      button.title = `${group.label} · ${group.critical} critical signals · not a verified incident`;
      button.onclick = () => onCluster(group.key);
      return new maplibregl.Marker({ element: button }).setLngLat(nodes[group.nodeId].coordinates).addTo(map.current!);
    });
    return () => markers.forEach(marker => marker.remove());
  }, [clusters, onCluster]);

  return <section className="map-panel" aria-label="Incident map">
    <div ref={container} className="map-canvas" />
    <div className="map-heading"><span className="live-dot" /> FORT LAUDERDALE, FL <span className="map-label">Operational area</span></div>
    <div className="map-note">{incidents.length ? `${incidents.length} verified requests · ${clusters.length} unverified area groups` : 'Area circles show unverified reports. Review before dispatch.'}<br />Red: closed street corridors · Colored lines: cached road routes</div>
    {error && <div className="map-error" role="status">Map tiles unavailable. Requests remain accessible in the list.</div>}
    <div className="map-legend"><span><i className="legend-dot critical" /> Critical</span><span><i className="legend-dot high" /> High</span><span>Circles = report volume, not affected population</span><span><i className="legend-dot team" /> Team</span></div>
  </section>;
}
