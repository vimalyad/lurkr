# Lurkr — Demo Walkthrough

> A tight ~3-minute walkthrough of the real product. Phone in hand (monitoring),
> laptop mirrored (the deep brief).

## The script
1. **Hook:** "Most startups can't afford a market research team. Lurkr is one — you describe your idea, and a team of AI agents finds and watches your competitors for you."
2. **Input:** Type the idea (e.g. *"a mobile-first AI notetaker for fast-moving teams"*) + a few features → tap **Find my competitors**.
3. **Discovery:** "It just identified the real players in this space" — point at the discovered list (real companies, real sites). You can drop any that don't fit.
4. **Sweep:** Tap **Run Intelligence Sweep** → "First it gathers *live* data — web and news on each competitor — then three agents analyze it in parallel." (Signal counts appear; cards flip analyzing → done.)
5. **Synthesis:** "Then the Strategy agent consumes all three and writes the brief for *my* product." → read the **Threat** and **Opportunity**, both tied to real, cited signals (e.g. a real funding round, real hiring, real reviews).
6. **Close:** "Live data, grounded analysis, personalized to your idea — and it never sleeps. That's Lurkr."

## Pre-demo checklist
- [ ] `OPENROUTER_API_KEY` and `TAVILY_API_KEY` set (in `.env.local`, or in Vercel env for the deployed URL).
- [ ] Do one warm-up run beforehand (first LLM + gather call can be slow cold).
- [ ] Pick an idea whose competitors have rich public footprints (well-known SaaS) so signals are plentiful.
- [ ] Phone added to Home Screen (PWA) — needs the HTTPS deploy.
- [ ] **Backup screen recording** of a full successful run, in case the network/API flakes live.

## If something breaks live
- Gather or an LLM call is slow/fails → "It's making live calls right now — here's a run I captured a moment ago" → play the backup recording.
- A source returns nothing → gather is best-effort, so the sweep still runs; just narrate that signal coverage varies by competitor.
