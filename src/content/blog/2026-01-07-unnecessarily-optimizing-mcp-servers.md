---
title: "Unnecessarily Optimizing MCP Servers"
pubDate: 2026-01-07
description: "How I spent hours optimizing MCP server memory usage so I could run a model that didn't even work for my use case"
tags: ["mcp", "performance", "llm"]
---

I wanted to run Llama 4 Scout locally for a text classification task. Scout is a 109B parameter mixture-of-experts model—17B active parameters with 16 experts—that fits on a single H100 with Int4 quantization. My M-series Mac is not an H100, but I figured I'd give it a shot. My machine was swapping constantly. Activity Monitor revealed the culprit: roughly 6GB of Python processes.

They were all [Serena](https://github.com/oraios/serena) MCP servers connected to my [Amp](https://ampcode.com) sessions. (Amp is Sourcegraph's Claude Code competitor, if you're unfamiliar.) Serena provides language-server-style intelligence to the AI agent. Serena holds repository embeddings in memory as an index, so a single instance for a large repo can run ~260MB or more. I often have multiple Amp threads going for the same repo, and since Serena originally launched as a stdio-based server—it needs to know which repository you're working in—each thread spawns its own instance with its own copy of those embeddings.

## Flashback: The Token Problem

A few weeks earlier, when Amp switched from Sonnet 4.5 to Opus, I'd noticed a different problem. Sonnet 4.5 had a 1M token context window; Opus has 200K. That's an 80% reduction. Serena was loading ~4,000 tokens of tool definitions upfront—21 tools, each with detailed schemas and descriptions.

(Aside: Sonnet had already started making poor decisions around the 200K mark, so the effective reduction may not have been as dramatic as it looked on paper.)

My hypothesis: replace those 21 tools with 3 meta-tools for on-demand discovery. Instead of:

```
tool: find_references(symbol, path, ...)
tool: rename_symbol(old_name, new_name, path, ...)
tool: get_hover_info(path, line, column, ...)
... (18 more)
```

Expose:

```
tool: find_tool(query) → returns matching tool names
tool: describe_tool(name) → returns full schema
tool: call_tool(name, arguments) → executes it
```

The AI can search semantically ("find usages of this function") and the wrapper returns the relevant tool. I built a stdio wrapper that spawns the real MCP server as a subprocess and uses sentence-transformers embeddings for the semantic search.

Initial estimate: 93% token reduction!

Reality check: Serena's `instructions` field was hiding another ~1,500 tokens. The actual reduction was closer to 55%—still meaningful, but humbler than I'd hoped.

## Present: The Memory Problem

Back to the 6GB of Python processes. Some might have been orphans from old sessions, but many were legitimate—I genuinely run multiple concurrent threads.

MCP servers can communicate via stdio or HTTP. The stdio model spawns a fresh server per client session. For Serena, that means each Amp thread gets its own ~260MB process, and they don't share the repo embeddings.

The fix: a multiplexing architecture.

```
┌─ Amp (library) ─┐     ┌─ stdio ─┐
│ thread 1        │────▶│ wrapper │──┐
└─────────────────┘     └─────────┘  │
                                     │     ┌─────────────────────┐
┌─ Amp (library) ─┐     ┌─ stdio ─┐  │     │  HTTP Multiplexer   │     ┌─────────────────┐
│ thread 2        │────▶│ wrapper │──┼────▶│                     │────▶│ Serena (library)│
└─────────────────┘     └─────────┘  │     │  routes by cwd:     │     └─────────────────┘
                                     │     │   /library → :9001  │
┌─ Amp (library) ─┐     ┌─ stdio ─┐  │     │   /mosaic  → :9002  │     ┌─────────────────┐
│ thread 3        │────▶│ wrapper │──┘     │                     │────▶│ Serena (mosaic) │
└─────────────────┘     └─────────┘        └─────────────────────┘     └─────────────────┘
                                                     ▲
┌─ Amp (mosaic) ──┐     ┌─ stdio ─┐                  │
│ thread 1        │────▶│ wrapper │──────────────────┘
└─────────────────┘     └─────────┘
```

Each Amp session still gets a stdio "server," but it's just a thin wrapper that forwards requests to a shared HTTP multiplexer. The wrapper passes its working directory with each request, and the multiplexer routes to the appropriate Serena backend—one instance per repo, shared across all sessions for that repo.

The multiplexer lazy-starts backends and times them out after 10 minutes of inactivity. A launchd plist keeps the multiplexer itself running on login.

Result: ~570MB total instead of ~6GB.

## The Punchline

With memory freed up, I finally ran Llama 4 Scout on my classification task.

It performed poorly.

The irony wasn't lost on me. I'd spent hours optimizing MCP servers so I could run a model that didn't even work for my use case. Both the token reduction and the memory reduction turned out to be... unnecessary?

## But Actually

I don't regret either optimization.

The system runs cooler and quieter. I don't have to quit everything when I want to experiment with local models. There's headroom for other memory-hungry tools. And the journey taught me things about MCP architecture I wouldn't have learned otherwise.

Sometimes you optimize for a goal that doesn't pan out, and it's still the right call. The goal was "run Llama 4 Scout." The outcome was "understand MCP better and have a more pleasant development environment." I'll take it.

## If You Want the Code

Code available upon request, or you can just point your coding agent at this blog post and ask it to build one for you. That's probably more in the spirit of the thing anyway.
