import { describe, it, expect } from 'vitest';
import { webhookEventKey, clientEventKey } from './paymentEvent';

describe('payment event dedup keys', () => {
  it('a webhook with an event id keys on that id', () => {
    expect(webhookEventKey('evt_abc123', 'pay_xyz')).toBe('evt_abc123');
  });

  it('a webhook without an event id falls back to the payment id', () => {
    expect(webhookEventKey(null, 'pay_xyz')).toBe('pay_pay_xyz');
    expect(webhookEventKey('', 'pay_xyz')).toBe('pay_pay_xyz');
    expect(webhookEventKey('   ', 'pay_xyz')).toBe('pay_pay_xyz');
  });

  it('the client key and the webhook fallback collide on purpose', () => {
    // So a client verify + a header-less webhook for the same payment
    // land on ONE paymentEvents doc and the second is a no-op.
    expect(clientEventKey('pay_xyz')).toBe(webhookEventKey(undefined, 'pay_xyz'));
  });

  it('two deliveries of the same webhook event produce the same key', () => {
    expect(webhookEventKey('evt_1', 'p1')).toBe(webhookEventKey('evt_1', 'p1'));
  });
});
