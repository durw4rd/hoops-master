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

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
}

/** Resend allows up to 100 messages per Batch API request. */
const BATCH_MAX = 100;

type ResendCall = () => Promise<{ error: { message?: string; name?: string; statusCode?: number | null } | null }>;

/**
 * Run a Resend call, retrying rate-limited (429) or 5xx responses with
 * exponential backoff. Returns true on success. Never throws.
 */
async function withResendRetry(fn: ResendCall, attempts = 3): Promise<boolean> {
  let delayMs = 500;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const { error } = await fn();
      if (!error) return true;
      const status = error.statusCode;
      const retriable =
        status === 429 ||
        error.name === 'rate_limit_exceeded' ||
        (typeof status === 'number' && status >= 500);
      if (!retriable || attempt === attempts) {
        console.error('[email] send failed:', error);
        return false;
      }
      console.warn(`[email] retriable error (attempt ${attempt}/${attempts}):`, error.name ?? error.message);
    } catch (err) {
      if (attempt === attempts) {
        console.error('[email] send threw:', err);
        return false;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    delayMs *= 2;
  }
  return false;
}

export async function sendEmail(params: OutgoingEmail): Promise<{ sent: boolean }> {
  if (!isEmailEnabled()) {
    console.log(`[email] disabled — skipping "${params.subject}" to ${params.to}`);
    return { sent: false };
  }
  const sent = await withResendRetry(() =>
    getClient().emails.send({
      from: process.env.EMAIL_FROM!,
      to: params.to,
      subject: params.subject,
      html: params.html,
    })
  );
  return { sent };
}

/**
 * Send many emails via the Batch API (≤100 per request) instead of one HTTP
 * call each — the primary defense against Resend's 10 req/s rate limit. Chunks
 * large lists, retries a rate-limited/5xx chunk with backoff, never throws.
 * Returns the count accepted for delivery. Each message can differ (batch
 * entries carry their own to/subject/html), so callers may combine unrelated
 * emails into one call.
 */
export async function sendBatchEmails(emails: OutgoingEmail[]): Promise<{ sent: number }> {
  if (emails.length === 0) return { sent: 0 };
  if (!isEmailEnabled()) {
    console.log(`[email] disabled — skipping batch of ${emails.length}`);
    return { sent: 0 };
  }
  const from = process.env.EMAIL_FROM!;
  let sent = 0;
  for (let i = 0; i < emails.length; i += BATCH_MAX) {
    const chunk = emails.slice(i, i + BATCH_MAX);
    const ok = await withResendRetry(() =>
      getClient().batch.send(
        chunk.map((e) => ({ from, to: e.to, subject: e.subject, html: e.html }))
      )
    );
    if (ok) sent += chunk.length;
  }
  return { sent };
}
