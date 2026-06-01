import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";
import * as db from "@/lib/db";
import { auth } from "@/auth";

function repIdOf(session: Session | null): string | undefined {
  return session?.user?.email ?? (session?.user as { id?: string } | undefined)?.id;
}

export async function GET(_req: NextRequest) {
  /* Identity comes from the session, never the client, so a rep can only ever
     list their own decks. */
  const repId = repIdOf(await auth());
  if (!repId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const decks = await db.listDecksByRep(repId);
    return NextResponse.json(decks);
  } catch (err) {
    console.error("[GET /api/decks]", err);
    return NextResponse.json({ error: "Failed to list decks" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const repId = repIdOf(await auth());
  if (!repId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  try {
    const deck = await db.createDeck({
      repId,
      productName:    body.productName   ?? "Untitled",
      targetPersona:  body.targetPersona ?? "",
      differentiators: body.differentiators ?? [],
      keyQuestions:   body.keyQuestions   ?? [],
    });
    return NextResponse.json(deck, { status: 201 });
  } catch (err) {
    console.error("[POST /api/decks]", err);
    return NextResponse.json({ error: "Failed to create deck" }, { status: 500 });
  }
}
