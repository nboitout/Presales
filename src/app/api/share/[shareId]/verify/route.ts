import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";

/** Reasons surfaced back on the entry page when a link can't be used. */
type Reason = "invalid" | "expired" | "used";

function bounce(req: NextRequest, shareId: string, reason: Reason) {
  const url = new URL(`/demo/${shareId}`, req.nextUrl.origin);
  url.searchParams.set("linkError", reason);
  return NextResponse.redirect(url);
}

/**
 * Verifies a one-time magic-link token. On success, creates a verified
 * prospect session and redirects into the chatbot. The token proves the
 * prospect controls the email — the session id is only ever minted here.
 */
export async function GET(req: NextRequest, { params }: { params: { shareId: string } }) {
  try {
    const token = req.nextUrl.searchParams.get("token") ?? "";
    if (!token) return bounce(req, params.shareId, "invalid");

    const link = await db.getMagicLink(token);
    if (!link || link.shareId !== params.shareId) return bounce(req, params.shareId, "invalid");

    /* Already used → reuse the session it created (idempotent re-clicks). */
    if (link.usedAt) {
      if (link.sessionId) {
        const url = new URL(`/demo/${params.shareId}/session`, req.nextUrl.origin);
        url.searchParams.set("sid", link.sessionId);
        return NextResponse.redirect(url);
      }
      return bounce(req, params.shareId, "used");
    }

    if (new Date(link.expiresAt).getTime() < Date.now()) {
      return bounce(req, params.shareId, "expired");
    }

    const deck = await db.getDeckById(link.deckId);
    if (!deck) return bounce(req, params.shareId, "invalid");

    const session = await db.createSession({
      demoDeckId:    deck.id,
      prospectName:  link.prospectName,
      prospectEmail: link.prospectEmail,
      emailVerified: true,
      totalSlides:   deck.totalSlides,
    });
    await db.consumeMagicLink(token, session.id);

    const url = new URL(`/demo/${params.shareId}/session`, req.nextUrl.origin);
    url.searchParams.set("sid", session.id);
    return NextResponse.redirect(url);
  } catch (err) {
    console.error("[GET /api/share/[shareId]/verify]", err);
    return bounce(req, params.shareId, "invalid");
  }
}
