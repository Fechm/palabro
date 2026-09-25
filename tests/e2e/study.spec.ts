import { expect, test, type Page } from "@playwright/test";

const ref = new URL(process.env.VITE_SUPABASE_URL ?? "https://ckjoklnmedodnrrqzqpk.supabase.co").hostname.split(".")[0];
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

function card(id: number, lemma: string, text: string, gloss: string) {
  return {
    user_card_id: id, mastery_level: 1, state: 0, reps: 0, is_new: true,
    next: { 1: MIN, 2: 6 * MIN, 3: 10 * MIN, 4: 4 * DAY },
    lexeme: {
      id, lemma, pos: "verb", cefr: "A1", ipa: "/noʊ/", definition_en: `to ${lemma} something`,
      definition_es: `significado de ${lemma}`, usage_note: null, false_friend: null,
      collocations: [], common_errors: [],
    },
    context: {
      id: id * 10, text, gloss_es: gloss, level: "A1", cloze_start: 0, cloze_end: 1,
      distractors: [], native_variant: null, audio_url: null,
    },
  };
}

const cards = [
  card(1, "know", "I don't know.", "No sé."),
  card(2, "just", "Just a minute.", "Un minuto."),
];

async function setup(page: Page) {
  const now = Math.floor(Date.now() / 1000);
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: `sb-${ref}-auth-token`,
    value: JSON.stringify({
      access_token: "t", refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: now + 3600,
      user: { id: "u", aud: "authenticated", role: "authenticated", email: "e@x", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
    }),
  });
  await page.route(/supabase\.co/, (r) => r.fulfill({ json: {} }));
  await page.route("**/api/session/today", (r) => r.fulfill({ json: { cards, warmup_count: 0, deferred: 0 } }));
  await page.route("**/api/review", (r) =>
    r.fulfill({ json: { due: new Date().toISOString(), mastery_level: 1, leveled_up: false, leveled_down: false } }));
  await page.route("**/api/progress*", (r) => r.fulfill({
    json: { words_seen: 1, words_usable: 0, coverage_pct: 0, due_now: 1, current_streak: 0, longest_streak: 0, freezes_left: 2, top_errors: [] },
  }));
  await page.goto("/");
}

test("la tarjeta explica qué hacer y revela el significado en español", async ({ page }) => {
  await setup(page);
  await expect(page.getByText("¿Qué significa")).toBeVisible();
  await page.getByRole("button", { name: "Mostrar significado" }).click();
  await expect(page.getByText("significado de know")).toBeVisible();
  await expect(page.getByText("No sé.")).toBeVisible();
  await expect(page.getByText("to know something")).toBeHidden();
  await page.getByText("Ver en inglés").click();
  await expect(page.getByText("to know something")).toBeVisible();
});

test("los botones muestran cuándo vuelve la palabra", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "Mostrar significado" }).click();
  for (const text of ["en 1 min", "en 6 min", "en 10 min", "en ~4 días"]) {
    await expect(page.getByText(text, { exact: true })).toBeVisible();
  }
});

test("la fonética está oculta hasta tocar «Ver fonética»", async ({ page }) => {
  await setup(page);
  await expect(page.getByText("/noʊ/")).toBeHidden();
  await page.getByRole("button", { name: "Ver fonética" }).click();
  await expect(page.getByText("/noʊ/")).toBeVisible();
});

test("ir a Progreso y volver mantiene la tarjeta donde ibas", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "Mostrar significado" }).click();
  await page.getByRole("button", { name: /Bien/ }).click();
  await expect(page.getByRole("heading", { name: "just" })).toBeVisible();
  await page.getByRole("button", { name: "Progreso" }).click();
  await page.getByRole("button", { name: "Estudiar" }).click();
  await expect(page.getByRole("heading", { name: "just" })).toBeVisible();
  await expect(page.getByText("2 / 2")).toBeVisible();
});

test("Progreso permite cambiar las palabras nuevas por día", async ({ page }) => {
  let saved: unknown = null;
  await page.route("**/api/settings", (r) => {
    if (r.request().method() === "PUT") {
      saved = r.request().postDataJSON();
      return r.fulfill({ json: saved });
    }
    return r.fulfill({ json: { new_per_day: 20 } });
  });
  await setup(page);
  await page.getByRole("button", { name: "Progreso" }).click();
  await expect(page.getByRole("radio", { name: "20" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "10" }).click();
  await expect(page.getByRole("radio", { name: "10" })).toHaveAttribute("aria-checked", "true");
  expect(saved).toEqual({ new_per_day: 10 });
});
