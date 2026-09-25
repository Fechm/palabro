import { useState } from "react";
import type { StudyCard } from "../../shared/schemas.js";
import { SpeakButton } from "./SpeakButton.js";

export function LexemeHeader({ card }: { card: StudyCard }) {
  const { lexeme } = card;
  const [showIpa, setShowIpa] = useState(false);
  return (
    <div className="mb-4">
      <div className="flex items-center gap-3">
        <h2 className="text-3xl font-bold">{lexeme.lemma}</h2>
        <SpeakButton text={lexeme.lemma} audioUrl={lexeme.audio_url} label={`Escuchar «${lexeme.lemma}»`} />
        <span className="ml-auto rounded-full bg-black/5 px-2 py-0.5 text-xs dark:bg-white/10">
          {lexeme.cefr}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-3 text-sm">
        <span className="opacity-60">{lexeme.pos}</span>
        {lexeme.ipa && (
          <button
            type="button"
            onClick={() => setShowIpa((v) => !v)}
            aria-expanded={showIpa}
            className="text-indigo-500 hover:underline"
          >
            {showIpa ? lexeme.ipa : "Ver fonética"}
          </button>
        )}
      </div>
    </div>
  );
}
