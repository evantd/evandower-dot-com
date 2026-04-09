# AI Agent Instructions for evandower.com

## Purpose

Personal website and blog built with Astro, deployed on Vercel. This is a **personal** project — do NOT use Indeed-specific tools or skills.

## Known Gotcha: pnpm Lockfile Registry

The global pnpm config on this machine points to Indeed's internal npm registry (`npm.artifacts.indeed.tech`). When the lockfile is regenerated, it will contain internal tarball URLs that Vercel cannot access, causing builds to fail with:

```
Error: Cannot find module @rollup/rollup-linux-x64-gnu
```

**Fix**: The project `.npmrc` overrides the registry to `https://registry.npmjs.org/`. If you ever delete and regenerate `pnpm-lock.yaml`, make sure `.npmrc` exists with the registry override **before** running `pnpm install`.

**If the build still fails after lockfile changes:**
1. Verify `.npmrc` has `registry=https://registry.npmjs.org/`
2. Delete `node_modules` and `pnpm-lock.yaml`
3. Run `pnpm install` to regenerate from scratch
4. Verify: `grep "npm.artifacts.indeed.tech" pnpm-lock.yaml` should return nothing

## Deployment

- **Host**: Vercel
- **CI/CD**: Push to `main` triggers automatic deploy
- **Build command**: `pnpm build` (runs `astro build`)

## Content Structure

- `src/content/blog/` — Blog posts (markdown, frontmatter: title, pubDate, description, tags)
- `src/content/parenting/` — Parenting curriculum (steps, companions, cards)
- `src/content/seven-principles/` — Marriage book study guide
- `src/pages/` — Standalone pages (Astro components)
