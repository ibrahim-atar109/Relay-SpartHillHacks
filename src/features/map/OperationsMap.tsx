import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MapInstance, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Incident, Team, RoutePlan } from '../../../shared/contracts';
import { roadFeatures } from './routeGeometry';
import { isDemo } from '../../services/api';

const fallbackStyle: StyleSpecification = {
  version: 8,
  sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' } },
  layers: [{ id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-saturation': -0.85, 'raster-opacity': 0.8 } }],
};

export function OperationsMap({ incidents, teams, plan, selectedId, onSelect }: { incidents: Incident[]; teams: Team[]; plan: RoutePlan | null; blockedEdgeIds: string[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapInstance | null>(null);
  const [error, setError] = useState(false);
  const locationSignature = JSON.stringify([...teams.map(t => t.coordinates), ...incidents.filter(i => i.status !== 'needs_review' && i.location.coordinates).map(i => i.location.coordinates)]);
  useEffect(() => {
    if (!container.current) return;
    try {
      const instance = new maplibregl.Map({ container: container.current, style: import.meta.env.VITE_MAP_STYLE_URL || fallbackStyle, center: [-121.889, 37.339], zoom: 13.1, attributionControl: { compact: true } });
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
      const el = document.createElement('div'); el.className = 'team-pin'; el.textContent = (team.name.trim().split(/\s+/).at(-1)?.charAt(0) || 'T'); el.title = `${team.name} · ${team.status}`;
      markers.push(new maplibregl.Marker({ element: el }).setLngLat(team.coordinates).addTo(map.current));
    }
    return () => markers.forEach(marker => marker.remove());
  }, [incidents, teams, selectedId, onSelect]);

  useEffect(() => {
    if (isDemo || !map.current) return;
    const points = JSON.parse(locationSignature) as [number, number][];
    if (!points.length) return;
    const bounds = new maplibregl.LngLatBounds(); points.forEach(point => bounds.extend(point));
    map.current.fitBounds(bounds, { padding: 70, maxZoom: 14, duration: 650 });
  }, [locationSignature]);

  useEffect(() => {
    const selected = incidents.find(item => item.id === selectedId);
    if (selected?.status !== 'needs_review' && selected?.location.coordinates) map.current?.easeTo({ center: selected.location.coordinates, duration: 650 });
  }, [selectedId, incidents]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    function draw() {
      if (!instance) return;
      const data = roadFeatures(plan);
      const source = instance.getSource('road-routes') as maplibregl.GeoJSONSource | undefined;
      if (source) source.setData(data);
      else {
        instance.addSource('road-routes', { type: 'geojson', data });
        instance.addLayer({ id: 'planned-routes', type: 'line', source: 'road-routes', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 5, 'line-opacity': 0.85 } });
      }
    }
    if (instance.isStyleLoaded()) draw();
    instance.on('load', draw);
    if (plan?.routing?.provider === 'amazon-location' && plan.routes.length) {
      const bounds = new maplibregl.LngLatBounds();
      plan.routes.forEach(route => route.coordinates.forEach(point => bounds.extend(point)));
      if (!bounds.isEmpty()) instance.fitBounds(bounds, { padding: 85, maxZoom: 14.5, duration: 650 });
    }
    return () => { instance.off('load', draw); };
  }, [plan]);

  return <section className="map-panel" aria-label="Incident map">
    <div ref={container} className="map-canvas" />
    <div className="map-heading"><span className="live-dot" /> {isDemo ? 'SAN JOSÉ' : 'RESPONSE AREA'} <span className="map-label">Operational area</span></div>
    <div className="map-note">{incidents.length ? `${incidents.length} verified requests · ${isDemo ? 'Sample locations' : 'Confirmed addresses'}` : 'No verified reports yet. Review collected data to add map pins.'}<br />{plan?.routing ? <>Driving routes via Amazon Location · Road access points<br />Routing © <a href="https://www.here.com/legal/terms" target="_blank" rel="noreferrer">HERE</a> · Traffic not included</> : 'Generate road routes to display the driving paths.'}</div>
    {error && <div className="map-error" role="status">Map tiles unavailable. Requests remain accessible in the list.</div>}
    <div className="map-legend"><span><i className="legend-dot critical" /> Critical</span><span><i className="legend-dot high" /> High</span><span><i className="legend-dot normal" /> Normal</span><span><i className="legend-dot team" /> Team</span></div>
  </section>;
}
