// Gather live signals for the discovered competitors, bucketed per analyst. Hybrid sources:
// Tavily web search (all buckets) + Google News RSS (recency for sales). Each source is
// best-effort — a failing source yields an empty list, never fails the whole gather.
import { NextResponse } from "next/server";
import { tavilySearch } from "@/lib/sources/tavily";
import { googleNews } from "@/lib/sources/news";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const safe = (p) => p.catch(() => []);

// One competitor → signals for one bucket, tagged with competitor + source.
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

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const competitors = Array.isArray(body?.competitors) ? body.competitors : [];
  if (competitors.length === 0) {
    return NextResponse.json({ ok: false, error: "No competitors to gather for." }, { status: 400 });
  }
  if (!process.env.TAVILY_API_KEY) {
    return NextResponse.json({ ok: false, error: "TAVILY_API_KEY not configured." }, { status: 500 });
  }

  try {
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
    return NextResponse.json({ ok: true, ...buckets, counts });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
