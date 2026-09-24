const synth = (): SpeechSynthesis | null =>
  typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;

function englishVoice(): SpeechSynthesisVoice | undefined {
  const voices = synth()?.getVoices() ?? [];
  return (
    voices.find((v) => v.lang === "en-US" && v.localService) ??
    voices.find((v) => v.lang === "en-US") ??
    voices.find((v) => v.lang.startsWith("en"))
  );
}

export function canSpeak(audioUrl?: string | null): boolean {
  return Boolean(audioUrl) || synth() !== null;
}

export function speak(text: string, audioUrl?: string | null): void {
  if (audioUrl) {
    void new Audio(audioUrl).play();
    return;
  }
  const s = synth();
  if (!s) return;
  s.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.9;
  const voice = englishVoice();
  if (voice) utterance.voice = voice;
  s.speak(utterance);
}
