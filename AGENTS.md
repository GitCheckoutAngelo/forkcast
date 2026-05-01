<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Forkcast

A personal weekly meal planner. Build 7-day plans from a recipe bank, track macros against daily targets, and use AI to scrape recipes from the web and look up food item macros.

## Tech stack

- **Next.js 16** (App Router, TypeScript, Turbopack, Tailwind, `src/` layout)
- **Supabase** (Postgres + Auth + auto-generated Data API, used via `@supabase/supabase-js` and `@supabase/ssr`)
  - Uses new key naming: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`
- **Anthropic API** (`@anthropic-ai/sdk`) for AI-assisted recipe scraping and food item lookup
- **Node 24 LTS**

Auth, RLS, and migrations are managed through Supabase. The Supabase CLI is in dev dependencies; migrations live in `supabase/migrations/` and are pushed with `supabase db push`.

## File layout

```
src/
  types/          # Domain types (see "Domain model" below)
  app/            # Next.js App Router pages & API routes
  lib/
    supabase/     # Supabase client factories (browser, server, route handler)
    anthropic/    # Anthropic API client + prompt builders
  components/     # React components

supabase/
  migrations/     # SQL migrations, timestamp-prefixed
```

Types are split by domain concern, not one-type-per-file. Recipe + RecipeIngredient live together because they always change together. The `*Resolved` computed types live alongside the base types they extend.

## Domain model

The meal-plan hierarchy is:

```
MealPlan (7 days)
  └── PlanDay (one date)
        └── MealSlot (e.g., Tuesday Dinner)
              └── MealEntry (Chicken Adobo @ 1.5 servings)
```

A `MealEntry` references a **consumable**, which is either a `Recipe` or a `FoodItem`. These are separate tables, joined polymorphically:

- `MealEntry.recipe_id` and `MealEntry.food_item_id` are both nullable FKs
- A CHECK constraint enforces that exactly one is non-null
- TypeScript surfaces this as a discriminated union via `MealEntryResolved.consumable`

`Recipe` is rich: ingredients, instructions, source URL, prep/cook times, scrape metadata. `FoodItem` is atomic: name, brand, serving size, macros. Keep them separate — different shapes, different lifecycles.

Snacks are modeled as separate `MealSlot` rows distinguished by `position`, not as multiple entries in a single slot. Breakfast/lunch/dinner are always position 0; snacks can be 0..N.

## Key design decisions and rationale

These are the calls that will be tempting to revisit. They've been thought through — leave them alone unless there's a concrete new reason.

**Per-serving macros are the source of truth, not per-ingredient.** Stored on `Recipe.macros_per_serving`. Computing macros from ingredients requires a USDA-style food database, unit conversion, and resolving messy scraped ingredient lines like "a handful of cilantro". Not worth the complexity for a personal app. If a recipe source provides macros, use them and set `macros_verified: true`. Otherwise estimate and set it `false`.

**`RecipeIngredient` has no link to `FoodItem`.** Ingredients are display data and shopping-list data only. There is no FK between them. We considered linking for shopping-list aggregation across recipes, but YAGNI — string-matching by name is fine until proven otherwise.

**MealEntry uses polymorphic FKs (recipe_id XOR food_item_id), not a discriminator column.** Recipe and FoodItem fields diverge enough that a shared table would be half-null on every row. The CHECK constraint at the DB level prevents invalid states.

**Meal plans are anchored to a per-user week start day.** `UserProfile.week_start_day` (0=Sunday..6=Saturday). A trigger on `meal_plans` rejects inserts/updates whose `start_date` doesn't fall on the user's chosen day. This makes overlap impossible (one plan per (user, start_date), and start_date must align). If a user changes `week_start_day`, existing plans become invalid — handle this in the settings UI by blocking the change while plans exist.

**Plans are always exactly 7 days.** A CHECK constraint enforces `end_date = start_date + 6 days`. No half-weeks, no monthly plans.

**`servings` on `MealEntry` is a decimal.** "1.5 servings of Chicken Adobo" is one entry, not three. `macros_override` is also available per entry for the "I ate this but no rice" case — null means use the consumable's macros × servings.

## AI integration: candidate → confirm → persist

The AI never writes to the database directly. The flow is always:

1. User clicks "Add recipe" / "Add food item"
2. UI POSTs a `*Request` to a Next.js API route
3. Server calls Anthropic API, returns `*Candidate` objects (transient, not persisted)
4. UI shows candidates; user picks/edits one
5. UI POSTs the chosen candidate to `/api/recipes` or `/api/food-items` to persist

Candidates are wire shapes, not database tables. The persist endpoints don't care whether the input came from AI or a manual form — both paths converge on the same edit screen and the same insert.

`meal_types` and `tags` are not on the candidate (or are optional pre-fills). They're user curation concerns and must be confirmed by the user before persisting, not guessed by AI.

API routes:

```
POST /api/recipes/search       → RecipeScrapeRequest    → RecipeCandidate[]
POST /api/recipes              → RecipeCandidate         → Recipe
POST /api/food-items/lookup    → FoodItemLookupRequest  → FoodItemCandidate[]
POST /api/food-items           → FoodItemCandidate       → FoodItem
```

## Auth + RLS

All tables have RLS enabled. Policies enforce `auth.uid() = user_id` (directly for parent tables, via parent lookups for child tables). The browser uses the publishable key (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`); RLS + auth tokens are what protect data, not key secrecy.

