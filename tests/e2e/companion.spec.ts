import { expect, test, type Page } from "@playwright/test";

const ref = new URL(process.env.VITE_SUPABASE_URL ?? "https://ckjoklnmedodnrrqzqpk.supabase.co").hostname.split(".")[0];

const card = {
  user_card_id: 1, mastery_level: 2, state: 1, reps: 2, is_new: false,
  lexeme: {
    id: 7, lemma: "actually", pos: "adverb", cefr: "A2", ipa: null,
    definition_en: "in fact", definition_es: "en realidad", usage_note: null,
    false_friend: { es_word: "actualmente", warning: "«Actualmente» se dice currently." },
    collocations: [], common_errors: [],
  },
  context: {
    id: 11, text: "I actually like it.", gloss_es: "En realidad me gusta.", level: "A2",
    cloze_start: 2, cloze_end: 10, distractors: ["currently", "really", "already"],
    native_variant: null, audio_url: null,
  },
};

function fakeSession() {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: "e2e-token", refresh_token: "e2e-refresh", token_type: "bearer",
    expires_in: 3600, expires_at: now + 3600,
    user: {
      id: "00000000-0000-0000-0000-000000000001", aud: "authenticated", role: "authenticated",
      email: "e2e@palabro.test", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString(),
    },
  };
}

async function setup(page: Page) {
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: `sb-${ref}-auth-token`, value: JSON.stringify(fakeSession()) },
  );
  await page.route(/supabase\.co/, (r) => r.fulfill({ status: 200, json: {} }));
  await page.route("**/api/session/today", (r) => r.fulfill({ json: { cards: [card], warmup_count: 0, deferred: 0 } }));
  await page.route("**/api/review", (r) =>
    r.fulfill({ json: { due: new Date().toISOString(), mastery_level: 2, leveled_up: false, leveled_down: false } }));
  await page.route("**/api/session/complete", (r) => r.fulfill({ json: { current_streak: 3 } }));
  await page.goto("/");
}

const sprite = (page: Page) => page.getByTestId("companion").locator(".companion-sprite");

test("el perro aparece en la pestaña Estudiar", async ({ page }) => {
  await setup(page);
  await expect(page.getByTestId("companion")).toBeVisible();
  await expect(sprite(page)).toHaveAttribute("data-anim", "idle");
});

test("fallar un hueco muestra el falso amigo y no tapa Continuar", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await setup(page);
  await page.getByRole("button", { name: "currently" }).click();
  await expect(page.getByRole("status")).toContainText("actualmente");
  await expect(sprite(page)).toHaveAttribute("data-anim", "oops");
  await page.screenshot({ path: "test-results/companion-mobile.png" });
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("Sesión completa")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("racha de 3 días");
  await expect(sprite(page)).toHaveAttribute("data-anim", "wave");
});

test("con movimiento reducido el perro no se anima", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setup(page);
  await expect(sprite(page)).toHaveCSS("animation-name", "none");
});
