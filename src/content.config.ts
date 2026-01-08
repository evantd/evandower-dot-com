import { z, defineCollection } from "astro:content";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    pubDate: z.coerce.date(),
    description: z.string().optional(),
    author: z.string().default("Evan Dower"),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

const parentingSteps = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/parenting/steps" }),
  schema: z.object({
    title: z.string(),
    step: z.number(),
    phase: z.number(),
    phaseName: z.string(),
    description: z.string().optional(),
  }),
});

const parentingCompanions = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/parenting/companions" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
  }),
});

const parentingCards = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/parenting/cards" }),
  schema: z.object({
    title: z.string(),
    step: z.number(),
    description: z.string().optional(),
  }),
});

export const collections = { blog, parentingSteps, parentingCompanions, parentingCards };
