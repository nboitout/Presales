import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import { auth } from "@/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const deckId = req.nextUrl.searchParams.get("deckId") ?? "";
  if (!deckId) return NextResponse.json({ error: "deckId required" }, { status: 400 });

  try {
    /* Verify the requesting rep owns this deck */
    const deck = await db.getDeckById(deckId);
    if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 });
    const repId = session.user.email ?? (session.user as { id?: string }).id;
    if (deck.repId !== repId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const sessions = await db.listSessionsByDeck(deckId);
    return NextResponse.json(sessions);
  } catch (err) {
    console.error("[GET /api/sessions]", err);
    return NextResponse.json({ error: "Failed to list sessions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  /* Prospect sessions are created only after email verification, via the
     magic-link verify route. This endpoint is reserved for the authenticated
     rep (e.g. creating a session on a prospect's behalf). */
  const authSession = await auth();
  if (!authSession?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    if (!body.demoDeckId || !body.prospectName) {
      return NextResponse.json({ error: "demoDeckId and prospectName required" }, { status: 400 });
    }
    const deck = await db.getDeckById(body.demoDeckId);
    if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 });

    const session = await db.createSession({
      demoDeckId:    body.demoDeckId,
      prospectName:  body.prospectName,
      prospectEmail: body.prospectEmail,
      emailVerified: false,
      totalSlides:   deck.totalSlides,
    });
    return NextResponse.json({ sessionId: session.id, deck }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/sessions]", err);
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}
