import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import * as db from "@/lib/db";
import { auth } from "@/auth";

/* One-time starter-card seed. Visit once (GET) while signed in: if your
 * workspace is empty, it creates a single demo deck pointing at the PDF that
 * lives in the repo (public/prez). Idempotent — it never adds a second copy.
 * Safe to delete once you've created your own decks. */

export const dynamic = "force-dynamic";

function repIdOf(session: Session | null): string | undefined {
  return session?.user?.email ?? (session?.user as { id?: string } | undefined)?.id;
}

export async function GET() {
  const repId = repIdOf(await auth());
  if (!repId) {
    return NextResponse.json({ error: "Sign in first, then reload this URL." }, { status: 401 });
  }

  const existing = await db.listDecksByRep(repId);
  if (existing.length > 0) {
    return NextResponse.json({ seeded: false, reason: "workspace not empty", count: existing.length });
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
    pdfUrl: "/prez/Claude Code Agents - overview.pdf",
    status: "ready",
  });

  return NextResponse.json({ seeded: true, deck: ready });
}
