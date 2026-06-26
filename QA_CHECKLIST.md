# OpenCook — Phase 8 Cross-Device QA Checklist

> **Temporary file** — the manual device-QA script the owner works through on real
> devices. Phase 6's 150 automated tests cover the server/money logic; this covers
> what tests can't reach: real devices, real PWA install, real wallets, and the
> rebrand looking right. `git rm` at launch-close (same lifecycle as LAUNCH_PLAN /
> LAUNCH_CHECKLIST). Mark each row PASS / FAIL / notes as you go.

## Before you start
- **Serve over HTTPS via the cloudflared tunnel** (the owner's method): build first, then
  tunnel — `npm run build && npm run start`, then `cloudflared tunnel --url http://localhost:3000`.
  **Use the production build, NOT `npm run dev`** — dev's React StrictMode double-fires
  effects and breaks the one-time flows you most need to test (PermanenceGate,
  IosStorageToast, first-earning toast). The tunnel's HTTPS URL is what
  enables PWA install + iOS Quick Look/ITP testing without a full deploy.
- **The tunnel URL changes each run, and an installed PWA caches that origin** — so install
  and finish a device's PWA section (A/B or C/D) within one tunnel session before restarting.
- **Device map (owner's kit):** iPhone 11 → Sections A+B; Samsung S22 Ultra → C+D; Desktop PC
  → E (+F if Firefox). Section G (desktop Safari) is macOS-only → SKIP.
- **Fund a fresh test wallet** with ~10,000 sats for paid boosts + the deposit flow.
  Not your production key — these trigger real transactions.
- **Two physical devices if possible** — an iPhone (Safari + installed PWA) and any
  Android (Chrome + PWA). Desktop in Chrome + Firefox.
- **Clear site data** on each test device first (iOS: Settings → Safari → Advanced →
  Website Data; desktop: DevTools → Application → Storage) for a clean first-visit.
- **Env state:** `BSV_SERVER_WIF` set + funded; `BSV_WALLET_SPEND_DISABLED` NOT set.

---

## Fragile-area hotspots (re-test every pass — these have ACTUALLY broken on real devices)
- **H1 — iOS PWA storage / ITP eviction.** iOS gives each "Add to Home Screen" a fresh sandbox; install-without-saved-file ⇒ empty identity. `HomeScreenWelcomeGate` + `IosStorageToast` exist for this. (SESSION_LOG 2026-05-11, E27–E28c.)
- **H2 — Balance vs affordability honesty.** `/api/balance` once summed confirmed+unconfirmed (overstated ~35%); paid boot then failed "not enough funds"; deposit shortfall omitted the network fee. Both fixed 2026-06-15. Headline = confirmed; "+X pending" separate; shortfall = price + fee.
- **H3 — Install-pitch sequencing/collision.** Must gate behind backedUp AND protected; `blockInstallPitch()` must stop it firing mid-protect/restore. (E32, 2026-06-03.)
- **H4 — iOS Quick Look recovery file.** Self-contained `.html`; inverse-noscript notice + static field render when JS is off. (E25, 2026-05-18.)
- **H5 — iCloud Keychain on passphrase.** Passphrase inputs use `autocomplete="off"` so iOS doesn't offer to save (and can't silently autofill a wrong value).
- **H6 — Session lockout.** Locked chip shows the cached name; tapping it must open `SignInModal`, NOT the You modal; boot/post must gate. (E30 → current.)
- **H7 — Mic (rebuilt, record + Groq Whisper).** `useVoiceToText` records → POSTs `/api/transcribe` → Groq Whisper. WORKING on Android + iPhone (Safari + PWA), tested 2026-06-26 (owner: looks right). Test ACTUAL transcription; "Voice input is offline" only when `GROQ_API_KEY` is unset. (Rebuilt 2026-06-25.)
- **H8 — Optimistic post UI.** Posts appear optimistically; resolve on re-poll; failed (rate-limit / rejected) show a reason then auto-remove ~3s. `daily_limit`/`paused` messages added 2026-06-16.
- **H9 — First-earning toast.** Fires when `/api/earnings` first returns total>0 (key `opencook_first_earning_save_dismissed_until`, 48h backoff). "Save now" → ProtectModal directly (no You-modal hop). (Fixed 2026-06-15.)
- **H10 — Android Chrome modal clipping.** `vh` clipped by the collapsing address bar → site-wide `vh`→`svh` sweep. (2026-06-03.)
- **H11 — Duplicate-outpoint UTXO.** WoC sometimes returns the same `(tx_hash,tx_pos)` twice; `dedupeUtxos` guards it (commit `7891355`). Watch for `bad-txns-inputs-duplicate`.
- **H12 — Paid-boot double-pay on network drop.** The critical one: a dropped `/api/boot-confirm` must NOT trigger a second broadcast (new txid = double-pay). F6 fix 2026-06-15.

---

## Launch-BLOCKERS (must be fixed before public launch if they fail)
- **BLOCKER-1 (B11) — Paid-boot double-pay on network drop** (H12). Real money loss.
- **BLOCKER-2 (A8/A9) — requireIdentity gate broken** — Boot/Post while locked must open SignInModal, never silently fire or bypass.
- **BLOCKER-3 (B5) — WelcomeGate restore loses passphrase** — restoring an encrypted file must yield a *protected* identity, never plaintext.
- **BLOCKER-4 (A11/C5) — FundAddress wrong shortfall** — must include the network fee (price + fee), or first paid boost fails twice.
- **BLOCKER-5 (A5/RB8/RB9/RB14) — "BSVibes" visible anywhere** — UI, recovery file, AI chat, /terms. Rebrand failure.
- **BLOCKER-6 (B7) — Version-gate not enforcing** — legacy/plaintext recovery files must be rejected (`unsupported_version`).

---

## Priority key
- **P0** — money / identity / data integrity (a failure = real loss → launch blocker)
- **P1** — onboarding / install / rebrand (degrades first-run or leaks old brand)
- **P2** — polish (annoying, not blocking)

---

## Section A — iPhone Safari (in-browser)
| # | Pri | Flow | Expected | P/F |
|---|-----|------|----------|-----|
| A1 | P0 | Fresh visit → auto-generate | Anon chip appears, no prompts, feed loads | |
| A2 | P0 | 2-click onboarding (type → Post) | PermanenceGate (first post), optimistic post, resolves to confirmed + green chain icon ≤5s | |
| A3 | P0 | Protect (passphrase ≥8) | Same address; recovery file offered; amber dot clears after save | |
| A4 | P0 | Recovery save → iOS share drawer (H4) | Native share sheet (not full-page popup); file `opencook-*.html` | |
| A5 | P0 | Recovery file content (RB8/9) | "OpenCook" title, OC favicon, opencook.fun footer, `opencook-` name; NO "BSVibes" | |
| A6 | P0 | Recovery file iOS Quick Look (H4/RB10) | "OpenCook" header, OC favicon; encrypted notice shows; Name/Address render statically | |
| A7 | P0 | Passphrase input — no Keychain prompt (H5) | iOS does NOT offer to save passphrase to iCloud Keychain | |
| A8 | P0 | Locked chip → SignInModal (H6) | Tapping chip opens SignInModal (not You modal); right passphrase unlocks; wrong shakes+errors | |
| A9 | P0 | Boot while locked → gate (H6) | SignInModal fires; after unlock user retaps Boot; no error after unlock | |
| A10 | P0 | Balance confirmed vs pending (H2) | Headline = confirmed only; "+X pending" separate muted line | |
| A11 | P0 | Paid boot → fee-aware FundAddress (H2) | Shortfall = price + network fee; "Network fee" row visible | |
| A12 | P1 | Install pitch gates (H3) | No pitch before backedUp+protected; appears after both | |
| A13 | P1 | Install pitch — no ProtectModal collision (H3) | Sheet waits until ProtectModal closes | |
| A14 | P1 | Install pitch — iOS manual instructions | Share→Add to Home Screen copy; chevron→bookmark chip; tap reopens | |
| A15 | P1 | First-earning toast (H9) | Fires ~30s after payout; "Save now"→ProtectModal direct; "Later"=48h suppress, no re-fire next load | |
| A16 | P1 | AI chat streaming (RB11) | Streams; NO "BSVibes"; footer "The code is open." ↗ | |
| A17 | P1 | Wordmark (RB1) | "Open" amber + "Cook" white; not "BSVibes" | |
| A18 | P1 | iOS amber top band removed (RB3) | Black behind the top; no amber stripe | |
| A19 | P1 | Permanence gate fires once | Fires first post; not on subsequent posts | |
| A20 | P1 | Mic button — record + transcribe (H7) | Tap → records → words appear (Groq Whisper); "Voice input is offline" only if key unset | |
| A21 | P2 | Optimistic failed → auto-remove (H8) | Failed post shows reason, auto-removes ~3s | |
| A22 | P2 | Legal pages (RB12) | "OpenCook" throughout; DRAFT banner; `[TODO]` shows; `[LAWYER]` does NOT | |
| A23 | P2 | Currency toggle | $↔sats; default is ALWAYS $ (no auto-flip); sats opt-in; choice persists | |
| A24 | P2 | Pull-to-refresh blocked | No iOS pull-to-refresh on the feed | |

## Section B — iPhone PWA (standalone, home-screen icon)
| # | Pri | Flow | Expected | P/F |
|---|-----|------|----------|-----|
| B1 | P0 | Standalone detection | Install pitch hidden (already installed) | |
| B2 | P0 | Identity carries from Safari (H1) | Same identity as Safari tab; no welcome gate if present | |
| B3 | P0 | iOS top band — standalone (RB3/15) | Black behind status bar (white clock on black); no amber | |
| B4 | P0 | IosStorageToast once | Fires after welcome gate; "Got it" dismisses; no re-fire | |
| B5 | P0 | WelcomeGate restore (H1, BLOCKER-3) | Clear data→reopen→gate→restore encrypted file→identity imported WITH passphrase (not plaintext) | |
| B6 | P0 | WelcomeGate "I don't have a recovery file" | Shows "set up in Safari first" instructions; NO identity generated (restore-only) | |
| B7 | P0 | WelcomeGate legacy file rejected (BLOCKER-6) | Plaintext/pre-v1 file → `unsupported_version`; gate stays open | |
| B8 | P0 | Recovery save in PWA — share drawer (H4) | Native share sheet, not full-page popup | |
| B9 | P0 | Free boot in PWA | Processes; Bootboard updates; no blank screen | |
| B10 | P0 | Paid boot in PWA (funded) | Client tx → confirm → Bootboard ≤5s | |
| B11 | P0 | Paid boot, network drop mid-confirm (H12, BLOCKER-1) | After broadcast, airplane-mode before confirm, restore — NO second broadcast, no double-charge | |
| B12 | P1 | App icon name (RB5) | Home-screen tile "OpenCook" | |
| B13 | P1 | Modals above keyboard | You-modal passphrase input not obscured by keyboard | |
| B14 | P2 | Session destroyed on blur | Unlock → switch apps → return → You modal locked again | |

## Section C — Android Chrome (in-browser)
| # | Pri | Flow | Expected | P/F |
|---|-----|------|----------|-----|
| C1 | P0 | Fresh visit | Anon chip, no prompts, feed loads | |
| C2 | P0 | 2-click onboarding | PermanenceGate → optimistic → confirmed + chain icon | |
| C3 | P0 | Protect + save | Android share sheet / `<a download>`; recovery file saves | |
| C4 | P0 | Balance confirmed vs pending (H2) | Headline confirmed; "+X pending" separate | |
| C5 | P0 | Paid boot fee-aware FundAddress (H2, BLOCKER-4) | Network fee row; shortfall = price + fee | |
| C6 | P1 | Install pitch one-tap (H3) | Native Android install dialog fires on tap (not the slide-up sheet) | |
| C7 | P1 | Install prompt name (RB5) | "OpenCook" | |
| C8 | P1 | Modals not clipped by address bar (H10) | You/FundAddress/SignIn not cut off; `svh` constrains | |
| C9 | P1 | UTXO dedup on sweep (H11) | No `bad-txns-inputs-duplicate` | |
| C10 | P2 | Legal pages (RB12) | "OpenCook" throughout; DRAFT banner | |

## Section D — Android PWA (standalone)
| # | Pri | Flow | Expected | P/F |
|---|-----|------|----------|-----|
| D1 | P0 | appinstalled → pitch gone | Install pitch hidden; standalone true | |
| D2 | P0 | Identity carries from Chrome | Same identity (Android storage stable, no ITP) | |
| D3 | P0 | Free + paid boot | Both work; Bootboard updates | |
| D4 | P1 | App name on home screen (RB5) | "OpenCook" | |
| D5 | P1 | OC icon on home screen (RB4) | OC monogram (O amber + C white on black) — PNG art generated this session, verify it renders | |
| D6 | P2 | Modals above address bar (H10) | Not clipped | |

## Section E — Desktop Chrome
| # | Pri | Flow | Expected | P/F |
|---|-----|------|----------|-----|
| E1 | P0 | 2-click onboarding | PermanenceGate → confirmed + chain icon | |
| E2 | P0 | Protect + save | `<a download>` path; file `opencook-*.html` to Downloads | |
| E3 | P0 | Recovery file in browser (RB9) | "OpenCook" title, OC favicon, opencook.fun footer; JS decrypt works | |
| E4 | P0 | Restore from file | Version-gate rejects legacy; v1 imports with passphrase | |
| E5 | P0 | Boot full flow | Free + paid; chain icon appears | |
| E6 | P0 | Health endpoint (F22) | GET /api/health → 200 JSON; NO WIF / NO address (only `addressConfigured`) | |
| E7 | P1 | Install pitch (one-tap) | Native Chrome install prompt fires | |
| E8 | P1 | Rebrand scan (RB1/6/11/12/14) | No "BSVibes" in tab title, header, /terms, /privacy, AI chat | |
| E9 | P1 | OG meta (RB7) | Share preview shows "OpenCook" copy | |
| E10 | P2 | Currency toggle | Works; default is ALWAYS $ (no auto-flip); persists | |
| E11 | P2 | Earnings sparkline | Renders (SVG), step shape matches payouts | |

## Section F — Desktop Firefox
| # | Pri | Flow | Expected | P/F |
|---|-----|------|----------|-----|
| F1 | P0 | Onboarding + posting | Works; no BSV SDK import errors (polyfills shimmed) | |
| F2 | P0 | Protect + save | `<a download>`; recovery file works | |
| F3 | P1 | No install pitch | Pitch absent (`installType: unsupported`) | |
| F4 | P1 | Rebrand scan | "OpenCook" throughout | |

## Section G — Desktop Safari (macOS)
| # | Pri | Flow | Expected | P/F |
|---|-----|------|----------|-----|
| G1 | P0 | Onboarding + posting | Works | |
| G2 | P0 | Protect + save | `<a download>`; file downloads | |
| G3 | P1 | Install pitch (manual instructions) | Slide-up sheet with Add-to-Dock / general instructions | |
| G4 | P2 | Rebrand scan | "OpenCook" throughout | |

---

## Progress tracker
| Device | Checks | Done | Blockers found |
|--------|--------|------|----------------|
| iPhone Safari (A) | 24 | | |
| iPhone PWA (B) | 14 | | |
| Android Chrome (C) | 10 | | |
| Android PWA (D) | 6 | | |
| Desktop Chrome (E) | 11 | | |
| Desktop Firefox (F) | 4 | | |
| Desktop Safari (G) | 4 | | |
| **Total** | **73** | | |

---

## What Phase 8 does NOT cover
Phase 6's 150 automated tests already verify server money conservation, all 7 createPost refuse-gates, the boot-confirm rejection paths, the durable sweep, and `/api/health`. Phase 8 is the real-device/UX layer only. Not covered (not built / deferred): in-app-browser splash, push notifications, QR device sync, ARC broadcast failover (Build D).

*Remove this file (`git rm QA_CHECKLIST.md`) at launch-close.*