The secret key is for admin/server operations that need to bypass RLS. Most features don't need it — AI proxy routes can use the user's auth context and respect RLS like any other request.

When a user signs up via Supabase Auth, a `user_profiles` row must be created to mirror `auth.users.id`. Implement via a Postgres trigger `AFTER INSERT ON auth.users`. Do not rely on the client to create the profile row — it'll fail intermittently.

## What this project does NOT do (don't propose these)

- **No USDA / Open Food Facts integration.** Macros come from the recipe source or AI estimates.
- **No ingredient-level macro recomputation.** `Recipe.macros_per_serving` is canonical.
- **No floating start dates.** Plans align to `user.week_start_day`.
- **No client-side use of the secret key.** Ever.
- **No `localStorage` for app data.** Supabase is the source of truth; the only client-side state is auth session (handled by `@supabase/ssr`) and ephemeral UI state.
- **No AI-generated meal plans yet.** Manual planning only. This may be added later — schema supports it.
- **No AI writes to DB.** Candidates flow to user confirmation first, always.
- **Ingredient units are free-form strings, not a dropdown.** Scraped recipes use messy units (handful, pinch, medium, to taste) that don't fit a finite enum. Unit normalization for shopping lists will be handled by AI at aggregation time, not at input time.

## Conventions

- TypeScript strict mode. No `any` without a `// eslint-disable` comment explaining why.
- Server-only code uses `@supabase/ssr` server client; browser code uses the browser client. Don't mix.
- Database column names are `snake_case`; TypeScript field names match (no camelCase mapping layer).
- All timestamps are ISO 8601 strings on the wire. Date-only fields use `YYYY-MM-DD`.
- IDs are UUIDs, generated by Postgres (`gen_random_uuid()`).
- Macros are stored as JSONB. If filtering/aggregation on individual macros becomes common, promote to columns.
- Migrations are forward-only. Don't edit a pushed migration; write a new one.
- **Component primitives:** the project uses a `@base-ui/react`-based shadcn variant, not the Radix-based default. All UI primitives (Button, Input, Dialog, Sheet, Select, Tabs, etc.) are consistent within this variant. Don't introduce Radix primitives — use the existing `@base-ui/react` ones.
- **Server actions:** all server actions live under `src/lib/[domain]/actions.ts`. No actions in `src/app/`. Current: `src/lib/auth/actions.ts`.
- **Auth user fetching:** use `getCurrentUser()` from `src/lib/auth/current-user.ts` instead of calling `supabase.auth.getUser()` directly. It deduplicates within a render pass via `React.cache`.
- **Responsive UI transitions.** Every navigation, mode toggle, or URL-param-driven view change must use `useTransition` so the triggering control updates synchronously while the destination content loads. The pattern:
  1. Wrap `router.push` (or the equivalent state update) in `startTransition`.
  2. Maintain a parallel piece of optimistic state that is set *before* the transition starts (synchronously on click). Compute the displayed active state as `isPending ? optimisticValue : serverDerivedValue` so the control reflects the click immediately.
  3. While `isPending` is true, show a subtle loading indicator (skeleton or spinner) on the **destination content area only** — not on the control that was clicked. The control stays fully interactive so the user can switch again.
  4. Use a 150 ms `setTimeout` before revealing the skeleton to avoid flashing on fast transitions. Clear the timeout and hide the skeleton as soon as `isPending` becomes false.
  - Applied to: top nav, view/edit mode toggle, meal plan card clicks, trip tab switching on the grocery page. Apply to any new navigation or view-state change without being asked.

## Common tasks

- **Add a new table:** new migration in `supabase/migrations/`, then `supabase db push`. Add types to `src/types/`. Enable RLS and write a policy in the same migration.
- **Add an env var:** add to `.env.local`, add to `.env.example` (committed), restart dev server.
- **Modify the schema:** new migration, never edit an existing one. Update types to match.
