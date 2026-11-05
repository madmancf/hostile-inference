# Security policy

Report vulnerabilities privately through
[GitHub private vulnerability reporting](https://github.com/madmancf/hostile-inference/security/advisories/new).
Do not open a public issue containing credentials, private player data, an
account takeover recipe, or a working leaderboard exploit.

Include the affected commit, local reproduction steps, expected/actual result,
and impact. Use disposable local accounts. Do not test against an installation
you do not own. There is no bug bounty or guaranteed response deadline.

Only the current `main` branch is maintained. This is pre-release software, not
a production service announcement. Publishing source does not establish a secure
hosted deployment. The development server binds to loopback and is for local use.
Use the packaged allowlisted server for deployment planning, with independent
review of HTTPS, persistent storage, email, proxy trust and backup configuration.

Replay verification rejects invalid game results; it does not prove human play
or prevent one person creating multiple accounts. See `docs/ROADMAP.md`.
