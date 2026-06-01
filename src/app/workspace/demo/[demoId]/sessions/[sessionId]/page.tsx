"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import FitSignalBadge from "@/components/FitSignalBadge";
import styles from "./detail.module.css";
import type { ProspectSession } from "@/lib/api";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(start: string, end: string | null) {
  if (!end) return "Active";
  const ms  = new Date(end).getTime() - new Date(start).getTime();
  const m   = Math.floor(ms / 60000);
  const s   = Math.round((ms % 60000) / 1000);
  return m > 0 ? `${m} min ${s} sec` : `${s} sec`;
}

export default function SessionDetailPage() {
  const params    = useParams<{ demoId: string; sessionId: string }>();
  const router    = useRouter();
  const { demoId, sessionId } = params;

  const [session, setSession] = useState<ProspectSession | null>(null);
  const [notes,   setNotes]   = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`)
      .then(r => r.ok ? r.json() : null)
      .then((s: ProspectSession | null) => {
        if (s) { setSession(s); setNotes(s.repNotes ?? ""); }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [sessionId]);

  const saveNotes = () => {
    if (!session) return;
    fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repNotes: notes }),
    }).catch(console.error);
  };

  const deleteSession = () => {
    if (!session) return;
    if (!confirm(`Permanently delete ${session.prospectName}'s session and all its data? This honors a deletion request and cannot be undone.`)) return;
    fetch(`/api/sessions/${sessionId}`, { method: "DELETE" })
      .then(r => { if (r.ok) router.push(`/workspace/demo/${demoId}/sessions`); })
      .catch(console.error);
  };

  const maxTime = session?.slideHistory?.reduce((m, e) => Math.max(m, e.timeSpentSec), 1) ?? 1;

  if (loading) return (
    <div className={styles.page}>
      <div className={styles.loadingState}>
        <div className={styles.loadingDot} /><div className={styles.loadingDot} /><div className={styles.loadingDot} />
      </div>
    </div>
  );

  if (!session) return (
    <div className={styles.page}>
      <div className={styles.errorState}>
        <div className={styles.errorTitle}>Session not found</div>
        <button className={styles.backBtn} onClick={() => router.push(`/workspace/demo/${demoId}/sessions`)}>← Back to sessions</button>
      </div>
    </div>
  );

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <div className={styles.topBarInner}>
          <button className={styles.backBtn} onClick={() => router.push(`/workspace/demo/${demoId}/sessions`)}>
            ← Sessions
          </button>
          <div className={styles.sessionMeta}>
            <span className={styles.prospectNameHeader}>{session.prospectName}</span>
            {session.prospectEmail && (
              <span className={styles.prospectEmailHeader}>
                {session.prospectEmail}{session.emailVerified ? " · ✓ verified" : ""}
                {session.trainingConsent ? " · opted in to training" : ""}
              </span>
            )}
            <span className={styles.sessionDate}>{fmtDate(session.createdAt)}</span>
            <span className={styles.sessionDuration}>{fmtDuration(session.createdAt, session.completedAt)}</span>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.mainInner}>
          <div className={styles.grid}>
            {/* Left column: fit signal + pain points + timeline + notes */}
            <div className={styles.leftCol}>

              {/* Fit signal card */}
              <section className={styles.section}>
                <div className={styles.sectionLabel}>Fit assessment</div>
                <div className={styles.fitCard}>
                  <FitSignalBadge signal={session.fitSignal} size="lg" />
                  {session.fitConfidence && (
                    <span className={styles.confidence}>{session.fitConfidence} confidence</span>
                  )}
                </div>
                {session.fitRationale && (
                  <p className={styles.rationale}>{session.fitRationale}</p>
                )}
                {session.nextStep && (
                  <div className={styles.nextStep}>
                    <div className={styles.nextStepLabel}>Suggested next step</div>
                    <div className={styles.nextStepText}>{session.nextStep}</div>
                  </div>
                )}
              </section>

              {/* Pain points */}
              {(session.discoveredPainPoints?.length ?? 0) > 0 && (
                <section className={styles.section}>
                  <div className={styles.sectionLabel}>Key topics surfaced</div>
                  <div className={styles.painChips}>
                    {session.discoveredPainPoints!.map(p => (
                      <span key={p} className={styles.painChip}>{p}</span>
                    ))}
                  </div>
                </section>
              )}

              {/* Slide timeline */}
              {(session.slideHistory?.length ?? 0) > 0 && (
                <section className={styles.section}>
                  <div className={styles.sectionLabel}>Slide engagement</div>
                  <div className={styles.timeline}>
                    {session.slideHistory!.map(e => (
                      <div key={e.slideNum} className={styles.timelineRow}>
                        <div className={styles.timelineLabel}>Slide {e.slideNum}</div>
                        <div className={styles.timelineBarWrap}>
                          <div className={styles.timelineBar} style={{ width: `${Math.round((e.timeSpentSec / maxTime) * 100)}%` }} />
                        </div>
                        <div className={styles.timelineSec}>{e.timeSpentSec}s</div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Rep notes */}
              <section className={styles.section}>
                <div className={styles.sectionLabel}>Rep notes</div>
                <textarea
                  className={styles.notesTextarea}
                  rows={4}
                  placeholder="Add private notes about this session…"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  onBlur={saveNotes}
                />
                <div className={styles.notesHint}>Saved automatically on blur</div>
              </section>

              {/* Data deletion (GDPR / consent withdrawal) */}
              <section className={styles.section}>
                <div className={styles.sectionLabel}>Privacy</div>
                <button className={styles.deleteBtn} onClick={deleteSession}>
                  Delete this session &amp; all data
                </button>
                <div className={styles.notesHint}>Use to honor a deletion or consent-withdrawal request.</div>
              </section>
            </div>

            {/* Right column: full transcript */}
            <div className={styles.rightCol}>
              <section className={styles.section}>
                <div className={styles.sectionLabel}>Full conversation</div>
                <div className={styles.transcript}>
                  {session.chatHistory?.map((msg, i) => (
                    <div key={i} className={msg.role === "ai" ? styles.aiMsg : styles.prospectMsg}>
                      <div className={styles.msgRole}>{msg.role === "ai" ? "AI Advisor" : session.prospectName}</div>
                      <div className={styles.msgText}>{msg.text}</div>
                      {msg.slideNum && (
                        <div className={styles.msgSlide}>Slide {msg.slideNum}</div>
                      )}
                    </div>
                  ))}
                  {(!session.chatHistory || session.chatHistory.length === 0) && (
                    <div className={styles.emptyTranscript}>No conversation recorded.</div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
