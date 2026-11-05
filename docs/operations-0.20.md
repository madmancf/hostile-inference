# Hostile Inference — local operating procedures

Build 0.20.0. Local implementation and rehearsals only; nothing deployed. Node 24+ on a Unix host. Full graphics, simulation rules and the approved leaderboard formula are unchanged. Sustained local capacity evidence is recorded separately from hosted capacity and 60 FPS certification.

## Operator access

Run the operator CLI from the **running release**. It connects through a Unix socket inside an owner-only `/tmp/hi-ops-<uid>/` directory. There is no HTTP administration route or browser-accessible operator credential. The socket is independent of `TMPDIR`, and both its directory and socket permissions are checked/set for the operating user.

`--data` names the absolute private directory containing `accounts.sqlite`. For the workspace preview this is `.runtime/accounts`; a portable server uses its configured `HI_DATA_DIR`. The preview's legacy journals remain under `.runtime/ranked`; portable data uses `legacy-ranked` beside the database. Backups normalize those locations automatically.

```sh
node scripts/operate.mjs status --data /absolute/private-data
node scripts/operate.mjs drain --data /absolute/private-data
node scripts/operate.mjs disable --data /absolute/private-data
node scripts/operate.mjs resume --data /absolute/private-data
node scripts/operate.mjs retry --data /absolute/private-data --id MATCH_UUID
```

`drain` and `disable` persist across restarts. Both refuse new ranked tickets while allowing admitted operations, account access and practice to continue. `drain` describes a planned update; `disable` is an operational hold. Neither silently discards a match or pauses its server clock. Only explicitly resume when the service is ready.

Status exposes admission, unfinished work, worker activity, queue age, durable attempt counts, next retry time, failed job IDs, retry counters and storage-error counters. Alerts flag failed jobs, queues older than 60 seconds and observed persistence errors. Process-local counters reset on restart; job history and failure codes remain durable. Structured error logs and the status command are local observability, not a configured hosted alerting service.

## History and capacity

The server keeps admitted command journals in memory while they are issued, active or verifying. Completed runs stay in SQLite and are fetched on demand; failed jobs are read as bounded summaries until an operator retries one. Account history is an indexed, 25-row page with SQL aggregates. Leaderboard reconstruction streams eligible rows and retains only each player's best result per rival/rules version. No command log or verified result is deleted by this change.

Default admission remains eight unfinished runs and 60 starts per hour. Failed verification jobs reserve a place until recovered, so an outage cannot accumulate unbounded pending work. The account-backed hourly start count survives restarts. Status includes the live-map count and capacity limits; failed-job details are capped at 100, with an explicit truncation indicator. A different configured capacity requires its own sustained test; this release makes no claim about 50 simultaneous players or hosted capacity.

The added indexes do not change schema 4 or its logical records. Version 0.19 remains a same-rules/schema rollback candidate after draining. Backup file hashing and logical database hashing stream the contents and preserve the previous fingerprint format; a large history is no longer copied into a single JavaScript object for verification. Online snapshots still impose a write barrier: rehearse snapshot duration for the intended host and database size before scheduling them during play.

`npm run test:history` checks cold-history ownership, idempotency, bounded residency, indexed reads and restart-preserved admission limits. `npm run test:capacity-soak` runs for 30 real minutes, creates 10,000 synthetic archived matches in a disposable directory, uses eight legal command streams over loopback HTTP, interrupts active play and a running verifier, and validates commands/results/ranks after backup and restore. It needs temporary disk space for the database and two copies; all fixtures are removed on completion or a handled interruption. Its report explicitly distinguishes historical fixtures from newly replay-verified victories. Nothing is sent to the public preview or external services.

## Verification recovery

Submission commits the intent to verify before acknowledging it. Each worker attempt is recorded before it starts. The process queue is reconstructed from durable events, including jobs interrupted by a process kill. Only one worker executes at a time; worker memory and a 15-second execution budget remain bounded.

Infrastructure failures retry automatically, up to five attempts, with delays of 1, 3, 10 and 30 seconds. Temporary settlement failures retry too. If storage cannot even record a failure, the persisted running lease remains recoverable after its timeout or restart. A rules-bundle mismatch requires operator attention immediately; it is never a player rejection.

Exhaustion produces `verification_failed`, with the accepted commands retained. The player sees a delayed-result message and can check the saved result later. Such a result contributes no points. Use `status` to find the job, correct the server/storage problem, and target that ID with `retry`. This resets a bounded attempt cycle. Rejected replays and committed results cannot be retried or overwritten by this command. There is no force-score or force-verify control.

