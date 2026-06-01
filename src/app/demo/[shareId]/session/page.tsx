"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import FitSignalBadge from "@/components/FitSignalBadge";
import styles from "./session.module.css";
import type { DemoDeck, ProspectSession, ChatMessage, AssessResponse } from "@/lib/api";

type Phase = "loading" | "narrating" | "awaiting" | "replying" | "advance" | "summary";

export default function DemoSessionPage() {
  const params    = useParams<{ shareId: string }>();
  const search    = useSearchParams();
  const sessionId = search.get("sid") ?? "";
  const shareId   = params.shareId;

  const [deck,         setDeck]         = useState<DemoDeck | null>(null);
  const [session,      setSession]      = useState<ProspectSession | null>(null);
  const [pdfUrl,       setPdfUrl]       = useState("");
  const [phase,        setPhase]        = useState<Phase>("loading");
  const [currentSlide, setCurrentSlide] = useState(1);
  const [totalSlides,  setTotalSlides]  = useState(0);
  const [chat,         setChat]         = useState<ChatMessage[]>([]);
  const [input,        setInput]        = useState("");
  const [assessment,   setAssessment]   = useState<AssessResponse | null>(null);
  const [error,        setError]        = useState("");

  const chatEndRef  = useRef<HTMLDivElement>(null);
  const slideStartRef = useRef<number>(Date.now());

  /* ── Scroll chat to bottom ──────────────────────────────── */
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat]);

  /* ── Add a message to chat + persist ───────────────────── */
  const addMessage = useCallback((msg: ChatMessage) => {
    setChat(prev => {
      const next = [...prev, msg];
      /* fire-and-forget patch */
      fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatHistory: next }),
      }).catch(() => {});
      return next;
    });
  }, [sessionId]);

  /* ── Narrate a slide ────────────────────────────────────── */
  const narrateSlide = useCallback(async (d: DemoDeck, slideNum: number, history: ChatMessage[]) => {
    setPhase("narrating");
    try {
      const res = await fetch("/api/ai/narrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deckId: d.id,
          slideNum,
          productName: d.productName,
          targetPersona: d.targetPersona,
          differentiators: d.differentiators,
          chatHistory: history,
        }),
      });
      const data = await res.json();
      const ts = new Date().toISOString();
      const narrationMsg: ChatMessage = { role: "ai", text: data.narration, slideNum, timestamp: ts };
      const questionMsg:  ChatMessage = { role: "ai", text: data.question,  slideNum, timestamp: ts };
      setChat(prev => {
        const next = [...prev, narrationMsg, questionMsg];
        fetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatHistory: next, currentSlide: slideNum }),
        }).catch(() => {});
        return next;
      });
      setPhase("awaiting");
    } catch {
      setError("The AI had trouble narrating this slide. Please try again.");
      setPhase("awaiting");
    }
  }, [sessionId]);

  /* ── Load session on mount ──────────────────────────────── */
  useEffect(() => {
    if (!sessionId || !shareId) return;
    (async () => {
      try {
        /* Resolve deck via share route */
        const shareRes = await fetch(`/api/share/${shareId}`);
        const shareMeta = await shareRes.json();
        const deckRes = await fetch(`/api/decks/${shareMeta.deckId}`);
        const d: DemoDeck = await deckRes.json();
        setDeck(d);
        setTotalSlides(d.totalSlides);

        /* Get signed PDF URL */
        const urlRes = await fetch(`/api/decks/${d.id}/pdf-url`);
        const { url } = await urlRes.json();
        setPdfUrl(url);

        /* Load or restore session */
        const sessRes = await fetch(`/api/sessions/${sessionId}`);
        const s: ProspectSession = await sessRes.json();
        setSession(s);

        if (s.status === "completed" && s.fitSignal) {
          setAssessment({
            fitSignal:  s.fitSignal,
            confidence: s.fitConfidence ?? "Medium",
            rationale:  s.fitRationale ?? "",
            painPoints: s.discoveredPainPoints ?? [],
            nextStep:   s.nextStep ?? "",
          });
          setCurrentSlide(s.totalSlides);
          setChat(s.chatHistory ?? []);
          setPhase("summary");
          return;
        }

        const restoredChat = s.chatHistory ?? [];
        setChat(restoredChat);
        const slide = s.currentSlide ?? 1;
        setCurrentSlide(slide);

        /* If chat is empty, start narrating slide 1 */
        if (restoredChat.length === 0) {
          await narrateSlide(d, slide, []);
        } else {
          setPhase("awaiting");
        }
      } catch (err) {
        setError("Could not load the demo. " + (err instanceof Error ? err.message : ""));
        setPhase("awaiting");
      }
    })();
  }, [sessionId, shareId, narrateSlide]);

  /* ── Prospect sends a message ───────────────────────────── */
  const handleSend = async () => {
    if (!input.trim() || phase !== "awaiting" || !deck) return;
    const msg = input.trim();
    setInput("");
    const prospectMsg: ChatMessage = { role: "prospect", text: msg, slideNum: currentSlide, timestamp: new Date().toISOString() };
    const nextChat = [...chat, prospectMsg];
    setChat(nextChat);
    setPhase("replying");

    try {
      const res = await fetch("/api/ai/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deckId: deck.id,
          slideNum: currentSlide,
          prospectMessage: msg,
          productName: deck.productName,
          targetPersona: deck.targetPersona,
          chatHistory: nextChat,
          keyQuestions: deck.keyQuestions,
        }),
      });
      const data = await res.json();
      const aiMsg: ChatMessage = { role: "ai", text: data.reply, slideNum: currentSlide, timestamp: new Date().toISOString() };
      const updatedChat = [...nextChat, aiMsg];
      setChat(updatedChat);

      await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatHistory: updatedChat }),
      });

      setPhase(data.advanceSlide ? "advance" : "awaiting");
    } catch {
      setError("AI reply failed. Please try again.");
      setPhase("awaiting");
    }
  };

  /* ── Advance to next slide or assess ────────────────────── */
  const handleAdvance = async () => {
    if (!deck) return;
    const timeSpent = Math.round((Date.now() - slideStartRef.current) / 1000);
    const updatedHistory = [...(session?.slideHistory ?? []), { slideNum: currentSlide, timeSpentSec: timeSpent }];
    slideStartRef.current = Date.now();

    if (currentSlide >= totalSlides) {
      /* Last slide — assess fit */
      setPhase("replying");
      await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slideHistory: updatedHistory }),
      });
      try {
        const res = await fetch("/api/ai/assess", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deckId: deck.id, chatHistory: chat, prospectName: session?.prospectName ?? "", productName: deck.productName, targetPersona: deck.targetPersona }),
        });
        const a: AssessResponse = await res.json();
        setAssessment(a);
        await fetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "completed",
            completedAt: new Date().toISOString(),
            fitSignal: a.fitSignal,
            fitConfidence: a.confidence,
            fitRationale: a.rationale,
            nextStep: a.nextStep,
            discoveredPainPoints: a.painPoints,
          }),
        });
        setPhase("summary");
      } catch {
        setError("Fit assessment failed. Please try again.");
        setPhase("awaiting");
      }
    } else {
      const nextSlide = currentSlide + 1;
      setCurrentSlide(nextSlide);
      await narrateSlide(deck, nextSlide, chat);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const progressPct = totalSlides > 0 ? Math.round((currentSlide / totalSlides) * 100) : 0;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerBrand}>
            <div className={styles.brandDot} />
            <span className={styles.productLabel}>{deck?.productName ?? "Demo"}</span>
          </div>
          <div className={styles.slideIndicator}>
            {totalSlides > 0 ? `Slide ${currentSlide} of ${totalSlides}` : "Loading…"}
          </div>
          <div className={styles.headerRight}>
            {session?.prospectName && <span className={styles.prospectName}>Hi, {session.prospectName}</span>}
          </div>
        </div>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
        </div>
      </header>

      <div className={styles.body}>
        {/* PDF pane */}
        <div className={styles.pdfPane}>
          {pdfUrl ? (
            <iframe
              key={`slide-${currentSlide}`}
              src={`${pdfUrl}#page=${currentSlide}`}
              className={styles.pdfFrame}
              title={`Slide ${currentSlide}`}
            />
          ) : (
            <div className={styles.pdfPlaceholder}>
              <div className={styles.pdfPlaceholderDots}>
                <div className={styles.loadingDot} /><div className={styles.loadingDot} /><div className={styles.loadingDot} />
              </div>
              <span className={styles.pdfPlaceholderText}>Loading document…</span>
            </div>
          )}

          {phase === "summary" ? null : (
            <div className={styles.slideNav}>
              {currentSlide > 1 && phase === "awaiting" && (
                <button className={styles.slideNavBtn} onClick={() => {
                  const prev = currentSlide - 1;
                  setCurrentSlide(prev);
                  if (deck) narrateSlide(deck, prev, chat);
                }}>◀ Prev</button>
              )}
              {phase === "advance" && (
                <button className={styles.slideNextBtn} onClick={handleAdvance}>
                  {currentSlide >= totalSlides ? "See your fit assessment →" : `Next: Slide ${currentSlide + 1} →`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Chat pane */}
        <div className={styles.chatPane}>
          {phase === "summary" && assessment ? (
            <div className={styles.summaryPane}>
              <div className={styles.summaryHeader}>
                <div className={styles.summaryEyebrow}>Demo complete</div>
                <h2 className={styles.summaryTitle}>Your fit assessment</h2>
              </div>
              <div className={styles.fitCard}>
                <FitSignalBadge signal={assessment.fitSignal} size="lg" />
                <span className={styles.fitConfidence}>{assessment.confidence} confidence</span>
              </div>
              <p className={styles.fitRationale}>{assessment.rationale}</p>

              {assessment.painPoints.length > 0 && (
                <div className={styles.painPoints}>
                  <div className={styles.painPointsLabel}>Key topics surfaced</div>
                  <div className={styles.painPointChips}>
                    {assessment.painPoints.map(p => <span key={p} className={styles.painChip}>{p}</span>)}
                  </div>
                </div>
              )}

              {assessment.nextStep && (
                <div className={styles.nextStepCard}>
                  <div className={styles.nextStepLabel}>Suggested next step</div>
                  <div className={styles.nextStepText}>{assessment.nextStep}</div>
                </div>
              )}

              <div className={styles.summaryFooter}>
                <p className={styles.summaryNote}>Your responses have been saved. A team member may reach out.</p>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.chatMessages}>
                {chat.map((msg, i) => (
                  <div key={i} className={msg.role === "ai" ? styles.aiBubble : styles.prospectBubble}>
                    {msg.role === "ai" && <div className={styles.aiLabel}>AI Advisor</div>}
                    <div className={styles.bubbleText}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                    </div>
                  </div>
                ))}
                {(phase === "narrating" || phase === "replying") && (
                  <div className={styles.aiBubble}>
                    <div className={styles.aiLabel}>AI Advisor</div>
                    <div className={styles.thinkingDots}>
                      <span /><span /><span />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {error && <div className={styles.errorBanner}>{error}</div>}

              {phase === "advance" && (
                <div className={styles.advanceBanner}>
                  <button className={styles.advanceBtn} onClick={handleAdvance}>
                    {currentSlide >= totalSlides ? "Finish demo & see assessment →" : `Continue to slide ${currentSlide + 1} →`}
                  </button>
                </div>
              )}

              <div className={styles.chatInputRow}>
                <textarea
                  className={styles.chatInput}
                  placeholder={phase === "awaiting" ? "Type your response…" : "Waiting for AI…"}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={phase !== "awaiting"}
                  rows={2}
                />
                <button
                  className={styles.sendBtn}
                  onClick={handleSend}
                  disabled={!input.trim() || phase !== "awaiting"}
                >
                  →
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
