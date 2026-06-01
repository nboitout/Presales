import type {
  DemoDeck,
  ProspectSession,
  NarrateResponse,
  ReplyResponse,
  AssessResponse,
  ChatMessage,
  FitSignal,
  FitConfidence,
} from "./types";

export type {
  DemoDeck,
  ProspectSession,
  NarrateResponse,
  ReplyResponse,
  AssessResponse,
  ChatMessage,
  FitSignal,
  FitConfidence,
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/* ── Decks ─────────────────────────────────────────────────── */

export function listDecks(repId: string): Promise<DemoDeck[]> {
  return request<DemoDeck[]>(`/api/decks?repId=${encodeURIComponent(repId)}`);
}

export function createDeck(payload: {
  productName: string;
  targetPersona: string;
  differentiators: string[];
  keyQuestions: string[];
  repId: string;
}): Promise<DemoDeck> {
  return request<DemoDeck>("/api/decks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getDeck(id: string): Promise<DemoDeck> {
  return request<DemoDeck>(`/api/decks/${id}`);
}

export function updateDeck(
  id: string,
  patch: Partial<Pick<DemoDeck, "productName" | "targetPersona" | "differentiators" | "keyQuestions" | "pdfUrl" | "slideTexts" | "groundingDoc" | "groundingDocName" | "totalSlides" | "status">>
): Promise<DemoDeck> {
  return request<DemoDeck>(`/api/decks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteDeck(id: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/decks/${id}`, { method: "DELETE" });
}

export function getDeckPdfUrl(id: string): Promise<{ url: string }> {
  return request<{ url: string }>(`/api/decks/${id}/pdf-url`);
}

/* ── Upload ────────────────────────────────────────────────── */

export async function uploadPdf(file: File): Promise<{
  url: string;
  filename: string;
  pageCount: number;
  slideTexts: string[];
  fullText: string;
}> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upload failed: ${text}`);
  }
  return res.json();
}

/* ── Share ─────────────────────────────────────────────────── */

export function resolveShare(shareId: string): Promise<{
  deckId: string;
  productName: string;
  targetPersona: string;
  status: string;
}> {
  return request(`/api/share/${shareId}`);
}

/* ── Sessions ──────────────────────────────────────────────── */

export function createSession(payload: {
  demoDeckId: string;
  prospectName: string;
  prospectEmail?: string;
}): Promise<{ sessionId: string; deck: DemoDeck }> {
  return request("/api/sessions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getSession(id: string): Promise<ProspectSession> {
  return request<ProspectSession>(`/api/sessions/${id}`);
}

export function updateSession(
  id: string,
  patch: Partial<Pick<ProspectSession, "currentSlide" | "slideHistory" | "chatHistory" | "discoveredPainPoints" | "fitSignal" | "fitConfidence" | "fitRationale" | "nextStep" | "repNotes" | "status" | "completedAt">>
): Promise<ProspectSession> {
  return request<ProspectSession>(`/api/sessions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function listSessions(deckId: string): Promise<ProspectSession[]> {
  return request<ProspectSession[]>(`/api/sessions?deckId=${encodeURIComponent(deckId)}`);
}

/* ── AI ────────────────────────────────────────────────────── */

export function narrateSlide(payload: {
  deckId: string;
  slideNum: number;
  productName: string;
  targetPersona: string;
  differentiators: string[];
  chatHistory: ChatMessage[];
}): Promise<NarrateResponse> {
  return request<NarrateResponse>("/api/ai/narrate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function replyToProspect(payload: {
  deckId: string;
  slideNum: number;
  prospectMessage: string;
  productName: string;
  targetPersona: string;
  chatHistory: ChatMessage[];
  keyQuestions: string[];
}): Promise<ReplyResponse> {
  return request<ReplyResponse>("/api/ai/reply", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function assessFit(payload: {
  deckId: string;
  chatHistory: ChatMessage[];
  prospectName: string;
  productName: string;
  targetPersona: string;
}): Promise<AssessResponse> {
  return request<AssessResponse>("/api/ai/assess", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
