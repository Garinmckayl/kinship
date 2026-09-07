// Shared voice-energy bus: speak() feeds live audio amplitude here,
// every NovaFace on screen bobs with her actual voice. No new assets.
export const voiceMotion = { level: 0 };

let ctx: AudioContext | null = null;
let src: MediaElementAudioSourceNode | null = null;
let analyser: AnalyserNode | null = null;
let raf = 0;
let fakeTimer: ReturnType<typeof setInterval> | null = null;

function loop() {
  if (!analyser) return;
  const buf = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / buf.length); // ~0..0.5 for speech
  const target = Math.min(1, rms * 3);
  voiceMotion.level += (target - voiceMotion.level) * 0.4; // smooth
  raf = requestAnimationFrame(loop);
}

function stopAll() {
  cancelAnimationFrame(raf);
  if (fakeTimer) clearInterval(fakeTimer);
  fakeTimer = null;
  try { src?.disconnect(); } catch {}
  src = null;
  analyser = null;
  voiceMotion.level = 0;
}

// Call with the <audio> that's about to play TTS.
export function attachMotion(audio: HTMLAudioElement) {
  stopAll();
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = ctx ?? new Ctx();
    if (ctx.state === "suspended") void ctx.resume();
    src = ctx.createMediaElementSource(audio);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    analyser.connect(ctx.destination);
    loop();
    const prev = audio.onended;
    audio.onended = (ev) => {
      stopAll();
      if (typeof prev === "function") prev.call(audio, ev);
    };
  } catch {
    fakePulse();
  }
}

// Browser-TTS path has no audio element: approximate with a pulse.
export function fakePulse() {
  stopAll();
  const t0 = Date.now();
  fakeTimer = setInterval(() => {
    voiceMotion.level = 0.45 + 0.35 * Math.sin((Date.now() - t0) / 130);
  }, 50);
}

export function stopMotion() {
  stopAll();
}
