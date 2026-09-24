import { Hono, type Context } from "hono";
import type { Env } from "../env.js";
import { db } from "../db.js";
import {
  isEmail, loginSchema, normalizeIdentifier, recoveryQuestionSchema, recoveryResetSchema,
  registerSchema, type SessionTokens,
} from "../../shared/auth.js";
import { hashAnswer, safeEqual, verifyAnswer } from "../auth/answer.js";
import { lockedUntil, WINDOW_MS } from "../auth/attempts.js";

type Ctx = Context<{ Bindings: Env }>;

interface AccountRow {
  user_id: string;
  email: string;
  question_id: number;
  answer_hash: string;
  answer_salt: string;
}

export const account = new Hono<{ Bindings: Env }>();

async function findAccount(env: Env, identifier: string): Promise<AccountRow | null> {
  const id = normalizeIdentifier(identifier);
  const { data, error } = await db(env)
    .from("accounts")
    .select("user_id,email,question_id,answer_hash,answer_salt")
    .eq(isEmail(id) ? "email" : "username", id)
    .maybeSingle();
  if (error) throw new Error(`accounts: ${error.message}`);
  return data as AccountRow | null;
}

async function recentFailures(env: Env, key: string): Promise<number[]> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { data, error } = await db(env)
    .from("auth_attempts").select("created_at").eq("key", key).gte("created_at", since);
  if (error) throw new Error(`auth_attempts: ${error.message}`);
  return (data ?? []).map((r: { created_at: string }) => Date.parse(r.created_at));
}

async function lockResponse(c: Ctx, key: string): Promise<Response | null> {
  const until = lockedUntil(await recentFailures(c.env, key), Date.now());
  if (until === null) return null;
  return c.json({ error: "too_many_attempts", retry_after_s: Math.ceil((until - Date.now()) / 1000) }, 429);
}

async function recordFailure(env: Env, key: string): Promise<void> {
  await db(env).from("auth_attempts").insert({ key });
}

async function clearFailures(env: Env, key: string): Promise<void> {
  await db(env).from("auth_attempts").delete().eq("key", key);
}

async function signIn(env: Env, email: string, password: string): Promise<SessionTokens | null> {
  const { data, error } = await db(env).auth.signInWithPassword({ email, password });
  if (error || !data.session) return null;
  return { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
}

async function readJson(c: Ctx): Promise<unknown> {
  return c.req.json().catch(() => null);
}

account.post("/register", async (c) => {
  const parsed = registerSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
  const input = parsed.data;

  if (!c.env.INVITE_CODE) return c.json({ error: "registration_closed" }, 503);
  if (!safeEqual(input.invite, c.env.INVITE_CODE)) return c.json({ error: "invalid_invite" }, 403);

  if (await findAccount(c.env, input.username)) return c.json({ error: "username_taken" }, 409);
  if (await findAccount(c.env, input.email)) return c.json({ error: "email_taken" }, 409);

  const admin = db(c.env).auth.admin;
  const created = await admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.username },
  });
  if (created.error || !created.data.user) {
    return created.error?.message.toLowerCase().includes("already")
      ? c.json({ error: "email_taken" }, 409)
      : c.json({ error: "register_failed" }, 500);
  }
  const userId = created.data.user.id;

  const { hash, salt } = await hashAnswer(input.answer);
  const { error } = await db(c.env).from("accounts").insert({
    user_id: userId,
    username: input.username,
    email: input.email,
    question_id: input.question_id,
    answer_hash: hash,
    answer_salt: salt,
  });
  if (error) {
    await admin.deleteUser(userId);
    return error.code === "23505"
      ? c.json({ error: "username_taken" }, 409)
      : c.json({ error: "register_failed" }, 500);
  }

  await db(c.env).from("user_stats").update({ new_per_day: input.new_per_day }).eq("user_id", userId);

  const tokens = await signIn(c.env, input.email, input.password);
  return tokens ? c.json(tokens) : c.json({ error: "register_failed" }, 500);
});

account.post("/login", async (c) => {
  const parsed = loginSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
  const key = `login:${normalizeIdentifier(parsed.data.identifier)}`;

  const locked = await lockResponse(c, key);
  if (locked) return locked;

  const found = await findAccount(c.env, parsed.data.identifier);
  const tokens = found ? await signIn(c.env, found.email, parsed.data.password) : null;
  if (!tokens) {
    await recordFailure(c.env, key);
    return c.json({ error: "invalid_credentials" }, 401);
  }
  await clearFailures(c.env, key);
  return c.json(tokens);
});

account.post("/recovery/question", async (c) => {
  const parsed = recoveryQuestionSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
  const found = await findAccount(c.env, parsed.data.identifier);
  return found ? c.json({ question_id: found.question_id }) : c.json({ error: "not_found" }, 404);
});

account.post("/recovery/reset", async (c) => {
  const parsed = recoveryResetSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: "invalid_input" }, 400);
  const id = normalizeIdentifier(parsed.data.identifier);
  const key = `recovery:${id}`;

  const locked = await lockResponse(c, key);
  if (locked) return locked;

  const found = await findAccount(c.env, id);
  const ok = found ? await verifyAnswer(parsed.data.answer, found.answer_hash, found.answer_salt) : false;
  if (!found || !ok) {
    await recordFailure(c.env, key);
    return c.json({ error: "invalid_answer" }, 401);
  }

  const { error } = await db(c.env).auth.admin.updateUserById(found.user_id, {
    password: parsed.data.new_password,
  });
  if (error) return c.json({ error: "reset_failed" }, 500);

  await clearFailures(c.env, key);
  await clearFailures(c.env, `login:${id}`);
  const tokens = await signIn(c.env, found.email, parsed.data.new_password);
  return tokens ? c.json(tokens) : c.json({ error: "reset_failed" }, 500);
});
