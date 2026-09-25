import type { Page } from "@playwright/test";

export const ref = new URL(process.env.VITE_SUPABASE_URL ?? "https://ckjoklnmedodnrrqzqpk.supabase.co").hostname.split(".")[0];

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

export function clozeCard(id: number, lemma: string, definition_es: string, extra: Record<string, unknown> = {}) {
  const text = `I ${lemma} it.`;
  return {
    user_card_id: id, mastery_level: 2, state: 1, reps: 2, is_new: false,
    next: { 1: MIN, 2: 6 * MIN, 3: 10 * MIN, 4: 4 * DAY },
    lexeme: {
      id, lemma, pos: "verb", cefr: "A1", ipa: null, definition_en: `to ${lemma}`, definition_es,
      usage_note: null, false_friend: null, collocations: [`${lemma} well`], common_errors: [],
      audio_url: `/audio/words/${lemma}.mp3`, ...extra,
    },
    context: {
      id: id * 10, text, gloss_es: `Lo ${definition_es}.`, level: "A1", cloze_start: 2, cloze_end: 2 + lemma.length,
      distractors: ["zzz1", "zzz2", "zzz3"], native_variant: null, audio_url: null,
    },
  };
}

export function recognitionCard(id: number, lemma: string, definition_es: string, distractors: string[]) {
  const base = clozeCard(id, lemma, definition_es);
  return { ...base, mastery_level: 1, lexeme: { ...base.lexeme, meaning_distractors: distractors } };
}

export interface Mocks {
  cards?: unknown[];
  settings?: { new_per_day: number; tutorial_done: boolean };
  progress?: unknown;
  vocab?: unknown[];
}

export interface Captured {
  settingsPuts: unknown[];
  gameResults: Record<string, unknown>[];
  reviews: Record<string, unknown>[];
}

export async function setup(page: Page, mocks: Mocks = {}): Promise<Captured> {
  const captured: Captured = { settingsPuts: [], gameResults: [], reviews: [] };
  const now = Math.floor(Date.now() / 1000);
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, value);
    const w = globalThis as unknown as { __played: string[]; Audio: unknown };
    w.__played = [];
    w.Audio = class {
      src: string;
      constructor(src: string) { this.src = src; }
      play() { w.__played.push(this.src); return Promise.resolve(); }
    };
  }, {
    key: `sb-${ref}-auth-token`,
    value: JSON.stringify({
      access_token: "e2e", refresh_token: "e2e", token_type: "bearer", expires_in: 3600, expires_at: now + 3600,
      user: { id: "u", aud: "authenticated", role: "authenticated", email: "e@x", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
    }),
  });
  await page.route(/supabase\.co/, (r) => r.fulfill({ json: {} }));
  await page.route("**/api/session/today", (r) =>
    r.fulfill({ json: { cards: mocks.cards ?? [], warmup_count: 0, deferred: 0 } }));
  await page.route("**/api/review", (r) => {
    captured.reviews.push(r.request().postDataJSON() as Record<string, unknown>);
    return r.fulfill({ json: { due: new Date().toISOString(), mastery_level: 2, leveled_up: false, leveled_down: false } });
  });
  await page.route("**/api/session/complete", (r) => r.fulfill({ json: { current_streak: 2 } }));
  await page.route("**/api/settings", (r) => {
    if (r.request().method() === "PUT") {
      const body = r.request().postDataJSON() as Record<string, unknown>;
      captured.settingsPuts.push(body);
      return r.fulfill({ json: { ...(mocks.settings ?? { new_per_day: 20, tutorial_done: true }), ...body } });
    }
    return r.fulfill({ json: mocks.settings ?? { new_per_day: 20, tutorial_done: true } });
  });
  await page.route("**/api/progress*", (r) => r.fulfill({ json: mocks.progress ?? {} }));
  await page.route("**/api/vocab", (r) => r.fulfill({ json: mocks.vocab ?? [] }));
  await page.route("**/api/game/result", (r) => {
    captured.gameResults.push(r.request().postDataJSON() as Record<string, unknown>);
    return r.fulfill({ json: { recorded: true, cards_brought_forward: 0 } });
  });
  return captured;
}

export const played = (page: Page) => page.evaluate(() => (globalThis as unknown as { __played: string[] }).__played);
