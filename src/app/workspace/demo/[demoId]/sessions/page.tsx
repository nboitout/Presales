"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import FitSignalBadge from "@/components/FitSignalBadge";
import styles from "./sessions.module.css";
import type { DemoDeck, ProspectSession } from "@/lib/api";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function fmtDuration(start: string, end: string | null) {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const m  = Math.floor(ms / 60000);
  const s  = Math.round((ms % 60000) / 1000);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function SessionsListPage() {
  const params  = useParams<{ demoId: string }>();
  const router  = useRouter();
  const demoId  = params.demoId;

  const [deck,     setDeck]     = useState<DemoDeck | null>(null);
  const [sessions, setSessions] = useState<ProspectSession[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [copyToast, setCopyToast] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [deckRes, authRes] = await Promise.all([
          fetch(`/api/decks/${demoId}`),
          fetch("/api/auth/session"),
        ]);
        const d: DemoDeck = await deckRes.json();
        const auth = await authRes.json();
        setDeck(d);
        const repId = auth?.user?.email ?? auth?.user?.id ?? "";
        const sessRes = await fetch(`/api/sessions?deckId=${demoId}&repId=${encodeURIComponent(repId)}`);
        const s: ProspectSession[] = sessRes.ok ? await sessRes.json() : [];
        setSessions(s);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [demoId]);

  const handleCopyLink = () => {
    if (!deck) return;
    navigator.clipboard.writeText(`${window.location.origin}/demo/${deck.shareId}`).catch(() => {});
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 2000);
  };

  const fitCounts = sessions.reduce<Record<string, number>>(
    (acc, s) => { const k = s.fitSignal ?? "none"; acc[k] = (acc[k] ?? 0) + 1; return acc; },
    {}
  );

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <div className={styles.topBarInner}>
          <button className={styles.backBtn} onClick={() => router.push("/workspace")}>
            ← Workspace
          </button>
          <div className={styles.topBarActions}>
            <button className={styles.copyLinkBtn} onClick={handleCopyLink}>
              {copyToast ? "Copied!" : "Copy share link"}
            </button>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.mainInner}>
          {loading ? (
            <div className={styles.loadingState}>
              <div className={styles.loadingDot} /><div className={styles.loadingDot} /><div className={styles.loadingDot} />
            </div>
          ) : !deck ? (
            <div className={styles.emptyState}><div className={styles.emptyTitle}>Deck not found</div></div>
          ) : (
            <>
              <div className={styles.deckMeta}>
                <div className={styles.deckEyebrow}>Demo deck</div>
                <h1 className={styles.deckTitle}>{deck.productName}</h1>
                {deck.targetPersona && <div className={styles.deckPersona}>{deck.targetPersona}</div>}
              </div>

              {/* Fit distribution */}
              {sessions.length > 0 && (
                <div className={styles.fitDistRow}>
                  {(["Strong fit", "Partial fit", "Poor fit", "Needs more info"] as const).map(sig => (
                    <div key={sig} className={styles.fitDistItem}>
                      <FitSignalBadge signal={sig} size="sm" />
                      <span className={styles.fitDistCount}>{fitCounts[sig] ?? 0}</span>
                    </div>
                  ))}
                  <div className={styles.fitDistItem}>
                    <span className={styles.fitDistLabel}>Total</span>
                    <span className={styles.fitDistCount}>{sessions.length}</span>
                  </div>
                </div>
              )}

              {sessions.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>◻</div>
                  <div className={styles.emptyTitle}>No sessions yet</div>
                  <div className={styles.emptyBody}>Share the demo link to start collecting prospect sessions.</div>
                  <button className={styles.copyLinkBtn} onClick={handleCopyLink}>Copy share link</button>
                </div>
              ) : (
                <div className={styles.table}>
                  <div className={styles.tableHead}>
                    <div className={styles.colName}>Prospect</div>
                    <div className={styles.colDate}>Date</div>
                    <div className={styles.colFit}>Fit signal</div>
                    <div className={styles.colSlides}>Slides</div>
                    <div className={styles.colDuration}>Duration</div>
                    <div className={styles.colAction} />
                  </div>
                  {sessions.map(s => (
                    <div key={s.id} className={styles.tableRow} onClick={() => router.push(`/workspace/demo/${demoId}/sessions/${s.id}`)}>
                      <div className={styles.colName}>
                        <div className={styles.prospectName}>{s.prospectName}</div>
                        {s.prospectEmail && (
                          <div className={styles.prospectEmail}>
                            {s.prospectEmail}{s.emailVerified ? " ✓" : ""}
                          </div>
                        )}
                      </div>
                      <div className={styles.colDate}>{fmtDate(s.createdAt)}</div>
                      <div className={styles.colFit}><FitSignalBadge signal={s.fitSignal} size="sm" /></div>
                      <div className={styles.colSlides}>{s.currentSlide} / {s.totalSlides || deck.totalSlides}</div>
                      <div className={styles.colDuration}>{fmtDuration(s.createdAt, s.completedAt)}</div>
                      <div className={styles.colAction}>
                        <span className={styles.viewLink}>View →</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
