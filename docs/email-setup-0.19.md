# Resend verification and recovery

The local adapter and provider-contract tests are implemented. No provider account, DNS records or real emails were created. The owner selected Resend and deferred domain details. Do not enable delivery until the following values are supplied and checked.

## Details needed

1. Owned domain and DNS host (for example Cloudflare or the registrar). A dedicated sending subdomain such as `mail.your-domain.com` can isolate transactional mail settings; this is a placeholder, not a purchased domain.
2. Sender address, for example `accounts@mail.your-domain.com`. Messages use the display name **Hostile Inference**. Supply a real monitored reply-to address separately.
3. Resend's exact verification records for that sending domain. Add the SPF and DKIM records shown in its dashboard and confirm the domain becomes verified. Review DMARC with the domain's existing mail setup. Do not invent DNS values or overwrite existing mail records. Disable click/open tracking for authentication emails.
4. A Resend API key with **Sending access**, restricted to that domain. Store it in the private key file below, not chat, source code, command arguments or a public browser variable.
5. An explicitly authorized test inbox. Local real-mail mode refuses any recipient outside the configured list, including old queued messages after an allowlist change.
6. Intended game HTTPS origin, when decided. For a local inbox test the link uses the loopback origin and must be opened on this Mac. The test does not need a public deployment or tunnel.

## Private local configuration

Prepared workspace files (both mode 600, under the private `.runtime/email` directory):

- `config.json`: currently `provider: "disabled"` with placeholders. Change to `resend` only after completing every field.
- `resend-key.txt`: currently empty. Paste only the sending API key into this file.

The JSON fields are:

```json
{
  "provider": "resend",
  "from": "accounts@mail.your-domain.com",
  "replyTo": "support@your-domain.com",
  "apiKeyFile": "/absolute/private/path/resend-key.txt",
  "testRecipients": ["your-authorized-test-inbox@example.com"]
}
```

An empty allowlist is rejected in loopback mode. On a future HTTPS production server an empty list permits real players; preserve a list for controlled staging. The runtime uses only `https://api.resend.com/emails`; there is no configurable external endpoint. It validates configuration before accepting requests. Private config/key files cannot be symlinks or readable by other users.

For an isolated local rehearsal, after supplying details:

```sh
HI_MAIL_CONFIG=/absolute/private/path/config.json \
HI_LOCAL_REHEARSAL=1 HI_REQUIRE_VERIFIED_EMAIL=1 \
HI_PUBLIC_ORIGIN=http://127.0.0.1:4180 \
HI_DATA_DIR=/absolute/private/rehearsal-data \
node server.mjs
```

Do not launch a second process against the user's live account database. Use the portable package and a separate data directory. The managed development preview defaults to local outbox simulation; configuring an unrelated shell does not reconfigure that running process.

## Delivery behavior and operating controls

Verification/reset requests commit a token hash and an immutable delivery job together. The 30-minute token stays single-use. Provider requests happen outside the player request handler, with one in-flight send, a 10-second timeout and at most six attempts. Network failures, rate limits and transient server errors retry with backoff; Retry-After is respected within the token lifetime. Every retry uses the same Resend idempotency key and exact payload bytes. Permanent errors stop and require a fresh request. Per-address and global quotas bound mail volume in addition to existing account/source limits.

Provider acceptance is recorded as **accepted**, never as proof of inbox delivery. Message content is cleared after acceptance, cancellation or final failure. Minimal status rows last seven days. Queued content is private server data and must be protected in backups. API keys are never stored in the database or backups. Mail content is sent to Resend for delivery; its own retention applies separately. No public delivery-webhook endpoint is exposed in this local build; provider dashboards and the real inbox test are required to assess delivery/bounces before launch.

Private socket commands (run from the source workspace or portable package):

```sh
node scripts/operate.mjs mail-status --data /absolute/private/data
node scripts/operate.mjs mail-admission --data /absolute/private/data --state paused
node scripts/operate.mjs mail-admission --data /absolute/private/data --state open
```

Status omits keys, recipients, message bodies and links. Restore starts sending paused. Review the instance and configuration before resuming. An old simulator outbox is never flushed into Resend. Switching origin or restricting test recipients cancels incompatible queued messages. Start a fresh email request after changing sender or origin configuration.

Schema 4 stores these jobs. Back up schema-3 data before upgrading; old 0.18 executables intentionally refuse schema 4. A cross-schema rollback requires restoring the pre-upgrade backup into a fresh directory; never point an old executable at migrated data.

## Remaining live acceptance test

After credentials/domain/test inbox are supplied, request verification through the UI, confirm arrival in that inbox, inspect authentication/tracking settings, confirm the link on this Mac, request password recovery, reset, verify old-session revocation and fresh login, and check rank/contribution remain intact. Try a used/expired link. Inspect Resend's accepted/delivered/bounce status for the same message IDs. Only then label real mail delivery verified. No deployment is required or authorized.

Primary references: [Resend sending API](https://resend.com/docs/api-reference/emails/send-email), [idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys), [domain verification](https://resend.com/docs/dashboard/domains/introduction), [sending-only API keys](https://resend.com/changelog/new-api-key-permissions).
