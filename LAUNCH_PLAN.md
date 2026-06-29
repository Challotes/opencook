# Launch Plan

> ⚠️ **Working document — temporary.** This file is the active launch-prep scratchpad created 2026-05-09. At launch-close: strategic decisions promote into `DECISIONS.md` (under the "Platform & Distribution" heading), shipped buckets promote into `ROADMAP.md` as Phase 6.5 closeout, and this file gets **deleted via `git rm`** (not archived — git history preserves it). Do not treat as canonical reference once launch is declared done. Lifecycle owned by the agent — see memory `project_launch_plan_lifecycle.md`.

> Comprehensive launch readiness plan covering mobile polish, in-app browser handling, install/notifications flow, and the QR device-sync layer.
>
> Authored: 2026-05-09 (brainstorming session). Final synthesis: 2026-05-10.
> Status: pre-implementation. Two rounds of agent review complete; ready for build.
>
> **Read order:** CLAUDE.md → ROADMAP.md → DECISIONS.md → this file → SESSION_LOG.md

---

## Bucket status (2026-06-01)

| Bucket | Status | Evidence |
|---|---|---|
| 1 — Mobile polish | ✅ DONE | Commits `6ee6441` → `ff7a193` (5 modals → bottom-sheet), `6c56093` (Batch 1 tap-targets). Verified by agent audit 2026-06-01. |
| 2 — In-app browser splash | 🔨 BUILDING (2026-06-29) | **REVISED to a content-first "splash with a window"** (static feed preview + open-in-browser CTA), NOT a hard block — see DECISIONS.md D2. Funds-safe by construction (splash renders in `page.tsx` before `IdentityProvider`, so no key is minted in-app). |
| 3a — Welcome gate + identity flow | ✅ DONE | Components shipped: `useStandaloneMode`, `useInstallPlatform`, `InstallContext`, `InstallPitch`, `HomeScreenWelcomeGate`, `IosStorageToast`. Commit `111c0e2` is the landing point. |
| 3b — Notifications | ⏸ NOT STARTED | Blocked behind Bucket 4 (`publishPayout()` helper). No service worker exists. |
| 4 — Server resilience | ⏸ NOT STARTED | No `/api/broadcast` proxy. No `publishPayout()` helper. `tx.broadcast()` still direct. |
| 5 — Deploy + observability | ⏸ NOT STARTED | Owner hasn't deployed. Railway-prep config exists (Dockerfile, `.env.example` env-var DB path). |

**Decisions promoted to DECISIONS.md 2026-06-01** as part of partial-promotion checkpoint: D4 ordering flow, D5 welcome-gate copy discipline, D6 SW scope discipline, Status #4 first-earning wiring, Status #6 notification copy, Status #10 install pitch dismissal calibration, Status #12 iOS ITP sequencing, C4 standalone-mode detection, C5 SW + Next.js 16 integration. The original sections in this file remain for working context but the binding decisions live in DECISIONS.md.

**Earlier decisions already promoted:** D1 (PWA over App Store), D2 (in-app browser hard block), D3 (mobile bottom-sheet), D7 (QR sync post-launch), Welcome gate four-causes note, TAAL deferral / miner-agnostic guardrail.

**Buckets 2, 3b, 4, 5 remain the live working surface of this file.** When all five are shipped, this file gets `git rm`'d per memory `project_launch_plan_lifecycle.md`.

---

## Executive summary

OpenCook is feature-complete for launch — Phase 6 is shipped, real BSV is moving, fairness payments are live, identity flows are deeply hardened. The remaining work to reach a credible public launch is **resilience + cross-device polish**, not new features.

This plan captures the strategic decisions reached during the 2026-05-09 brainstorming session and sequences the work into **five buckets**:

1. **Mobile modal restructure** — adopt the existing AgentChat bottom-sheet pattern across the other six modals (in-house Tailwind, no library).
2. **In-app browser splash** — block X/Instagram/etc. webviews at the door with an "Open in Safari/Chrome" gateway page; protects from sandboxed-storage identity loss.
3. **Install + notifications flow** — gate the install pitch behind "user has saved a recovery file"; detect platform for one-tap (Android) vs visual instructions (iOS Safari) vs "open in Safari first" (iOS non-Safari); register a service worker so notifications are possible.
4. **Server-side resilience** (Phase 6.5 first item, already in ROADMAP) — `/api/broadcast` proxy with GorillaPool→TAAL ARC failover, server wallet sharing the client's resilience stack. This is the single biggest "won't get pulled back in by ARC outages" win.
5. **QR device sync** (future layer) — encrypted-blob handoff via short-lived server record + decryption key in the QR; plaintext WIF never leaves source device. **Not blocking launch.**

