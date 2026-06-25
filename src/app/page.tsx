import { getBootboard, getPosts } from "./actions";
import { Feed } from "./Feed";

export const revalidate = 10;

export default async function Home() {
  const [posts, bootboard] = await Promise.all([getPosts(), getBootboard()]);

  return (
    // Fully black background (combines with themeColor "#000000" so both the
    // iOS PWA status-bar zone and Safari's URL bar read black). The previous
    // amber safe-area band at the top was removed at the OpenCook rebrand.
    <div className="h-[100dvh] text-white overflow-hidden touch-pan-x touch-pan-y overscroll-none bg-black">
      <Feed posts={posts} bootboard={bootboard} />
    </div>
  );
}
