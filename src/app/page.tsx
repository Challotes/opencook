import { headers } from "next/headers";
import { InAppBrowserSplash } from "@/components/InAppBrowserSplash";
import { classifyInAppBrowser, detectMobileOS } from "@/lib/in-app-browser";
import { getBootboard, getPosts } from "./actions";
import { Feed } from "./Feed";

// Dynamic by necessity: we read the request `user-agent` to gate in-app social
// WebViews (Telegram/X/Instagram/…) into the content-first splash. Crawlers
// fall through to <Feed> so OG/SEO previews still server-render. See DECISIONS
// "In-app browsers ... splash with a window".

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ continue?: string }>;
}) {
  const [posts, bootboard] = await Promise.all([getPosts(), getBootboard()]);
  const ua = (await headers()).get("user-agent") ?? "";
  const { continue: continueAnyway } = await searchParams;
  const { inApp, app } = classifyInAppBrowser(ua);

  // In-app WebView (and not the "continue anyway" escape hatch) → render the
  // splash INSTEAD of <Feed>. <Feed> is the ONLY thing that mounts
  // IdentityProvider, so a key can never be minted in an in-app session.
  // Funds-safe by construction.
  if (inApp && continueAnyway !== "1") {
    return <InAppBrowserSplash posts={posts} app={app} os={detectMobileOS(ua)} />;
  }

  return (
    // Fully black background (combines with themeColor "#000000" so both the
    // iOS PWA status-bar zone and Safari's URL bar read black). The previous
    // amber safe-area band at the top was removed at the OpenCook rebrand.
    <div className="h-[100dvh] text-white overflow-hidden touch-pan-x touch-pan-y overscroll-none bg-black">
      <Feed posts={posts} bootboard={bootboard} />
    </div>
  );
}
