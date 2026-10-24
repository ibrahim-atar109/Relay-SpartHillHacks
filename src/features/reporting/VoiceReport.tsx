import { useEffect, useRef, useState } from 'react';
import { Mic, Square, X, Send, Bot, Volume2, VolumeX, RotateCw } from 'lucide-react';
import type { CallReportResponse, CallTurn } from '../../../shared/contracts';
import { aiConfigured, aiSignedIn, bedrock } from '../../services/ai';
import { isDemo } from '../../services/api';

type Turn = CallTurn & { audioUrl?: string };
export type FinishedCall = { turns: CallTurn[]; report: CallReportResponse };
const MAX_TURNS = 38;
export const transcriptText = (turns: CallTurn[]) => turns.map(t => `${t.speaker === 'assistant' ? 'AI intake assistant (simulation)' : 'Caller'}: ${t.text}`).join('\n\n');

type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type Recognition = {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

/**
 * Simulated 911 call with the configured Amazon Bedrock model. Every assistant line comes from the
 * backend `/ai/call-turn` endpoint; there is no scripted fallback. If AI is unavailable the call cannot start.
 */
export function VoiceReport({ onClose, onSubmit }: { onClose: () => void; onSubmit: (transcript: string, audioUrl: string, recordings: { text: string; audioUrl: string }[], call: FinishedCall) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const urls = useRef<string[]>([]);
  const finalText = useRef('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [readAloud, setReadAloud] = useState(true);
  const [readyToFile, setReadyToFile] = useState(false);
  const [failedTurns, setFailedTurns] = useState<Turn[] | null>(null);
  const readAloudRef = useRef(true);
  const turnsRef = useRef<Turn[]>([]);
  const greeted = useRef(false);
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const aiReady = aiConfigured && aiSignedIn();
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
    if (aiConfigured && aiSignedIn() && !greeted.current) { greeted.current = true; void askAssistant([]); }
    return () => {
      mounted.current = false;
      clearTimeout(timeout.current);
      recognition.current?.abort();
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stream.current?.getTracks().forEach(track => track.stop());
      window.speechSynthesis?.cancel();
      urls.current.forEach(url => { if (!transferred.current || !retainedUrls.current.has(url)) URL.revokeObjectURL(url); });
    };
  }, []);
  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = setInterval(() => setSeconds(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => { threadEnd.current?.scrollIntoView({ block: 'nearest' }); }, [turns]);
  /** Read an assistant line aloud. The microphone stays off while speaking so playback is never transcribed. */
  function speak(text: string) {
    if (!canSpeak || !readAloudRef.current) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.onend = utterance.onerror = () => { if (mounted.current) setSpeaking(false); };
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }
  function stopSpeaking() { if (canSpeak) window.speechSynthesis.cancel(); setSpeaking(false); }
  async function askAssistant(history: Turn[]) {
    setThinking(true); setError(''); setFailedTurns(null);
    try {
      const result = await bedrock.callTurn(history.map(({ speaker, text }) => ({ speaker, text })));
      if (!mounted.current) return;
      setConversation([...history, { speaker: 'assistant', text: result.reply }]);
      setReadyToFile(result.readyToFile);
      speak(result.reply);
    } catch (err) {
      if (!mounted.current) return;
      setConversation(history); setFailedTurns(history);
      setError(err instanceof Error ? `The AI assistant did not respond: ${err.message}` : 'The AI assistant did not respond.');
    } finally { if (mounted.current) setThinking(false); }
  }
  function setConversation(next: Turn[]) { turnsRef.current = next; setTurns(next); }
  function addCallerTurn(turn: Turn) {
    const next = [...turnsRef.current, turn];
    setConversation(next);
    void askAssistant(next);
  }
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
    if (!Speech) return;
    setError(''); setPhase('starting'); setTranscript(''); setInterim(''); setSeconds(0);
    stopSpeaking();
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
          addCallerTurn({ speaker: 'caller', text: finalText.current.trim(), audioUrl });
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
  const active = phase === 'starting' || phase === 'recording' || phase === 'stopping';
  const recordings = turns.filter(turn => turn.speaker === 'caller' && turn.audioUrl).map(turn => ({ text: turn.text, audioUrl: turn.audioUrl! }));
  const callerTurns = turns.filter(turn => turn.speaker === 'caller');
  const atLimit = turns.length >= MAX_TURNS;
  const replyLocked = !aiReady || thinking || speaking || saving || atLimit || !turns.length;
  async function finish() {
    setSaving(true); setError(''); stopSpeaking();
    try {
      const plain = turns.map(({ speaker, text }) => ({ speaker, text }));
      const report = await bedrock.callReport(plain);
      retainedUrls.current = new Set(recordings.map(r => r.audioUrl));
      transferred.current = true;
      await onSubmit(transcriptText(plain), recordings[0]?.audioUrl ?? '', recordings, { turns: plain, report });
    } catch (err) { transferred.current = false; setError(err instanceof Error ? `Report not filed: ${err.message}` : 'Could not file the report.'); setSaving(false); }
  }
  return <dialog ref={dialog} className="voice-dialog call-dialog" aria-labelledby="voice-title" onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}>
    <div className="voice-header"><div><div className="eyebrow">TRAINING SIMULATION · AI CALL INTAKE</div><h2 id="voice-title">Simulated 911 call</h2></div><button className="voice-close" aria-label="Close call" disabled={saving} onClick={onClose}><X size={20} /></button></div>
    <p className="ai-disclosure"><Bot size={16} /><span>You are speaking with an <strong>AI assistant powered by Amazon Bedrock</strong> in a training simulation. No emergency service is contacted and no one is dispatched.</span></p>
    {!aiConfigured && <p className="voice-error" role="alert">AI call intake is not connected. Set VITE_AI_API_URL, VITE_AWS_REGION and VITE_COGNITO_CLIENT_ID and deploy the backend to use this feature.</p>}
    {aiConfigured && !aiSignedIn() && <p className="voice-error" role="alert">Sign in under “New report” to start an AI call. The call cannot run without the Bedrock backend.</p>}
    <div className="call-thread" aria-label="Call conversation" aria-live="polite">{turns.map((turn, index) => <article key={index} className={`call-turn ${turn.speaker}`}><span>{turn.speaker === 'assistant' ? 'AI assistant · Bedrock' : turn.audioUrl ? 'Caller · voice transcript' : 'Caller · typed'}</span><p>{turn.text}</p>{turn.audioUrl && <audio controls src={turn.audioUrl} aria-label={`Caller reply ${index}`} />}</article>)}
      {thinking && <article className="call-turn assistant pending"><span>AI assistant · Bedrock</span><p className="typing" aria-label="Assistant is responding"><i /><i /><i /></p></article>}
      <div ref={threadEnd} /></div>
    {failedTurns && <button className="button secondary" onClick={() => void askAssistant(failedTurns)}><RotateCw size={15} />Retry AI reply</button>}
    {readyToFile && !saving && <p className="ready-hint">The assistant has the key details. Finish the call to file the report, or keep talking to add more.</p>}
    {atLimit && <p className="voice-error">This call reached its length limit. Finish the call to file the report.</p>}
    {!supported && aiReady && <p className="voice-support-note">Voice transcription is unavailable in this browser. Type your replies, or use Chrome on HTTPS.</p>}
    <div className="voice-controls">
      <button className={`button ${phase === 'recording' ? 'recording-button' : 'primary'}`} disabled={!supported || replyLocked || phase === 'starting' || phase === 'stopping'} onClick={phase === 'recording' ? stop : () => void start()}>{phase === 'recording' ? <Square size={16} /> : <Mic size={17} />}{phase === 'recording' ? 'Send spoken reply' : phase === 'starting' ? 'Requesting microphone…' : phase === 'stopping' ? 'Transcribing…' : 'Speak'}</button>
      <span role="status">{phase === 'recording' ? `Listening · ${seconds}s` : speaking ? 'Assistant speaking — mic paused' : thinking ? 'Assistant is thinking…' : 'Microphone off'}</span>
      {canSpeak && <button className="button ghost" aria-pressed={readAloud} onClick={() => { const next = !readAloud; readAloudRef.current = next; setReadAloud(next); if (!next) stopSpeaking(); }}>{readAloud ? <Volume2 size={15} /> : <VolumeX size={15} />}{readAloud ? 'Voice on' : 'Voice off'}</button>}
      {speaking && <button className="button ghost" onClick={stopSpeaking}>Skip</button>}
    </div>
    {active && <div className="voice-transcript" aria-live="polite"><p>{transcript || 'Listening…'} <em>{interim}</em></p></div>}
    {error && <p className="voice-error" role="alert">{error}</p>}
    {phase === 'ready' && !transcript && <p className="voice-error">No speech was captured. Please speak again.</p>}
    <form className="typed-reply" onSubmit={event => {
      event.preventDefault();
      if (active || replyLocked || !typedReply.trim()) return;
      addCallerTurn({ speaker: 'caller', text: typedReply.trim().slice(0, 2000) });
      setTypedReply(''); setError(''); setPhase('idle');
    }}><label className="field">Or type a reply<textarea rows={2} maxLength={2000} value={typedReply} onChange={e => setTypedReply(e.target.value)} disabled={active || !aiReady || saving} placeholder="Describe where you are and what is happening…" /></label><button type="submit" className="button secondary" disabled={active || replyLocked || !typedReply.trim()}><Send size={15} />Send</button></form>
    <p className="voice-privacy">Use fictional details. Speech recognition may use your browser’s online service; audio stays in this tab. {isDemo ? 'The finished report joins the review queue in this tab.' : 'The transcript is saved to the shared workspace; audio is not uploaded.'}</p>
    <div className="voice-footer"><p>{callerTurns.length} caller {callerTurns.length === 1 ? 'reply' : 'replies'}. Missing details are marked unknown for human review.</p><button type="button" className="button primary" disabled={active || saving || thinking || !callerTurns.length || !!typedReply.trim() || !aiReady} onClick={() => void finish()}><Send size={16} />{saving ? 'Filing report with Bedrock…' : 'End call & file report'}</button></div>
  </dialog>;
}
