import { useState } from "react";
import type { StudyCard, Verdict } from "../../shared/schemas.js";
import { api } from "../lib/api.js";
import { LexemeHeader } from "./LexemeHeader.js";

/**
 * Nivel 4 — Producción libre. El diferenciador de la app.
 *
 * El usuario escribe SU propia frase y un modelo la evalúa. La nota no la
 * pone él: sale del veredicto, que distingue gramatical de natural.
 */
export function ProductionCard({
  card, onGrade,
}: { card: StudyCard; onGrade: (g: number) => void }) {
  const [sentence, setSentence] = useState("");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSending(true);
    setError(null);
    try {
      const v = await api.post<Verdict>("/api/produce", {
        lexeme_id: card.lexeme.id,
        sentence: sentence.trim(),
      });
      setVerdict(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo evaluar.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card-in">
      <LexemeHeader card={card} />

      <p className="mb-2 text-sm opacity-70">{card.lexeme.definition_es}</p>

      {card.lexeme.collocations.length > 0 && (
        <p className="mb-4 text-xs opacity-50">
          Combinaciones habituales: {card.lexeme.collocations.join(" · ")}
        </p>
      )}

      {!verdict ? (
        <>
          <label className="mb-2 block font-medium">
            Escribe una frase usando «{card.lexeme.lemma}»
          </label>
          <textarea
            value={sentence}
            onChange={(e) => setSentence(e.target.value)}
            rows={3}
            maxLength={300}
            autoFocus
            placeholder="Tu frase en inglés…"
            className="w-full resize-none rounded-2xl border border-black/10 bg-white p-4 text-lg outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-white/5"
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <button
            onClick={submit}
            disabled={sentence.trim().length < 3 || sending}
            className="mt-3 w-full rounded-xl bg-indigo-500 py-4 font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-40"
          >
            {sending ? "Revisando…" : "Revisar mi frase"}
          </button>
        </>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl bg-white p-4 dark:bg-white/5">
            <p className="text-xs uppercase tracking-wide opacity-50">Tu frase</p>
            <p className="text-lg">{sentence}</p>
          </div>

          {/* Dos señales separadas: correcto no es lo mismo que natural. */}
          <div className="flex gap-2 text-sm">
            <Badge ok={verdict.grammatical} label="Gramática" />
            <Badge ok={verdict.natural} label="Suena nativo" />
          </div>

          {verdict.native_version.trim().toLowerCase() !== sentence.trim().toLowerCase() && (
            <div className="rounded-2xl border-l-4 border-emerald-500 bg-emerald-50 p-4 dark:bg-emerald-500/10">
              <p className="text-xs uppercase tracking-wide opacity-60">Como lo diría un nativo</p>
              <p className="text-lg">{verdict.native_version}</p>
            </div>
          )}

          <p className="rounded-2xl bg-black/5 p-4 dark:bg-white/5">{verdict.feedback_es}</p>

          {verdict.error_tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {verdict.error_tags.map((t) => (
                <span key={t} className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                  {t}
                </span>
              ))}
            </div>
          )}

          <button
            onClick={() => onGrade(verdict.grade)}
            className="w-full rounded-xl bg-indigo-500 py-4 font-semibold text-white transition hover:bg-indigo-600"
          >
            Continuar
          </button>
        </div>
      )}
    </div>
  );
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`flex-1 rounded-xl px-3 py-2 text-center ${
        ok
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
          : "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
      }`}
    >
      {ok ? "✓" : "○"} {label}
    </span>
  );
}
