import { z } from "zod";

export const SECURITY_QUESTIONS = [
  { id: 1, text: "¿Cómo se llamaba tu primera mascota?" },
  { id: 2, text: "¿En qué ciudad nació tu madre?" },
  { id: 3, text: "¿Cómo se llamaba tu escuela primaria?" },
  { id: 4, text: "¿Cuál era tu comida favorita de niño o niña?" },
  { id: 5, text: "¿Cómo se llamaba tu mejor amigo o amiga de la infancia?" },
  { id: 6, text: "¿En qué calle vivías cuando eras niño o niña?" },
] as const;

const questionIds = SECURITY_QUESTIONS.map((q) => q.id) as number[];

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.]{3,20}$/, "3 a 20 caracteres: letras, números, _ o .");

export const passwordSchema = z.string().min(8, "Mínimo 8 caracteres").max(72);

const answerSchema = z.string().trim().min(2).max(60);

export const NEW_PER_DAY_OPTIONS = [5, 10, 20, 30] as const;

export const newPerDaySchema = z
  .number()
  .int()
  .refine((n) => (NEW_PER_DAY_OPTIONS as readonly number[]).includes(n));

export const registerSchema = z.object({
  invite: z.string().trim().min(1),
  username: usernameSchema,
  email: z.string().trim().toLowerCase().email(),
  password: passwordSchema,
  question_id: z.number().int().refine((id) => questionIds.includes(id)),
  answer: answerSchema,
  new_per_day: newPerDaySchema.default(20),
});

export const settingsSchema = z
  .object({ new_per_day: newPerDaySchema.optional(), tutorial_done: z.literal(true).optional() })
  .refine((v) => v.new_per_day !== undefined || v.tutorial_done !== undefined);

export interface Settings {
  new_per_day: number;
  tutorial_done: boolean;
}

export const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(72),
});

export const recoveryQuestionSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
});

export const recoveryResetSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  answer: answerSchema,
  new_password: passwordSchema,
});

export const isEmail = (identifier: string): boolean => identifier.includes("@");

export const normalizeIdentifier = (identifier: string): string => identifier.trim().toLowerCase();

export type RegisterInput = z.infer<typeof registerSchema>;
export type SessionTokens = { access_token: string; refresh_token: string };
