import { useEffect, useState } from 'react';
import { Radio } from 'lucide-react';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Brief logo animation on every load. Skipped instantly for reduced-motion users; click to dismiss. */
export function BootSplash() {
  const [phase, setPhase] = useState<'show' | 'leave' | 'gone'>(reducedMotion() ? 'gone' : 'show');
  useEffect(() => {
    if (phase === 'gone') return;
    const leave = setTimeout(() => setPhase('leave'), 1900);
    const gone = setTimeout(() => setPhase('gone'), 2500);
    return () => { clearTimeout(leave); clearTimeout(gone); };
  }, []);
  if (phase === 'gone') return null;
  return <div className={`boot-splash ${phase === 'leave' ? 'leaving' : ''}`} role="status" aria-label="Loading Relay" onClick={() => setPhase('gone')}>
    <div className="boot-logo">
      <span className="boot-ring r1" /><span className="boot-ring r2" /><span className="boot-ring r3" />
      <span className="boot-mark"><Radio size={38} /></span>
    </div>
    <div className="boot-word">relay</div>
    <div className="boot-tag">Disaster response coordination</div>
    <div className="boot-bar"><i /></div>
  </div>;
}
