// Server-side orchestration of the full intelligence sweep. The interactive UI
// drives the individual steps itself (so it can render progress and let the user
// edit competitors); this module runs the whole pipeline end-to-end for the daily
// cron refresh, reusing the exact same agents.
import { runAgent } from "./openrouter.js";
import { DISCOVERY, ANALYSTS, STRATEGY } from "./agents.js";
import { gatherSignals } from "./gather.js";

export async function discoverCompetitors(idea, features) {
  const result = await runAgent({
    model: DISCOVERY.model,
    system: DISCOVERY.system,
    user: JSON.stringify({ your_idea: idea, your_features: features || "" }),
  });
  return {
    space: result.space || "",
    competitors: Array.isArray(result.competitors) ? result.competitors : [],
  };
}

export async function runAnalysts({ idea, features, competitors, buckets }) {
  const entries = await Promise.all(
    ANALYSTS.map(async (a) => {
      const result = await runAgent({
        model: a.model,
        system: a.system,
        user: JSON.stringify({
          your_idea: idea || "",
          your_features: features || "",
          competitors,
          signals: buckets[a.id] || [],
        }),
      });
      return [a.id, result.findings ?? []];
    })
  );
  return Object.fromEntries(entries);
}

export async function runStrategy({ idea, features, space, competitors, agents }) {
  return runAgent({
    model: STRATEGY.model,
    system: STRATEGY.system,
    user: JSON.stringify({ your_idea: idea, your_features: features, space, competitors, ...agents }),
  });
}

// Full sweep: discover → gather → analysts → strategy. Used by the daily cron.
export async function runFullSweep({ idea, features }) {
  const { space, competitors } = await discoverCompetitors(idea, features);
  if (competitors.length === 0) return { space, competitors: [], agents: {}, brief: {}, counts: {} };
  const buckets = await gatherSignals(competitors);
  const counts = buckets.counts || {};
  const agents = await runAnalysts({ idea, features, competitors, buckets });
  const brief = await runStrategy({ idea, features, space, competitors, agents });
  return { space, competitors, agents, brief, counts };
}
