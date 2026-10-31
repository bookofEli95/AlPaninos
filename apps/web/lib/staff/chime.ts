"use client";

// The new-order sound: a bright two-note chime made in the browser (no
// sound file to load). Browsers only allow sound after someone taps the
// page, so the screen asks for one tap to start ("Start taking orders").
let context: AudioContext | null = null;

export function unlockSound(): boolean {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;
    context ??= new Ctor();
    if (context.state === "suspended") void context.resume();
    return true;
  } catch {
    return false;
  }
}

export function playChime() {
  if (!context) return;
  const now = context.currentTime;
  [
    { freq: 880, at: 0 },
    { freq: 1318.5, at: 0.18 },
    { freq: 880, at: 0.6 },
    { freq: 1318.5, at: 0.78 },
  ].forEach(({ freq, at }) => {
    const osc = context!.createOscillator();
    const gain = context!.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + at);
    gain.gain.exponentialRampToValueAtTime(0.5, now + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.35);
    osc.connect(gain).connect(context!.destination);
    osc.start(now + at);
    osc.stop(now + at + 0.4);
  });
}
