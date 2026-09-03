import { describe, it, expect } from 'vitest';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { signAttributionToken, verifyAttributionToken, type AttributionPayload } from './attributionToken';

// The browser lib (attributionToken.ts, uses btoa/atob) and the two api/*.ts
// handlers (api/auth.ts signRefToken, api/checkout.ts verifyRefToken, both
// use node:crypto + Buffer base64url) are separate implementations that must
// stay byte-compatible - a divergence would silently break every ?ref= link
// attribution in production. These tests exercise both directions.

const SECRET = 'test-partner-token-secret-value';

// Exact reproduction of api/auth.ts's signRefToken.
function handlerSign(payload: AttributionPayload, secret = SECRET): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

// Exact reproduction of api/checkout.ts's verifyRefToken.
function handlerVerify(token: string, secret = SECRET): AttributionPayload | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  if (expected.length !== sig.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof payload.exp !== 'number' || Date.now() / 1000 >= payload.exp) return null;
    if (!payload.code || !payload.partnerId || !payload.productId) return null;
    return payload;
  } catch {
    return null;
  }
}

// Adapter so the pure lib can be driven with the real HMAC the handlers use.
const realHmac = (secret = SECRET) => (msg: string) => createHmac('sha256', secret).update(msg).digest('base64url');

const future = Math.floor(Date.now() / 1000) + 3600;
const past = Math.floor(Date.now() / 1000) - 10;

const payload = (exp: number): AttributionPayload => ({
  code: 'HCPABC234',
  partnerId: 'HCP1234567890',
  productId: 'HELPCERTIFY',
  exp,
});

describe('attribution token interop: handler <-> handler', () => {
  it('round-trips a valid token', () => {
    const p = payload(future);
    expect(handlerVerify(handlerSign(p))).toEqual(p);
  });
  it('rejects an expired token', () => {
    expect(handlerVerify(handlerSign(payload(past)))).toBeNull();
  });
  it('rejects a token signed with a different secret', () => {
    const t = handlerSign(payload(future), 'other-secret');
    expect(handlerVerify(t)).toBeNull();
  });
  it('rejects a tampered body', () => {
    const t = handlerSign(payload(future));
    const [body, sig] = t.split('.');
    expect(handlerVerify(`${body}AA.${sig}`)).toBeNull();
  });
  it('rejects a payload missing required fields', () => {
    const bad = Buffer.from(JSON.stringify({ code: 'HCPABC234', exp: future })).toString('base64url');
    const sig = createHmac('sha256', SECRET).update(bad).digest('base64url');
    expect(handlerVerify(`${bad}.${sig}`)).toBeNull();
  });
});

describe('attribution token interop: browser lib <-> handler', () => {
  it('a handler-signed token verifies with the pure lib', () => {
    const p = payload(future);
    const token = handlerSign(p);
    expect(verifyAttributionToken(token, realHmac(), Math.floor(Date.now() / 1000))).toEqual(p);
  });
  it('a lib-signed token verifies with the handler', () => {
    const p = payload(future);
    const token = signAttributionToken(p, realHmac());
    expect(handlerVerify(token)).toEqual(p);
  });
  it('the two implementations produce an identical token for the same payload', () => {
    const p = payload(future);
    // lib and handler both: base64url(JSON) . hmacSha256Base64url(body)
    expect(signAttributionToken(p, realHmac())).toBe(handlerSign(p));
  });
  it('lib rejects a handler token past expiry', () => {
    const token = handlerSign(payload(past));
    expect(verifyAttributionToken(token, realHmac(), Math.floor(Date.now() / 1000))).toBeNull();
  });
  it('lib rejects a handler token signed with the wrong secret', () => {
    const token = handlerSign(payload(future), 'wrong');
    expect(verifyAttributionToken(token, realHmac(), Math.floor(Date.now() / 1000))).toBeNull();
  });
});
