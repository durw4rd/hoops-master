/**
 * Resend wrapper. Gracefully no-ops (with a log line) when RESEND_API_KEY or
 * EMAIL_FROM is unset, so local dev and tests never send or crash. Never
 * throws — a failed email must not break a spot mutation or a cron run.
 *
 * Dispatch is additionally gated behind the LaunchDarkly boolean flag
 * `email-notifications` (fail-closed: no LD/Edge Config → emails off).
 * The outbox keeps enqueueing regardless, so flipping the flag needs no deploy.
 */

import { Resend } from 'resend';
import { evalServerFlag } from '@/lib/launchdarkly';

const EMAIL_NOTIFICATIONS_FLAG = 'email-notifications';

let client: Resend | null = null;

export function isEmailEnabled(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

/** Master kill-switch for all outgoing email (LD flag, fail-closed). */
export async function isEmailNotificationsEnabled(): Promise<boolean> {
  return evalServerFlag(EMAIL_NOTIFICATIONS_FLAG, 'hoops-master-backend', false);
}

function getClient(): Resend {
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ sent: boolean; error?: string }> {
  if (!isEmailEnabled()) {
    console.log(`[email] disabled — skipping "${params.subject}" to ${params.to}`);
    return { sent: false, error: 'email disabled' };
  }
  try {
    const { error } = await getClient().emails.send({
      from: process.env.EMAIL_FROM!,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    if (error) {
      console.error('[email] send failed:', error);
      return { sent: false, error: error.message };
    }
    return { sent: true };
  } catch (err) {
    console.error('[email] send threw:', err);
    return { sent: false, error: String(err) };
  }
}
