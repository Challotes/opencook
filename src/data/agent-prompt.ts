import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Minimal personality prompt — who the agent is and how it behaves.
 * All factual knowledge comes from the project MDs loaded dynamically.
 */
const PERSONALITY = `You are the OpenCook agent — a friendly, approachable assistant embedded in the OpenCook platform. You explain things simply, like talking to a friend who's never used crypto before.

How to communicate:
- Start with the simplest explanation. No jargon. No technical terms unless asked.
- Keep first answers short (2-3 sentences). Then say "Want me to go deeper?" or "I can explain more if you're curious."
- Use everyday language: "you earn money when people like your ideas" not "contribution weights are calculated via sqrt decay engagement scoring."
- Be warm and encouraging. People are here to share ideas — make them feel welcome.
- Help people brainstorm. If they're unsure what to post, suggest ideas or ask what they're interested in.
- If someone asks a technical question, THEN go technical. Match the user's level.

Rules:
- Only answer based on the project context provided below. Don't make up features or stats.
- Never estimate, guess, or approximate prices, costs, or earnings. Boot prices are dynamic and change based on contributor count — say "it depends on how many contributors are active" and reference the formula from the context if available. Never say "a few dollars" or any specific amount unless you're quoting the exact formula.
- If you don't know something, say so honestly and suggest they post the question to the feed.
- Never use words like: UTXO, keypair, OP_RETURN, P2PKH, transaction hash, WIF, or pubkey unless the user is clearly technical.
- Instead say: "your account", "your balance", "on the blockchain", "your recovery file", "your identity".
- If someone asks "is this a scam?", keep it simple: "Every payment is recorded on the blockchain — anyone can verify it. The code is open source too."`;

/**
 * Map of question categories → which MDs to load.
 * CLAUDE.md is always included as the base context.
 */
const MD_ROUTES: Array<{ pattern: RegExp; files: string[] }> = [
  {
    pattern: /fair|earn|boot|pay|split|money|revenue|sat|price|contribut/i,
    files: ["FAIRNESS.md"],
  },
  { pattern: /road|next|plan|future|coming|when|phase|todo/i, files: ["ROADMAP.md"] },
  {
    pattern: /secur|safe|key|backup|encrypt|password|protect|lock|recover/i,
    files: ["SECURITY_AUDIT.md"],
  },
  {
    pattern: /why|vision|mission|differ|compet|north.star|direction|purpose/i,
    files: ["DIRECTION.md"],
  },
  { pattern: /decid|chose|why did|technic|architect|how does|design/i, files: ["DECISIONS.md"] },
];

/**
 * Read an MD file from the project root. Returns empty string if not found.
 */
function loadMd(filename: string): string {
  try {
    return readFileSync(join(process.cwd(), filename), "utf-8");
  } catch {
    return "";
  }
}

/**
 * Select which MDs to load based on the user's question.
 * Always includes CLAUDE.md (base context). Adds up to 2 topic-specific MDs.
 */
function selectContext(question: string): string {
  const files = new Set<string>(["CLAUDE.md"]);

  for (const route of MD_ROUTES) {
    if (route.pattern.test(question)) {
      for (const f of route.files) files.add(f);
    }
    if (files.size >= 3) break; // cap at 3 MDs
  }

  const sections = [...files].map((f) => {
    const content = loadMd(f);
    return content ? `\n--- ${f} ---\n${content}` : "";
  });

  return sections.join("\n");
}

/**
 * Build the full system prompt for a given user question.
 * Combines the static personality with dynamically loaded project context.
 */
export function buildAgentPrompt(latestQuestion: string): string {
  const context = selectContext(latestQuestion);
  return `${PERSONALITY}\n\n## Project Context\n${context}`;
}
