export type FitSignal = "Strong fit" | "Partial fit" | "Poor fit" | "Needs more info";
export type FitConfidence = "High" | "Medium" | "Low";

export interface DemoDeck {
  id: string;
  repId: string;
  productName: string;
  targetPersona: string;
  differentiators: string[];
  keyQuestions: string[];
  pdfUrl: string | null;
  slideTexts: string[];
  totalSlides: number;
  shareId: string;
  status: "draft" | "ready";
  sessionCount: number;
  createdAt: string;
  sessionStats?: {
    total: number;
    fitDistribution: Record<FitSignal | "none", number>;
    avgSlidesCompleted: number;
  };
}

export interface ChatMessage {
  role: "ai" | "prospect";
  text: string;
  slideNum: number;
  timestamp: string;
}

export interface SlideHistoryEntry {
  slideNum: number;
  timeSpentSec: number;
}

export interface ProspectSession {
  id: string;
  demoDeckId: string;
  prospectName: string;
  prospectEmail: string | null;
  emailVerified: boolean;
  trainingConsent: boolean;
  status: "active" | "completed";
  currentSlide: number;
  totalSlides: number;
  slideHistory: SlideHistoryEntry[];
  chatHistory: ChatMessage[];
  discoveredPainPoints: string[];
  fitSignal: FitSignal | null;
  fitConfidence: FitConfidence | null;
  fitRationale: string | null;
  nextStep: string | null;
  repNotes: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface MagicLink {
  token: string;
  deckId: string;
  shareId: string;
  prospectName: string;
  prospectEmail: string;
  trainingConsent: boolean;
  sessionId: string | null;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export interface NarrateResponse {
  narration: string;
  question: string;
}

export interface ReplyResponse {
  reply: string;
  advanceSlide: boolean;
}

export interface AssessResponse {
  fitSignal: FitSignal;
  confidence: FitConfidence;
  rationale: string;
  painPoints: string[];
  nextStep: string;
}
