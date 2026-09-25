import { expect, test, type Page } from "@playwright/test";
import { clozeCard, played, setup } from "./helpers.js";

const four = [
  clozeCard(1, "know", "saber"),
  clozeCard(2, "think", "pensar"),
  clozeCard(3, "want", "querer"),
  clozeCard(4, "need", "necesitar"),
];

const bubble = (page: Page) => page.getByRole("status");
const sprite = (page: Page) => page.getByTestId("companion").locator(".companion-sprite");

async function answerCloze(page: Page, lemma: string) {
  await page.getByRole("button", { name: lemma, exact: true }).click();
  await page.getByRole("button", { name: /^Continuar/ }).click();
}

test.describe("franja del perro", () => {
  test("saluda con la cantidad de repasos y el globito no se cierra solo", async ({ page }) => {
    await page.clock.install();
    await setup(page, { cards: [clozeCard(1, "know", "saber"), { ...clozeCard(2, "think", "pensar"), is_new: true }] });
    await page.goto("/");
    await expect(bubble(page)).toContainText("Hoy tienes 1 repaso y 1 palabra nueva");
    await page.clock.runFor(12_000);
    await expect(bubble(page)).toContainText("Hoy tienes 1 repaso");
  });

  test("a los 30 s sin responder da una pista con la primera letra", async ({ page }) => {
    await page.clock.install();
    await setup(page, { cards: [clozeCard(1, "know", "saber")] });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "know", exact: true })).toBeVisible();
    await page.clock.runFor(30_100);
    await expect(sprite(page)).toHaveAttribute("data-anim", "idea");
    await expect(bubble(page)).toContainText("Pista: empieza con «k»");
  });

  test("tocar al perro pronuncia la palabra de la tarjeta", async ({ page }) => {
    await setup(page, { cards: [clozeCard(1, "know", "saber")] });
    await page.goto("/");
    await page.getByRole("button", { name: "Palabro: escuchar «know»" }).click();
    expect(await played(page)).toContain("/audio/words/know.mp3");
  });

  test("en 375 px la franja no impide responder", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await setup(page, { cards: [clozeCard(1, "know", "saber")] });
    await page.goto("/");
    await page.getByRole("button", { name: "zzz1" }).click();
    await page.getByRole("button", { name: /^Continuar/ }).click();
    await expect(page.getByText("Sesión completa")).toBeVisible();
    await page.screenshot({ path: "test-results/franja-mobile.png" });
  });

  test("el tutorial aparece la primera vez y se marca al terminar", async ({ page }) => {
    const captured = await setup(page, {
      cards: [clozeCard(1, "know", "saber")],
      settings: { new_per_day: 20, tutorial_done: false },
    });
    await page.goto("/");
    await expect(bubble(page)).toContainText("Elige la palabra que falta");
    await expect(sprite(page)).toHaveAttribute("data-anim", "point");
    await answerCloze(page, "know");
    await expect(page.getByText("Sesión completa")).toBeVisible();
    await expect.poll(() => captured.settingsPuts).toContainEqual({ tutorial_done: true });
  });
});

test.describe("mini test", () => {
  test("aparece al terminar, se responde y envía las falladas", async ({ page }) => {
    const captured = await setup(page, { cards: four });
    await page.goto("/");
    for (const c of four) await answerCloze(page, c.lexeme.lemma);

    await expect(page.getByText("Mini test de la sesión")).toBeVisible();
    const meaning = Object.fromEntries(four.map((c) => [c.lexeme.lemma, c.lexeme.definition_es]));
    let firstMiss: string | null = null;
    for (let i = 0; i < 4; i++) {
      const lemma = (await page.locator("h2 em").textContent())!;
      const options = page.locator("[data-state]");
      if (i === 0) {
        const wrong = (await options.allTextContents()).find((t) => t !== meaning[lemma])!;
        firstMiss = lemma;
        await options.filter({ hasText: wrong }).click();
      } else {
        await page.getByRole("button", { name: meaning[lemma], exact: true }).click();
      }
      await page.getByRole("button", { name: i === 3 ? "Ver resultado" : "Siguiente" }).click();
    }

    await expect(page.getByText("3 de 4")).toBeVisible();
    await expect.poll(() => captured.gameResults.length).toBe(1);
    const result = captured.gameResults[0]!;
    expect(result).toMatchObject({ mode: "session_quiz", score: 3, max_score: 4 });
    expect(result.missed_lexeme_ids).toEqual([four.find((c) => c.lexeme.lemma === firstMiss)!.lexeme.id]);
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText("Sesión completa")).toBeVisible();
  });

  test("se puede saltar y no envía nada", async ({ page }) => {
    const captured = await setup(page, { cards: four });
    await page.goto("/");
    for (const c of four) await answerCloze(page, c.lexeme.lemma);
    await page.getByRole("button", { name: "Saltar" }).click();
    await expect(page.getByText("Sesión completa")).toBeVisible();
    expect(captured.gameResults).toEqual([]);
  });

  test("no aparece con menos de 4 palabras", async ({ page }) => {
    await setup(page, { cards: four.slice(0, 3) });
    await page.goto("/");
    for (const c of four.slice(0, 3)) await answerCloze(page, c.lexeme.lemma);
    await expect(page.getByText("Sesión completa")).toBeVisible();
  });
});

