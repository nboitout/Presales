"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import styles from "./entry.module.css";

const LINK_ERRORS: Record<string, string> = {
  invalid: "That link isn't valid. Please request a new one below.",
  expired: "That link has expired. Request a fresh one below.",
  used:    "That link was already used. Request a new one below.",
};

interface DeckMeta {
  deckId: string;
  productName: string;
  targetPersona: string;
  status: string;
}

export default function DemoEntryPage() {
  const params  = useParams<{ shareId: string }>();
  const search  = useSearchParams();
  const shareId = params.shareId;

  const [deck,    setDeck]    = useState<DeckMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [name,    setName]    = useState("");
  const [email,   setEmail]   = useState("");
  const [starting, setStarting] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [devLink, setDevLink] = useState("");
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    fetch(`/api/share/${shareId}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error("Demo not found")))
      .then(setDeck)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [shareId]);

  /* Surface errors bounced back from the magic-link verify route. */
  useEffect(() => {
    const code = search.get("linkError");
    if (code && LINK_ERRORS[code]) setError(LINK_ERRORS[code]);
  }, [search]);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !deck) return;
    setError("");
    setStarting(true);
    try {
      const res = await fetch(`/api/share/${shareId}/request-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), trainingConsent: consent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to send your link");
      if (data.devLink) setDevLink(data.devLink);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your link. Please try again.");
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingWrap}>
          <div className={styles.loadingDot} /><div className={styles.loadingDot} /><div className={styles.loadingDot} />
        </div>
      </div>
    );
  }

  if (error || !deck) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.errorIcon}>⚠</div>
          <h1 className={styles.errorTitle}>Demo not found</h1>
          <p className={styles.errorBody}>{error || "This demo link may have expired or been removed."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoRow}>
          <div className={styles.logoDot} />
          <span className={styles.logoName}>PreSales Central</span>
        </div>

        <div className={styles.productBadge}>{deck.targetPersona || "Product demo"}</div>
        <h1 className={styles.productName}>{deck.productName}</h1>

        {sent ? (
          <>
            <p className={styles.productTagline}>
              Check your inbox — we sent a secure, one-time link to <strong>{email}</strong>.
              Open it on this device to start your walkthrough. It expires in 30 minutes.
            </p>
            {devLink && (
              <div className={styles.errorMsg}>
                Dev mode (no email provider configured):{" "}
                <a href={devLink}>open your link</a>
              </div>
            )}
            <button className={styles.startBtn} type="button" onClick={() => { setSent(false); setDevLink(""); }}>
              Use a different email
            </button>
            <p className={styles.hint}>Didn&apos;t get it? Check spam, or try again.</p>
          </>
        ) : (
          <>
            <p className={styles.productTagline}>
              Your personal AI pre-sales specialist will walk you through {deck.productName}, ask about your setup, and help you understand if it&apos;s a fit.
            </p>

            <form onSubmit={handleStart} className={styles.form}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Your name *</label>
                <input
                  className={styles.fieldInput}
                  type="text"
                  placeholder="e.g. Alex Johnson"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Work email *</label>
                <input
                  className={styles.fieldInput}
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>

              <label className={styles.consentRow}>
                <input
                  type="checkbox"
                  className={styles.consentBox}
                  checked={consent}
                  onChange={e => setConsent(e.target.checked)}
                />
                <span className={styles.consentText}>
                  Optional: I allow my anonymized conversation to be used to improve this service.
                  Leaving this unchecked means your session is never used for training.
                </span>
              </label>

              {error && <div className={styles.errorMsg}>{error}</div>}

              <button
                className={styles.startBtn}
                type="submit"
                disabled={!name.trim() || !email.trim() || starting || deck.status !== "ready"}
              >
                {starting ? "Sending…" : deck.status !== "ready" ? "Demo not ready yet" : "Email me a secure link →"}
              </button>
            </form>

            <p className={styles.hint}>
              Takes about 5 minutes · No password · We never sell your data
            </p>
          </>
        )}
      </div>
    </div>
  );
}
