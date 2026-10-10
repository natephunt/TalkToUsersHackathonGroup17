// Shapes from the data contract in CLAUDE.md.

export type Borrower = {
  id?: string;
  name: string;
  website_domain?: string;
  hq_city?: string;
  hq_state?: string;
  industry?: string;
};

export type SignalType = "hiring_drop" | "review_distress" | "exec_departure" | "legal_layoffs";
export type Severity = "strong" | "weak";

export type Signal = {
  borrower_id: string;
  type: SignalType;
  severity: Severity;
  date: string; // YYYY-MM-DD
  title: string;
  snippet: string;
  source_name: string;
  source_url: string;
};

// One Google News result from Bright Data SERP (brd_json=1), images stripped.
export type NewsItem = {
  title: string;
  link: string;
  source: string;
  description: string;
  date: string; // "1 month ago" or "Jul 9, 2026"
};

// What tagItem returns for one article or review.
export type Tag = {
  relevant: boolean;
  same_company: boolean;
  signal_type: SignalType | null;
  severity: Severity | null;
  snippet: string;
};

// A tagger tags many items at once (Devin needs batching; rules don't care).
export type Tagger = {
  name: string;
  tagMany(items: { text: string; url: string; hint: SignalType }[], b: Borrower): Promise<Tag[]>;
};
