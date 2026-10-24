import { useEffect, useState } from 'react';
import { Radio } from 'lucide-react';
export function BootScreen() {
  const [visible,setVisible]=useState(true);
  useEffect(()=>{const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;const timer=setTimeout(()=>setVisible(false),reduced?50:1400);return()=>clearTimeout(timer);},[]);
  if(!visible)return null;
  return <div className="boot-screen" role="status" aria-label="Opening Relay workspace"><div className="boot-logo"><Radio size={42}/></div><strong>relay</strong><span>Community response. Connected.</span><div className="boot-line"/></div>;
}
