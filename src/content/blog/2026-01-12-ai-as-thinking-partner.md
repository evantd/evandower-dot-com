---
title: "How I Used AI to Build a Parenting Curriculum"
pubDate: 2026-01-12
description: "A worked example of AI collaboration: generating options, steering through questions, prototyping before scaling, and catching drift at scale"
tags: ["ai", "parenting"]
---

## The Problem

I've read about fifteen parenting books over the years. Each one gave me ideas I liked. None of them turned into consistent behavior.

What I needed wasn't more information — I needed a structure for turning "I know I should" into actually doing. I wrote about what I built in a [companion post](/blog/2026-01-07-operationalizing-parenting-books/), and the [curriculum itself is here](/parenting/). This post is about how I built it.

I could do the intellectual work of deciding what to include — which frameworks, which values, which specific practices. But executing at scale was a different problem. I needed to synthesize ideas from a dozen books into a coherent set of steps, each with consistent structure, cross-references, and aligned terminology.

I used AI as a thinking partner throughout. Here's what that looked like in practice: generating options, steering through questions, prototyping before scaling, and catching drift at scale.

## Generating Options (Best-of-N)

This is common advice: instead of asking AI for one answer, ask for multiple options and choose the best — or synthesize from several. I used this constantly.

For example, early on I asked: "Which of these source books have structures that would translate well to a curriculum?" Then: "Create a curriculum outline based on each of those." The AI laid out trade-offs for each. I chose a phase-based structure (regulation first, then connection, then cooperation, then boundaries) because it matched how the source books sequence skill-building.

Later, when deciding how to integrate philosophical lenses (Buddhist, Waldorf), I asked for options: weave them throughout every step, create separate companion documents, or add targeted callouts in relevant steps. The AI laid out pros and cons. I chose the hybrid — companion docs plus targeted callouts — because heavy integration would bloat the core content.

The pattern: AI proposes options with trade-offs; I decide based on my values and context. That kept the decisions with me while still getting leverage from the model.

## Steering Through Questions

Rather than giving explicit instructions, I often steered by asking questions. "What would happen if we moved this section earlier?" or "Why might this feel off?" or "What are the pros and cons of this approach?" This is how I'd work with a human collaborator — exploring together rather than dictating.

When reviewing AI-generated blog post suggestions, several titles felt clickbait-y and guru-ish. Instead of saying "rewrite these without the hype," I asked: "What about these feels distasteful to me?" That helped me articulate what I actually wanted — and once I could say it, the AI could help me get there.

The questions helped me think too. Sometimes I'd figure out the answer while formulating the question.

This is related to Cunningham's Law, the internet adage that the best way to get the right answer online is to post the wrong answer — people can't help correcting you. AI works similarly. It's like when you can't decide, so you flip a coin — and your reaction to the result tells you your preference. A bad answer is a good start. The AI doesn't need to be right; it needs to give you something to react to.

## Prototyping Before Scaling

I used a pattern called "stub-one-all" — three phases with review between each.

**Stub:** Define the structure for all 16 steps as stubs — titles, topics, what each step would cover. Review before anything is written. Missing steps? Rename them. Wrong order? Rearrange. At the end of this phase, I had agreement on what would be built.

**One:** Fully develop Step 1 and iterate until the format feels right. The prompt was explicit: "Draft Step 1 using this structure: [list of required sections]. Include examples for parents of 2–7-year-olds. Match this tone: [pasted excerpt]." Two rounds of AI review refined the template: adding "The One Thing" escape hatch, a micro-TOC ("if you only have 10 seconds..."), three tracks (parent, child, environment), and adaptations for diverse neurotypes throughout. At the end of this phase, I had a concrete example establishing the patterns I wanted.

**All:** Generate the remaining steps in parallel. Each subagent (a separate AI run) gets two things: the structure (what sections each step must have) and the Step 1 example (how to fill those sections). The structure is the hard requirement; the example is the inspiration. Because I'd already shaped both, reviewing the output was quick — I was scanning for anomalies, not reading everything cold.

Both phases are necessary, and they prevent different problems:

- The stub phase locks in scope — what will be built, covering which topics. Without it, you might generate beautifully consistent content that covers the wrong things.
- The one phase locks in both the per-step structure (what sections each step includes) and the style (formatting, tone). Without it, you know what topics to cover, but each step might be structured differently.

By front-loading both, I avoided generating content I would have to discard later.

## Catching Drift at Scale

Even with a locked template, consistency is hard at scale. Terminology shifts ("calm corner" vs "calm-down corner"), cross-references get missed, tone varies.

I used overlapping review windows: one review covered Steps 1-3, another covered 2-4, another 3-5, and so on through Steps 10-12. This is the same best-of-N principle from earlier, applied to review. Each step got seen multiple times in different contexts — different neighbors, different reviewers. What one pass missed, another caught.

This caught real problems: "sportscaster" and "descriptive noticing" were the same skill with different names in different steps. Age labels varied ("2yo twins" vs "2-year-olds"). The calm-down corner had three different names. One step had sharper language ("caving teaches them their upset controls you") that didn't match the overall tone.

I consolidated the feedback by theme — terminology, cross-links, adaptations for diverse neurotypes — rather than by step, then applied fixes systematically. That turned what could have been a pile of scattered nits into a few deliberate decisions I could apply across the whole curriculum.

## What I Got

A 16-step curriculum with quick reference cards, internally consistent, aligned with my values.

I haven't read every step in detail — I'll do that as I work through the curriculum to learn the skills. But that's fine, because the process builds review into production. Stub-one-all front-loads review before scaling; overlapping windows catch drift after. If the scope, structure, style, and consistency are right, the rest follows.

Throughout, the AI did the fast drafting and pattern-matching; I made the calls about scope, values, and what to keep. The real test is whether it actually works. I'll find out as I use it.
