import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: { shareId: string } }) {
  try {
    const deck = await db.getDeckByShareId(params.shareId);
    if (!deck) return NextResponse.json({ error: "Demo not found" }, { status: 404 });
    /* Return only public fields — never expose repId, keyQuestions, slideTexts */
    return NextResponse.json({
      deckId:        deck.id,
      productName:   deck.productName,
      targetPersona: deck.targetPersona,
      status:        deck.status,
      contactEmail:  process.env.PRIVACY_CONTACT_EMAIL ?? "",
    });
  } catch (err) {
    console.error("[GET /api/share/[shareId]]", err);
    return NextResponse.json({ error: "Failed to resolve share link" }, { status: 500 });
  }
}
