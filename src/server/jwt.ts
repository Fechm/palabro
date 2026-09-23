import { jwtVerify, type JWTVerifyGetKey } from "jose";

/**
 * Verifica el JWT de Supabase comprobando la FIRMA localmente contra las
 * claves públicas del proyecto (ES256, JWKS). La JWKS se descarga una vez
 * por isolate y queda en caché: cada petición cuesta ~1ms y no consume cuota.
 */
export async function verifyAccessToken(
  token: string,
  keys: JWTVerifyGetKey,
  issuer: string,
): Promise<string> {
  const { payload } = await jwtVerify(token, keys, {
    algorithms: ["ES256", "RS256"],
    issuer,
  });
  if (!payload.sub) throw new Error("token sin sub");
  return payload.sub;
}
