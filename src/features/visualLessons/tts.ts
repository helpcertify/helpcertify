// Narration playback abstraction. The player depends only on this
// interface, so a real TTS provider (per-scene MP3s from Google Cloud TTS
// or similar, played through an <audio> element) can be dropped in later
// without touching ScenePlayer - it just implements NarrationSpeaker.

export interface SpeakOptions {
  voice?: string;
  rate?: number;
  onEnd?: () => void;
}

export interface NarrationSpeaker {
  supported: boolean;
  speak(text: string, opts?: SpeakOptions): void;
  cancel(): void;
  listVoices(): { name: string; lang: string }[];
}

// Browser Web Speech API implementation. Free, offline, no CSP impact.
// Voice list depends on the OS/browser and can populate asynchronously.
class WebSpeechSpeaker implements NarrationSpeaker {
  get supported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  speak(text: string, opts: SpeakOptions = {}): void {
    if (!this.supported || !text.trim()) {
      opts.onEnd?.();
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = opts.rate ?? 1;
    if (opts.voice) {
      const match = window.speechSynthesis.getVoices().find((v) => v.name === opts.voice);
      if (match) u.voice = match;
    }
    if (opts.onEnd) {
      u.onend = () => opts.onEnd?.();
      u.onerror = () => opts.onEnd?.();
    }
    window.speechSynthesis.speak(u);
  }

  cancel(): void {
    if (this.supported) window.speechSynthesis.cancel();
  }

  listVoices(): { name: string; lang: string }[] {
    if (!this.supported) return [];
    return window.speechSynthesis.getVoices().map((v) => ({ name: v.name, lang: v.lang }));
  }
}

export const webSpeechSpeaker: NarrationSpeaker = new WebSpeechSpeaker();