**Strategic decision logged**: web-first / PWA is the durable architecture for OpenCook. Not pursuing iOS App Store (Apple's 30% IAP cut + crypto-rejection patterns + UGC-with-payments scrutiny make it incompatible with the fairness model; spending months on submissions has high cost and low success rate). Google Play might be technically possible but Android-only would create a third storage silo and worsen identity confusion. The PWA install flow IS the "app experience."

---

## Where we are now (verified)

**Originally verified 2026-05-09. Refreshed 2026-06-04 — Bucket 1 and Bucket 3a have shipped since:**

| Surface | Current state |
|---------|---------------|
| `public/manifest.json` | Exists. `display: standalone`, theme `#f59e0b`, three icon sizes, `start_url: /`. Ready for install. |
| `src/app/layout.tsx` | Full PWA metadata: `manifest`, `appleWebApp.capable`, `mobile-web-app-capable`, `theme-color`, `apple-touch-icon`. Ready. |
| `AgentChat.tsx` | **Already has the bottom-sheet-on-mobile / centered-on-desktop pattern** (line 207–209). Pure Tailwind, no library. The pattern is `flex items-end sm:items-center` + `w-full sm:max-w-lg` + `rounded-t-2xl sm:rounded-2xl`. |
| `SignInModal`, `IdentityBar` (You modal), `MoveAddressModal`, `RestoreModal`, `ChangePassphraseModal`, `FundAddress` | **SHIPPED (Bucket 1):** all converted to the bottom-sheet pattern. Also: all 7 centered modals use `svh` instead of `vh` for top-offset + max-height so Android Chrome's toolbar can't clip them (2026-06-03). |
| Service worker | **Does not exist.** Required before push notifications. Bucket 3b. |
| `beforeinstallprompt` capture | **SHIPPED (Bucket 3a):** captured in `InstallContext`, consumed by `promptInstall()`. Android Chrome single-tap install works via `<InstallPitch>`. |
| `display-mode: standalone` detection | **SHIPPED (Bucket 3a):** `useStandaloneMode` hook. Install pitch hides automatically when already installed. |
| In-app browser detection | **Not implemented anywhere.** X/Instagram/Discord webview users hit the live app and create sandboxed identities they will lose. Bucket 2. |
| QR sync | Not implemented. Manifest of recovery file (`backup-template.ts`) is the only cross-device bridge today. Bucket 6 (post-launch). |

**The pattern is in-house.** AgentChat proves the responsive bottom-sheet works in this codebase. We don't need vaul or any other library — adopting the same Tailwind classes across the other modals is the work.

---

## Definition of "launch"

Reached when:

1. iPhone Safari users get a coherent mobile experience: no oversized modals, taps land, downloads work, the recovery file flow is bullet-proof.
2. Users arriving from in-app browsers (X, Instagram, Discord, etc.) are redirected out before they create a sandboxed identity that will get wiped.
3. Users who save a recovery file get a clear path to install OpenCook to their home screen with notifications enabled.
4. The server-side broadcast path has the same resilience the client path got in April 2026 (no ARC outage = no platform freeze).
5. Deployed to Railway with custom domain.

QR device sync is **not** in this list. It's a polish layer to ship after launch.

---

## Decisions reached this session (filtered against DECISIONS.md)

These are NEW decisions from the 2026-05-09 brainstorm, recorded here for future-proofing. They will be promoted into DECISIONS.md when implementation begins. Each was checked against existing settled decisions; no relitigation.

### D1. Web-first / PWA, not native apps

Stay web-first. Do not pursue iOS App Store or Google Play. The PWA install flow IS the app experience.

**Why:** Apple's 30% IAP cut is incompatible with sat-level boot fees. Apple has rejected nearly every BSV/crypto-payments app. UGC-with-payments triggers their highest moderation tier. Months of submission with low success probability is a category cost we cannot absorb. Google Play alone creates an Android-only third sandbox and worsens identity confusion. Web-first is also the only model compatible with the open-source / "platform that builds itself" / "anyone can spawn a project" thesis — apps assume gatekeepers.

**Anti-patterns to avoid:** retrofitting the boot flow through Apple IAP (would destroy the economics); shipping Android-native first then iOS later (creates sandbox asymmetry); using a thin native shell over the web app via Capacitor/etc. (still triggers the IAP review).

**Revisit when:** all three are simultaneously true — major traction (>5k WAU), iOS PWA notifications still painful enough to lose users, and a clear App Store policy path opens. Until then, treat the question as settled.

### D2. In-app browsers are blocked, not supported

Detect known in-app browsers (Facebook, Instagram, X/Twitter, TikTok, LinkedIn, WeChat, Line, Discord, Snapchat, Pinterest, Reddit, Slack, Telegram, KakaoTalk) at the root layout and serve a splash page with logo + "Open in Safari/Chrome" button + visual instructions. Search-engine crawlers (Googlebot, Twitterbot link-preview fetchers, etc.) bypass the splash so SEO/OG previews still work.

**Why:** in-app browsers have isolated localStorage that diverges from the user's real browser, sometimes wipes between sessions, and never supports notifications. Letting users in creates a phantom identity that gets lost. Blocking at the door is more honest framing ("open in Safari so your account stays with you") and protects the user from creating an account they cannot recover.

**Hard block, not soft.** No partial read-only mode. The whole pitch is "join the platform that builds itself" — half-joining isn't a thing, and the read-only path adds confusion when they try to post.

**Anti-patterns to avoid:** allow-listing only known-good browsers (false positives on niche-but-legit browsers); soft warning banner that lets them through (creates phantom identities anyway); attempting JavaScript redirects to Safari (Apple killed every reliable trick years ago — only the user-tap "Open in Safari" link is reliable on iOS).

### D3. Mobile modals adopt the AgentChat bottom-sheet pattern (no library)

Six modals (`SignInModal`, `IdentityBar`'s You modal, `MoveAddressModal`, `RestoreModal`, `ChangePassphraseModal`, `FundAddress`) restructure to bottom-sheet on mobile / centered on desktop, using the **same Tailwind pattern already proven in `AgentChat.tsx`**:

```
container: fixed inset-0 z-[…] flex items-end sm:items-center justify-center sm:p-4 pointer-events-none
panel:     w-full sm:max-w-{sm|lg} rounded-t-2xl sm:rounded-2xl border border-zinc-800 bg-{…} pointer-events-auto animate-[slideUp_0.3s_ease-out]
```

**Why:** AgentChat already proves the pattern. Mobile-native sheet anchors to the bottom edge (thumb-reachable, gesture-native), desktop floats centered. No vaul or external library — would add a dep for a problem that's already solved in-house.

**Wizards (`MoveAddressModal`, `RestoreModal`, `ChangePassphraseModal`) get full-height sheets on mobile.** Multi-step flows deserve the whole screen — taller `min-h-[85vh]` or `h-screen` panel with internal scroll, not the AgentChat half-height treatment.

**Single-step modals (`SignInModal`, `FundAddress`, `IdentityBar`) get the AgentChat half-height bottom sheet** — small enough that thumb reaches everything.

**Anti-patterns to avoid:** introducing vaul or react-modal-sheet (the in-house pattern works); changing the desktop pattern (don't break what works); putting a drag-handle / swipe-to-close on mobile in v1 (nice-to-have, not blocking launch); breaking the locked-state You modal pattern (per DECISIONS.md 2026-05-01).

### D4. Save → Install → Welcome-gate → Notifications is one ordered flow

The trigger sequence:

1. User lands → silent identity creation (no nags, no banners) → can post/boot/earn freely
2. After meaningful action (first earning OR first boot OR explicit "Save" tap) → save flow → produces recovery file
3. **Recovery file exists AND not already installed AND supported platform** → install pitch fires
4. User installs to home screen
5. User opens from home-screen icon → **welcome gate**: "I have a recovery file" / "Scan from another device" (when QR sync ships) / "Start fresh"
6. Choice made → request notification permission
7. Done

**Why:** the file is the bridge between sandboxes (especially Brave/Chrome iOS → home-screen-icon iOS Safari sandbox). Gating the install pitch behind "file exists" guarantees that even if the install lands in a fresh sandbox, the user has a recovery path. **Without this gate, a user could install before saving, lose their pre-install identity, and have nothing to recover.**

**Trigger logic** (one helper, called from anywhere):
```
shouldShowInstallPitch =
  recoveryFileExists() AND
  !isStandaloneMode() AND
  isSupportedInstallPlatform() AND
  !installPitchDismissedRecently()
```

**Anti-patterns to avoid:** firing the pitch on first visit (kills the 2-click onboarding, increases bounce); pitching install before save (creates the lost-pre-install-identity scenario); using a "more secure" framing in the copy (false — install doesn't improve security, only privacy + convenience); auto-replaying the pitch every visit (set a 30-day localStorage suppression flag).

### D5. Welcome-gate copy uses intent, not technical state

The home-screen first-launch screen presents three options framed by user intent, not by sandbox mechanics:

```
Welcome to OpenCook

Are you returning to an account you already use, or starting fresh?

[ I have a recovery file ]   → file picker → restore
[ Scan from another device ] → camera → QR sync   ← when QR layer ships
[ Start fresh ]              → keep new identity
```

**Why:** users shouldn't need to understand storage sandboxes. "Returning vs starting fresh" maps cleanly to user intent regardless of the technical reason their identity is missing.

**Anti-patterns:** explaining the sandbox concept in copy ("if your address has changed, restore..." — too technical); auto-detecting the "right" choice (false confidence — the user knows their intent better than we do); making "Start fresh" feel scary (it's a perfectly valid choice for new users).

### D6. Push notifications require a service worker; service worker comes with launch

Per DECISIONS.md tech stack: "No service worker / offline support yet." That changes for launch.

**Scope:** minimal service worker — only what's needed for the Push API. Not full offline support, not background sync, not caching strategies. Just enough to register the push subscription endpoint and fire notifications.

**Notification triggers (priority order):**
1. Boot received (your post got featured) — primary signal, the dopamine moment
2. Earnings received (someone booted a post you contributed to) — the agentic-fairness moment
3. (Future) Featured post appearing while you're away
4. (Future) Daily summary

**Anti-patterns to avoid:** building full offline support (not a launch goal — the app needs the network for chain/db reads anyway); pushing marketing notifications (kills permission-grant rates); registering the SW on first visit (only after install pitch is taken).

### D7. QR device sync is the next-version layer, not launch

Sit on top of the recovery file primitive. Same trust model (passphrase + something you have), but time-limited (5 min) and one-shot — better hygiene for active transfer between devices.

**Cryptography model** (validated this session, pending code-auditor review):
- Source device reads its already-encrypted blob (`bfn_keypair_enc`) from localStorage. No decryption. No passphrase needed at source.
- Wraps that blob in a fresh one-time AES-GCM envelope.
- Sends envelope to opencook.fun server, gets back short ID. Server stores envelope ≤5 min, auto-deletes.
- QR contains: `{id, transferKey}` packed as URL with key in fragment (`#key=…`) so server never sees the key.
- Destination device scans QR, fetches envelope by ID, decrypts with transfer key from QR → has the original encrypted blob.
- Destination prompts user for passphrase → unlocks the encrypted blob locally → identity loaded.

**Plaintext WIF never leaves source device.** Two layers of encryption between the key and any attacker; three independent factors required to compromise (physical access to QR, network access to server within 5min window, knowledge of passphrase).

**Plaintext-mode users** are blocked from sync until they set a passphrase. Forcing function for the right behavior — multi-device is exactly when you need passphrase protection.

**Typed-code fallback** for users without a camera: 6-digit numeric code maps to the transfer record server-side. Slightly weaker security model (server briefly holds a way to look up the key) but time-limited, sufficient for the constraint.

**Anti-patterns to avoid:** decrypting WIF on source device for transfer (creates plaintext window); putting the transfer key in the URL path (server logs would record it); skipping the auto-delete (server should never hold encrypted-key-plus-key-to-decrypt-it simultaneously); allowing sync from plaintext mode (forces a forcing function for passphrase setup).

---

## Work breakdown — sequenced

Estimates are focused-work hours, not calendar hours.

### Bucket 1 — Mobile polish (~1 day)

Goal: iPhone feels like a real mobile app, not a desktop-modal-shrunk-to-fit.

| Task | File(s) | Effort |
|------|---------|--------|
| Refactor `SignInModal` to bottom-sheet on mobile | `src/components/SignInModal.tsx` | 30 min |
| Refactor `IdentityBar` You modal (locked + unlocked states) to bottom-sheet on mobile | `src/app/IdentityBar.tsx` | 1.5 h (largest modal, body cross-fade preserved) |
| Refactor `MoveAddressModal` to full-height sheet on mobile | `src/components/MoveAddressModal.tsx` | 1 h |
| Refactor `RestoreModal` to full-height sheet on mobile | `src/components/RestoreModal.tsx` | 30 min |
| Refactor `ChangePassphraseModal` to full-height sheet on mobile | `src/components/ChangePassphraseModal.tsx` | 30 min |
| Refactor `FundAddress` to bottom-sheet on mobile (QR center stage) | `src/app/FundAddress.tsx` | 30 min |
| **Backdrop-tap-to-close audit:** every modal must close on backdrop tap on iOS Safari (the existing handlers may be swallowed by scroll lock or higher z-index handlers — fix per modal) | All 7 modals | 1 h |
| **Tap target audit:** ensure all interactive elements (chip, pills, icons, close X buttons) hit at least 44×44px hit area on mobile, even if visual size is smaller | `IdentityBar`, `Header`, `PostList`, `Bootboard`, `AgentChat` | 1.5 h |
| **Download-loop bug investigation** (separate, scoped) — what specifically loops on iPhone? Reproduce, find root cause | TBD | 1–4 h (unknown — could be quick or gnarly) |
| **Manual QA on physical iPhone**, fix-as-found | All | 2 h |

**Sequencing:** SignInModal first (smallest, validates the pattern works). Then IdentityBar (biggest payoff — the most-used modal). Then wizards. Then audits. Then QA pass with iPhone in hand.

**Anti-patterns reminder:** preserve the locked-state You modal pattern (one container, two states, body cross-fade) per DECISIONS.md 2026-05-01.

### Bucket 2 — In-app browser splash (~half day)

Goal: protect users arriving from social app webviews from creating phantom identities.

| Task | File(s) | Effort |
|------|---------|--------|
| Detection helper (UA parse + crawler bypass) | new: `src/lib/in-app-browser.ts` | 1 h |
| Splash page component (logo + "Open in Safari/Chrome" button + iOS-specific visual instructions) | new: `src/components/InAppBrowserSplash.tsx` | 2 h |
| Wire splash check into `src/app/layout.tsx` (or middleware) — render splash instead of children when detected | `src/app/layout.tsx` or `middleware.ts` | 30 min |
| Android intent-link: `intent://opencook.fun#Intent;scheme=https;…` for Chrome | `src/components/InAppBrowserSplash.tsx` | 30 min |
| iOS animated arrow pointing at share-menu icon | `src/components/InAppBrowserSplash.tsx` (asset + CSS) | 1 h |
| "Wrong instructions? Tap here" manual-fallback link for the 2–5% misdetection edge | same | 15 min |
| Manual test from inside X / Instagram / Discord webviews on iPhone | — | 1 h |

**Detection list (initial):** `FBAN`/`FBAV` (Facebook), `Instagram`, `Twitter`/`X`, `TikTok`/`musical_ly`, `LinkedInApp`, `MicroMessenger` (WeChat), `Line`, `Discord`, `Snapchat`, `Pinterest`, `RedditApp`, `Slack`, `KAKAOTALK`. Exempt: `Googlebot`, `bingbot`, `Twitterbot`, `facebookexternalhit`, `LinkedInBot`, `Slackbot-LinkExpanding`, `WhatsApp` (link previews), `TelegramBot`.

### Bucket 3 — Save → Install → Notifications flow (~2 days)

Goal: turn the recovery-file save into the entry point for an installable app with notifications.

| Task | File(s) | Effort |
|------|---------|--------|
| `useStandaloneMode()` hook — checks `display-mode: standalone` + `navigator.standalone` (iOS) + 30-day localStorage flag | new: `src/hooks/useStandaloneMode.ts` | 30 min |
| `useInstallPlatform()` hook — returns `{ platform, canPromptOneTap, instructions }` for Android/iOS Safari/iOS-non-Safari/desktop Chrome/desktop Safari/Firefox/etc. | new: `src/hooks/useInstallPlatform.ts` | 1 h |
| `beforeinstallprompt` capture (Android one-tap) — store the deferred event, expose via context | `src/contexts/InstallContext.tsx` | 1 h |
| `InstallPitch` component — branches on platform, renders one-tap button or visual instructions or "open in Safari" nudge | new: `src/components/InstallPitch.tsx` | 2 h |
| Wire trigger logic: fire pitch only after recovery file exists + not already installed + supported platform + not dismissed within 30 days | `src/app/IdentityBar.tsx` (after save), `MoveAddressModal` (after rotation done) | 1 h |
| iPad-disguised-as-macOS-Safari edge case (combine UA + touch detection) | `src/hooks/useInstallPlatform.ts` | 15 min |
| Service worker for Push API (minimal, no offline scope) | new: `public/sw.js` + registration in layout | 2 h |
| Push subscription endpoint (server stores subscription per pubkey, sends notifications when boot received) | new: `src/app/api/push/subscribe/route.ts`, `src/app/api/push/send/route.ts` | 3 h |
| Wire notification triggers: boot received, earnings received | `boot-orchestrator.ts`, `boot-confirm/route.ts` | 1 h |
| Welcome-gate component — shown on first home-screen launch, three buttons: "I have a recovery file" / "Start fresh" / (later) "Scan from another device" | new: `src/components/HomeScreenWelcomeGate.tsx` | 2 h |
| Welcome-gate detection: standalone-mode AND no identity in localStorage AND first-launch flag | `src/contexts/IdentityContext.tsx` | 30 min |
| Notification permission prompt — fires after welcome-gate completion, with friendly copy ("Get notified when your posts earn") | `src/components/NotificationPrompt.tsx` | 1 h |
| Manual QA across iOS Safari, Android Chrome, desktop Chrome, desktop Safari | — | 2 h |

**Sequencing within this bucket:**
1. Hooks first (`useStandaloneMode`, `useInstallPlatform`, `InstallContext`)
2. `InstallPitch` component + wire trigger
3. Service worker + push subscription endpoint
4. Notification triggers from server
5. Welcome gate + permission prompt
6. QA pass

### Bucket 4 — Server-side resilience (~1 day, already in ROADMAP Phase 6.5)

Goal: stop ARC outages from freezing the platform. Already specced in ROADMAP — fold here for completeness.

Per ROADMAP Phase 6.5 first item:
- `/api/broadcast` proxy with GorillaPool primary → TAAL ARC fallback on 5xx, 10s timeout, structured ARC error passthrough
- Server wallet (`wallet.ts`, `onchain.ts`, `boot-orchestrator.ts`) reuses the same proxy via shared broadcaster module
- Server wallet reuses `/api/tx-hex` and `/api/unspent` caches via shared internal cache module
- Broadcast timeout + queue-depth metric (log/alert when mutex wait > 5s or queue depth > 5)
- Low-balance alert on server wallet (log + optional webhook when balance < 10k sats)
- Split mutexes posts vs boots
- Backpressure on `logPostOnChain`
- WoC retry/backoff in double-spend recovery

**Why before launch:** an ARC outage (already happened twice in April 2026) without this proxy freezes the whole platform with zero visibility. Single biggest "won't get pulled back in" win.

**Anti-patterns:** building this AFTER launch and patching during the first outage; using direct `tx.broadcast()` from server-side paths (per DECISIONS.md "Server wallet shares the client's resilience stack" 2026-04-15 — already settled).

### Bucket 5 — Deploy + production observability (~half day)

| Task | Effort |
|------|--------|
| Railway deployment with persistent /data volume for SQLite | 1 h |
| Custom domain wired up (DNS, SSL via Railway) | 30 min |
| Production env vars set (BSV_SERVER_WIF, ANTHROPIC_API_KEY, push VAPID keys) | 30 min |
| `x-forwarded-for` IP header verification at Railway (rate limiting depends on it being trustworthy — see CLAUDE.md "Deployment Notes") | 30 min |
| Smoke test on production URL (post, boot, save, install, notification) | 1 h |
| OG image / metadata polish for social-share previews | 1 h |

### Bucket 6 — QR device sync (POST-LAUNCH polish, ~1.5 days)

**Not blocking launch.** Build once user feedback shows file-restore friction is real. Specced here so it's ready to pick up.

| Task | Effort |
|------|--------|
| Server endpoint `POST /api/sync` (store envelope, return short ID with auto-expiry) | 1 h |
| Server endpoint `GET /api/sync/:id` (return envelope, mark for delete on success) | 30 min |
| Auto-cleanup of expired sync records (lazy delete on next access OR cron) | 30 min |
| Encryption helper (reuses existing `crypto.ts` AES-GCM) | 30 min |
| QR display component on source device (uses existing `qrcode.react`) | 1 h |
| Camera + QR scanning on destination (library: `qr-scanner` ~12kb) | 2 h |
| 6-digit typed-code fallback flow | 1.5 h |
| Plaintext-mode block: refuse sync until passphrase is set | 30 min |
| UI polish (countdown timer, error states, success animation) | 2 h |
| Rate-limiting + abuse protection on `/api/sync` (per pubkey) | 1 h |
| Welcome-gate "Scan from another device" option | 30 min |
| Manual QA across iPhone↔iPhone, iPhone↔Android, iPhone↔desktop | 2 h |

---

## Sequencing the launch (recommended order)

Three parallelizable streams:

**Stream A — UX + mobile (1–1.5 days):**
1. Bucket 1 (mobile modals + tap targets + download loop)
2. Bucket 2 (in-app browser splash)

**Stream B — install + notifications (2 days):**
3. Bucket 3 (save → install → notifications + welcome gate)

**Stream C — server resilience (1 day):**
4. Bucket 4 (broadcast proxy + server wallet hardening)

Then sequential:

5. Bucket 5 (deploy)
6. Bucket 6 (QR sync, **post-launch**)

**Total focused work for launch (Buckets 1–5):** ~5 days, parallelizable to ~3 calendar days if dispatched cleanly.

---

## Open questions

These need decisions before the corresponding work can ship.

### Q1. ~~What's the trigger for "save your recovery file"?~~ — RESOLVED (Status #4, shipped)

Resolved via Option (b): **first-earning trigger.** `<FirstEarningToast>` fires from the 30-second `/api/earnings` poll when `total_sats > 0`, with a 48h backoff via `opencook_first_earning_save_dismissed_until` localStorage timestamp. The toast CTA flows into the save-recovery-file path. The amber "Unsaved key" dot in IdentityBar remains the persistent fallback between re-fires. See DECISIONS.md "First earning toast trigger wires to `/api/earnings` polling".

### Q2. Notification frequency / batching policy

If a user gets 50 boots in an hour (popular post), do they get 50 notifications or one batched "you got 50 boots"?

**Recommendation pending review.** Likely: dedupe within a 60-second window, send "X+ new boots" if multiple fire close together.

### Q3. ~~What "starting fresh" means in the welcome gate~~ — RESOLVED (Status #9, shipped)

Resolved as recommended: **leave the previous in-browser identity intact.** `<HomeScreenWelcomeGate>` only generates a new keypair in the standalone tab; the regular browser tab keeps its own identity. Users who want to bring posts/earnings across use the "I have a recovery file" branch instead of "Start fresh".

### Q4. Push notification cost / scale

Web Push has no per-message fee but requires server CPU + outbound bandwidth. Estimating: 1k DAU × 5 notifications/day × ~200 bytes = ~1 MB/day outbound. Negligible at launch scale. Revisit at 100k DAU.

**No action needed** — flagged for completeness.

### Q5. How does QR sync interact with passphrase rotation?

Edge case: user generates QR, then on source device rotates passphrase BEFORE destination scans. The envelope on the server is encrypted with the OLD passphrase's blob, but the source's localStorage now has the NEW one. Destination scans → fetches envelope → asks for passphrase → user types NEW passphrase → decryption fails.

**Recommendation:** invalidate any in-flight sync envelopes on rotation. Source device hits `DELETE /api/sync/:id` when passphrase rotates. Destination sees "transfer expired" and starts over. Cheap, correct.

### Q6. ~~Should the in-app browser splash allow read-only access?~~ — RESOLVED (Status #7, deferred-to-Bucket-2)

Resolved as **hard block** per Status #7. When Bucket 2 ships, X/Instagram/Discord webviews will get a full-page "Open in Safari/Chrome" splash with no read-only fallback — passive viewing is incompatible with the "join the platform that builds itself" pitch, and read-only adds confusion when the user taps to post. Implementation pending Bucket 2.

---

## Risk register

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| R1 | iPhone download loop turns out to be deep (Safari quirk we don't understand) | Med | Time-box investigation to 4h; if not solved, ship with documented workaround in launch FAQ |
| R2 | Service worker registration breaks during Next.js Turbopack build | Med | Use a known-good SW pattern (see Vercel/Next docs); test in production-built mode before merging |
| R3 | iOS Safari push notifications less reliable than expected | Low-Med | Treat as nice-to-have; Android push is the primary platform anyway |
| R4 | In-app browser detection fires on a legitimate browser (false positive) | Low | "Wrong instructions? Tap here" manual-fallback link is the safety valve |
| R5 | Broadcast proxy fallback (GorillaPool → TAAL) has a subtle behavior diff that breaks production payouts | High | Test with both upstreams independently before flipping the proxy live; have a kill-switch env var to force one upstream during incident |
| R6 | Server wallet runs out of sats during launch (free boots subsidy) | High | Low-balance alert in Bucket 4; manual top-up + monitor first week of launch |
| R7 | Notification permission prompt shows too eagerly and gets denied → can't re-prompt | Med | Only fire after welcome-gate completion (post-install), with explicit "Get notified when your posts earn" copy that has clear value |
| R8 | A modal restructure breaks the locked-state You modal pattern (DECISIONS.md 2026-05-01) | Med | Code-auditor review on the IdentityBar refactor specifically; preserve the body cross-fade |
| R9 | Apple's WebKit changes break the recovery-file static render between iOS releases | Low | Already partially defensive (no JS dependency for static fields); monitor on iOS major releases |
| R10 | Rate limit `x-forwarded-for` trust assumption fails on Railway | High | Verify in Bucket 5 deploy; document the trusted-proxy expectation in ops runbook |

---

## What this plan deliberately does NOT include

To stay focused:

- **Native iOS / Android apps** — see D1.
- **Full offline support** — service worker is push-only, not full offline.
- **Notification batching beyond simple dedupe** — Q2 above; revisit post-launch.
- **Cross-project contribution tracking** (Phase 7 north star) — not a launch goal.
- **AFP protocol / handles / future fairness phases** — see DIRECTION.md / FUTURE.md.
- **Yours Wallet integration** — Phase 7, post-launch.
- **Notification preferences / settings UI** — v1 is binary on/off.
- **Email / SMS notifications** — web push only.
- **Content moderation tooling** — already in ROADMAP Phase 6.5; not in this plan's scope (separate stream).

These are good ideas, just not for this launch.

---

## What success looks like, three weeks after launch

A working measure of "did this plan deliver":

1. iPhone Safari users complete the post → save → install flow without bouncing > 30%.
2. No "I lost my account" support tickets traceable to in-app browser sandbox isolation.
3. Push notifications delivered for ≥ 80% of boot-received events on installed users.
4. Zero ARC outage incidents that froze the platform for > 30 seconds.
5. Server wallet stayed funded (no zero-balance windows).
6. Recovery file restoration worked across all platforms users tested.

If those six are true at three weeks, the plan worked.

---

## Hand-off

This plan goes to four parallel review agents next:

- **Architect** — technical sequencing, broadcast proxy correctness, service worker integration with Next.js Turbopack
- **Designer** — mobile modal patterns, welcome-gate copy + UX, install pitch flow timing
- **Code-auditor** — QR sync cryptography model + threat analysis (per memory `feedback_toolkit_before_code_fixes`)
- **Marketer** — launch sequencing, in-app browser splash copy, install pitch copy, save trigger timing

Findings will be filtered against DECISIONS.md hard-stops (per memory `feedback_validate_agent_findings`). Anything that contradicts a settled decision will be flagged for explicit user decision rather than silently incorporated.

After review synthesis, this document becomes the canonical launch reference and the basis for ROADMAP.md Phase 6.5 closeout + a new Phase 7 entry.

---

# Final synthesis — confirmed decisions (2026-05-10)

> Two rounds of agent review (4 agents → 3 agents → 3 agents on the ITP toast) plus user iteration on each open question. **Architect verification pass (2026-05-10) confirmed safe to write** with one correction folded in. This section is the **canonical state** of all decisions.

## Status table

| # | Decision | Final answer |
|---|----------|--------------|
| 1 | TAAL broadcaster fallback | **DEFER.** Ship single broadcaster (GorillaPool) at launch via the proxy. Helper structure miner-agnostic so adding TAAL later is a localized internal change. |
| 2 | Tap target audit additions | Add **boot button** (`px-1.5 py-0.5` currently — far below 44px), **WoC chain icon link** (12px SVG no padding), **Bootboard reboot button** (`px-1 py-0.5`), and **"Load earlier posts" button** (`px-3 py-1.5` ~30px borderline, `src/app/PostList.tsx:217`). All to ≥44px via `relative -m-3 p-3` padding pattern. |
| 3 | Welcome gate trigger framing | Use *"We couldn't find your identity on this device."* — covers all four real causes (non-Safari install, iOS 7-day ITP eviction, Private Browsing install, fresh install/storage wipe) without reading as a bug. |
| 4 | First earning event toast | Trigger: first earning > 0 sats, fires once ever per device. Copy: *"You just earned your first sats. Save your recovery file — if you lose this device without it, they're gone."* Buttons: **Save now** (primary) / **Later** (secondary, 48h suppression). |
| 5 | Welcome gate copy + body | Header: *"Welcome back or starting fresh?"* + body sentence: *"We couldn't find your identity on this device."* Then two buttons with sub-text (button order in #9). |
| 6 | Notification copy (both surfaces) | *"Get notified when you earn."* Used identically for permission prompt AND install pitch. No roadmap hedging. Broaden when new triggers ship. |
| 7 | In-app browser splash | Headline: *"Open OpenCook in your browser"*. Body: *"You're inside [X/Instagram]'s built-in browser. OpenCook uses your browser's secure storage. Open in your browser instead — your account stays with you."* **Android:** real button `[ Open in browser ]` fires intent link. **iOS:** NO button — static inline tip *"Tap Share, then 'Open in Browser'"* with share icon. Differentiate the surface, not the words. |
| 8 | Bucket order | **Mobile polish (Bucket 1) first**, **in-app browser splash (Bucket 2) second**. Per user's call (nothing ships until both done; risk-ordering during build doesn't change launch state). |
| 9 | Welcome gate primary button | *"Restore from your saved file"* primary (sub-text: *"Use your most recent recovery file. Your posts and earnings come back."*). *"Start with a new identity"* secondary (sub-text: *"Begin fresh on this device. You can save and restore later."*). Most welcome-gate visitors are returning users (gate fires only after recovery file save → install). |
| 10 | Install pitch surfaces | **Inline pitch in You modal done-state** (primary, fires on "Got it" tap after recovery file save) **+ gentle bottom banner** (secondary; designer's calibrated dismissal: max once per session, vanishes on next page load, 30-day suppression on X tap, permanent suppression on engagement with either surface). Both visible at launch (Designer's option). |
| 11 | Welcome gate "Why did this happen?" explainer | **DROP** the collapsible. Keep one body sentence (*"We couldn't find your identity on this device."* — already in #5) which is honest in all causes. If post-launch confusion signals emerge, the collapsible is a 30-min add. |
| 12 | iOS post-install ITP toast | **ADD.** iOS standalone only (`navigator.standalone === true`). Fires once on first standalone launch (gated by `opencook_ios_storage_notice_shown` localStorage flag). **Sequenced AFTER welcome gate** if both apply (architect's collision fix). Auto-dismiss after 8s, single "Got it" button, no "Remind me later." Copy: *Headline: "You're all set. One thing to know." Body: "Apple may clear saved site data after long periods of inactivity. If that ever happens, your recovery file brings everything back in seconds — you're covered." Button: "Got it"* |

## Detailed notes per decision

### #1 TAAL deferral — guardrail to remember

The architect's confirm was conditional: keep the broadcast result type miner-agnostic (`{ status, txid, code }`). **Don't leak `gorillapool_*` strings into call sites or status enums.** If you do that, BLOCKER-2's double-broadcast hazard never materializes (only one broadcaster exists), and adding TAAL later is a localized internal change rather than a cross-cutting refactor.

### #2 Tap targets — concrete CSS pattern

`relative -m-3 p-3` wrapper expands hit area without changing visual size. Boot button visual stays the same; touchable area becomes 44×44+. Apply to all small icons: WoC chain link, Bootboard reboot, "Load earlier posts" button, close X buttons across modals. Architect's verification confirmed actual button strings — match those exactly when grepping.

### #3 Welcome gate trigger — DECISIONS.md note worth adding

Architect flagged that the next session shouldn't re-derive the four-causes logic. When implementation begins, add a one-line note to DECISIONS.md: *"Welcome gate fires when standalone-mode + no identity. Causes include iOS 7-day ITP eviction, Private Browsing install, non-Safari iOS install, and fresh install/storage wipe — copy must be honest in all four cases."*

### #4 First earning toast — wired into boot-confirm

Fires from `/api/boot-confirm` flow when the recipient is the user AND `opencook_first_earning_save_offered` localStorage flag is unset. Sets the flag whether they tap Save or Later. "Later" sets `opencook_first_earning_save_dismissed_until` to (now + 48h). Toast can return after 48h if they ignored — gentle backoff, not 30 days, because this is the highest-stakes moment.

### #5 + #9 Welcome gate full layout

```
Welcome back or starting fresh?

We couldn't find your identity on this device.

┌──────────────────────────────────────────────────┐
│ [ Restore from your saved file ]                 │  ← primary, full-width
│   Use your most recent recovery file. Your       │
│   posts and earnings come back.                  │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ [ Start with a new identity ]                    │  ← secondary, ghost
│   Begin fresh on this device. You can save       │
│   and restore later.                             │
└──────────────────────────────────────────────────┘
```

(Add a *"[ Scan from another device ]"* row between them when QR sync ships in Bucket 6 — sub-text: *"Use QR code sync from your other device."*)

### #6 Notification copy — single-line discipline

Marketer's push-back: don't expand the install pitch into multiple lines about future activity types. The pitch should lead with present value, not roadmap. *"Get notified when you earn."* is honest for today and broadens naturally as new notification types ship.

### #7 In-app browser splash — surface differentiation rationale

Designer caught a subtle UX bug: a button that just scrolls to an instruction is a **broken affordance** — iOS users tap, see nothing happen, assume it failed. Don't fake-button it. Render the iOS path as a static inline tip from the start, render the Android path as a real button. Same headline + body across both.

### #10 Install pitch — banner calibration is the actual fix to nag-risk

Designer's calibrated dismissal pattern is what makes "two surfaces" not feel like a nag:

- **Banner appears max once per session** (vanishes on next page load — not on every tap)
- **Tap the banner** → opens the install flow
- **Tap X** → 30-day suppression, then returns once on same gentle pattern
- **Engaging with install (from inline OR banner)** → permanent suppression

The trigger for both surfaces is the same: `recoveryFileExists() && !isStandaloneMode() && isSupportedInstallPlatform() && !installPitchDismissedRecently()`.

### #12 iOS ITP toast — sequencing logic (architect's collision fix)

Naive implementation: toast fires on first standalone launch. Welcome gate fires when no identity. **Both could fire on the same launch** (e.g., user installed → ITP eviction wiped data including the toast-shown flag → user opens app → no identity → welcome gate fires → toast tries to fire too).

**Resolution:** sequence them. Welcome gate first (user resolves with Restore or Start fresh). THEN toast fires AFTER welcome-gate completion. At that moment the toast becomes a contextual *"by the way, this is what just happened"* — even better timing than pre-emptive.

For users without ITP eviction (clean Safari install → standalone share storage → identity carries over), the toast fires on first standalone launch with no welcome gate — the original simple flow.

For users on regular Safari (non-standalone), toast does NOT fire — they don't have the eviction risk in the same form, and showing it would create false threat.

For Android users, toast does NOT fire — Apple ITP doesn't apply.

## Architect's technical corrections (folded in)

These are technical bug-fixes from the first agent review round that don't have user-facing copy implications:

- **Broadcast proxy correctness** (C1): even with single broadcaster (TAAL deferred), keep result type miner-agnostic so the helper is ready
- **`publishPayout()` helper** (C2): single emit-site for push notifications + future SSE + future audit logs. Eliminates emit-site coupling between Bucket 3 (notifications) and Bucket 4 (broadcast proxy)
- **Welcome gate detection inversion** (C3): synchronous pre-hydration check in IdentityProvider's lazy initializer (before any async work). If `isStandaloneMode() && !hasIdentity()`, defer auto-generation until welcome-gate decision. Drop "first-launch flag" entirely
- **Standalone-mode detection — three signals + reactive listener** (C4): `display-mode: standalone` || `display-mode: minimal-ui` || `display-mode: fullscreen` || `navigator.standalone`. matchMedia change listener for iPad Stage Manager / Split View transitions
- **Service worker integration with Next.js 16** (C5): NO `fetch` listener (Turbopack dev caching). Register from a client component (IdentityProvider, not layout.tsx). CSP needs `worker-src 'self'`. Generate VAPID keys in setup

## Designer's per-modal mobile pattern specs (folded in)

Concrete class refactor specs for each of the 6 modals adopting the AgentChat bottom-sheet pattern:

| Modal | Outer container | Panel classes | Notes |
|-------|----------------|---------------|-------|
| `SignInModal` | `fixed inset-0 z-[80] flex items-end sm:items-center justify-center sm:p-4 pointer-events-none` | `w-full max-w-sm sm:max-w-sm rounded-t-2xl sm:rounded-2xl pointer-events-auto animate-[slideUp_0.3s_ease-out]` | half-height bottom sheet |
| `IdentityBar` (You modal) | same | same + `max-h-[92vh] overflow-y-auto` | tallest — height cap critical |
| `MoveAddressModal` | `fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4` | `w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-[#0f0f0f] border border-amber-400/20 min-h-[85vh] sm:min-h-0 overflow-y-auto` | full-height wizard, drop existing `mx-4`, keep no-close-during-active-stages logic |
| `RestoreModal` | same as Move | same + `min-h-[75vh] sm:min-h-0`, `sm:max-w-md` for desktop | full-height wizard |
| `ChangePassphraseModal` | same as Move | same + `min-h-[80vh] sm:min-h-0 flex flex-col` | done-state buttons need `mt-auto` to pin to bottom |
| `FundAddress` | same as Sign-in | same | half-height bottom sheet, QR center stage |

All preserve their existing internal logic (locked-state cross-fade, no-close-during-active-stages, etc.). Only the outer container + panel classes change.

## QR sync deltas (deferred to Bucket 6 — captured here for the build)

Code-auditor's five required changes when QR sync is built post-launch:

1. **Use a dedicated raw-key AES-GCM helper, not the PBKDF2 wrapper.** Add `encryptWithKey(plaintext, rawKey)` / `decryptWithKey(ciphertext, rawKey)` sibling to `crypto.ts`
2. **GET endpoint is strictly one-shot atomic delete-on-read** (atomic `SELECT … FOR UPDATE` + DELETE)
3. **5-attempt cap on typed-code fallback. Single most important security control.** Per-code: 5 wrong attempts → invalidate permanently. Per-IP: ≤10 code submissions/min. Use `crypto.getRandomValues` + rejection sampling. Constant-time comparison
4. **Bind envelope to `id` and origin via AES-GCM AAD** — defends against cross-origin QR confusion
5. **Destination must validate inner blob shape** (`enc:` prefix + valid base64 + JSON wrapper with `encrypted`, `name`, `address`), **ship the FULL `bfn_keypair_enc` JSON wrapper** (not just encrypted field), **prompt-with-auto-backup before overwriting** any existing identity

Plus medium-priority Bucket 6 items: don't-screenshot warning, `history.replaceState` after extracting key, 16 KB max envelope size, identity-merge confirmation with auto-backup, server log hygiene for fragments.

## Marketer's risk additions + success metrics (folded in)

**R11 added to risk register:** broken/missing OG preview when opencook.fun is shared on X/Discord/Slack. Mitigation: verify `og:image` (1200×630), `twitter:card`, OG title + description in Bucket 5 deploy checklist. Test via X card validator + Slack unfurl.

**Bucket 1 mitigation upgrade:** before shipping, add a **plain-text fallback display of the recovery key with copy-to-clipboard** as a secondary path when the file download fails. R1 mitigation upgrade — never leave a user stranded after their first earning.

**Three-week success metrics — additions:**
- Save rate (% with earnings > 0 who saved file). Target > 40%
- Install rate among saved-file users
- Return rate from installed users (within 7 days)
- Notification opt-in rate (target > 50%)
- Split iPhone bounce metric into save-step and install-step separately

## Updated work breakdown

| Bucket | First-round estimate | Final estimate | Why changed |
|--------|----------------------|----------------|-------------|
| 1. Mobile polish | 1.25 days | **1.25 days** | unchanged — tap target additions confirmed |
| 2. In-app browser splash | half day | **half day** | unchanged — copy + surface differentiation locked |
| 3. Save → install → notifications | 2.25 days | **2.5 days** | + iOS ITP toast (~1h) + bottom banner with calibrated dismissal (~1h) + welcome gate single-sentence body (no collapsible — saves time vs first-round plan) |
| 4. Server resilience | 1.25 days | **1 day** | TAAL deferral simplifies the proxy spec — no fallback classification logic at launch |
| 5. Deploy + observability | half day | **half day** | unchanged |

**Total launch work (Buckets 1–5): ~5.75 days focused work**, parallelizable to ~3.5 calendar days.
**Bucket 6 (QR sync, post-launch): ~1.5 days + the 5 cryptographic deltas captured above.**

## Sequencing the actual build

1. **Week 1 — Bucket 1** (mobile polish + tap targets + IdentityBar bottom-sheet height + download loop investigation)
2. **Week 1–2 — Bucket 2** (in-app browser splash, can run partially in parallel with Bucket 1)
3. **Week 2 — Bucket 4** (broadcast proxy with miner-agnostic result type + `publishPayout()` helper + server wallet sharing the resilience stack)
4. **Week 2–3 — Bucket 3** (save → install → notifications → welcome gate → ITP toast). Sequenced after Bucket 4's `publishPayout()` helper exists
5. **Week 3 — Bucket 5** (deploy to Railway + custom domain + OG preview verification + plain-text recovery key fallback)

Buckets 1, 2, 4 have no inter-dependencies and can run truly in parallel. Bucket 3 has a single dependency on the `publishPayout()` helper from Bucket 4 and otherwise runs independently. Bucket 5 is sequential after all four.

## Hand-off notes — promoting into other repo files at launch-close

Per memory `project_launch_plan_lifecycle.md`, the agent will handle this at launch-close. Recorded here for reference:

1. Each row in the **Status table** above promotes into a Linear ticket (or ROADMAP entry) with its final answer
2. The architect's miner-agnostic result type guardrail (#1) lives in DECISIONS.md
3. The welcome gate four-causes note (#3) lives in DECISIONS.md under a new "Platform & Distribution" heading
4. The locked-state You modal pattern (DECISIONS.md 2026-05-01) is preserved through the bottom-sheet refactor
5. SESSION_LOG.md gets an entry summarizing this two-round planning session and the final state
6. **LAUNCH_PLAN.md gets deleted via `git rm`** with Nige's confirmation per Hard Rule #2

**End of synthesis. Ready for build.**

---

# Sequencing revision (2026-05-11) — split Bucket 3 + reorder

> Real-world iPhone testing on 2026-05-11 surfaced that multiple "Add to Home Screen" actions on iOS create isolated storage sandboxes — each silently generates a new identity. This is a **data-loss risk in the current pre-implementation state**: users may create multiple identities without realizing, lose earnings to silent sandbox creation. The launch plan as designed solves this via the welcome gate (Bucket 3) + save-first flow, but the gate isn't built yet.
>
> Architect + designer confirmed (2026-05-11) the right response is to **split Bucket 3 and prioritize the identity flow ahead of mobile polish**.

## The split

**Bucket 3a — Identity flow (~1.5–2 days, NO Bucket 4 dependency)**

The pieces that solve the silent multi-identity problem and don't need server-side broadcast work:

- `useStandaloneMode()` hook (display-mode + navigator.standalone + reactive listener)
- `useInstallPlatform()` hook (Android/iOS Safari/non-Safari/desktop branching)
- `beforeinstallprompt` capture + `InstallContext`
- `InstallPitch` component (inline section in You modal + persistent bottom banner)
- Install pitch trigger logic (gated behind recovery file save)
- iPad-disguised-as-macOS UA detection
- `HomeScreenWelcomeGate` component
- Welcome gate detection (synchronous pre-hydration check in `IdentityProvider`)
- First earning event toast (wired to `/api/earnings` polling — see architect refinement below)
- iOS post-install ITP toast (sequenced after welcome gate)
- Manual QA on iPhone

**Bucket 3b — Notifications (~1 day, REQUIRES Bucket 4's `publishPayout()` helper)**

- Service worker registration (push-only, no fetch handler)
- Push subscription endpoint (`/api/push/subscribe`, `/api/push/send`)
- Notification triggers wired into `publishPayout()`
- Notification permission prompt (after welcome-gate completion)

## Revised sequence

```
NOW  →  3a  — Identity flow (~1.5–2 days, no Bucket 4 dep)
       →  1   — Mobile polish (~1.25 days)
       →  2   — In-app browser splash (~half day)
       →  4   — Server resilience + publishPayout() helper (~1 day)
       →  3b  — Notifications (~1 day, needs Bucket 4)
       →  5   — Deploy (~half day)
```

Total effort unchanged (~5.75 days focused work). Order changed to fix the urgent data-loss-adjacent bug first.

## Architect's refinements

### A. First earning toast wires to `/api/earnings` polling, NOT `boot-confirm` emit-site

**Original plan (3a entry #4):** Toast fires from `/api/boot-confirm` flow when recipient is the user.

**Why this was wrong:** the `boot-confirm` route is Bucket 4's territory — it's the same emit-site `publishPayout()` will own. Wiring a new client-side trigger directly to `boot-confirm` creates rework when Bucket 4 lands.

**Refined approach:** the toast trigger reads from the existing `/api/earnings` polling response (already polled every 30s per CLAUDE.md). On poll: if total earnings > 0 AND `opencook_first_earning_save_offered` localStorage flag is unset → fire toast → set flag (whether user taps Save or Later).

**Why this is better:**
- Zero new emit-site in `boot-confirm`
- Server-emit-site-agnostic — when Bucket 4 adds SSE/push via `publishPayout()`, the toast code doesn't change
- 30s detection latency is acceptable for a first-earning save prompt (not a real-time signal)

### B. Synchronous pre-hydration check is safe to ship in 3a

`IdentityProvider`'s lazy initializer needs the welcome-gate inversion (`isStandaloneMode() && !hasIdentity()` → defer auto-generation). This is purely client-side localStorage + matchMedia. No interaction with broadcast paths. Safe to land without any Bucket 4 work.

### C. Drop the "first-launch flag"

Per architect's C3 finding in the first review round: gating welcome gate on a localStorage "first-launch flag" means it fires only once ever per device, even if storage is wiped later. **Detection condition is purely `isStandaloneMode() && !hasIdentity()`.** If those are true, gate fires — first launch or fifth.

## Designer's per-component shape specs

**Key insight:** none of the 3a components are bottom-sheet modals in the Bucket 1 sense. They live in entirely different shape categories. Bucket 1's modal refactor has **zero overlap** with 3a, so there is no refactor risk regardless of order.

| Component | Shape | Tailwind anchor | Rationale |
|-----------|-------|----------------|-----------|
| `HomeScreenWelcomeGate` | **Full-screen takeover** | `fixed inset-0 z-[90] flex flex-col items-center justify-center bg-[#0f0f0f] px-6 py-12` | No backdrop, no close X, not dismissable. Routing decision, not a dialog. No underlying content to see. |
| `InstallPitch` inline section | Shape-agnostic section inside the You modal | inherits You modal's container | Inherits whatever Bucket 1 makes the You modal. Zero refactor risk. |
| `InstallPitch` bottom banner | Fixed bottom strip | `fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-sm px-4 py-3 flex items-center justify-between` | Strip, not a modal. Untouched by Bucket 1. |
| `ITPToast` | Pill — match `GoatModeToast` exactly | `fixed bottom-24 left-1/2 -translate-x-1/2 rounded-full border bg-zinc-900 px-4 py-2 text-sm shadow-lg` | Toast pattern already proven in codebase. 8s auto-dismiss, single "Got it" tap target. |
| First earning toast | Pill-card — wider than GoatModeToast | `fixed bottom-24 left-1/2 -translate-x-1/2 rounded-2xl` + internal `flex gap-2 mt-2` button row | Has two buttons (Save now / Later) — breaks the single-pill-as-button pattern. `rounded-2xl` gives breathing room. |

## Status table — entries that change

The locked decisions from the Final synthesis (2026-05-10) carry forward unchanged. Two table rows update to reflect the architect's refinement:

| # | Decision | Updated final answer |
|---|----------|----------------------|
| 4 | First earning event toast | Trigger: first earning > 0 sats detected via `/api/earnings` polling response (NOT a new emit-site in `boot-confirm`). Fires once ever per device gated by `opencook_first_earning_save_offered` localStorage flag. Copy + buttons unchanged. |
| 5 | Welcome gate detection | Detection condition: `isStandaloneMode() && !hasIdentity()`. No first-launch flag. Synchronous pre-hydration check in `IdentityProvider` lazy initializer. |

All other Status table rows (1, 2, 3, 6, 7, 8, 9, 10, 11, 12) unchanged.

## Build sequence within 3a

Sized for one focused chunk per agent-consult-then-build cycle. Per memory `feedback_consult_before_implementation`, each chunk gets an architect or designer consult on approach before code lands.

1. `useStandaloneMode()` hook — 30 min
2. `useInstallPlatform()` hook — 1 hour
3. `InstallContext` + `beforeinstallprompt` capture — 1 hour
4. `HomeScreenWelcomeGate` component — 2 hours
5. Welcome gate detection (sync pre-hydration check in `IdentityProvider`) — 30 min
6. `InstallPitch` component (inline section + bottom banner) — 2 hours
7. Install pitch trigger logic (gated behind recovery file save) — 1 hour
8. First earning event toast (wired to `/api/earnings` polling) — 1 hour
9. iOS post-install ITP toast — 1 hour
10. iPad UA detection edge — 15 min
11. Manual QA on iPhone — 2 hours

**Total: ~12 hours focused work.**

After 3a completes, the user's data-loss-adjacent multi-identity bug is fixed — every `Add to Home Screen` either silently restores (via Bucket 3 install pitch sequencing) or surfaces the welcome gate. No more silent sandbox identity creation.

**End of sequencing revision. 3a begins next.**
