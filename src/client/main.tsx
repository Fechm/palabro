import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase.js";
import { AuthScreen } from "./components/AuthScreen.js";
import { Study } from "./routes/Study.js";
import { Progress } from "./routes/Progress.js";
import { Words } from "./routes/Words.js";
import { Companion } from "./companion/Companion.js";
import "./index.css";

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      // Una sesión de estudio no se beneficia de refrescos automáticos:
      // volver a la pestaña no debe rehacer la cola a medio camino.
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

type Tab = "study" | "words" | "progress";

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("study");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return null;
  if (!session) return <AuthScreen />;

  return (
    <div className="min-h-full pb-20">
      {tab === "study" ? <Study /> : tab === "words" ? <Words /> : <Progress />}
      {tab === "study" && <Companion />}

      <nav className="fixed inset-x-0 bottom-0 border-t border-black/10 bg-white/90 backdrop-blur dark:border-white/10 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-lg">
          <TabButton active={tab === "study"} onClick={() => setTab("study")}>Estudiar</TabButton>
          <TabButton active={tab === "words"} onClick={() => setTab("words")}>Palabras</TabButton>
          <TabButton active={tab === "progress"} onClick={() => setTab("progress")}>Progreso</TabButton>
        </div>
      </nav>
    </div>
  );
}

function TabButton({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-4 text-sm font-medium transition ${
        active ? "text-indigo-500" : "opacity-50"
      }`}
    >
      {children}
    </button>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
