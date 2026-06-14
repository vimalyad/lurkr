// Gather live signals for the discovered competitors, bucketed per analyst. Hybrid sources:
// Tavily web search (all buckets) + Google News RSS (recency for sales). Each source is
// best-effort — a failing source yields an empty list, never failing the whole gather.
import { tavilySearch } from "./sources/tavily.js";
import { googleNews } from "./sources/news.js";

const safe = (p) => p.catch(() => []);

async function marketingSignals(name) {
  const r = await safe(tavilySearch(`${name} product positioning pricing campaign 2026`, { maxResults: 4 }));
  return r.map((x) => ({ competitor: name, source: "web", title: x.title, content: x.content, url: x.url, date: x.date }));
}

async function productSignals(name) {
  const r = await safe(tavilySearch(`${name} user reviews complaints feature requests`, { maxResults: 4 }));
  return r.map((x) => ({ competitor: name, source: "web", title: x.title, content: x.content, url: x.url, date: x.date }));
}

async function salesSignals(name) {
  const [web, news] = await Promise.all([
    safe(tavilySearch(`${name} funding hiring expansion growth 2026`, { maxResults: 3 })),
    safe(googleNews(`${name} funding OR raises OR hiring OR expansion`, { limit: 4 })),
  ]);
  return [
    ...web.map((x) => ({ competitor: name, source: "web", title: x.title, content: x.content, url: x.url, date: x.date })),
    ...news.map((x) => ({ competitor: name, source: "news", title: x.title, content: "", url: x.url, date: x.date })),
  ];
}

/** @param {{name:string}[]} competitors */
export async function gatherSignals(competitors) {
  const names = competitors.map((c) => c.name).filter(Boolean);
  const perCompetitor = await Promise.all(
    names.map(async (name) => ({
      marketing: await marketingSignals(name),
      product: await productSignals(name),
      sales: await salesSignals(name),
    }))
  );

  const buckets = { marketing: [], product: [], sales: [] };
  for (const c of perCompetitor) {
    buckets.marketing.push(...c.marketing);
    buckets.product.push(...c.product);
    buckets.sales.push(...c.sales);
  }
  const counts = {
    marketing: buckets.marketing.length,
    product: buckets.product.length,
    sales: buckets.sales.length,
  };
  return { ...buckets, counts };
}
