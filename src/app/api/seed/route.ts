import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import * as db from "@/lib/db";
import { auth } from "@/auth";

/* One-time starter-card seed / upgrade. Visit (GET) while signed in:
 *   • no starter deck yet → creates one pointing at the repo PDF (public/prez)
 *   • starter deck exists but has no slides → upgrades it with the page count
 * Idempotent — never adds a second copy. Safe to delete once you have your own
 * decks. The committed PDF is 11 image-based slides (no text layer), so we set
 * totalSlides directly and use slide placeholders for slideTexts. */

export const dynamic = "force-dynamic";

const PDF_URL = "/prez/Claude Code Agents - overview.pdf";
const TOTAL_SLIDES = 11;
const SLIDE_TEXTS = Array.from({ length: TOTAL_SLIDES }, (_, i) => `[Slide ${i + 1}]`);

function repIdOf(session: Session | null): string | undefined {
  return session?.user?.email ?? (session?.user as { id?: string } | undefined)?.id;
}

export async function GET() {
  const repId = repIdOf(await auth());
  if (!repId) {
    return NextResponse.json({ error: "Sign in first, then reload this URL." }, { status: 401 });
  }

  const existing = await db.listDecksByRep(repId);
  const starter = existing.find((d) => d.pdfUrl === PDF_URL);

  // Upgrade path: starter deck already exists — fill in slides if missing.
  if (starter) {
    if (starter.totalSlides === TOTAL_SLIDES) {
      return NextResponse.json({ seeded: false, reason: "already complete", deck: starter });
    }
    const upgraded = await db.updateDeck(starter.id, {
      totalSlides: TOTAL_SLIDES,
      slideTexts: SLIDE_TEXTS,
      status: "ready",
    });
    return NextResponse.json({ seeded: true, action: "upgraded", deck: upgraded });
  }

  // Don't auto-seed into a workspace that already has other (non-starter) decks.
  if (existing.length > 0) {
    return NextResponse.json({ seeded: false, reason: "workspace has other decks", count: existing.length });
  }

  const deck = await db.createDeck({
    repId,
    productName: "Claude Code Agents — overview",
    targetPersona: "Engineering leaders evaluating AI coding agents",
    differentiators: [
      "Runs in your terminal, IDE, and CI",
      "Agentic multi-step task execution",
      "Works against your real repo with full context",
    ],
    keyQuestions: [
      "How does your team currently adopt AI coding tools?",
      "What slows your developers down most today?",
    ],
  });

  const ready = await db.updateDeck(deck.id, {
    pdfUrl: PDF_URL,
    slideTexts: SLIDE_TEXTS,
    totalSlides: TOTAL_SLIDES,
    status: "ready",
  });

  return NextResponse.json({ seeded: true, action: "created", deck: ready });
}
