import { describe, expect, it } from 'vitest';
import {
  confirmModeFromFlag,
  SPOT_CONFIRM_COPY,
  type SpotActionKind,
} from '@/lib/spotConfirm';

describe('confirmModeFromFlag', () => {
  it('passes through single and double', () => {
    expect(confirmModeFromFlag('single')).toBe('single');
    expect(confirmModeFromFlag('double')).toBe('double');
  });

  it('falls back to disabled for anything unexpected', () => {
    for (const v of ['disabled', 'x', '', undefined, null, true, 1, {}]) {
      expect(confirmModeFromFlag(v)).toBe('disabled');
    }
  });
});

describe('SPOT_CONFIRM_COPY', () => {
  const kinds: SpotActionKind[] = [
    'claim', 'claim2nd', 'release', 'offer', 'retract',
    'addRider', 'dropRider', 'offerRider', 'retractRider',
    'handover', 'handover2nd', 'acceptPromotion', 'declinePromotion',
  ];

  it('has complete, well-formed copy for every action kind', () => {
    for (const kind of kinds) {
      const copy = SPOT_CONFIRM_COPY[kind];
      expect(copy, kind).toBeTruthy();
      expect(copy.title.length, `${kind} title`).toBeGreaterThan(0);
      expect(copy.message.length, `${kind} message`).toBeGreaterThan(0);
      expect(copy.confirmLabel.length, `${kind} confirmLabel`).toBeGreaterThan(0);
      expect(['danger', 'default'], `${kind} variant`).toContain(copy.variant);
    }
  });
});
