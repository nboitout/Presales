import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import { sendMagicLink } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Passwordless entry: a prospect submits name + email, we email them a
 * one-time link. No password, no account. We capture the email (and its
 * domain) as a fit signal but never block on it.
 */
export async function POST(req: NextRequest, { params }: { params: { shareId: string } }) {
  try {
    const { name, email } = await req.json();
    const cleanName  = (name as string | undefined)?.trim() ?? "";
    const cleanEmail = (email as string | undefined)?.trim().toLowerCase() ?? "";

    if (!cleanName) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!EMAIL_RE.test(cleanEmail)) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    }

    const deck = await db.getDeckByShareId(params.shareId);
    if (!deck) return NextResponse.json({ error: "Demo not found" }, { status: 404 });
    if (deck.status !== "ready") {
      return NextResponse.json({ error: "This demo isn't ready yet" }, { status: 409 });
    }

    const magic = await db.createMagicLink({
      deckId:        deck.id,
      shareId:       params.shareId,
      prospectName:  cleanName,
      prospectEmail: cleanEmail,
    });

    const link = `${req.nextUrl.origin}/api/share/${params.shareId}/verify?token=${magic.token}`;
    const { delivered } = await sendMagicLink({
      to: cleanEmail,
      name: cleanName,
      productName: deck.productName,
      link,
    });

    /* In non-production without an email provider, surface the link so the
       flow is testable. Never leak it in production. */
    const devLink = !delivered && process.env.NODE_ENV !== "production" ? link : undefined;

    return NextResponse.json({ ok: true, delivered, devLink });
  } catch (err) {
    console.error("[POST /api/share/[shareId]/request-link]", err);
    return NextResponse.json({ error: "Could not send your link. Please try again." }, { status: 500 });
  }
}
