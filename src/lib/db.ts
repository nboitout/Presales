import { v4 as uuidv4 } from "uuid";
import type { DemoDeck, ProspectSession, MagicLink, FitSignal, FitConfidence } from "./types";

/* ───────────────────────────────────────────────────────────────────────────
 * Dual-driver data layer.
 *
 *   • Production (Vercel)  → PostgreSQL, when POSTGRES_URL / DATABASE_URL is set.
 *   • Local development    → SQLite file (local.db), the zero-config fallback.
 *
 * Every public function is async and engine-agnostic; callers don't care which
 * backend is live. SQL is written once with `?` placeholders and translated to
 * `$1, $2, …` for Postgres.
 * ────────────────────────────────────────────────────────────────────────── */

const PG_URL = process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? "";
const usePg = PG_URL.length > 0;

type Row = Record<string, unknown>;

interface Backend {
  all(sql: string, params?: unknown[]): Promise<Row[]>;
  get(sql: string, params?: unknown[]): Promise<Row | undefined>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
}

/* ── SQLite backend (local dev) ───────────────────────────── */

function createSqliteBackend(): Backend {
  // Lazy require so better-sqlite3's native binding is never loaded in
  // serverless/Postgres environments where it isn't needed.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require("better-sqlite3");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require("path");

  const db = new Database(path.join(process.cwd(), "local.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS demo_decks (
      id             TEXT PRIMARY KEY,
      rep_id         TEXT NOT NULL,
      product_name   TEXT NOT NULL,
      target_persona TEXT DEFAULT '',
      differentiators TEXT DEFAULT '[]',
      key_questions  TEXT DEFAULT '[]',
      pdf_url        TEXT,
      slide_texts    TEXT DEFAULT '[]',
      grounding_doc      TEXT DEFAULT '',
      grounding_doc_name TEXT DEFAULT '',
      total_slides   INTEGER DEFAULT 0,
      share_id       TEXT UNIQUE NOT NULL,
      status         TEXT DEFAULT 'draft',
      session_count  INTEGER DEFAULT 0,
      created_at     TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS prospect_sessions (
      id                   TEXT PRIMARY KEY,
      demo_deck_id         TEXT REFERENCES demo_decks(id) ON DELETE CASCADE,
      prospect_name        TEXT NOT NULL,
      prospect_email       TEXT,
      email_verified       INTEGER DEFAULT 0,
      training_consent     INTEGER DEFAULT 0,
      status               TEXT DEFAULT 'active',
      current_slide        INTEGER DEFAULT 1,
      total_slides         INTEGER DEFAULT 0,
      slide_history        TEXT DEFAULT '[]',
      chat_history         TEXT DEFAULT '[]',
      discovered_pain_points TEXT DEFAULT '[]',
      fit_signal           TEXT,
      fit_confidence       TEXT,
      fit_rationale        TEXT,
      next_step            TEXT,
      rep_notes            TEXT,
      created_at           TEXT DEFAULT (datetime('now')),
      completed_at         TEXT
    );

    CREATE TABLE IF NOT EXISTS magic_links (
      token          TEXT PRIMARY KEY,
      deck_id        TEXT NOT NULL,
      share_id       TEXT NOT NULL,
      prospect_name  TEXT NOT NULL,
      prospect_email TEXT NOT NULL,
      training_consent INTEGER DEFAULT 0,
      session_id     TEXT,
      expires_at     TEXT NOT NULL,
      used_at        TEXT,
      created_at     TEXT DEFAULT (datetime('now'))
    );
  `);

  // Migrations for pre-existing local DBs.
  const addColumnIfMissing = (table: string, column: string, ddl: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
  };
  addColumnIfMissing("prospect_sessions", "email_verified", "email_verified INTEGER DEFAULT 0");
  addColumnIfMissing("prospect_sessions", "training_consent", "training_consent INTEGER DEFAULT 0");
  addColumnIfMissing("magic_links", "training_consent", "training_consent INTEGER DEFAULT 0");
  addColumnIfMissing("demo_decks", "grounding_doc", "grounding_doc TEXT DEFAULT ''");
  addColumnIfMissing("demo_decks", "grounding_doc_name", "grounding_doc_name TEXT DEFAULT ''");

  return {
    async all(sql, params = []) {
      return db.prepare(sql).all(...params) as Row[];
    },
    async get(sql, params = []) {
      return db.prepare(sql).get(...params) as Row | undefined;
    },
    async run(sql, params = []) {
      const res = db.prepare(sql).run(...params);
      return { changes: res.changes };
    },
  };
}

/* ── PostgreSQL backend (production) ──────────────────────── */

function createPgBackend(): Backend {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Pool } = require("pg");

  const pool = new Pool({
    connectionString: PG_URL,
    // Azure Database for PostgreSQL enforces SSL. Managed certs aren't in the
    // serverless trust store, so don't reject the chain.
    ssl:
      PG_URL.includes("localhost") || PG_URL.includes("127.0.0.1")
        ? false
        : { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 30_000,
  });

  // `?` → `$1, $2, …`
  const toPg = (sql: string) => {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  };

  let initPromise: Promise<void> | null = null;
  const ensureSchema = () =>
    (initPromise ??= (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS demo_decks (
          id             TEXT PRIMARY KEY,
          rep_id         TEXT NOT NULL,
          product_name   TEXT NOT NULL,
          target_persona TEXT DEFAULT '',
          differentiators TEXT DEFAULT '[]',
          key_questions  TEXT DEFAULT '[]',
          pdf_url        TEXT,
          slide_texts    TEXT DEFAULT '[]',
          grounding_doc      TEXT DEFAULT '',
          grounding_doc_name TEXT DEFAULT '',
          total_slides   INTEGER DEFAULT 0,
          share_id       TEXT UNIQUE NOT NULL,
          status         TEXT DEFAULT 'draft',
          session_count  INTEGER DEFAULT 0,
          created_at     TEXT DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
        );

        CREATE TABLE IF NOT EXISTS prospect_sessions (
          id                   TEXT PRIMARY KEY,
          demo_deck_id         TEXT REFERENCES demo_decks(id) ON DELETE CASCADE,
          prospect_name        TEXT NOT NULL,
          prospect_email       TEXT,
          email_verified       INTEGER DEFAULT 0,
          training_consent     INTEGER DEFAULT 0,
          status               TEXT DEFAULT 'active',
          current_slide        INTEGER DEFAULT 1,
          total_slides         INTEGER DEFAULT 0,
          slide_history        TEXT DEFAULT '[]',
          chat_history         TEXT DEFAULT '[]',
          discovered_pain_points TEXT DEFAULT '[]',
          fit_signal           TEXT,
          fit_confidence       TEXT,
          fit_rationale        TEXT,
          next_step            TEXT,
          rep_notes            TEXT,
          created_at           TEXT DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
          completed_at         TEXT
        );

        CREATE TABLE IF NOT EXISTS magic_links (
          token          TEXT PRIMARY KEY,
          deck_id        TEXT NOT NULL,
          share_id       TEXT NOT NULL,
          prospect_name  TEXT NOT NULL,
          prospect_email TEXT NOT NULL,
          training_consent INTEGER DEFAULT 0,
          session_id     TEXT,
          expires_at     TEXT NOT NULL,
          used_at        TEXT,
          created_at     TEXT DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
        );

        ALTER TABLE prospect_sessions ADD COLUMN IF NOT EXISTS email_verified INTEGER DEFAULT 0;
        ALTER TABLE prospect_sessions ADD COLUMN IF NOT EXISTS training_consent INTEGER DEFAULT 0;
        ALTER TABLE magic_links       ADD COLUMN IF NOT EXISTS training_consent INTEGER DEFAULT 0;
        ALTER TABLE demo_decks        ADD COLUMN IF NOT EXISTS grounding_doc TEXT DEFAULT '';
        ALTER TABLE demo_decks        ADD COLUMN IF NOT EXISTS grounding_doc_name TEXT DEFAULT '';
      `);
    })());

  return {
    async all(sql, params = []) {
      await ensureSchema();
      const res = await pool.query(toPg(sql), params);
      return res.rows as Row[];
    },
    async get(sql, params = []) {
      await ensureSchema();
      const res = await pool.query(toPg(sql), params);
      return res.rows[0] as Row | undefined;
    },
    async run(sql, params = []) {
      await ensureSchema();
      const res = await pool.query(toPg(sql), params);
      return { changes: res.rowCount ?? 0 };
    },
  };
}

