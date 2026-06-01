import { AzureOpenAI } from "openai";

let _client: AzureOpenAI | null = null;

/**
 * Azure OpenAI client. Configure with:
 *   AZURE_OPENAI_ENDPOINT     e.g. https://<resource>.openai.azure.com
 *   AZURE_OPENAI_API_KEY      key from the Azure portal
 *   AZURE_OPENAI_DEPLOYMENT   your deployment name (used as the model)
 *   OPENAI_API_VERSION        e.g. 2024-10-21 (optional; sensible default)
 */
export function getLLMClient(): AzureOpenAI {
  if (!_client) {
    _client = new AzureOpenAI({
      endpoint:   process.env.AZURE_OPENAI_ENDPOINT,
      apiKey:     process.env.AZURE_OPENAI_API_KEY,
      apiVersion: process.env.OPENAI_API_VERSION ?? "2024-10-21",
    });
  }
  return _client;
}

/** Deployment name doubles as the model id on Azure OpenAI. */
export const AI_MODEL = process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-4o";

/**
 * Builds the system message with the stable, per-deck context (product framing
 * + optional grounding document) up front.
 *
 * Azure OpenAI caches the longest common prompt prefix automatically (no
 * markers needed) for prefixes ≥ ~1024 tokens. Because this system message is
 * byte-identical across every slide call in a session and sits first in the
 * messages array, the grounding document is served from cache after the first
 * request. Keep all per-slide/volatile content (slide number, slide text, the
 * prospect's latest message, chat history) in the user/assistant turns — never
 * here — or the cached prefix changes.
 */
export function buildGroundedSystem(opts: {
  instruction: string;
  deckContext: string;
  groundingDoc?: string | null;
}): string {
  const grounding = opts.groundingDoc?.trim();
  let system = `${opts.instruction}\n\n${opts.deckContext}`;
  if (grounding) {
    system +=
      `\n\nGROUNDING REFERENCE — authoritative source material for this deck. ` +
      `Ground every explanation in it and stay accurate to it. Never read it ` +
      `aloud verbatim, quote it at length, or mention that it exists.\n"""\n` +
      `${grounding}\n"""`;
  }
  return system;
}
