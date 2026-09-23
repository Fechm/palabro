import { describe, expect, it } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { verifyAccessToken } from "../../src/server/jwt.js";

const ISSUER = "https://demo.supabase.co/auth/v1";

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "ES256" };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const sign = (claims: Record<string, unknown> = {}, iss = ISSUER, exp: string | number = "1h") =>
    new SignJWT({ role: "authenticated", ...claims })
      .setProtectedHeader({ alg: "ES256", kid: "k1" })
      .setSubject("user-123")
      .setIssuer(iss)
      .setIssuedAt()
      .setExpirationTime(exp)
      .sign(privateKey);
  return { keys, sign };
}

describe("verifyAccessToken", () => {
  it("acepta un token ES256 firmado por la clave del proyecto", async () => {
    const { keys, sign } = await setup();
    expect(await verifyAccessToken(await sign(), keys, ISSUER)).toBe("user-123");
  });

  it("rechaza un token HS256 firmado con un secreto compartido", async () => {
    const { keys } = await setup();
    const forged = await new SignJWT({ role: "authenticated" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-123")
      .setIssuer(ISSUER)
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("super-secret-jwt-token"));
    await expect(verifyAccessToken(forged, keys, ISSUER)).rejects.toThrow();
  });

  it("rechaza un token de otro proyecto", async () => {
    const { keys, sign } = await setup();
    const token = await sign({}, "https://otro.supabase.co/auth/v1");
    await expect(verifyAccessToken(token, keys, ISSUER)).rejects.toThrow();
  });

  it("rechaza un token expirado", async () => {
    const { keys, sign } = await setup();
    const token = await sign({}, ISSUER, Math.floor(Date.now() / 1000) - 60);
    await expect(verifyAccessToken(token, keys, ISSUER)).rejects.toThrow();
  });
});
