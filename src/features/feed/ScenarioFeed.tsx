import { Pause, Play, SkipForward, Newspaper, PhoneCall, Shield } from 'lucide-react';
import type { FeedEvent } from '../../data/katrinaFeed';
import { channelLabels } from '../../data/katrinaFeed';

const channelIcons = { news: Newspaper, '911': PhoneCall, police: Shield } as const;

/** Simulated incoming information during the Katrina scenario: news, 911 calls and police reports. */
export function ScenarioFeed({ played, total, playing, onToggle, onStep }: { played: FeedEvent[]; total: number; playing: boolean; onToggle: () => void; onStep: () => void }) {
  const done = played.length >= total;
  return <section className="feed-panel" aria-label="Incoming scenario feed">
    <div className="feed-header">
      <div><div className="section-kicker"><span className={`live-dot ${playing && !done ? 'pulsing' : ''}`} />Incoming information</div><h2>{played.at(-1)?.time ?? 'Aug 29, 2005 · before landfall'}</h2></div>
      <div className="feed-controls">
        <button className="button ghost" onClick={onToggle} disabled={done} aria-label={playing ? 'Pause feed' : 'Play feed'}>{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? 'Pause' : 'Play'}</button>
        <button className="button ghost" onClick={onStep} disabled={done} aria-label="Next update"><SkipForward size={15} />Next</button>
      </div>
    </div>
    <p className="feed-disclaimer">Simulated feed modeled on Hurricane Katrina in St. Bernard Parish (Aug 29–30, 2005). Training content, not archival quotes or live data. {played.length}/{total} updates.</p>
    <ol className="feed-list" aria-live="polite">
      {[...played].reverse().map(event => {
        const Icon = channelIcons[event.channel];
        return <li key={event.id} className={`feed-item channel-${event.channel}`}>
          <span className="feed-icon"><Icon size={14} /></span>
          <div><div className="feed-meta"><strong>{channelLabels[event.channel]}</strong><time>{event.time}</time>{event.report && <span className="feed-flag">New report → review</span>}{event.blocksEdgeId && <span className="feed-flag danger">Road closed</span>}</div><p>{event.headline}</p></div>
        </li>;
      })}
      {!played.length && <li className="feed-empty">Waiting for the first update…</li>}
    </ol>
  </section>;
}
