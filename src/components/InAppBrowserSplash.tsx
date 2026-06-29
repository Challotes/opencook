import type { MobileOS } from "@/lib/in-app-browser";
import { timeAgo } from "@/lib/utils";
import type { Post } from "@/types";
import { InAppBrowserCta } from "./InAppBrowserCta";
import { InAppStandaloneGuard } from "./InAppStandaloneGuard";

/**
 * Content-first splash for in-app social WebViews (Telegram/X/Instagram/…).
 *
 * Server component — rendered by `page.tsx` INSTEAD of `<Feed>` for in-app
 * sessions, BEFORE the identity provider mounts, so no BSV key is ever minted
 * in a throwaway in-app storage partition (funds-safe by construction). It
 * shows a static, read-only preview of the top posts so a visitor sees value
 * before the ask, then the only action is to open in a real browser. It
 * deliberately imports NO identity / boost / deposit surfaces. The lone client
 * children are the CTA and the standalone-guard (which rescues installed PWAs
 * that share a bare in-app UA). See DECISIONS "In-app browsers ... splash with a
 * window" (revised 2026-06-29).
 */
export function InAppBrowserSplash({
  posts,
  app,
  os,
}: {
  posts: Post[];
  app: string | null;
  os: MobileOS;
}) {
  // `app` is "Unknown" for fail-safe catches (bare WKWebView, Electron, empty UA)
  // — show generic copy rather than "Unknown's built-in browser".
  const named = app && app !== "Unknown" ? app : null;
  const preview = posts.slice(0, 5);

  return (
    <div className="min-h-[100dvh] overflow-y-auto bg-black text-white">
      {/* Installed PWAs share a bare in-app UA on iOS → redirect them to the app. */}
      <InAppStandaloneGuard />
      <div className="mx-auto max-w-md px-5 pt-10 pb-16">
        {/* Brand + one-liner (no crypto jargon on the splash — see DECISIONS). */}
        <h1 className="text-center text-3xl font-bold tracking-tight">
          <span className="text-amber-400">Open</span>Cook
        </h1>
        <p className="mt-2 text-center text-sm text-zinc-400">
          Ideas people back with real money. Every one logged permanently.
        </p>

        {/* Why switch + the CTA */}
        <div className="mt-6 rounded-2xl border border-amber-400/20 bg-[#0f0f0f] p-4">
          <p className="text-sm leading-relaxed text-zinc-300">
            You&apos;re viewing this inside{" "}
            {named ? (
              <span className="text-zinc-100">{named}&apos;s built-in browser</span>
            ) : (
              "an in-app browser"
            )}
            . It can&apos;t keep your account between sessions — and any earnings you make here
            won&apos;t travel with you. Open OpenCook in your real browser and your account is yours
            to keep. Takes about 10 seconds.
          </p>
          <div className="mt-4">
            <InAppBrowserCta os={os} />
          </div>
        </div>

        {/* Read-on framing — it's a window, not a wall. */}
        <p className="mt-6 text-center text-xs text-zinc-500">
          Scroll down for a taste of what&apos;s on OpenCook right now.
        </p>

        {/* Static, read-only preview. Inert markup — no BootButton/PostForm/IdentityBar. */}
        <div className="mt-4 space-y-3">
          <div className="text-[11px] uppercase tracking-wide text-zinc-600">
            Live on OpenCook right now
          </div>
          {preview.length > 0 ? (
            preview.map((p) => (
              <div key={p.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <span className="text-amber-400/80">{p.author_name}</span>
                  <span>·</span>
                  <span>{timeAgo(p.created_at)}</span>
                  {p.tx_id ? <span className="text-zinc-600">· ⛓ on-chain</span> : null}
                </div>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-zinc-100">
                  {p.content}
                </p>
                <div className="mt-2 text-[11px] text-zinc-500">🥾 {p.boot_count}</div>
              </div>
            ))
          ) : (
            <p className="text-sm text-zinc-500">
              New ideas are posted all the time — open in your browser to see them.
            </p>
          )}
          <p className="pt-1 text-center text-[11px] text-zinc-600">
            Reading is open to everyone. Posting and boosting need your real browser.
          </p>
        </div>

        {/* Misdetection escape hatch — a full navigation that bypasses the splash. */}
        <div className="mt-8 text-center">
          <a
            href="/?continue=1"
            className="text-[11px] text-zinc-600 underline underline-offset-2 hover:text-zinc-400"
          >
            This looks wrong? Continue anyway.
          </a>
        </div>
      </div>
    </div>
  );
}
