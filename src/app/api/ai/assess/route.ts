import { NextRequest, NextResponse } from "next/server";
import { getLLMClient, AI_MODEL } from "@/lib/llm";
import type { FitSignal, FitConfidence } from "@/lib/types";

const FALLBACK = {
  fitSignal:  "Needs more info" as FitSignal,
  confidence: "Low"             as FitConfidence,
  rationale:  "Not enough information was captured to make a fit assessment.",
  painPoints: [],
  nextStep:   "Schedule a follow-up call to learn more.",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { chatHistory, prospectName, productName, targetPersona } = body;

    const transcript = (chatHistory as { role: string; text: string }[])
      ?.map(m => `${m.role === "ai" ? "AI" : prospectName}: ${m.text}`)
      .join("\n\n") ?? "";

    const prompt = `Based on this demo conversation about ${productName} with a ${targetPersona || "prospect"} named ${prospectName}:

Full transcript:
"""
${transcript.slice(0, 4000)}
"""

Extract and return a fit assessment JSON:
{
  "fitSignal": "Strong fit" | "Partial fit" | "Poor fit" | "Needs more info",
  "confidence": "High" | "Medium" | "Low",
  "rationale": "One sentence explaining the fit assessment based on specific things the prospect said",
  "painPoints": ["max 5 terse noun phrases representing discovered pain points or interests"],
  "nextStep": "Specific recommended next step for the sales rep (e.g. 'Book a 30-min technical deep-dive on CI/CD integration')"
}

Return valid JSON only, no markdown fences.`;

    const client  = getLLMClient();
    const completion = await client.chat.completions.create({
      model:       AI_MODEL,
      max_tokens:  512,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a sales intelligence analyst. Extract fit signals from prospect conversations. Always respond with valid JSON only." },
        { role: "user",   content: prompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    try {
      const parsed = JSON.parse(raw);
      return NextResponse.json({
        fitSignal:  parsed.fitSignal  ?? FALLBACK.fitSignal,
        confidence: parsed.confidence ?? FALLBACK.confidence,
        rationale:  parsed.rationale  ?? FALLBACK.rationale,
        painPoints: parsed.painPoints ?? [],
        nextStep:   parsed.nextStep   ?? FALLBACK.nextStep,
      });
    } catch {
      return NextResponse.json(FALLBACK);
    }
  } catch (err) {
    console.error("[POST /api/ai/assess]", err);
    return NextResponse.json(FALLBACK);
  }
}
