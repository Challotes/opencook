import { describe, expect, it } from "vitest";
import { cleanLegalMarkdown } from "./legal-doc";

describe("cleanLegalMarkdown", () => {
  it("strips the HTML draft comment and inline [LAWYER:] notes but keeps [TODO:] + body", () => {
    const raw = [
      "<!-- DRAFT — not legal advice — [LAWYER] review required before launch. -->",
      "",
      "# Title",
      "",
      "Body text with a real clause.",
      "`[LAWYER: this internal review note must NEVER reach users — strip it.]`",
      "",
      "Operator: **[TODO: OPERATOR LEGAL NAME]**.",
    ].join("\n");

    const out = cleanLegalMarkdown(raw);

    // Internal scaffolding must not leak to the public page.
    expect(out).not.toContain("[LAWYER");
    expect(out).not.toContain("must NEVER reach users");
    expect(out).not.toContain("<!--");
    // User-facing body + the honest [TODO:] placeholders are kept.
    expect(out).toContain("# Title");
    expect(out).toContain("Body text with a real clause.");
    expect(out).toContain("[TODO: OPERATOR LEGAL NAME]");
  });
});
