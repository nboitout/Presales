"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import styles from "./login.module.css";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const search = useSearchParams();
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(
    search.get("error") ? "That email isn't authorized for this workspace." : ""
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean) return;
    setError("");
    setLoading(true);
    const res = await signIn("email-only", { email: clean, redirect: false });
    if (res?.error) {
      setError("That email isn't authorized for this workspace.");
      setLoading(false);
      return;
    }
    /* Full reload so the new session cookie is picked up everywhere. */
    window.location.href = "/workspace";
  };

  return (
    <div className={styles.page}>
      <div className={styles.brand}>
        <div className={styles.brandInner}>
          <div className={styles.logo}>
            <img
              src="/brand/agentic-sdlc-icon-400.png"
              alt="Agentic SDLC"
              className={styles.logoImg}
              onError={e => { e.currentTarget.style.display = "none"; }}
            />
            <span className={styles.logoName}>Forward Deployed Advisor</span>
          </div>
          <h1 className={styles.brandTagline}>
            Your AI advisor workspace for agentic SDLC engagements.
          </h1>
          <div className={styles.brandFeatures}>
            <div className={styles.brandFeature}><span className={styles.brandDot} /> Build AI-guided walkthroughs from your decks</div>
            <div className={styles.brandFeature}><span className={styles.brandDot} /> Verified, passwordless client access</div>
            <div className={styles.brandFeature}><span className={styles.brandDot} /> Fit signals and session intelligence</div>
          </div>
        </div>
      </div>

      <div className={styles.form}>
        <div className={styles.formInner}>
          <h2 className={styles.heading}>Sign in</h2>
          <p className={styles.sub}>Enter your authorized email to access the workspace.</p>

          <form className={styles.emailForm} onSubmit={handleSubmit}>
            <label className={styles.emailLabel} htmlFor="email">Email</label>
            <input
              id="email"
              className={styles.emailInput}
              type="email"
              placeholder="you@yourfirm.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
              required
            />

            {error && <div className={styles.errorMsg}>{error}</div>}

            <button
              className={`${styles.emailBtn} ${loading ? styles.emailBtnLoading : ""}`}
              type="submit"
              disabled={!email.trim() || loading}
            >
              {loading ? "Signing in…" : "Sign in →"}
            </button>
          </form>

          <p className={styles.legal}>
            Access is restricted to authorized workspace owners.
          </p>
        </div>
      </div>
    </div>
  );
}
