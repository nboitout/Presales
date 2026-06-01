import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const deck = await db.getDeckById(params.id);
    if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });
    /* Grounding doc is for the AI's context only — never expose its text to the
       client (the prospect session page fetches this endpoint). Keep the name. */
    return NextResponse.json({ ...deck, groundingDoc: "" });
  } catch (err) {
    console.error("[GET /api/decks/[id]]", err);
    return NextResponse.json({ error: "Failed to fetch deck" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body  = await req.json();
    const deck  = await db.updateDeck(params.id, body);
    if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ...deck, groundingDoc: "" });
  } catch (err) {
    console.error("[PATCH /api/decks/[id]]", err);
    return NextResponse.json({ error: "Failed to update deck" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await db.deleteDeck(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/decks/[id]]", err);
    return NextResponse.json({ error: "Failed to delete deck" }, { status: 500 });
  }
}
