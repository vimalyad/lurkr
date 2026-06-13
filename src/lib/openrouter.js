// Server-side ONLY. Never import this from a client component — it reads the API key.
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Some models wrap JSON in ```json … ``` fences even with response_format set.
// Strip fences, and as a fallback grab the outermost {...}, then parse.
function parseJsonLoose(text) {
  let s = text.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  try {
    return JSON.parse(s);
  } catch {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start !== -1 && end > start) return JSON.parse(s.slice(start, end + 1));
    throw new Error("Could not parse JSON from model output");
  }
}

/**
 * Call an agent via OpenRouter and parse strict JSON from the response.
 * Guards the parse with try/catch + 1 retry (per CLAUDE.md).
 *
 * @param {{model:string, system:string, user:string}} args
 * @returns {Promise<object>} parsed JSON object from the model
 */
export async function runAgent({ model, system, user }) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 500)}`);
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error("Empty completion from OpenRouter");

      return parseJsonLoose(content);
    } catch (err) {
      lastErr = err;
      // fall through to retry once
    }
  }
  throw lastErr;
}
