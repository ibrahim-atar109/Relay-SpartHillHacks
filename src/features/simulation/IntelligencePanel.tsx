import type { Board } from '../../../shared/contracts';
import type { SignalCluster } from './engine';
export function IntelligencePanel({ board, clusters, activeCluster, onCluster, onSelect }: { board: Board; clusters: SignalCluster[]; activeCluster: string | null; onCluster: (id: string | null) => void; onSelect: (id: string) => void }) {
  const selected = clusters.find(item => item.key === activeCluster) || clusters[0];
  const unlocated = board.incidents.filter(item => !item.nodeId && item.status !== 'delivered');
  return <aside className="intelligence"><div className="panel-title"><h2>Operational intelligence</h2><span>SIMULATED</span></div><p className="intel-description">Location grouping + declared urgency. No model inference or live news connected.</p>
    <div className="intel-summary"><strong>{board.incidents.length.toLocaleString()}</strong><span>reports → <b>{clusters.length} area groups</b><br />Related signals, not proven duplicate incidents.</span></div>
    {!!unlocated.length && <button className="unknown-signal" onClick={() => onSelect(unlocated[0].id)}>{unlocated.length} unlocated reports need review →</button>}
    <h3>Priority areas <span>Critical count first</span></h3>
    <div className="cluster-list">{clusters.map(group => <button key={group.key} className={selected?.key === group.key ? 'selected' : ''} onClick={() => onCluster(activeCluster === group.key ? null : group.key)}><i className={group.critical ? 'signal-red' : 'signal-amber'} /><span><strong>{group.label}</strong><small>{group.count.toLocaleString()} reports · {group.critical} critical signals</small></span><b>→</b></button>)}</div>
    {selected && <div className="cluster-evidence"><h3>Evidence samples</h3><p>{selected.label} · {selected.categories.join(', ')}</p>{selected.samples.map(id => { const item = board.incidents.find(report => report.id === id)!; return <button key={id} onClick={() => onSelect(id)}><span>{item.origin === 'participant' ? 'Participant' : 'Synthetic'} · {id}</span><p>“{item.originalReport.slice(0,145)}{item.originalReport.length > 145 ? '…' : ''}”</p></button>; })}</div>}
    <div className="uncertainty"><strong>What this does not establish</strong><p>Caller urgency is unverified. Multiple calls may describe one event. Group size is not a count of people. News bulletins do not automatically close roads.</p></div>
  </aside>;
}