Settlement uses a stable event ID and an atomic SQLite transaction covering the event, match state and result projection. Repeating finalization or losing the acknowledgement after commit does not award another result. The leaderboard reads only committed verified rows. Known invalid commands and replay disagreement remain rejections; unknown worker faults are infrastructure failures.

## Planned update and rollback

Season Zero's rules and season ID are pinned in private storage. This build supports **drained updates with the same rules**, not a rules-changing rolling deployment. Keep the previous compatible immutable release and its full art files for rollback. Rollback after migration requires schema 4. Version 0.17 has operational controls but cannot read the new account-safety tables; retain its pre-migration backup rather than starting it on migrated data.

1. Run `drain`. Poll `status` until `safeToUpdate` is `true`. Issued, active, verifying and failed verification jobs must all finish or be recovered. Failed jobs cannot be hidden by toggling admission.
2. Make and verify a fresh backup as below.
3. Validate the candidate:

   ```sh
   node scripts/operate.mjs update-check --data /absolute/private-data --release /absolute/candidate-release
   ```

   It checks operational/schema compatibility, public and private file hashes and the actual frozen rules. It does not switch processes or publish anything.
4. Stop the old process gracefully through its supervisor. Start the candidate against the same private data. A separate SQLite ownership lock prevents two supported processes from using that data concurrently and is released by the OS after a crash.
5. Check `/healthz`, operator status, sign-in and saved results. Admission remains drained. Only then run `resume`.
6. For rollback, drain and preflight the retained compatible release, stop the new process, start the retained release with the same data, check saved results, then explicitly resume. Do not restore an older backup merely to roll code back; that would discard newer acknowledgements.

A crash/restart on compatible rules recovers accepted command logs and pending verification. Planned updates wait for all work to finish. A different rules hash or future storage schema refuses startup. A new season or incompatible schema transition needs a separately planned migration; this CLI cannot bypass the freeze.

New verified starts carry their browser build ID. A stale browser must reload before starting after an update. Reconnect checks the ticket's rules before simulation. Account history and leaderboard debrief links open immutable saved result summaries, including old results, without simulating them with current code. Historical 3D replay hosting is not implemented.

## Backup

```sh
node scripts/operate.mjs backup --data /absolute/private-data --destination /absolute/private-backups/unique-name
node scripts/operate.mjs verify-backup --source /absolute/private-backups/unique-name
```

The destination's parent must already exist. Every backup uses a new directory and refuses to overwrite one. Store it outside the live data and release/static directories. The backup includes credential hashes, recovery hashes, sessions and private command logs: keep it private. No backup is included in the runtime/source distribution or served by HTTP.

Ranked writes briefly wait at a barrier while existing writes finish. SQLite `VACUUM INTO` takes a consistent committed snapshot, including WAL content; legacy journals are copied while ranked writes remain held. The manifest records checksums, schema, rules, timestamp and logical-state fingerprint. Files and directories are synced, and the manifest is written last. Integrity and foreign-key checks are required. This follows SQLite's [documented snapshot semantics](https://www.sqlite.org/lang_vacuum.html); copying only a live main database file would omit uncheckpointed WAL data.

An interrupted or incomplete backup is not a recovery point. Verification rejects missing manifests, changed bytes, unexpected files and symlinks. Backups are operator-triggered here. Scheduling, off-host encrypted retention and a hosted recovery-point/restore-time guarantee remain public operations work; do not infer a five-minute backup interval from the local drill.

## Restore to a clean instance

```sh
node scripts/operate.mjs restore --source /absolute/private-backups/unique-name --destination /absolute/new-private-data
```

The target must not exist; its parent must exist. The tool validates the full backup before creating it, copies and rechecks the data, and writes a restore receipt. An interrupted restore leaves a `.restoring` marker that prevents server startup. It never overwrites a live or existing directory.

Use a compatible release with the restored rules. Admission is forced to `draining` on the new instance. Verify sign-in, allegiance, scores, ranks, contribution and pending jobs before explicitly resuming. Sessions are preserved by this recovery procedure; it is not a credential-compromise response. Wall-clock match deadlines are preserved too: after an outage, expired active runs settle from their acknowledged commands rather than gaining time.

Retain the original directory until the restored instance is accepted. A backup contains only acknowledgements through its snapshot point; later acknowledgements require newer backups or the original live data. This build does not implement point-in-time log shipping.

## Evidence and remaining gates

