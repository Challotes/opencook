import type { ReactNode } from "react";

/**
 * Minimal markdown renderer for the legal pages (Phase 3 surfacing) — a focused
 * subset (headings, paragraphs, `-` lists, `>` blockquotes, `---` rules, **bold**,
 * `code`), so we render readable legal prose without adding a markdown dependency.
 * Input is OUR committed `legal/*.md` content (trusted), so this returns JSX
 * elements — no `dangerouslySetInnerHTML`.
 */

function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(/(\*\*[^*]+\*\*|`[^`]+`)/g)) {
    const idx = match.index;
    if (idx > last) out.push(text.slice(last, idx));
    const tok = match[0];
    if (tok.startsWith("**")) {
      out.push(
        <strong key={`b${key++}`} className="font-semibold text-zinc-100">
          {tok.slice(2, -2)}
        </strong>
      );
    } else {
      out.push(
        <code
          key={`c${key++}`}
          className="rounded bg-zinc-800 px-1 py-0.5 text-[0.85em] text-zinc-200"
        >
          {tok.slice(1, -1)}
        </code>
      );
    }
    last = idx + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function LegalDoc({ markdown }: { markdown: string }) {
  const lines = markdown.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
    } else if (line.startsWith("### ")) {
      blocks.push(
        <h3 key={key++} className="mt-5 text-sm font-semibold text-zinc-100">
          {renderInline(line.slice(4))}
        </h3>
      );
      i++;
    } else if (line.startsWith("## ")) {
      blocks.push(
        <h2 key={key++} className="mt-7 text-base font-semibold text-white">
          {renderInline(line.slice(3))}
        </h2>
      );
      i++;
    } else if (line.startsWith("# ")) {
      blocks.push(
        <h1 key={key++} className="text-xl font-bold text-white">
          {renderInline(line.slice(2))}
        </h1>
      );
      i++;
    } else if (line.trim() === "---") {
      blocks.push(<hr key={key++} className="my-6 border-zinc-800" />);
      i++;
    } else if (line.startsWith("> ")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        buf.push(lines[i].slice(2));
        i++;
      }
      blocks.push(
        <blockquote
          key={key++}
          className="mt-4 border-l-2 border-amber-500/40 bg-amber-950/10 px-3 py-2 text-sm text-amber-200/90"
        >
          {renderInline(buf.join(" "))}
        </blockquote>
      );
    } else if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(lines[i].slice(2));
        i++;
      }
      blocks.push(
        <ul
          key={key++}
          className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-300"
        >
          {items.map((it, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static legal content, order is stable
            <li key={j}>{renderInline(it)}</li>
          ))}
        </ul>
      );
    } else {
      const para: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        !lines[i].startsWith("#") &&
        !lines[i].startsWith("- ") &&
        !lines[i].startsWith("> ") &&
        lines[i].trim() !== "---"
      ) {
        para.push(lines[i]);
        i++;
      }
      blocks.push(
        <p key={key++} className="mt-3 text-sm leading-relaxed text-zinc-300">
          {renderInline(para.join(" "))}
        </p>
      );
    }
  }

  return <>{blocks}</>;
}
