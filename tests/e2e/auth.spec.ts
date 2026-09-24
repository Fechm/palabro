import { expect, test, type Page } from "@playwright/test";

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

function fakeTokens() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access = `${b64({ alg: "ES256", typ: "JWT" })}.${b64({ sub: "u-1", exp, aud: "authenticated", role: "authenticated" })}.${b64({ firma: "e2e" })}`;
  return { access_token: access, refresh_token: "refresh-e2e" };
}

const user = {
  id: "u-1", aud: "authenticated", role: "authenticated", email: "e2e@palabro.test",
  app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString(),
};

async function setup(page: Page) {
  await page.route(/supabase\.co/, (r) => r.fulfill({ json: {} }));
  await page.route(/supabase\.co\/auth\/v1\/user/, (r) => r.fulfill({ json: user }));
  await page.route("**/api/session/today", (r) => r.fulfill({ json: { cards: [], warmup_count: 0, deferred: 0 } }));
  await page.goto("/");
}

const password = (page: Page) => page.getByLabel("Contraseña", { exact: true });

test("el ojito muestra y oculta la contraseña", async ({ page }) => {
  await setup(page);
  await password(page).fill("secreta-123");
  await expect(password(page)).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Mostrar contraseña" }).click();
  await expect(password(page)).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Ocultar contraseña" }).click();
  await expect(password(page)).toHaveAttribute("type", "password");
});

test("entra con nombre de usuario y llega a la pantalla de estudio", async ({ page }) => {
  let body: unknown = null;
  await page.route("**/api/auth/login", async (r) => {
    body = r.request().postDataJSON();
    await r.fulfill({ json: fakeTokens() });
  });
  await setup(page);
  await page.getByLabel("Usuario o correo").fill("felipe");
  await password(page).fill("secreta-123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText("No tienes tarjetas pendientes")).toBeVisible();
  expect(body).toEqual({ identifier: "felipe", password: "secreta-123" });
});

test("con credenciales malas muestra el mensaje genérico", async ({ page }) => {
  await page.route("**/api/auth/login", (r) => r.fulfill({ status: 401, json: { error: "invalid_credentials" } }));
  await setup(page);
  await page.getByLabel("Usuario o correo").fill("felipe");
  await password(page).fill("mala-clave");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Usuario o contraseña incorrectos.");
});

test("la recuperación muestra la pregunta de seguridad de la cuenta", async ({ page }) => {
  await page.route("**/api/auth/recovery/question", (r) => r.fulfill({ json: { question_id: 1 } }));
  await setup(page);
  await page.getByRole("button", { name: "¿Olvidaste tu contraseña?" }).click();
  await page.getByLabel("Usuario o correo").fill("felipe");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("¿Cómo se llamaba tu primera mascota?")).toBeVisible();
  await expect(page.getByLabel("Contraseña nueva", { exact: true })).toHaveAttribute("type", "password");
});

test("el registro envía las palabras nuevas por día elegidas", async ({ page }) => {
  let body: Record<string, unknown> | null = null;
  await page.route("**/api/auth/register", async (r) => {
    body = r.request().postDataJSON();
    await r.fulfill({ json: fakeTokens() });
  });
  await setup(page);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.getByLabel("Código de invitación").fill("codigo");
  await page.getByLabel("Nombre de usuario").fill("felipe");
  await page.getByLabel("Correo").fill("f@x.cl");
  await page.getByLabel("Contraseña", { exact: true }).fill("secreta-123");
  await page.getByLabel("Repite la contraseña").fill("secreta-123");
  await page.getByLabel("Respuesta").fill("Toby");
  await expect(page.getByLabel("¿Cuántas palabras nuevas quieres por día?")).toHaveValue("20");
  await page.getByLabel("¿Cuántas palabras nuevas quieres por día?").selectOption("10");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect.poll(() => body?.new_per_day).toBe(10);
});

test("el registro valida que las contraseñas coincidan antes de enviar", async ({ page }) => {
  let called = false;
  await page.route("**/api/auth/register", (r) => { called = true; return r.fulfill({ json: fakeTokens() }); });
  await setup(page);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.getByLabel("Código de invitación").fill("codigo");
  await page.getByLabel("Nombre de usuario").fill("felipe");
  await page.getByLabel("Correo").fill("f@x.cl");
  await page.getByLabel("Contraseña", { exact: true }).fill("secreta-123");
  await page.getByLabel("Repite la contraseña").fill("otra-cosa-9");
  await page.getByLabel("Respuesta").fill("Toby");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("alert")).toHaveText("Las contraseñas no coinciden.");
  expect(called).toBe(false);
});
