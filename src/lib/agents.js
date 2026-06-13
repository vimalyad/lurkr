// Lurkr agents. The pipeline is now idea-driven: the user describes their own product,
// a Discovery step finds real competitors, then the three analysts (idea-aware) analyze
// those competitors and Strategy synthesizes a personalized brief for the user's product.
//
// NOTE (M6): analysts currently reason from the LLM's own knowledge of each competitor.
// M7 grounds them in live signals (web search + reviews + news). The prompts already ask
// for confidence/uncertainty so knowledge-based findings stay honest until then.

export const MODELS = {
  analyst: "anthropic/claude-3.5-haiku",
  strategy: "anthropic/claude-sonnet-4.5", // also used for discovery (recall quality matters)
};

// ── Discovery ────────────────────────────────────────────────────────────────
export const DISCOVERY_PROMPT = `You are a market research analyst. Given a description of a user's startup or product idea, identify 3 to 5 REAL, currently-operating companies that are the most relevant competitors or close comparables in that space. Only include companies you are reasonably confident actually exist — do not invent names. For each company provide: name, website (best-guess homepage URL), a one-line description, and why_relevant (how it relates to or competes with the user's idea). Return ONLY JSON: {space: string, competitors: [{name, website, description, why_relevant}]}.`;

export const DISCOVERY = {
  id: "discovery",
  label: "Discovery AI",
  model: MODELS.strategy,
  system: DISCOVERY_PROMPT,
};

// ── Analysts (idea-aware) ─────────────────────────────────────────────────────
// User message for each analyst: JSON { your_idea, your_features, competitors:[...] }
// Shared grounding clause: when present, `signals` are live web/news results; prefer them.
const GROUNDING = ` You may also receive "signals": live web and news results about these competitors. When signals are present, base your findings PRIMARILY on these concrete signals and reference what they actually say (cite the title/source); if signals are sparse for a competitor, say so and lower confidence rather than inventing detail.`;

export const MARKETING_PROMPT = `You are a marketing intelligence analyst. The user's own product is described in the input as "your_idea"/"your_features". For each competitor listed, identify their marketing positioning, campaign themes, and market trends — focusing on what matters for the user's product. Return ONLY JSON: {findings: [{competitor, signal, insight, trend_direction:'rising'|'flat'|'declining', confidence:0-1}]}. Tie each insight to something concrete.${GROUNDING}`;

export const PRODUCT_PROMPT = `You are a product intelligence analyst. The user's own product is described in the input as "your_idea"/"your_features". For each competitor listed, extract customer sentiment, recurring complaints, and feature gaps — especially gaps the user's product could exploit. Return ONLY JSON: {findings: [{competitor, theme, sentiment:'pos'|'neg'|'mixed', feature_gap, opportunity}]}.${GROUNDING}`;

export const SALES_PROMPT = `You are a sales intelligence analyst. The user's own product is described in the input as "your_idea"/"your_features". For each competitor listed, identify buying signals and competitive moves: funding, key hires, market expansion, strategic focus. Return ONLY JSON: {findings: [{competitor, signal_type:'funding'|'hiring'|'expansion', detail, buying_signal, urgency:'high'|'med'|'low'}]}.${GROUNDING}`;

export const STRATEGY_PROMPT = `You are the chief strategy synthesizer working FOR the user, whose product is described in the input as "your_idea"/"your_features". You receive findings from Marketing, Product, and Sales intelligence agents about the user's competitors. Synthesize them into an executive brief for the user's product. Surface the single biggest THREAT to the user's product and the single biggest OPPORTUNITY for it, each tied to specific findings, each with a recommended action the user should take. Return ONLY JSON: {summary, threat:{title, evidence, action}, opportunity:{title, evidence, action}, watch_items:[...]}. Be specific and surprising — no generic advice.`;

export const ANALYSTS = [
  { id: "marketing", label: "Marketing AI", model: MODELS.analyst, system: MARKETING_PROMPT },
  { id: "product",   label: "Product AI",   model: MODELS.analyst, system: PRODUCT_PROMPT },
  { id: "sales",     label: "Sales AI",     model: MODELS.analyst, system: SALES_PROMPT },
];

export const STRATEGY = {
  id: "strategy",
  label: "Strategy AI",
  model: MODELS.strategy,
  system: STRATEGY_PROMPT,
};
