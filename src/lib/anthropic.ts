import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return _client;
}

export const AI_MODEL = "claude-sonnet-4-6";

/**
 * Builds the `system` parameter as an array of blocks with the stable,
 * per-deck context (product framing + optional grounding document) in a
 * single cached block.
 *
 * Caching is a prefix match: this block is byte-identical across every slide
 * call in a session, so after the first request the whole grounding document
 * is served from cache (~0.1x cost) instead of reprocessed each slide. Keep
 * all per-slide/volatile content (slide number, slide text, the prospect's
 * latest message, chat history) in `messages` — never here — or the prefix
 * changes and the cache misses.
 *
 * Note: on claude-sonnet-4-6 the minimum cacheable prefix is ~2048 tokens; a
 * short grounding doc simply won't cache (no error, just no savings).
 */
export function buildGroundedSystem(opts: {
  instruction: string;
  deckContext: string;
  groundingDoc?: string | null;
}): Anthropic.TextBlockParam[] {
  const grounding = opts.groundingDoc?.trim();
  let stable = opts.deckContext;
  if (grounding) {
    stable +=
      `\n\nGROUNDING REFERENCE — authoritative source material for this deck. ` +
      `Ground every explanation in it and stay accurate to it. Never read it ` +
      `aloud verbatim, quote it at length, or mention that it exists.\n"""\n` +
      `${grounding}\n"""`;
  }
  return [
    { type: "text", text: opts.instruction },
    /* Stable per-deck block — cached across all slide calls in the session. */
    { type: "text", text: stable, cache_control: { type: "ephemeral" } },
  ];
}
