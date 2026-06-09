import { buildAgentPrompt } from "@/data/agent-prompt";
import { rateLimit } from "@/lib/rate-limit";

// Concurrency limiter — max 3 simultaneous Anthropic requests
let _activeRequests = 0;
const MAX_CONCURRENT = 3;

export async function POST(req: Request) {
  // Validate input
  let body: { messages?: { from: string; text: string }[] };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("Messages required", { status: 400 });
  }

  // Rate limit (use a generic key since we don't have user identity in route handlers)
  // Concurrency check — prevent overwhelming the Anthropic API
  if (_activeRequests >= MAX_CONCURRENT) {
    return new Response("Agent is busy — try again in a moment.", { status: 429 });
  }

  // Match the canonical pattern used by other external-API-proxying routes
  // (balance, tx-hex, unspent). Without `.split(",")[0]?.trim()` the raw
  // header (which contains all proxy hops) is used as the rate-limit key —
  // an attacker can prepend arbitrary IPs to extend their budget. The
  // `x-real-ip` fallback covers Vercel deploys where `x-forwarded-for` may
  // be absent; without it, every Vercel request collapses to one shared
  // "unknown" bucket. See SECURITY_AUDIT.md OBS-N1.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const rl = rateLimit(`agent:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!rl.success) {
    return new Response("Slow down — too many questions.", { status: 429 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response("Agent is offline — no API key configured.", { status: 503 });
  }

  // Cap to last 20 messages and limit content length
  const cappedMessages = messages.slice(-20);
  const apiMessages = cappedMessages
    .filter((m) => m.from === "user" || m.from === "agent")
    .map((m) => ({
      role: m.from === "user" ? ("user" as const) : ("assistant" as const),
      content: m.text.slice(0, 2000),
    }));

  _activeRequests++;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        system: buildAgentPrompt(apiMessages[apiMessages.length - 1]?.content ?? ""),
        messages: apiMessages,
        stream: true,
      }),
    });

    if (!res.ok || !res.body) {
      _activeRequests--;
      const err = await res.text();
      console.error("Agent API error:", err);
      return new Response("Agent had a hiccup — try again in a moment.", { status: 502 });
    }

    // Transform the Anthropic SSE stream into plain text chunks
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Process complete SSE lines
            const lines = buffer.split("\n");
            // Keep the last potentially incomplete line in the buffer
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6);
              if (data === "[DONE]") continue;

              try {
                const parsed = JSON.parse(data);
                if (
                  parsed.type === "content_block_delta" &&
                  parsed.delta?.type === "text_delta" &&
                  parsed.delta.text
                ) {
                  controller.enqueue(new TextEncoder().encode(parsed.delta.text));
                }
              } catch {
                // Skip malformed JSON lines
              }
            }
          }
        } catch (e) {
          console.error("Stream processing error:", e);
        } finally {
          _activeRequests--;
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (e) {
    _activeRequests--;
    console.error("Agent error:", e);
    return new Response("Couldn't reach the agent right now.", { status: 502 });
  }
}