/* ── Singleton (survives serverless warm invocations) ─────── */

const globalForDb = globalThis as unknown as { __fdaBackend?: Backend };

function backend(): Backend {
  if (!globalForDb.__fdaBackend) {
    globalForDb.__fdaBackend = usePg ? createPgBackend() : createSqliteBackend();
  }
  return globalForDb.__fdaBackend;
}

/* ── DemoDeck helpers ─────────────────────────────────────── */

function rowToDeck(row: Row): DemoDeck {
  return {
    id:              row.id as string,
    repId:           row.rep_id as string,
    productName:     row.product_name as string,
    targetPersona:   (row.target_persona as string) ?? "",
    differentiators: JSON.parse((row.differentiators as string) ?? "[]"),
    keyQuestions:    JSON.parse((row.key_questions  as string) ?? "[]"),
    pdfUrl:          (row.pdf_url as string) ?? null,
    slideTexts:      JSON.parse((row.slide_texts  as string) ?? "[]"),
    groundingDoc:     (row.grounding_doc as string) ?? "",
    groundingDocName: (row.grounding_doc_name as string) ?? "",
    totalSlides:     Number(row.total_slides ?? 0),
    shareId:         row.share_id as string,
    status:          (row.status as "draft" | "ready") ?? "draft",
    sessionCount:    Number(row.session_count ?? 0),
    createdAt:       row.created_at as string,
  };
}

