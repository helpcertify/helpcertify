import { describe, it, expect } from 'vitest';
import { signAttributionToken, verifyAttributionToken, type AttributionPayload } from './attributionToken';

// A stand-in HMAC - deterministic, not cryptographic; enough to prove the
// sign/verify pairing, tamper rejection and expiry logic.
const fakeHmac = (msg: string) => {
  let h = 5381;
  for (let i = 0; i < msg.length; i++) h = (h * 33) ^ msg.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, '0');
};

const payload: AttributionPayload = {
  code: 'HCPABC234',
  partnerId: 'HCPABC234',
  productId: 'HELPCERTIFY',
  exp: 2000,
};

describe('attribution token', () => {
  it('round-trips a valid unexpired token', () => {
    const t = signAttributionToken(payload, fakeHmac);
    expect(verifyAttributionToken(t, fakeHmac, 1000)).toEqual(payload);
  });
  it('rejects an expired token', () => {
    const t = signAttributionToken(payload, fakeHmac);
    expect(verifyAttributionToken(t, fakeHmac, 2000)).toBeNull();
    expect(verifyAttributionToken(t, fakeHmac, 3000)).toBeNull();
  });
  it('rejects a tampered payload', () => {
    const t = signAttributionToken(payload, fakeHmac);
    const [body, sig] = t.split('.');
    const forged = `${body}x.${sig}`;
    expect(verifyAttributionToken(forged, fakeHmac, 1000)).toBeNull();
  });
  it('rejects a wrong signature / wrong secret', () => {
    const t = signAttributionToken(payload, fakeHmac);
    expect(verifyAttributionToken(t, (m) => `zzz${fakeHmac(m)}`, 1000)).toBeNull();
  });
  it('rejects malformed input', () => {
    expect(verifyAttributionToken('nodot', fakeHmac, 1000)).toBeNull();
    expect(verifyAttributionToken('.sig', fakeHmac, 1000)).toBeNull();
  });
});
