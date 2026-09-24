import { useState, type FormEvent, type ReactNode } from "react";
import { SECURITY_QUESTIONS, passwordSchema, registerSchema } from "../../shared/auth.js";
import { authMessage, login, recoveryQuestion, register, resetPassword } from "../lib/auth.js";
import { PasswordInput, inputClass } from "./PasswordInput.js";

type View = "login" | "register" | "recover";

const buttonClass =
  "w-full rounded-xl bg-indigo-500 py-4 font-semibold text-white transition hover:bg-indigo-600 disabled:opacity-40";
const linkClass = "text-sm text-indigo-500 hover:underline";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{label}</span>
        {children}
      </label>
      {hint && <p className="mt-1 text-xs opacity-60">{hint}</p>}
    </div>
  );
}

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(authMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

function LoginForm({ go }: { go: (v: View) => void }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, run } = useSubmit();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(() => login(identifier, password));
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Usuario o correo">
        <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required
          autoComplete="username" autoCapitalize="none" spellCheck={false} className={inputClass} />
      </Field>
      <Field label="Contraseña">
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required
          autoComplete="current-password" />
      </Field>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className={buttonClass}>{busy ? "Entrando…" : "Entrar"}</button>
      <div className="flex justify-between">
        <button type="button" onClick={() => go("recover")} className={linkClass}>¿Olvidaste tu contraseña?</button>
        <button type="button" onClick={() => go("register")} className={linkClass}>Crear cuenta</button>
      </div>
    </form>
  );
}

function RegisterForm({ go }: { go: (v: View) => void }) {
  const [form, setForm] = useState({
    invite: "", username: "", email: "", password: "", confirm: "", question_id: 1, answer: "",
  });
  const { busy, error, setError, run } = useSubmit();
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: key === "question_id" ? Number(e.target.value) : e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) return setError("Las contraseñas no coinciden.");
    const parsed = registerSchema.safeParse(form);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Revisa los datos del formulario.");
    void run(() => register(parsed.data));
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Código de invitación" hint="Te lo comparte quien administra el grupo.">
        <input value={form.invite} onChange={set("invite")} required autoCapitalize="none" className={inputClass} />
      </Field>
      <Field label="Nombre de usuario" hint="3 a 20 caracteres: letras, números, _ o .">
        <input value={form.username} onChange={set("username")} required autoComplete="username"
          autoCapitalize="none" spellCheck={false} className={inputClass} />
      </Field>
      <Field label="Correo">
        <input type="email" value={form.email} onChange={set("email")} required autoComplete="email" className={inputClass} />
      </Field>
      <Field label="Contraseña" hint="Mínimo 8 caracteres.">
        <PasswordInput value={form.password} onChange={set("password")} required autoComplete="new-password" />
      </Field>
      <Field label="Repite la contraseña">
        <PasswordInput value={form.confirm} onChange={set("confirm")} required autoComplete="new-password" />
      </Field>
      <Field label="Pregunta de seguridad" hint="La usarás si olvidas tu contraseña.">
        <select value={form.question_id} onChange={set("question_id")} className={inputClass}>
          {SECURITY_QUESTIONS.map((q) => <option key={q.id} value={q.id}>{q.text}</option>)}
        </select>
      </Field>
      <Field label="Respuesta" hint="Elige algo que no aparezca en tus redes sociales.">
        <input value={form.answer} onChange={set("answer")} required autoComplete="off" className={inputClass} />
      </Field>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className={buttonClass}>{busy ? "Creando…" : "Crear cuenta"}</button>
      <button type="button" onClick={() => go("login")} className={linkClass}>Ya tengo cuenta</button>
    </form>
  );
}

function RecoverForm({ go }: { go: (v: View) => void }) {
  const [identifier, setIdentifier] = useState("");
  const [questionId, setQuestionId] = useState<number | null>(null);
  const [answer, setAnswer] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const { busy, error, setError, run } = useSubmit();
  const question = SECURITY_QUESTIONS.find((q) => q.id === questionId);

  const askQuestion = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => setQuestionId((await recoveryQuestion(identifier)).question_id));
  };

  const reset = (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError("Las contraseñas no coinciden.");
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Contraseña inválida.");
    void run(() => resetPassword(identifier, answer, password));
  };

  return question ? (
    <form onSubmit={reset} className="space-y-4">
      <p className="rounded-xl bg-black/5 p-4 font-medium dark:bg-white/5">{question.text}</p>
      <Field label="Respuesta">
        <input value={answer} onChange={(e) => setAnswer(e.target.value)} required autoComplete="off" className={inputClass} />
      </Field>
      <Field label="Contraseña nueva" hint="Mínimo 8 caracteres.">
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
      </Field>
      <Field label="Repite la contraseña nueva">
        <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
      </Field>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className={buttonClass}>{busy ? "Guardando…" : "Cambiar contraseña"}</button>
      <button type="button" onClick={() => go("login")} className={linkClass}>Volver</button>
    </form>
  ) : (
    <form onSubmit={askQuestion} className="space-y-4">
      <Field label="Usuario o correo">
        <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required
          autoCapitalize="none" spellCheck={false} className={inputClass} />
      </Field>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy} className={buttonClass}>{busy ? "Buscando…" : "Continuar"}</button>
      <button type="button" onClick={() => go("login")} className={linkClass}>Volver</button>
    </form>
  );
}

const TITLES: Record<View, string> = {
  login: "Entrar",
  register: "Crear cuenta",
  recover: "Recuperar contraseña",
};

export function AuthScreen() {
  const [view, setView] = useState<View>("login");
  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="mb-2">
        <picture>
          <source srcSet="/logo-dark.png" media="(prefers-color-scheme: dark)" />
          <img src="/logo-light.png" alt="Palabro" width={720} height={172} className="h-14 w-auto" />
        </picture>
      </h1>
      <p className="mb-6 opacity-60">Aprende a usar el inglés, no solo a reconocerlo.</p>
      <h2 className="mb-4 text-xl font-semibold">{TITLES[view]}</h2>
      {view === "login" && <LoginForm go={setView} />}
      {view === "register" && <RegisterForm go={setView} />}
      {view === "recover" && <RecoverForm go={setView} />}
    </div>
  );
}
