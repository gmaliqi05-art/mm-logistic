/**
 * Shared Zod schemas for edge function input validation.
 *
 * Centralises common field shapes (email, uuid, name, etc.) so each
 * function gets consistent validation + error messages without repeating
 * the regex / length / type checks at every call site.
 *
 * Usage:
 *   import { z, parseJson, emailSchema } from "../_shared/schemas.ts";
 *   const Body = z.object({ email: emailSchema, name: nameSchema(120) });
 *   const parsed = await parseJson(req, Body);
 *   if (!parsed.ok) return parsed.response;
 *   const { email, name } = parsed.data;
 */

import { z } from "npm:zod@3.23.8";

export { z };

export const emailSchema = z
  .string({ required_error: "Email mungon" })
  .trim()
  .toLowerCase()
  .min(3, "Email shume i shkurter")
  .max(254, "Email shume i gjate")
  .email("Email i pavlefshem");

export const passwordSchema = z
  .string({ required_error: "Fjalekalimi mungon" })
  .min(8, "Fjalekalimi duhet te kete te pakten 8 karaktere")
  .max(128, "Fjalekalimi nuk mund te kete me shume se 128 karaktere");

export const uuidSchema = z
  .string({ required_error: "ID mungon" })
  .uuid("UUID i pavlefshem");

export const usernameSchema = z
  .string({ required_error: "Emri i perdoruesit mungon" })
  .trim()
  .min(2, "Emri i perdoruesit shume i shkurter")
  .max(64, "Emri i perdoruesit shume i gjate")
  .regex(/^[a-zA-Z0-9._-]+$/, "Vetem shkronja, numra, pika, viza dhe nenviza lejohen");

export const nameSchema = (maxLen = 200) =>
  z
    .string({ required_error: "Emri mungon" })
    .trim()
    .min(1, "Emri nuk mund te jete bosh")
    .max(maxLen, `Emri nuk mund te kete me shume se ${maxLen} karaktere`);

export const localeSchema = z.enum(["sq", "en", "de", "fr"]).optional();

export const platformSchema = z.enum(["ios", "android"], {
  errorMap: () => ({ message: "Platforma duhet te jete 'ios' ose 'android'" }),
});

/**
 * Optional string with a max length. Empty / null / undefined collapse to
 * undefined so the downstream handler can use `?? ""` or `?? null` without
 * worrying about the difference. Mirrors the ad-hoc `optionalStringMax`
 * helper that lived inside individual handlers before validation moved
 * into shared schemas.
 */
export const optionalString = (max: number, label = "Fusha") =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (v == null || v === "" ? undefined : v))
    .pipe(
      z
        .string()
        .max(max, `${label} nuk mund te kete me shume se ${max} karaktere`)
        .optional(),
    );

/**
 * Non-negative integer quantity (>=0). Accepts both `5` and `"5"`; rejects
 * negatives, NaN, and non-integers. Used by stock / delivery line items.
 */
export const quantitySchema = z.coerce
  .number({ invalid_type_error: "Sasia duhet te jete numer" })
  .int("Sasia duhet te jete numer i plote")
  .nonnegative("Sasia nuk mund te jete negative");


/**
 * Parse and validate a JSON request body against a Zod schema.
 * Returns { ok: true, data } on success or { ok: false, response } with a
 * ready-to-return 400 response on failure.
 */
export async function parseJson<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
  corsHeaders: Record<string, string> = {},
): Promise<
  | { ok: true; data: z.infer<T> }
  | { ok: false; response: Response }
> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "Body JSON i pavlefshem" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      ),
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "Te dhena te pavlefshme", issues }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      ),
    };
  }

  return { ok: true, data: parsed.data };
}