The local tests inject crashes, timeouts, storage failures before and after commit, repeated finalization, bounded exhaustion, operator retry, a hard process kill and corrupted backups. All three factions produce verified victories through recovery. The v0.17 baseline includes a portable Node 24 update/rollback drill. Version 0.19 separately verifies schema-2 backup migration, current-schema restore and packaged account controls; exact current receipts specify which release was exercised. Background browser checks cover saved results, delayed verification, operator recovery and normal faction entry.

The source workspace retains `docs/local-build-0.19.md` and `provenance/servers/local-game-v0.19-verification.json` with exact build/test evidence. Remaining public gates include real email delivery and support contacts, hosted capacity and edge controls, newcomer playtests, full-quality FPS certification, rights review and real hosting/origin/backup scheduling. No deployment is authorized by these procedures.

## Account and standings controls (0.19)

Storage schema 4 adds the durable email delivery queue to the schema-3 account-safety tables. A schema-2 or schema-3 backup can restore to a fresh directory and migrate on startup. Do not roll a schema-4 database back into a 0.17 executable. Keep the pre-migration backup; rollbacks after migration require another schema-4 build. Existing player/gameplay rows are not reset.

Commands use the private socket and the same `--data` argument:

- `signups --state paused|open` pauses creation without blocking existing logins.
- `publication --state paused|open` pauses public standings without discarding verified results.
- `reports` lists up to 100 open reports; `resolve-report --id UUID --state resolved|dismissed` records disposition.
- `moderate --id PRIVATE_USER_ID --action suspend|restore|rename --reason "Documented reason"` changes eligibility or, with `--callsign "New name"`, renames a callsign. Suspensions revoke sessions and exclude points immediately. Reports never automatically suspend.
- `mail-outbox` reads up to 100 unexpired local messages. It exposes secret recovery links only to the local operator. Do not paste its output in public logs. This is an outbox simulator, not email delivery. Links are single-use and expire after 30 minutes.

Release mode requires verified email for ranked starts and disables the local mail outbox. The Resend adapter is implemented; public opening remains blocked on supplying credentials/domain settings and proving actual inbox delivery. Loopback rehearsal defaults to the outbox; HI_MAIL_CONFIG opts into Resend with an explicit test-recipient allowlist; `HI_REQUIRE_VERIFIED_EMAIL=1` rehearses the email gate. Production hosting is not authorized by this package.

Default client identity is the socket peer. `HI_TRUSTED_PROXIES` accepts only exact immediate proxy IP addresses. A configured proxy must strip and overwrite `X-Real-IP`; forwarded chains and headers from untrusted peers are ignored. IPv6 sources share a /64 abuse bucket. Do not enable proxy trust before checking the real deployment path.

Sign-up: five attempts per source/hour. Login: 60 per source/15 minutes, 12 per source/account, 100 per account. Recovery: 16 per source/15 minutes, eight per source/account, 100 per account. Two scrypt jobs maximum. Leaderboard reads allow 120/source/minute. Ranked command/result routes allow 240/account/minute and 2,400/source/minute, above ordinary one-second recording cadence. Busy and throttled requests provide Retry-After. These controls reduce abuse; they do not prove one person per account or resist an unlimited distributed attack. Public edge controls remain a hosting task.

Use a fresh data directory for the public season; never copy local QA data. The portable archive contains no accounts/results. Before publication, set the approved contact details and recovery provider, configure/verify backup retention (proposed maximum 30 days), off-host backups, restore-time targets and monitoring. Deleting an account removes active-store identity and public contribution; older backups retain it until rotation. Reports/audit reasons expire after 90 days; outbox/tokens after 30 minutes; source counters after 24 hours.

Security design references: [OWASP recovery guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html). Local tests, not a third-party security certification.

## Resend delivery in 0.19

See `docs/email-setup-0.19.md` in the source package (EMAIL-SETUP.md in the portable package). Real sending is opt-in through HI_MAIL_CONFIG; never use the local mail outbox as production delivery. Private operator commands `mail-status` and `mail-admission --state paused|open` inspect or pause the durable queue without exposing links or addresses. Backups include delivery jobs; restore starts email paused as well as ranked admission drained. Review pending jobs and explicitly resume email only on the intended instance.

This release migrates storage from schema 3 to 4. Drain and back up with the old executable first, verify that backup, stop the old server, and rehearse the new executable on a restored copy before changing live storage. The old same-schema update-check intentionally refuses this migration. Never run 0.18 on migrated storage. Rollback across this boundary requires a fresh restore of the pre-upgrade snapshot with 0.18; preserve newer data separately. Same-schema checks work after migration.
