import type { StudyCard } from "../../shared/schemas.js";

export function LexemeHeader({ card }: { card: StudyCard }) {
  const { lexeme } = card;
  return (
    <div className="mb-4">
      <div className="flex items-baseline gap-3">
        <h2 className="text-3xl font-bold">{lexeme.lemma}</h2>
        {lexeme.ipa && <span className="text-sm opacity-50">{lexeme.ipa}</span>}
        <span className="ml-auto rounded-full bg-black/5 px-2 py-0.5 text-xs dark:bg-white/10">
          {lexeme.cefr}
        </span>
      </div>
      <p className="text-sm opacity-60">{lexeme.pos}</p>
    </div>
  );
}
