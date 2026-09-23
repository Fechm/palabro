import { useState } from "react";
import { supabase } from "../lib/supabase.js";

/**
 * Magic link: sin contraseñas que recordar ni recuperar. Para un grupo
 * cerrado de diez personas es lo más simple que funciona bien.
 */
export function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setSending(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 text-4xl font-bold">Palabro</h1>
      <p className="mb-8 opacity-60">Aprende a usar el inglés, no solo a reconocerlo.</p>

      {sent ? (
        <div className="rounded-2xl border-l-4 border-emerald-500 bg-emerald-50 p-4 dark:bg-emerald-500/10">
          <p className="font-medium">Revisa tu correo</p>
          <p className="mt-1 text-sm opacity-70">
            Te mandamos un enlace a {email}. Ábrelo desde este mismo dispositivo.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            className="w-full rounded-xl border border-black/10 bg-white p-4 outline-none focus:border-indigo-400 dark:border-white/10 dark:bg-white/5"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={sending}
            className="w-full rounded-xl bg-indigo-500 py-4 font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-40"
          >
            {sending ? "Enviando…" : "Entrar con enlace mágico"}
          </button>
        </form>
      )}
    </div>
  );
}
