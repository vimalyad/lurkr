// Tavily search client (server-side only — reads TAVILY_API_KEY). Built for LLM grounding:
// returns clean title/url/content snippets we can hand straight to the analyst agents.
const TAVILY_URL = "https://api.tavily.com/search";

export async function tavilySearch(query, { maxResults = 5, days, topic = "general", depth = "basic" } = {}) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY missing");

  const body = { api_key: key, query, max_results: maxResults, search_depth: depth, topic };
  if (days) body.days = days; // restrict to recent N days (topic:"news")

  const res = await fetch(TAVILY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Tavily ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    content: r.content,
    date: r.published_date || null,
  }));
}
