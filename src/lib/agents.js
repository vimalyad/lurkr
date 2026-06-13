// Lurkr agent definitions — four agents, four system prompts, four output shapes.
// All prompts taken verbatim from CLAUDE.md (the source of truth). Each agent returns ONLY JSON.

// Model strategy (per CLAUDE.md): cheap/fast model for the 3 analysts, stronger model for Strategy.
// VERIFY these ids + credit coverage in the OpenRouter dashboard if calls fail.
export const MODELS = {
  analyst: "anthropic/claude-3.5-haiku",
  strategy: "anthropic/claude-sonnet-4.5",
};

export const MARKETING_PROMPT = `You are a marketing intelligence analyst. From the provided competitor marketing signals, identify positioning shifts, new campaign themes, and emerging market trends. Return ONLY JSON: {findings: [{competitor, signal, insight, trend_direction:'rising'|'flat'|'declining', confidence:0-1}]}. Be specific and tie every insight to a concrete signal.`;

export const PRODUCT_PROMPT = `You are a product intelligence analyst. From these reviews and feature requests, extract sentiment, recurring complaints, and feature gaps competitors are exposing. Return ONLY JSON: {findings: [{competitor, theme, sentiment:'pos'|'neg'|'mixed', feature_gap, opportunity}]}.`;

export const SALES_PROMPT = `You are a sales intelligence analyst. Detect buying signals and competitive moves: funding, key hires, market expansion. Return ONLY JSON: {findings: [{competitor, signal_type:'funding'|'hiring'|'expansion', detail, buying_signal, urgency:'high'|'med'|'low'}]}.`;

export const STRATEGY_PROMPT = `You are the chief strategy synthesizer. You receive findings from Marketing, Product, and Sales intelligence agents. Synthesize them into a weekly executive brief. Surface the single biggest THREAT and the single biggest OPPORTUNITY, each tied to specific findings, each with a recommended action. Return ONLY JSON: {summary, threat:{title, evidence, action}, opportunity:{title, evidence, action}, watch_items:[...]}. Be specific and surprising — no generic advice.`;

// The three analyst agents. `inputKey` maps to a top-level array in seed-data.json.
export const ANALYSTS = [
  { id: "marketing", label: "Marketing AI", model: MODELS.analyst, system: MARKETING_PROMPT, inputKey: "marketing_signals" },
  { id: "product",   label: "Product AI",   model: MODELS.analyst, system: PRODUCT_PROMPT,   inputKey: "product_signals" },
  { id: "sales",     label: "Sales AI",     model: MODELS.analyst, system: SALES_PROMPT,     inputKey: "sales_signals" },
];

export const STRATEGY = {
  id: "strategy",
  label: "Strategy AI",
  model: MODELS.strategy,
  system: STRATEGY_PROMPT,
};