export async function createDeck(data: {
  repId: string;
  productName: string;
  targetPersona: string;
  differentiators: string[];
  keyQuestions: string[];
}): Promise<DemoDeck> {
  const id      = uuidv4();
  const shareId = uuidv4();
  const db      = backend();
  await db.run(
    `INSERT INTO demo_decks (id, rep_id, product_name, target_persona, differentiators, key_questions, share_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, data.repId, data.productName, data.targetPersona,
     JSON.stringify(data.differentiators), JSON.stringify(data.keyQuestions), shareId]
  );
  return rowToDeck((await db.get("SELECT * FROM demo_decks WHERE id = ?", [id]))!);
}

export async function getDeckById(id: string): Promise<DemoDeck | null> {
  const row = await backend().get("SELECT * FROM demo_decks WHERE id = ?", [id]);
  return row ? rowToDeck(row) : null;
}

export async function getDeckByShareId(shareId: string): Promise<DemoDeck | null> {
  const row = await backend().get("SELECT * FROM demo_decks WHERE share_id = ?", [shareId]);
  return row ? rowToDeck(row) : null;
}

export async function listDecksByRep(repId: string): Promise<DemoDeck[]> {
  const rows = await backend().all(
    `SELECT d.*, COUNT(s.id) AS session_count_live
     FROM demo_decks d
     LEFT JOIN prospect_sessions s ON s.demo_deck_id = d.id
     WHERE d.rep_id = ?
     GROUP BY d.id
     ORDER BY d.created_at DESC`,
    [repId]
  );
  return rows.map((r) => ({ ...rowToDeck(r), sessionCount: Number(r.session_count_live ?? 0) }));
}

export async function updateDeck(
  id: string,
  patch: Partial<{
    productName: string;
    targetPersona: string;
    differentiators: string[];
    keyQuestions: string[];
    pdfUrl: string;
    slideTexts: string[];
    groundingDoc: string;
    groundingDocName: string;
    totalSlides: number;
    status: "draft" | "ready";
  }>
): Promise<DemoDeck | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];

  if (patch.productName      != null) { sets.push("product_name = ?");       vals.push(patch.productName); }
  if (patch.targetPersona    != null) { sets.push("target_persona = ?");     vals.push(patch.targetPersona); }
  if (patch.differentiators  != null) { sets.push("differentiators = ?");    vals.push(JSON.stringify(patch.differentiators)); }
  if (patch.keyQuestions     != null) { sets.push("key_questions = ?");      vals.push(JSON.stringify(patch.keyQuestions)); }
  if (patch.pdfUrl           != null) { sets.push("pdf_url = ?");            vals.push(patch.pdfUrl); }
  if (patch.slideTexts       != null) { sets.push("slide_texts = ?");        vals.push(JSON.stringify(patch.slideTexts)); }
  if (patch.groundingDoc     != null) { sets.push("grounding_doc = ?");      vals.push(patch.groundingDoc); }
  if (patch.groundingDocName != null) { sets.push("grounding_doc_name = ?"); vals.push(patch.groundingDocName); }
  if (patch.totalSlides      != null) { sets.push("total_slides = ?");       vals.push(patch.totalSlides); }
  if (patch.status           != null) { sets.push("status = ?");             vals.push(patch.status); }

  if (sets.length === 0) return getDeckById(id);
  vals.push(id);
  await backend().run(`UPDATE demo_decks SET ${sets.join(", ")} WHERE id = ?`, vals);
  return getDeckById(id);
}

export async function deleteDeck(id: string): Promise<void> {
  await backend().run("DELETE FROM demo_decks WHERE id = ?", [id]);
}

/* ── ProspectSession helpers ──────────────────────────────── */

function rowToSession(row: Row): ProspectSession {
  return {
    id:                   row.id as string,
    demoDeckId:           row.demo_deck_id as string,
    prospectName:         row.prospect_name as string,
    prospectEmail:        (row.prospect_email as string) ?? null,
    emailVerified:        Boolean(row.email_verified),
    trainingConsent:      Boolean(row.training_consent),
    status:               (row.status as "active" | "completed") ?? "active",
    currentSlide:         Number(row.current_slide ?? 1),
    totalSlides:          Number(row.total_slides ?? 0),
    slideHistory:         JSON.parse((row.slide_history as string) ?? "[]"),
    chatHistory:          JSON.parse((row.chat_history  as string) ?? "[]"),
    discoveredPainPoints: JSON.parse((row.discovered_pain_points as string) ?? "[]"),
    fitSignal:            (row.fit_signal    as FitSignal)    ?? null,
    fitConfidence:        (row.fit_confidence as FitConfidence) ?? null,
    fitRationale:         (row.fit_rationale as string) ?? null,
    nextStep:             (row.next_step     as string) ?? null,
    repNotes:             (row.rep_notes     as string) ?? null,
    createdAt:            row.created_at as string,
    completedAt:          (row.completed_at  as string) ?? null,
  };
}

export async function createSession(data: {
  demoDeckId: string;
  prospectName: string;
  prospectEmail?: string;
  emailVerified?: boolean;
  trainingConsent?: boolean;
  totalSlides: number;
}): Promise<ProspectSession> {
  const id = uuidv4();
  const db = backend();
  await db.run(
    `INSERT INTO prospect_sessions (id, demo_deck_id, prospect_name, prospect_email, email_verified, training_consent, total_slides)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, data.demoDeckId, data.prospectName, data.prospectEmail ?? null,
     data.emailVerified ? 1 : 0, data.trainingConsent ? 1 : 0, data.totalSlides]
  );
  return rowToSession((await db.get("SELECT * FROM prospect_sessions WHERE id = ?", [id]))!);
}

