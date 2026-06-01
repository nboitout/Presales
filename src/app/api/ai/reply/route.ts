import { NextRequest, NextResponse } from "next/server";
import { getAnthropicClient, AI_MODEL, buildGroundedSystem } from "@/lib/anthropic";
import * as db from "@/lib/db";

const FALLBACK = { reply: "That's really helpful context. Let me know if you'd like to explore another aspect of this.", advanceSlide: false };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { deckId, slideNum, prospectMessage, productName, targetPersona, chatHistory, keyQuestions } = body;

    const deck = await db.getDeckById(deckId);
    const slideText = deck?.slideTexts?.[slideNum - 1] ?? `Slide ${slideNum}`;

    const questList = (keyQuestions as string[])?.length
      ? (keyQuestions as string[]).map((q: string) => `- ${q}`).join("\n")
      : "(none provided)";

    /* Stable per-deck context lives in the cached system block. */
    const deckContext =
      `Product: ${productName}\n` +
      `Audience: ${targetPersona || "prospect"}\n` +
      `Discovery questions the rep wants explored (weave in if relevant):\n${questList}`;

    const system = buildGroundedSystem({
      instruction: "You are a helpful, concise AI forward deployed advisor answering a prospect's question about the current slide. Always respond with valid JSON only.",
      deckContext,
      groundingDoc: deck?.groundingDoc,
    });

    const prompt = `Current slide context: """${slideText.slice(0, 400)}"""

The prospect just said: "${prospectMessage}"

Instructions:
1. Acknowledge their response empathetically in 1 sentence.
2. Connect their situation to how ${productName} addresses it (1-2 sentences), grounded in the reference material. Be specific, not generic.
3. Either ask the next discovery question OR signal you're ready to move to the next slide.
4. Set "advanceSlide" to true only when the exchange on this slide feels complete (prospect has shared meaningful context).

Return valid JSON only, no markdown fences:
{"reply": "...", "advanceSlide": true/false}`;

    const client  = getAnthropicClient();
    const message = await client.messages.create({
      model:      AI_MODEL,
      max_tokens: 512,
      system,
      messages:   [
        ...((chatHistory as { role: string; text: string }[])?.slice(-8).map(m => ({
          role:    (m.role === "ai" ? "assistant" : "user") as "assistant" | "user",
          content: m.text,
        })) ?? []),
        { role: "user", content: prompt },
      ],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text.trim() : "";
    try {
      const parsed = JSON.parse(raw);
      return NextResponse.json({ reply: parsed.reply ?? FALLBACK.reply, advanceSlide: Boolean(parsed.advanceSlide) });
    } catch {
      return NextResponse.json(FALLBACK);
    }
  } catch (err) {
    console.error("[POST /api/ai/reply]", err);
    return NextResponse.json(FALLBACK);
  }
}
