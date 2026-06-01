import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";
import { auth } from "@/auth";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await db.getSessionById(params.id);
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(session);
  } catch (err) {
    console.error("[GET /api/sessions/[id]]", err);
    return NextResponse.json({ error: "Failed to fetch session" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body    = await req.json();
    const session = await db.updateSession(params.id, body);
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(session);
  } catch (err) {
    console.error("[PATCH /api/sessions/[id]]", err);
    return NextResponse.json({ error: "Failed to update session" }, { status: 500 });
  }
}

/* Honors a prospect's deletion / consent-withdrawal request. Rep-only:
   the prospect emails the contact address and the rep deletes here. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const authSession = await auth();
  if (!authSession?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const deleted = await db.deleteSession(params.id);
    if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/sessions/[id]]", err);
    return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
  }
}