export async function deleteSession(id: string): Promise<boolean> {
  const db = backend();
  // Drop any magic link that minted this session, then the session itself.
  await db.run("DELETE FROM magic_links WHERE session_id = ?", [id]);
  const res = await db.run("DELETE FROM prospect_sessions WHERE id = ?", [id]);
  return res.changes > 0;
}

export async function getSessionById(id: string): Promise<ProspectSession | null> {
  const row = await backend().get("SELECT * FROM prospect_sessions WHERE id = ?", [id]);
  return row ? rowToSession(row) : null;
}

export async function listSessionsByDeck(deckId: string): Promise<ProspectSession[]> {
  const rows = await backend().all(
    "SELECT * FROM prospect_sessions WHERE demo_deck_id = ? ORDER BY created_at DESC",
    [deckId]
  );
  return rows.map(rowToSession);
}

export async function updateSession(
  id: string,
  patch: Partial<Pick<ProspectSession,
    "currentSlide" | "slideHistory" | "chatHistory" | "discoveredPainPoints" |
    "fitSignal" | "fitConfidence" | "fitRationale" | "nextStep" | "repNotes" | "status" | "completedAt"
  >>
): Promise<ProspectSession | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];

  if (patch.currentSlide         != null) { sets.push("current_slide = ?");           vals.push(patch.currentSlide); }
  if (patch.slideHistory         != null) { sets.push("slide_history = ?");           vals.push(JSON.stringify(patch.slideHistory)); }
  if (patch.chatHistory          != null) { sets.push("chat_history = ?");            vals.push(JSON.stringify(patch.chatHistory)); }
  if (patch.discoveredPainPoints != null) { sets.push("discovered_pain_points = ?");  vals.push(JSON.stringify(patch.discoveredPainPoints)); }
  if (patch.fitSignal            != null) { sets.push("fit_signal = ?");              vals.push(patch.fitSignal); }
  if (patch.fitConfidence        != null) { sets.push("fit_confidence = ?");          vals.push(patch.fitConfidence); }
  if (patch.fitRationale         != null) { sets.push("fit_rationale = ?");           vals.push(patch.fitRationale); }
  if (patch.nextStep             != null) { sets.push("next_step = ?");               vals.push(patch.nextStep); }
  if (patch.repNotes             != null) { sets.push("rep_notes = ?");               vals.push(patch.repNotes); }
  if (patch.status               != null) { sets.push("status = ?");                  vals.push(patch.status); }
  if (patch.completedAt          != null) { sets.push("completed_at = ?");            vals.push(patch.completedAt); }

  if (sets.length === 0) return getSessionById(id);
  vals.push(id);
  await backend().run(`UPDATE prospect_sessions SET ${sets.join(", ")} WHERE id = ?`, vals);
  return getSessionById(id);
}

