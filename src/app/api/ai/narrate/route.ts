import { NextRequest, NextResponse } from "next/server";
import { getAnthropicClient, AI_MODEL, buildGroundedSystem } from "@/lib/anthropic";
import * as db from "@/lib/db";

const FALLBACK = { narration: "Let me walk you through this section.", question: "What are your current challenges in this area?" };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { deckId, slideNum, productName, targetPersona, differentiators, chatHistory } = body;

    /* Fetch slide text + grounding doc from DB */
    const deck = await db.getDeckById(deckId);
    const slideText = deck?.slideTexts?.[slideNum - 1] ?? `Slide ${slideNum}`;

    const diffList = (differentiators as string[])?.length
      ? (differentiators as string[]).map((d: string) => `- ${d}`).join("\n")
      : "(none provided)";

    /* Stable per-deck context lives in the cached system block; only the
       per-slide details below stay in the user message. */
    const deckContext =
      `Product: ${productName}\n` +
      `Audience: ${targetPersona || "prospect"}\n` +
      `Key differentiators to weave in naturally (do NOT list them mechanically):\n${diffList}`;

    const system = buildGroundedSystem({
      instruction: "You are a helpful, concise AI forward deployed advisor presenting a technical deck slide by slide. Always respond with valid JSON only.",
      deckContext,
      groundingDoc: deck?.groundingDoc,
    });

    const prompt = `The prospect is currently viewing slide ${slideNum}.

Slide content:
"""
${slideText}
"""

Your task:
1. Narrate this slide in 2-3 accessible sentences — explain the business value, not just describe the content. Ground your explanation in the reference material.
2. Ask ONE discovery question about the prospect's current setup, pain points, or goals related to this slide's content.

Return valid JSON only, no markdown fences:
{"narration": "...", "question": "..."}`;

    const client = getAnthropicClient();
    const message = await client.messages.create({
      model:      AI_MODEL,
      max_tokens: 512,
      system,
      messages:   [
        ...((chatHistory as { role: string; text: string }[])?.slice(-6).map(m => ({
          role:    (m.role === "ai" ? "assistant" : "user") as "assistant" | "user",
          content: m.text,
        })) ?? []),
        { role: "user", content: prompt },
      ],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text.trim() : "";
    try {
      const parsed = JSON.parse(raw);
      return NextResponse.json({ narration: parsed.narration ?? FALLBACK.narration, question: parsed.question ?? FALLBACK.question });
    } catch {
      return NextResponse.json(FALLBACK);
    }
  } catch (err) {
    console.error("[POST /api/ai/narrate]", err);
    return NextResponse.json(FALLBACK);
  }
}
