# Email setup (Resend + domain)

Hoops Master sends transactional email through [Resend](https://resend.com). Sending
is gated two ways: the env vars below must be set, **and** the LaunchDarkly
`email-notifications` flag must be on (see
[`launchdarkly-vercel-setup.md`](./launchdarkly-vercel-setup.md)). With neither, the
app no-ops and logs `[email] disabled` — safe for local dev.

| Piece | Value in this project |
|-------|-----------------------|
| Provider | Resend |
| Sending domain | `mail.michalfasanek.cz` (a subdomain of the owner's `michalfasanek.cz`) |
| From address | `Hoops Master <hoopsmaster@mail.michalfasanek.cz>` |
| Inbound (optional) | ImprovMX forwards `@mail.michalfasanek.cz` → owner's Gmail |

Using a dedicated `mail.` subdomain isolates the app's sending reputation from the
root domain and avoids clashing with any existing mail on `michalfasanek.cz`.

## 1. Verify the sending domain in Resend

1. Resend → **Domains** → **Add Domain** → `mail.michalfasanek.cz` (pick the EU
   region — recipients are in Czechia).
2. Add the DNS records Resend shows, on the domain's DNS host:
   - **DKIM** — TXT on `resend._domainkey.mail.michalfasanek.cz`
   - **SPF / Return-Path** — MX + TXT on `send.mail.michalfasanek.cz` (note: the
     receiving record lives on the `send.` sub-subdomain, which is why the `mail.`
     name itself stays free for inbound forwarding below)
   - **DMARC** (recommended) — TXT on `_dmarc.mail.michalfasanek.cz`
3. Wait for **Verified**, then create an API key under Resend → **API Keys**
   (sending access is enough).

No mailbox is required for the from-address — Resend only needs DNS ownership.

## 2. Environment variables

Set locally in `.env.local` and in the Vercel project (all three), then redeploy:

```bash
RESEND_API_KEY=re_xxx                                        # Resend → API Keys
EMAIL_FROM="Hoops Master <hoopsmaster@mail.michalfasanek.cz>" # in Vercel: paste WITHOUT quotes
EMAIL_REPLY_TO=misa.fasa+hoopsmaster@gmail.com               # optional; where player replies land (from-address is unmonitored)
CRON_SECRET=xxxxxxxx                                          # openssl rand -hex 32 — same literal value both places
```

`CRON_SECRET` is a shared secret: Vercel Cron sends it as `Authorization: Bearer
<secret>` and `/api/cron/event-reminders` compares against the env var. Generate it
once and reuse the same value everywhere.

## 3. Turn it on

Enable the LaunchDarkly `email-notifications` flag (kill-switch — default/fallthrough
must serve `true`; per-user rules do NOT apply, it evaluates on the synthetic key
`hoops-master-backend`). Emails start flowing on the next dispatch (bench promotions
immediately; the 48h reminder at the daily 07:00 UTC cron).

## 4. Inbound forwarding (optional — for the sender avatar + replies)

Not needed for sending. Set it up if you want to (a) create a Google account for the
from-address so Gmail shows a profile-photo avatar, or (b) receive player replies.

Using **ImprovMX** (free, DNS-host-agnostic):

1. improvmx.com → add domain `mail.michalfasanek.cz` → forward to the owner's Gmail.
2. Add on the `mail` subdomain (does NOT conflict with Resend, which uses `send.`):
   - MX `mail.michalfasanek.cz` → `mx1.improvmx.com` (10), `mx2.improvmx.com` (20)
   - TXT `mail.michalfasanek.cz` → `v=spf1 include:spf.improvmx.com ~all`
3. Verify, send a test to `hoopsmaster@mail.michalfasanek.cz`, confirm it lands in
   Gmail. Now Google-account signup for that address (or a "reply") reaches the inbox.

(If DNS is on Cloudflare, its built-in Email Routing can replace ImprovMX where it
supports the subdomain.)

## Local testing

```bash
# Reminder cron (needs a game within 48h + email-notifications on):
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/event-reminders
# Second run immediately after → {"events":0} (idempotent).
```

Check the Resend dashboard → **Emails** for delivery status, and the dev-server log
for `[email]` lines. Bench-promotion emails fire from any promotion; watch the
`email_outbox` table drain post-commit.
