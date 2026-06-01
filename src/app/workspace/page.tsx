"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import styles from "./workspace.module.css";
import FitSignalBadge from "@/components/FitSignalBadge";
import {
  listDecks,
  createDeck,
  updateDeck,
  deleteDeck,
  uploadPdf,
  type DemoDeck,
} from "@/lib/api";

type SortKey = "recent" | "title";
type Modal   = null | "create";

function CreateDeckModal({
  repId,
  onClose,
  onCreate,
}: {
  repId: string;
  onClose: () => void;
  onCreate: (deck: DemoDeck) => void;
}) {
  const [productName,   setProductName]   = useState("");
  const [persona,       setPersona]       = useState("");
  const [diffText,      setDiffText]      = useState("");
  const [questText,     setQuestText]     = useState("");
  const [file,          setFile]          = useState<File | null>(null);
  const [fileName,      setFileName]      = useState("");
  const [dragOver,      setDragOver]      = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => { setFile(f); setFileName(f.name); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async () => {
    if (!productName.trim()) return;
    setLoading(true); setError(null);
    try {
      const differentiators = diffText.split("\n").map(s => s.trim()).filter(Boolean);
      const keyQuestions    = questText.split("\n").map(s => s.trim()).filter(Boolean);

      const deck = await createDeck({
        productName: productName.trim(),
        targetPersona: persona.trim(),
        differentiators,
        keyQuestions,
        repId,
      });

      if (file) {
        const { url, slideTexts, pageCount } = await uploadPdf(file);
        const updated = await updateDeck(deck.id, {
          pdfUrl: url,
          slideTexts,
          totalSlides: pageCount,
          status: "ready",
        });
        onCreate(updated ?? deck);
      } else {
        onCreate(deck);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalEyebrow}>New demo deck</div>
            <h2 className={styles.modalTitle}>Create a demo deck</h2>
          </div>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          {error && <div className={styles.errorBanner}>{error}</div>}
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Product name *</label>
            <input className={styles.fieldInput} type="text" placeholder="e.g. Agentic SDLC Platform" value={productName} onChange={e => setProductName(e.target.value)} autoFocus />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Target persona</label>
            <input className={styles.fieldInput} type="text" placeholder="e.g. CTO, DevOps Lead, Engineering Manager" value={persona} onChange={e => setPersona(e.target.value)} />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Key differentiators <span className={styles.fieldHint}>one per line</span></label>
            <textarea className={styles.fieldTextarea} rows={3} placeholder={"Reduces release cycles by 40%\nNative CI/CD integration\nAI-generated test coverage"} value={diffText} onChange={e => setDiffText(e.target.value)} />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Discovery questions <span className={styles.fieldHint}>one per line — AI will weave these in</span></label>
            <textarea className={styles.fieldTextarea} rows={3} placeholder={"How many deployments do you ship per week?\nWhat does your current review process look like?\nWhere do bugs typically slip through?"} value={questText} onChange={e => setQuestText(e.target.value)} />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Technical document (PDF)</label>
            <div
              className={`${styles.dropZone} ${dragOver ? styles.dragOver : ""} ${fileName ? styles.hasFile : ""}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              {fileName
                ? (<><div className={styles.dropIcon}>✓</div><div className={styles.dropFileName}>{fileName}</div><div className={styles.dropHint}>Click to change</div></>)
                : (<><div className={styles.dropIcon}>↑</div><div className={styles.dropPrimary}>Drop your PDF here</div><div className={styles.dropHint}>or click to browse — up to 20 MB</div></>)}
            </div>
          </div>
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={loading}>Cancel</button>
          <button
            className={`${styles.createBtn} ${(!productName.trim() || loading) ? styles.createDisabled : ""}`}
            onClick={handleSubmit}
            disabled={!productName.trim() || loading}
          >
            {loading ? "Creating…" : "Create deck →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeckCard({
  deck,
  onDelete,
  onCopyLink,
}: {
  deck: DemoDeck;
  onDelete: (id: string) => void;
  onCopyLink: (shareId: string) => void;
}) {
  const router   = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied,   setCopied]   = useState(false);
  const initials = deck.productName.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const dateStr  = new Date(deck.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  const stats    = deck.sessionStats;
  const total    = stats?.total ?? deck.sessionCount ?? 0;

  const handleCopy = () => {
    onCopyLink(deck.shareId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    setMenuOpen(false);
  };

  return (
    <div className={styles.card} onClick={() => router.push(`/workspace/demo/${deck.id}/sessions`)}>
      <div className={styles.cardBand}>
        <div className={styles.cardInitials}>{initials}</div>
        <div className={styles.cardMenu} onClick={e => e.stopPropagation()}>
          <button className={styles.menuTrigger} onClick={() => setMenuOpen(!menuOpen)}>⋯</button>
          {menuOpen && (
            <div className={styles.menuDropdown}>
              <button className={styles.menuItem} onClick={() => { router.push(`/workspace/demo/${deck.id}/sessions`); setMenuOpen(false); }}>View sessions</button>
              <button className={styles.menuItem} onClick={handleCopy}>{copied ? "Copied!" : "Copy share link"}</button>
              <button className={`${styles.menuItem} ${styles.menuItemDanger}`} onClick={e => { e.stopPropagation(); onDelete(deck.id); setMenuOpen(false); }}>Delete</button>
            </div>
          )}
        </div>
      </div>
      <div className={styles.cardBody}>
        <h3 className={styles.cardTitle}>{deck.productName}</h3>
        <div className={styles.cardMeta}>
          {deck.targetPersona && <div className={styles.cardPersona}>{deck.targetPersona}</div>}
          <div className={styles.cardDate}>{dateStr}</div>
        </div>
      </div>
      <div className={styles.cardFooter} onClick={e => e.stopPropagation()}>
        <div className={styles.cardFooterLeft}>
          <span className={`${styles.statusBadge} ${deck.status === "ready" ? styles.statusReady : styles.statusDraft}`}>
            {deck.status === "ready" ? "Ready" : "Draft"}
          </span>
          <span className={styles.sessionCount}>{total} {total === 1 ? "session" : "sessions"}</span>
        </div>
        <button
          className={styles.sessionsBtn}
          onClick={e => { e.stopPropagation(); router.push(`/workspace/demo/${deck.id}/sessions`); }}
        >
          Sessions →
        </button>
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  const [userId,     setUserId]     = useState("");
  const [decks,      setDecks]      = useState<DemoDeck[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [modal,      setModal]      = useState<Modal>(null);
  const [search,     setSearch]     = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sortKey,    setSortKey]    = useState<SortKey>("recent");
  const [sortOpen,   setSortOpen]   = useState(false);
  const [viewMode,   setViewMode]   = useState<"grid" | "list">("grid");
  const [toast,      setToast]      = useState("");

  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "loading") return;
    const id = session?.user?.email ?? "";
    if (!id) { setLoading(false); return; }
    setUserId(id);
    listDecks(id)
      .then(setDecks)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [status, session]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDeck(id);
      setDecks(prev => prev.filter(d => d.id !== id));
    } catch (err) { console.error(err); }
  };

  const handleCopyLink = (shareId: string) => {
    const url = `${window.location.origin}/demo/${shareId}`;
    navigator.clipboard.writeText(url).catch(() => {});
    showToast("Share link copied!");
  };

  const filtered = decks
    .filter(d => d.productName.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) =>
      sortKey === "title"
        ? a.productName.localeCompare(b.productName)
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

  const totalSessions = decks.reduce((acc, d) => acc + (d.sessionCount ?? 0), 0);
  const readyDecks    = decks.filter(d => d.status === "ready").length;

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <div className={styles.topBarInner}>
          <a href="/" className={styles.topBarBrand}>
            <img
              src="/brand/agentic-sdlc-icon-400.png"
              alt="Agentic SDLC"
              className={styles.brandImg}
              onError={e => { e.currentTarget.style.display = "none"; }}
            />
            <span className={styles.brandName}>Forward Deployed Advisor</span>
            <span className={styles.brandTag}>Agentic SDLC</span>
          </a>
          <div className={styles.topBarActions}>
            {userId && <span className={styles.userEmail}>{userId}</span>}
            <button className={styles.signOutBtn} onClick={() => signOut({ callbackUrl: "/login" })}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.mainInner}>
          <div className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>My Demo Decks</h1>
            <button className={styles.createNewBtn} onClick={() => setModal("create")}>
              <span className={styles.createPlus}>+</span> Create demo deck
            </button>
          </div>

          <div className={styles.statsRibbon}>
            <div className={styles.stat}><div className={styles.statValue}>{decks.length}</div><div className={styles.statLabel}>Demo decks</div></div>
            <div className={styles.statDivider} />
            <div className={styles.stat}><div className={styles.statValue}>{readyDecks}</div><div className={styles.statLabel}>Ready</div></div>
            <div className={styles.statDivider} />
            <div className={styles.stat}><div className={styles.statValue}>{totalSessions}</div><div className={styles.statLabel}>Total sessions</div></div>
          </div>

          <div className={styles.toolbar}>
            <div className={styles.toolbarLeft}>
              <div className={`${styles.searchWrap} ${searchOpen ? styles.searchOpen : ""}`}>
                <button className={styles.toolBtn} onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearch(""); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </button>
                {searchOpen && <input className={styles.searchInput} autoFocus placeholder="Search decks…" value={search} onChange={e => setSearch(e.target.value)} />}
              </div>
            </div>
            <div className={styles.toolbarRight}>
              <div className={styles.viewToggle}>
                <button className={`${styles.viewBtn} ${viewMode === "grid" ? styles.viewBtnActive : ""}`} onClick={() => setViewMode("grid")}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                </button>
                <button className={`${styles.viewBtn} ${viewMode === "list" ? styles.viewBtnActive : ""}`} onClick={() => setViewMode("list")}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                </button>
              </div>
              <div className={styles.sortWrap}>
                <button className={styles.sortBtn} onClick={() => setSortOpen(!sortOpen)}>
                  {sortKey === "recent" ? "Most recent" : "Alphabetical"}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 6 }}><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {sortOpen && (
                  <div className={styles.sortDropdown}>
                    {(["recent", "title"] as SortKey[]).map(k => (
                      <button key={k} className={`${styles.sortItem} ${sortKey === k ? styles.sortItemActive : ""}`} onClick={() => { setSortKey(k); setSortOpen(false); }}>
                        {k === "recent" ? "Most recent" : "Alphabetical"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <div className={styles.loadingState}>
              <div className={styles.loadingDot} /><div className={styles.loadingDot} /><div className={styles.loadingDot} />
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>◻</div>
              <div className={styles.emptyTitle}>{search ? "No decks found" : "No demo decks yet"}</div>
              <div className={styles.emptyBody}>{search ? `No results for "${search}".` : "Create your first demo deck to start sharing AI-guided product demos with prospects."}</div>
              {!search && <button className={styles.createNewBtn} onClick={() => setModal("create")}><span className={styles.createPlus}>+</span> Create demo deck</button>}
            </div>
          ) : viewMode === "grid" ? (
            <div className={styles.grid}>
              {filtered.map(d => (
                <DeckCard key={d.id} deck={d} onDelete={handleDelete} onCopyLink={handleCopyLink} />
              ))}
            </div>
          ) : (
            <div className={styles.listView}>
              {filtered.map((d, i) => (
                <div key={d.id} className={styles.listRow} onClick={() => {}}>
                  <div className={styles.listAccent} style={{ background: ["#dceeff","#e8f0fe","#d2e3fc","#f0e9ff","#e8f5e9"][i % 5] }}>
                    <span className={styles.listInitials}>{d.productName.split(" ").slice(0,2).map(w=>w[0]).join("").toUpperCase()}</span>
                  </div>
                  <div className={styles.listBody}>
                    <div className={styles.listTitle}>{d.productName}</div>
                    <div className={styles.listMeta}>{d.targetPersona} · {new Date(d.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</div>
                  </div>
                  <div className={styles.listRight}>
                    <FitSignalBadge signal={null} size="sm" />
                    <span className={styles.sessionCount}>{d.sessionCount ?? 0} sessions</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {modal === "create" && (
        <CreateDeckModal
          repId={userId}
          onClose={() => setModal(null)}
          onCreate={deck => { setDecks(prev => [deck, ...prev]); setModal(null); }}
        />
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}