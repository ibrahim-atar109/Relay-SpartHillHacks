import { useEffect, useRef, useState } from 'react';
import { conversationMessages, type CallTurn } from './conversation';
import { bedrock } from '../../services/ai';
import type { CallMessage, CallResponse } from '../../../shared/contracts';
import { Mic, Square, X, Send } from 'lucide-react';
import './voice.css';
import { isDemo } from '../../services/api';

type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type Recognition = {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

export function VoiceReport({ onClose, onSubmit }: { onClose: () => void; onSubmit: (transcript: string, audioUrl: string, recordings: { text: string; audioUrl: string }[]) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const urls = useRef<string[]>([]);
  const finalText = useRef('');
  const [turns, setTurns] = useState<CallTurn[]>([]);
  const turnsRef = useRef<CallTurn[]>([]);
  const initialRequest = useRef<Promise<CallResponse> | null>(null);
  const [thinking, setThinking] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [callReady, setCallReady] = useState(false);
  const [retryMessages, setRetryMessages] = useState<CallMessage[] | null>(null);
  const [provenance, setProvenance] = useState('');
  const speechTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function speakReply(message: string) {
    if (!window.speechSynthesis || !mounted.current) return;
    recognition.current?.abort();
    stream.current?.getTracks().forEach(track => { track.enabled = false; track.stop(); });
    window.speechSynthesis.cancel(); clearTimeout(speechTimeout.current);
    const utterance = new SpeechSynthesisUtterance(message);
    const finished = () => { clearTimeout(speechTimeout.current); if (mounted.current) setSpeaking(false); };
    utterance.onend = finished; utterance.onerror = finished;
    setSpeaking(true); window.speechSynthesis.speak(utterance);
    speechTimeout.current = setTimeout(() => { window.speechSynthesis.cancel(); finished(); }, 45000);
  }
  async function askOperator(messages: CallMessage[], openingResponse?: Promise<CallResponse>) {
    setThinking(true); setError('');
    try {
      const result = await (openingResponse ?? bedrock.converse(messages));
      if (!mounted.current) return;
      const next = [...turnsRef.current, { speaker: 'dispatcher' as const, text: result.message }];
      turnsRef.current = next; setTurns(next); setRetryMessages(null); setCallReady(true);
      setProvenance(`${result.ai.modelId} · request ${result.ai.requestId}`); speakReply(result.message);
    } catch (err) {
      if (mounted.current) { setRetryMessages(messages); setError(err instanceof Error ? err.message : 'Bedrock conversation failed. No scripted fallback is used.'); }
    } finally { if (mounted.current) setThinking(false); }
  }
  async function sendCaller(reply: CallTurn) {
    const next = [...turnsRef.current, reply];
    if (next.map(t => t.text).join('').length > 5000 || next.length > 23) { setError('This reply would exceed the call length limit. Finish the captured call first; add further details during human review.'); return false; }
    turnsRef.current = next; setTurns(next);
    await askOperator(conversationMessages(next));
    return true;
  }
  const threadEnd = useRef<HTMLDivElement>(null);
  const transferred = useRef(false);
  const retainedUrls = useRef(new Set<string>());
  const mounted = useRef(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [phase, setPhase] = useState<'idle' | 'starting' | 'recording' | 'stopping' | 'ready'>('idle');
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [typedReply, setTypedReply] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const speechWindow = window as SpeechWindow;
  const Speech = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
  const supported = !!Speech && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined' && window.isSecureContext;

  useEffect(() => {
    mounted.current = true;
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
    return () => {
      mounted.current = false;
      clearTimeout(timeout.current);
      clearTimeout(speechTimeout.current);
      recognition.current?.abort();
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stream.current?.getTracks().forEach(track => track.stop());
      window.speechSynthesis?.cancel();
      urls.current.forEach(url => { if (!transferred.current || !retainedUrls.current.has(url)) URL.revokeObjectURL(url); });
    };
  }, []);
  useEffect(() => {
    // Reuse one opening request through React StrictMode's effect replay.
    initialRequest.current ??= bedrock.converse([]);
    let cancelled = false;
    const promise = initialRequest.current;
    Promise.resolve().then(() => { if (!cancelled) void askOperator([], promise); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = setInterval(() => setSeconds(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => { threadEnd.current?.scrollIntoView({ block: 'nearest' }); }, [turns]);
  function finishAudio() {
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach(track => track.stop());
  }
  function stop() {
    setPhase('stopping');
    // Allow final speech results to arrive before enabling submission.
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => { recognition.current?.abort(); finishAudio(); }, 3000);
    recognition.current?.stop();
  }
  async function start() {
    if (!Speech || thinking || speaking || !callReady || retryMessages || active) return;
    setError(''); setPhase('starting'); setTranscript(''); setInterim(''); setSeconds(0);
    window.speechSynthesis?.cancel();
    finalText.current = ''; 
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const capture = new MediaRecorder(media);
      recorder.current = capture;
      const chunks: Blob[] = [];
      capture.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      capture.onerror = () => { setError('Audio recording failed. Please record again.'); recognition.current?.abort(); finishAudio(); };
      capture.onstop = () => {
        if (!mounted.current) return;
        const blob = new Blob(chunks, { type: capture.mimeType });
        const audioUrl = blob.size ? URL.createObjectURL(blob) : undefined;
        if (audioUrl) urls.current.push(audioUrl);
        if (finalText.current.trim()) {
          const reply: CallTurn = { speaker: 'caller', text: finalText.current.trim(), audioUrl };
          void sendCaller(reply);
        }
        setInterim(''); setPhase('ready');
      };
      const speech = new Speech();
      recognition.current = speech;
      speech.continuous = true; speech.interimResults = true; speech.lang = 'en-US';
      speech.onresult = event => {
        if (!mounted.current) return;
        const results = Array.from(event.results);
        finalText.current = results.filter(result => result.isFinal).map(result => result[0].transcript).join(' ').trim();
        setTranscript(finalText.current);
        setInterim(results.filter(result => !result.isFinal).map(result => result[0].transcript).join(' '));
      };
      speech.onerror = event => {
        if (!mounted.current) return;
        const messages: Record<string, string> = {
          'not-allowed': 'Microphone or speech permission was denied. Allow access in your browser and try again.',
          'service-not-allowed': 'This browser’s speech service is unavailable. Try Chrome with speech recognition enabled.',
          network: 'The speech service could not connect. Check your connection and record again.',
          'no-speech': 'No speech was detected. Speak clearly and record again.',
          'audio-capture': 'No working microphone was found. Check your input device.',
        };
        if (event.error !== 'aborted') setError(messages[event.error] || `Transcription stopped (${event.error}). Review what was captured or record again.`);
      };
      speech.onend = () => {
        clearTimeout(timeout.current);
        if (mounted.current) finishAudio();
      };
      capture.start(); speech.start(); setPhase('recording');
      timeout.current = setTimeout(stop, 120000);
    } catch (err) {
      recognition.current?.abort(); finishAudio();
      if (!mounted.current) return;
      setPhase('idle');
      setError(err instanceof DOMException && err.name === 'NotAllowedError' ? 'Microphone access was denied. Allow microphone access in your browser, then try again.' : 'Could not start recording. Check your microphone and use Chrome on localhost or HTTPS.');
    }
  }
  const active = phase === 'starting' || phase === 'recording' || phase === 'stopping' || thinking || speaking;
  const recordings = turns.filter(turn => turn.speaker === 'caller' && turn.audioUrl).map(turn => ({ text: turn.text, audioUrl: turn.audioUrl! }));
  const callerTurns = turns.filter(turn => turn.speaker === 'caller');
  return <dialog ref={dialog} className="voice-dialog call-dialog" aria-labelledby="voice-title" onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}>
    <div className="voice-header"><div><div className="eyebrow">TRAINING LINE · AMAZON BEDROCK</div><h2 id="voice-title">Simulated 911 call</h2></div><button className="voice-close" aria-label="Close voice report" disabled={saving} onClick={onClose}><X size={20} /></button></div>
    <p className="voice-intro">Training exercise. Speak or type naturally; the Bedrock operator asks follow-up questions based on your conversation.</p>
    <div className="call-thread" aria-label="Call conversation">{turns.map((turn,index) => <article key={index} className={`call-turn ${turn.speaker}`}><span>{turn.speaker === 'dispatcher' ? 'Dispatcher · simulated' : 'You · caller transcript'}</span><p>{turn.text}</p>{turn.audioUrl && <audio controls src={turn.audioUrl} aria-label={`Your reply ${Math.ceil(index / 2)}`} />}</article>)}<div ref={threadEnd} /></div>
    <details className="call-guide"><summary>Need help getting started?</summary><p>Describe a fictional location, what happened, who needs help, and what you can see. For example: “I’m at the downtown community center. Six people need water and the street is flooded.” You do not have to follow a script.</p></details>
    <p className="voice-privacy">Training only. No emergency service is contacted. Operator replies are generated by the configured Bedrock model; no scripted fallback is used. Speech recognition may use your browser’s online service. Audio stays in this tab and clears on reset/reload. Finishing extracts a structured report with Bedrock for human review. {isDemo ? 'Reports stay in this tab.' : 'Transcripts are saved to the shared AWS workspace.'} Audio is not uploaded. Use fictional personal details. Each spoken reply is limited to two minutes.</p>
    {!supported && <p className="voice-support-note">Voice transcription is unavailable here. Type your replies below, or use a supported browser such as Chrome on HTTPS.</p>}
    <div className="voice-controls"><button className={`button ${phase === 'recording' ? 'recording-button' : 'primary'}`} disabled={!supported || thinking || speaking || !callReady || retryMessages !== null || phase === 'starting' || phase === 'stopping' || saving} onClick={phase === 'recording' ? stop : () => void start()}>{phase === 'recording' ? <Square size={16} /> : <Mic size={17} />}{phase === 'recording' ? 'Send spoken reply' : phase === 'starting' ? 'Requesting microphone…' : phase === 'stopping' ? 'Transcribing…' : 'Speak your reply'}</button><span role="status">{phase === 'recording' ? `Recording · ${seconds}s` : speaking ? 'Operator speaking · microphone off' : thinking ? 'Waiting for Bedrock · microphone off' : 'Your microphone is off'}</span><button className="button secondary" disabled={active || saving || !window.speechSynthesis || !callReady} onClick={() => { const last = turns.at(-1); if (last?.speaker === 'dispatcher') speakReply(last.text); }}>Read prompt aloud</button></div>
    {(phase === 'recording' || phase === 'starting' || phase === 'stopping') && <div className="voice-transcript" aria-live="polite"><p>{transcript || 'Listening…'} <em>{interim}</em></p></div>}
    {thinking && <p role="status" className="voice-support-note">Connecting to the real Bedrock operator…</p>}
    {provenance && <small className="ai-provenance">{provenance}</small>}
    {speaking && <button type="button" className="button secondary" onClick={() => { window.speechSynthesis.cancel(); clearTimeout(speechTimeout.current); setSpeaking(false); }}>Stop playback</button>}
    {error && <p className="voice-error" role="alert">{error}</p>}
    {retryMessages !== null && <button type="button" className="button secondary" disabled={active || saving} onClick={() => void askOperator(retryMessages)}>Retry Bedrock response</button>}
    {phase === 'ready' && !transcript && <p className="voice-error">No final transcript was captured. Please speak your reply again.</p>}
    <form className="typed-reply" onSubmit={async event => {
      event.preventDefault();
      if (active || saving || !callReady || retryMessages !== null || !typedReply.trim()) return;
      const reply: CallTurn = { speaker: 'caller', text: typedReply.trim() };
      if (await sendCaller(reply)) setTypedReply('');
      setPhase('idle');
    }}><label className="field">Or type your reply<textarea rows={2} maxLength={2000} value={typedReply} onChange={e => setTypedReply(e.target.value)} disabled={active || saving} placeholder="Tell the dispatcher what you can see…" /></label><button type="submit" className="button secondary" disabled={active || saving || !callReady || retryMessages !== null || !typedReply.trim()}><Send size={15} />Send reply</button></form>
    <div className="voice-footer"><p>{callerTurns.length} {callerTurns.length === 1 ? 'reply' : 'replies'} captured · {recordings.length} recorded.<br />Finish at any time; missing details stay unverified.</p><button type="button" className="button primary" disabled={active || saving || !callerTurns.length || !!typedReply.trim()} onClick={async () => {
      setSaving(true); setError('');
      try {
        retainedUrls.current = new Set(recordings.map(r => r.audioUrl));
        transferred.current = true;
        await onSubmit(turns.map(turn => `${turn.speaker === 'dispatcher' ? 'Dispatcher (simulation)' : 'Caller'}: ${turn.text}`).join('\n\n'), recordings[0]?.audioUrl ?? '', recordings);
      }
      catch (err) { transferred.current = false; setError(err instanceof Error ? err.message : 'Could not submit report.'); setSaving(false); }
    }}><Send size={16} />{saving ? 'Adding call…' : 'Finish call & submit'}</button></div>
  </dialog>;
}
