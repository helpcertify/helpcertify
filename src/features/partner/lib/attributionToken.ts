// The opaque signed token handed to the browser after a ?ref= code
// resolves. The browser only stores and forwards it; verification happens
// server-side (api/auth.ts resolveReferral signs it, Phase 2's checkout
// verifies it). Pure so the sign/verify pair is unit-testable with a stub
// HMAC (see attributionToken.test.ts); the api handler re-implements this
// inline with Node's crypto.

export interface AttributionPayload {
  code: string;
  partnerId: string;
  productId: string;
  // seconds since epoch
  exp: number;
}

type Hmac = (message: string) => string;

function b64urlJson(obj: unknown): string {
  const json = JSON.stringify(obj);
  // btoa exists in browsers and modern Node; keep it dependency-free.
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64urlJson<T>(part: string): T | null {
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(b64)))) as T;
  } catch {
    return null;
  }
}

// `<base64url(payload)>.<hmac(base64url(payload))>`
export function signAttributionToken(payload: AttributionPayload, hmac: Hmac): string {
  const body = b64urlJson(payload);
  return `${body}.${hmac(body)}`;
}

export function verifyAttributionToken(
  token: string,
  hmac: Hmac,
  nowSeconds: number,
): AttributionPayload | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  // constant-ish time compare - length check first, then char-by-char OR.
  const expected = hmac(body);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  const payload = fromB64urlJson<AttributionPayload>(body);
  if (!payload || typeof payload.exp !== 'number') return null;
  if (nowSeconds >= payload.exp) return null;
  if (!payload.code || !payload.partnerId || !payload.productId) return null;
  return payload;
}
