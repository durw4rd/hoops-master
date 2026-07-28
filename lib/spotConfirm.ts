/**
 * Confirmation copy + mode resolution for player spot actions, gated by the
 * LaunchDarkly string flag `spot-confirmation` (disabled | single | double).
 * See components/ui/useConfirmGate.ts for the state machine and
 * EventDetailModal for the wiring.
 */

export type ConfirmMode = 'disabled' | 'single' | 'double';

/** Narrow the raw flag value to a mode; anything unexpected → 'disabled' (fail-safe). */
export function confirmModeFromFlag(value: unknown): ConfirmMode {
  return value === 'single' || value === 'double' ? value : 'disabled';
}

export type SpotActionKind =
  | 'claim'
  | 'claim2nd'
  | 'release'
  | 'offer'
  | 'retract'
  | 'addRider'
  | 'dropRider'
  | 'offerRider'
  | 'retractRider'
  | 'handover'
  | 'handover2nd'
  | 'acceptPromotion'
  | 'declinePromotion';

export interface ConfirmCopy {
  title: string;
  message: string;
  confirmLabel: string;
  variant: 'danger' | 'default';
}

/**
 * Per-action copy. Titles carry the graffiti flavor; the body keeps the spot
 * verb plain and states the consequence (per VOCABULARY.md). `danger` (red) is
 * used for give-up / hand-off moves, `default` (dark) for grabbing a spot.
 */
export const SPOT_CONFIRM_COPY: Record<SpotActionKind, ConfirmCopy> = {
  claim: {
    title: 'Claim this spot?',
    message: 'Grabbing a spot charges your credit for it.',
    confirmLabel: 'CLAIM IT',
    variant: 'default',
  },
  claim2nd: {
    title: 'Bring a +1?',
    message: 'A 2nd spot charges you for the extra head.',
    confirmLabel: 'CLAIM IT',
    variant: 'default',
  },
  release: {
    title: 'Release your spot?',
    message: 'Hands it to the first player on the bench and credits you back.',
    confirmLabel: 'RELEASE',
    variant: 'danger',
  },
  offer: {
    title: 'Offer your spot?',
    message: 'Opens it up for anyone in the crew to grab.',
    confirmLabel: 'OFFER IT',
    variant: 'danger',
  },
  retract: {
    title: 'Pull your offer back?',
    message: 'Takes your spot back off the marketplace.',
    confirmLabel: 'RETRACT',
    variant: 'default',
  },
  addRider: {
    title: 'Bring a +1?',
    message: 'Adds a +1 spot and charges you for it.',
    confirmLabel: 'ADD +1',
    variant: 'default',
  },
  dropRider: {
    title: 'Release your +1?',
    message: 'Hands your +1 to the first player on the bench.',
    confirmLabel: 'RELEASE +1',
    variant: 'danger',
  },
  offerRider: {
    title: 'Offer your +1?',
    message: 'Opens your +1 up for anyone in the crew to grab.',
    confirmLabel: 'OFFER +1',
    variant: 'danger',
  },
  retractRider: {
    title: 'Pull your +1 offer back?',
    message: 'Takes your +1 back off the marketplace.',
    confirmLabel: 'RETRACT',
    variant: 'default',
  },
  handover: {
    title: 'Hand over your spot?',
    message: 'Gives it to the player you picked — they take on the cost.',
    confirmLabel: 'HAND IT OVER',
    variant: 'danger',
  },
  handover2nd: {
    title: 'Hand over your 2nd spot?',
    message: 'Gives your +1 to the player you picked — they take on the cost.',
    confirmLabel: 'HAND IT OVER',
    variant: 'danger',
  },
  acceptPromotion: {
    title: 'Take the spot?',
    message: "You're in — this claims it and charges your credit.",
    confirmLabel: "I'M IN",
    variant: 'default',
  },
  declinePromotion: {
    title: 'Pass on the spot?',
    message: 'Turns it down and drops it to the next player on the bench.',
    confirmLabel: 'PASS',
    variant: 'danger',
  },
};

/** Second-stage copy for the `double` mode — generic, reuses the action's confirm label. */
export const SECOND_STAGE_COPY = {
  title: 'Really, really sure?',
  message: "No takebacks — you'd have to redo it by hand.",
};
