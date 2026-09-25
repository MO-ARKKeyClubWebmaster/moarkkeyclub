# Turning on email notifications — 5 steps (~10 min)

The email system is already written into `worker.js`. It stays **completely off
and harmless until you add one API key**, so you can deploy the Worker now and
finish this whenever. Nothing about the portal changes until the key is set.

## What sends automatically once it's on
- **New submission** → emails the Editor ("Division X submitted their October newsletter").
- **Editor approves** → emails the Webmaster ("ready for final approval").
- **Webmaster approves** → emails that LTG ("your newsletter was approved 🎉").
- **Returned for revision** → emails that LTG with the reviewer's comment.
- **Deadline reminders** → 3 days and 1 day before the 10th (newsletters) and the
  30th (MRFs), only to LTGs who haven't submitted yet.

All emails are branded navy/gold and link straight into the portal.

## Steps
1. **Resend account + domain.** Go to resend.com, sign up (free — 3,000 emails/mo).
   Add the domain **moarkkeyclub.com**, then add the DNS records it shows you in
   Cloudflare DNS. Wait until it says **Verified** (usually a few minutes).
2. **API key.** In Resend → API Keys → Create. Copy it.
3. **Add the secret to the Worker.** Cloudflare dashboard → your `moark-portal-api`
   Worker → **Settings → Variables and Secrets** → Add → type **Secret** →
   name it exactly `RESEND_API_KEY`, paste the key → Save.
4. **Add the reminder schedule.** Same Worker → **Settings → Triggers → Cron
   Triggers → Add Cron Trigger** → enter `0 14 * * *` → Add. (Runs once a day.)
5. **Deploy** the updated `worker.js` (paste it into the Worker editor → Deploy,
   or `npx wrangler deploy`).

That's it. To test: submit a newsletter as an LTG, or approve one — the matching
email should arrive.

## Who gets what (edit if any address is wrong)
Recipient addresses live at the top of `worker.js` in the `OFFICER_EMAILS` and
`LTG_EMAILS` blocks — currently your `@moarkkeyclub.com` addresses. Div 4 and
Div 7 are set to `null` (vacant), so they're skipped. The "from" address is
`portal@moarkkeyclub.com`; change it in `EMAIL_FROM` if you'd rather send from a
different mailbox on the verified domain.

## Notes
- If a `@moarkkeyclub.com` address is a forwarding alias (Cloudflare Email
  Routing), sending and receiving can coexist — just follow Resend's DNS wizard;
  it uses its own subdomain so it won't clash with your inbound routing.
- Email failures never break the portal — they're caught and logged, and the
  submission/approval still goes through.
