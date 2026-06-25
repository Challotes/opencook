import { getBootboard, getPosts } from "./actions";
import { Feed } from "./Feed";

export const revalidate = 10;

export default async function Home() {
  const [posts, bootboard] = await Promise.all([getPosts(), getBootboard()]);

  return (
    // Fully black background (combines with themeColor "#000000" so both the
    // iOS PWA status-bar zone and Safari's URL bar read black). The previous
    // amber safe-area band at the top was removed at the OpenCook rebrand.
    <div
      className="text-white overflow-hidden touch-pan-x touch-pan-y overscroll-none bg-black"
      style={{
        // Track the visible viewport (set by useViewportHeight); fall back to
        // 100dvh on the server / pre-mount. translateY keeps the shell's top
        // pinned to the top of the visible band when the keyboard shifts it. (#6)
        height: "var(--app-height, 100dvh)",
        transform: "translateY(var(--app-vv-top, 0px))",
      }}
    >
      <Feed posts={posts} bootboard={bootboard} />
    </div>
  );
}