/* ── MagicLink helpers ────────────────────────────────────── */

function rowToMagicLink(row: Row): MagicLink {
  return {
    token:         row.token as string,
    deckId:        row.deck_id as string,
    shareId:       row.share_id as string,
    prospectName:  row.prospect_name as string,
    prospectEmail: row.prospect_email as string,
    trainingConsent: Boolean(row.training_consent),
    sessionId:     (row.session_id as string) ?? null,
    expiresAt:     row.expires_at as string,
    usedAt:        (row.used_at as string) ?? null,
    createdAt:     row.created_at as string,
  };
}

export async function createMagicLink(data: {
  deckId: string;
  shareId: string;
  prospectName: string;
  prospectEmail: string;
  trainingConsent?: boolean;
  ttlMinutes?: number;
}): Promise<MagicLink> {
  const token     = uuidv4() + uuidv4().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + (data.ttlMinutes ?? 30) * 60_000).toISOString();
  const db = backend();
  await db.run(
    `INSERT INTO magic_links (token, deck_id, share_id, prospect_name, prospect_email, training_consent, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [token, data.deckId, data.shareId, data.prospectName, data.prospectEmail,
     data.trainingConsent ? 1 : 0, expiresAt]
  );
  return rowToMagicLink((await db.get("SELECT * FROM magic_links WHERE token = ?", [token]))!);
}

export async function getMagicLink(token: string): Promise<MagicLink | null> {
  const row = await backend().get("SELECT * FROM magic_links WHERE token = ?", [token]);
  return row ? rowToMagicLink(row) : null;
}

export async function consumeMagicLink(token: string, sessionId: string): Promise<void> {
  await backend().run(
    "UPDATE magic_links SET used_at = ?, session_id = ? WHERE token = ?",
    [new Date().toISOString(), sessionId, token]
  );
}
