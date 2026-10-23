import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MapInstance, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Incident, Team } from '../../../shared/contracts';

const fallbackStyle: StyleSpecification = {
  version: 8,
  sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' } },
  layers: [{ id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-saturation': -0.85, 'raster-opacity': 0.8 } }],
};

export function OperationsMap({ incidents, teams, selectedId, onSelect }: { incidents: Incident[]; teams: Team[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapInstance | null>(null);
  const [error, setError] = useState(false);
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
      if (!item.location.coordinates) continue;
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
    if (selected?.location.coordinates) map.current?.easeTo({ center: selected.location.coordinates, duration: 650 });
  }, [selectedId, incidents]);

  return <section className="map-panel" aria-label="Incident map">
    <div ref={container} className="map-canvas" />
    <div className="map-heading"><span className="live-dot" /> SAN JOSÉ <span className="map-label">Operational area</span></div>
    {error && <div className="map-error" role="status">Map tiles unavailable. Requests remain accessible in the list.</div>}
    <div className="map-legend"><span><i className="legend-dot critical" /> Critical</span><span><i className="legend-dot high" /> High</span><span><i className="legend-dot normal" /> Normal</span><span><i className="legend-dot team" /> Team</span></div>
  </section>;
}