const progress = {
  words_seen: 25, words_usable: 0, coverage_pct: 0, due_now: 3, due_tomorrow: 7,
  levels: { 1: 24, 2: 1 }, study_days: [{ day: "2026-09-23", n: 20 }],
  current_streak: 1, longest_streak: 1, freezes_left: 2, top_errors: [],
};

test.describe("Progreso", () => {
  test("muestra la escalera, el pronóstico, el calendario y el crédito de la voz", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-09-24T15:00:00Z"));
    await setup(page, { progress });
    await page.goto("/");
    await page.getByRole("button", { name: "Progreso" }).click();
    await expect(page.getByText("Una palabra cuenta cuando llega al nivel 4")).toBeVisible();
    await expect(page.getByTestId("level-1")).toContainText("24");
    await expect(page.getByTestId("level-2")).toContainText("1");
    await expect(page.getByTestId("level-4")).toContainText("0");
    await expect(page.getByText("Te tocan mañana").locator("..")).toContainText("7");
    await expect(page.getByTestId("day-2026-09-23")).toHaveAttribute("data-n", "20");
    await expect(page.getByRole("link", { name: "ElevenLabs" })).toBeVisible();
  });
});

const vocab = [
  { lexeme_id: 1, lemma: "know", pos: "verb", cefr: "A1", definition_es: "saber, conocer", audio_url: "/audio/words/know.mp3", mastery_level: 1, due: "2026-09-30T00:00:00Z", example: "I don't know.", example_es: "No sé." },
  { lexeme_id: 2, lemma: "think", pos: "verb", cefr: "A1", definition_es: "pensar, creer", audio_url: "/audio/words/think.mp3", mastery_level: 2, due: "2026-09-20T00:00:00Z", example: null, example_es: null },
  { lexeme_id: 3, lemma: "want", pos: "verb", cefr: "A1", definition_es: "querer", audio_url: "/audio/words/want.mp3", mastery_level: 1, due: "2026-09-28T00:00:00Z", example: null, example_es: null },
  { lexeme_id: 4, lemma: "need", pos: "verb", cefr: "A1", definition_es: "necesitar", audio_url: "/audio/words/need.mp3", mastery_level: 1, due: "2026-09-28T00:00:00Z", example: null, example_es: null },
];

test.describe("Mis palabras", () => {
  test("lista, busca, filtra por nivel y muestra el ejemplo", async ({ page }) => {
    await setup(page, { vocab });
    await page.goto("/");
    await page.getByRole("button", { name: "Palabras" }).click();
    await expect(page.getByText("4 vistas")).toBeVisible();
    await page.getByLabel("Buscar palabra").fill("creer");
    await expect(page.locator("li strong")).toHaveText(["think"]);
    await page.getByLabel("Buscar palabra").fill("");
    await page.getByRole("radio", { name: "Nivel 2" }).click();
    await expect(page.locator("li strong")).toHaveText(["think"]);
    await page.getByRole("radio", { name: "Todas" }).click();
    await page.getByRole("button", { name: /^know/ }).click();
    await expect(page.getByText("I don't know.")).toBeVisible();
    await expect(page.getByText("No sé.")).toBeVisible();
  });

  test("el modo escucha reproduce la palabra, se responde y envía el resultado", async ({ page }) => {
    const captured = await setup(page, { vocab });
    await page.goto("/");
    await page.getByRole("button", { name: "Palabras" }).click();
    await page.getByRole("button", { name: "Practicar escuchando" }).click();
    for (let i = 0; i < 4; i++) {
      const sounds = await played(page);
      const lemma = sounds.at(-1)!.replace("/audio/words/", "").replace(".mp3", "");
      await page.getByRole("button", { name: lemma, exact: true }).click();
      await page.getByRole("button", { name: i === 3 ? "Ver resultado" : "Siguiente" }).click();
    }
    await expect(page.getByText("4 de 4")).toBeVisible();
    await expect.poll(() => captured.gameResults.length).toBe(1);
    expect(captured.gameResults[0]).toMatchObject({ mode: "listening", score: 4, max_score: 4, missed_lexeme_ids: [] });
  });

  test("sin 4 palabras con audio el modo escucha está desactivado", async ({ page }) => {
    await setup(page, { vocab: vocab.slice(0, 3) });
    await page.goto("/");
    await page.getByRole("button", { name: "Palabras" }).click();
    await expect(page.getByRole("button", { name: "Practicar escuchando" })).toBeDisabled();
  });
});

test("Progreso permite cerrar sesión y vuelve a la pantalla de ingreso", async ({ page }) => {
  await setup(page, { progress });
  await page.goto("/");
  await page.getByRole("button", { name: "Progreso" }).click();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Progreso" })).toBeHidden();
});
