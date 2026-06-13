// Google News RSS — free, no key. Good for recency on funding / hiring / expansion.
const xmlEntities = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'" };

function clean(s) {
  if (!s) return "";
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, (e) => xmlEntities[e] ?? e)
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1] : "";
}

export async function googleNews(query, { limit = 5 } = {}) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Lurkr)" } });
  if (!res.ok) throw new Error(`GoogleNews ${res.status}`);
  const xml = await res.text();

  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) && items.length < limit) {
    const block = m[1];
    items.push({
      title: clean(tag(block, "title")),
      url: clean(tag(block, "link")),
      date: clean(tag(block, "pubDate")),
    });
  }
  return items;
}
