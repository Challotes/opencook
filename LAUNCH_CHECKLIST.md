# Launch Checklist

> **Temporary file** — the single "what the operator must DO to go live" list, gathered
> from every phase. It is NOT a record (the *decisions* live permanently in DECISIONS.md /
> ROADMAP.md / `.env.example`); it's a do-list for deploy day. **`git rm` this at
> launch-close** (same lifecycle as LAUNCH_PLAN.md). Work it top to bottom at Phase 9.
>
> Build status: Phases 1–7 COMPLETE. Phase 8 (cross-device QA) done. Remaining: 9 (deploy).
> This list is executed during 8–9.

## 0. Deployment approach — Railway + closed-alpha-first

> **Platform = Railway** (the repo is already wired: `railway.toml` + `Dockerfile`, `/data` volume).
> **NOT a self-managed VPS** — see DECISIONS "Deploy on Railway, NOT a self-managed VPS". Decider:
> a VPS exposes the server-wallet key (`BSV_SERVER_WIF`) to anyone with root; Railway keeps it in
> your own env vars. **Sequence: closed alpha first, then public.**

### Closed alpha — small trusted group, unadvertised, at `alpha.opencook.fun`
- [ ] Connect the GitHub repo to a new Railway project (uses the existing `railway.toml`/`Dockerfile`).
- [ ] Add a **Volume** mounted at `/data` (matches `DATABASE_PATH=/data/local.db`).
- [ ] Set the env vars from §1 — **including `CONTENT_DENYLIST`** (the one that silently fails open). Leave `BSV_WALLET_SPEND_DISABLED` unset; do NOT set `PORT` (Railway injects it).
- [ ] **Fund the server wallet** (§2).
- [ ] **Point `alpha.opencook.fun`** at the service (Railway → service → Settings → Networking → Custom Domain → add the CNAME it shows at your DNS provider; SSL auto-provisions). Leave the apex `opencook.fun` parked/unpointed.
- [ ] **Gate it** — *simplest:* just don't advertise the URL (enough for a small trusted group). *One notch up:* a small net-new `middleware.ts` doing HTTP Basic-Auth against a shared-password env var (e.g. `ALPHA_GATE_PASSWORD`), gating the whole site EXCEPT `/api/health` (so UptimeRobot still works). ~15 lines, no library; remove/disable to go public. *(No `middleware.ts` exists yet — this is net-new.)*
- [ ] **UptimeRobot** on `https://alpha.opencook.fun/api/health?token=<HEALTH_TOKEN>` (§3).
- [ ] **Legal minimum for a closed alpha** *(practical risk framing, NOT legal advice)*: `CONTENT_DENYLIST` set; fill the cheap `[TODO]`s — **contact email + effective date** (⚠️ the operator's real legal name goes in the DEPLOYED/visible copy ONLY — never commit it to the public repo, Hard Rule #6); confirm the **PermanenceGate** acknowledgement fires before the first post. The 3 `[LAWYER]` hard clauses, DMCA-agent registration, and the binding jurisdiction/liability/age `[TODO]`s WAIT for public (§4).

### Alpha → public (`opencook.fun`) — a flip, not a rebuild
- [ ] Point the apex `opencook.fun` (+ `www`) at the **SAME** Railway service (same `/data` volume → the alpha's posts + funded wallet carry over; decide deliberately if you instead want a clean DB).
- [ ] Remove the alpha gate (delete the middleware / unset `ALPHA_GATE_PASSWORD`).
- [ ] Update the UptimeRobot URL to the apex.
- [ ] Complete §4 legal (lawyer pass on the 3 hard clauses + fill the binding `[TODO]`s + register the DMCA agent) and §5 verification (smoke test + confirm `x-forwarded-for` carries a real client IP).

### Railway gotchas (know these before the first deploy)
- **Build:** `railway.toml` is set to `nixpacks`, but a `Dockerfile` (which installs `python3 make g++` to compile the native `better-sqlite3`) also exists. On the FIRST deploy, **watch the build log confirm `better-sqlite3` compiled**; if it fails, switch the builder to the Dockerfile.
- **DB backups are thin on Railway** — set up a simple periodic copy of `/data/local.db` off-box (it holds posts + earnings).
- **`x-forwarded-for`** — verify on the first real deploy that requests carry a genuine client IP (the cloudflared-tunnel testing masked this); every per-IP cap depends on it.
- **In-memory caps** (daily spend, rate-limit windows) reset on every redeploy — documented + acceptable; just don't be surprised by a burst of redeploys near launch.
- **`user-agent` must reach the app** — the in-app-browser gate fails SAFE on a missing UA (empty UA → splash). So if a proxy ever strips the `user-agent` header, *everyone* gets the in-app splash. Not unsafe (installed PWAs self-rescue via the standalone guard; everyone else has the one-tap `?continue=1`), but if "every visitor suddenly sees the open-in-browser splash," check the proxy is forwarding `user-agent`.

## 1. Environment variables (Railway → service → Variables)

- [ ] `BSV_SERVER_WIF` — server wallet private key (WIF). Required for on-chain post logging + server-funded free boosts. Without it, posts save to DB only (no on-chain fingerprint).
- [ ] `ANTHROPIC_API_KEY` — required for the "Ask AI" agent chat.
- [ ] `GROQ_API_KEY` — *(optional but recommended)* powers the compose-box voice-to-text mic (`/api/transcribe` → Groq Whisper). Free key, no card, from https://console.groq.com/keys (free tier 2,000 transcriptions/day). Unset = the mic shows "voice input offline" on tap; everything else works. *(optional)* `TRANSCRIBE_DAILY_LIMIT` caps daily transcription calls (default 2000).
- [ ] `CONTENT_DENYLIST` — illegal-floor pre-publish filter (Phase 3). **MUST be set before public launch** (unset = permissive/no filtering). Patterns one-per-line or comma-separated; `/regex/` or substring. Scope to ILLEGAL content only. NOT committed.
- [ ] `HEALTH_TOKEN` — bearer token gating `GET /api/health` (Phase 5). Set a long random string; you'll put it in the UptimeRobot URL.
- [ ] `DATABASE_PATH=/data/local.db` — points SQLite at the mounted volume (see §2).
- [ ] *(optional)* `SERVER_DAILY_SPEND_SATS` — daily server-wallet spend ceiling (default ~1,721,170 = ~$0.20/day). Tune or leave default.
- [ ] *(optional)* `ONCHAIN_POST_IP_LIMIT` — per-IP daily on-chain post cap (default 200). Tune or leave default.
- [ ] Leave `BSV_WALLET_SPEND_DISABLED` **unset** — that is the emergency kill-switch (set to `true`/`1` only to halt all server spending in a drain/leak emergency; takes effect on redeploy).
- [ ] `PORT` — Railway sets this automatically; do not override.

> Full descriptions with inline comments are in `.env.example`.

## 2. Infrastructure

- [ ] **Fund the server wallet** — send some sats to the `BSV_SERVER_WIF` address (covers free boosts + post-logging fees; ~66 sats/post, ~1,000+ sats/free boost). Watch the low-balance alert (§3) and top up.
- [ ] **Mounted volume** for the SQLite DB at `/data` (so the DB survives redeploys), matching `DATABASE_PATH`.
- [ ] **Trusted proxy must set `x-forwarded-for` / `x-real-ip`** — Railway does this by default. **Every per-IP control depends on it** (the 200/day post cap, free-boot cap, all route rate limits). If a deploy ever strips both headers, header-less requests share one bucket → free boots silently all become paid and posts can hit a shared daily cap. Verify after first deploy by checking a couple of requests carry a real client IP.

## 3. External services

- [ ] **UptimeRobot monitor** on `GET /api/health?token=<HEALTH_TOKEN>` (Phase 5):
  - HTTP(s) monitor, 5-min interval, your email as the alert contact.
  - Alerts on any non-200 — the endpoint returns **503 when a critical condition trips** (wallet low, posts not anchoring, kill-switch on, daily spend ceiling hit) and on full server-down.
  - *(optional)* add a keyword check: alert if the body does NOT contain `"ok":true`.
  - Bookmark the same URL — it's your at-a-glance health page.

## 4. Legal / owner (Phase 3 — NOT build blockers, but do before public launch)

- [ ] **~1 hour with a lawyer** on the 3 hard risks flagged in the legal drafts: GDPR-erasure-vs-immutable-chain, CSAM/operator-as-broadcaster, money-transmitter exposure (the `[LAWYER]`-marked clauses).
- [ ] **Register a DMCA agent** (the drafts deliberately leave the process to a lawyer decision).
- [ ] **Fill the `[TODO]` placeholders** in `legal/terms-of-service.md`, `legal/privacy-policy.md`, `legal/permanence-acknowledgement.md` — operator legal name, jurisdiction, contact email, effective dates.

## 5. Pre-launch verification

- [ ] **Cross-device QA** (Phase 8) — post / boost / install / deposit on iPhone + Android + desktop.
- [ ] **Production smoke test** — `npm run build` green; post a test idea and confirm it lands on-chain (check the tx); do one free boost + one paid boost; open `/api/health` and confirm `"ok": true`.
- [ ] Confirm `CONTENT_DENYLIST` is actually set (the one item that silently fails open if forgotten).

---

*When every box is ticked and you're live: `git rm LAUNCH_CHECKLIST.md` and commit — the launch is closed.*
