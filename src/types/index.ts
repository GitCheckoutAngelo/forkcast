// ============================================================================
// MEAL PLANNING APP — DOMAIN MODEL
// ============================================================================
// Conventions:
// - All IDs are UUIDs (strings).
// - All timestamps are ISO 8601 strings (Supabase returns these as strings).
// - Dates without time use 'YYYY-MM-DD' format.
// - Macros are stored in standard nutrition units: grams for protein/carbs/fat,
//   kcal for calories.
// ============================================================================

// ----- Shared primitives ----------------------------------------------------

export type UUID = string;
export type ISODate = string;       // 'YYYY-MM-DD'
export type ISODateTime = string;   // ISO 8601

/**
 * Macro/calorie payload. Used everywhere nutrition is tracked.
 * Stored as numbers (decimals allowed) — no units in the type because
 * the convention is fixed: kcal, grams, grams, grams, mg.
 */
export interface Macros {
  calories: number;       // kcal
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;       // optional but commonly tracked
  sugar_g?: number;
  sodium_mg?: number;
}

/** A user's daily macro target. Stored on the user profile. */
export interface MacroTarget {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  // Tolerance for "did I hit my target" checks. Defaults applied at app layer.
  tolerance_pct?: number; // e.g., 5 means ±5% counts as "on target"
}

// ----- User -----------------------------------------------------------------

/**
 * 0 = Sunday, 1 = Monday, ..., 6 = Saturday.
 * Matches JavaScript's Date.getDay() and Postgres's EXTRACT(DOW FROM ...).
 */
export type WeekStartDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface UserProfile {
  id: UUID;                      // matches Supabase auth.users.id
  email: string;
  display_name: string | null;
  macro_target: MacroTarget | null;
  timezone: string;              // IANA tz, e.g. 'Australia/Sydney'
  /**
   * Day of the week the user's meal plans start on. All MealPlan.start_date
   * values for this user must fall on this day. Defaults to Monday.
   */
  week_start_day: WeekStartDay;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  // Future additions to consider as features are built:
  // - dietary_restrictions: string[]   (when AI recipe scraper needs filtering)
  // - cuisine_preferences: string[]    (when AI variety logic exists)
  // - measurement_system: 'metric' | 'imperial'   (when settings UI exists)
  // - avatar_url: string | null        (when profile UI exists)
}

// ----- Consumables: Recipe & FoodItem ---------------------------------------
// These are the two things a MealEntry can reference. Kept separate because
// their shapes diverge significantly (see design notes).

export type ServingUnit =
  | 'serving'      // generic — "1 serving"
  | 'g'
  | 'ml'
  | 'piece'        // "1 banana", "1 egg"
  | 'cup'
  | 'tbsp'
  | 'tsp'
  | 'oz';

/**
 * A simple, atomic edible. No ingredients, no instructions.
 * Examples: a banana, store-bought kimchi, a protein bar, plain Greek yogurt.
 * Macros are stored per single serving as defined by serving_size + serving_unit.
 */
export interface FoodItem {
  id: UUID;
  user_id: UUID;                 // owner; could be null for a shared/global library later
  name: string;
  brand: string | null;          // e.g., "Chobani", or null for generic
  serving_size: number;          // e.g., 100 (means "100 g per serving")
  serving_unit: ServingUnit;
  macros_per_serving: Macros;
  notes: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

/** One row in a recipe's ingredient list. Kept structured for shopping lists. */
export interface RecipeIngredient {
  id: UUID;
  recipe_id: UUID;
  position: number;              // ordering in the list
  // Free-form fields — scraped data is messy, so be permissive.
  quantity: number | null;       // null for "to taste"
  unit: string | null;           // free string: 'tbsp', 'medium', 'pinch', etc.
  name: string;                  // 'olive oil', 'yellow onion'
  preparation: string | null;    // 'finely chopped', 'room temperature'
  raw_text: string;              // the original line as scraped/entered
}

/** Where a recipe came from. Multiple sources possible per logical recipe. */
export interface RecipeSource {
  url: string;
  site_name: string | null;      // 'Serious Eats', 'NYT Cooking'
  scraped_at: ISODateTime;
}

/**
 * A recipe in the user's recipe bank. Per-serving macros are the source of
 * truth for meal-plan math; ingredients are stored for shopping lists and
 * display.
 */
export interface Recipe {
  id: UUID;
  user_id: UUID;
  name: string;
  description: string | null;
  source: RecipeSource | null;   // null for user-authored recipes
  servings: number;              // how many servings the full recipe yields
  prep_time_min: number | null;
  cook_time_min: number | null;
  instructions: string[] | null; // ordered steps; null if not captured
  // Macros for ONE serving. Authoritative for daily totals.
  macros_per_serving: Macros;
  // Whether macros came from the source (true) or were estimated (false).
  // Useful for showing a "estimated" badge in the UI.
  macros_verified: boolean;
  // Categorization for AI variety logic.
  cuisine: string | null;        // 'Filipino', 'Italian', 'Japanese'
  meal_types: MealSlotType[];    // which slots this recipe is suitable for
  tags: string[];                // free tags: 'high-protein', 'one-pot', 'meal-prep'
  image_url: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  // ingredients are a separate table; loaded on demand.
}

// ----- Meal Plan / Plan Day / Meal Slot / Meal Entry ------------------------

export type MealSlotType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/** The 7-day container. */
export interface MealPlan {
  id: UUID;
  user_id: UUID;
  // Plans are anchored by their start date. Always 7 days.
  start_date: ISODate;           // inclusive
  end_date: ISODate;              // inclusive; always start_date + 6
  name: string | null;           // optional label, e.g., "Week of April 27"
  notes: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

/** One date inside a MealPlan. Created for each of the 7 days. */
export interface PlanDay {
  id: UUID;
  meal_plan_id: UUID;
  date: ISODate;
  // Optional per-day target override. Falls back to user's MacroTarget if null.
  macro_target_override: MacroTarget | null;
  notes: string | null;
}

/**
 * A meal slot within a day (e.g., Tuesday's Dinner).
 * Pre-created or lazily created — design choice. Recommend pre-creating all
 * 4 slots × 7 days = 28 slots when a plan is generated, so the UI has a
 * stable grid to render even when slots are empty.
 *
 * Snacks are special: a day can have multiple "snack" slots. To keep it
 * uniform, model snacks as separate rows distinguished by `position`.
 */
export interface MealSlot {
  id: UUID;
  plan_day_id: UUID;
  slot_type: MealSlotType;
  position: number;              // 0 for breakfast/lunch/dinner; 0..N for snacks
  notes: string | null;          // e.g., "skipped", "ate out"
}

/**
 * One item inside a slot. Polymorphic: references EITHER a Recipe OR a FoodItem,
 * never both, never neither. Enforced by a CHECK constraint at the DB layer.
 *
 * `servings` is a decimal multiplier — 1.5 means "1.5x the recipe's per-serving
 * macros". For FoodItems it means "1.5x the food item's macros_per_serving".
 */
export interface MealEntry {
  id: UUID;
  meal_slot_id: UUID;
  position: number;              // ordering within the slot
  recipe_id: UUID | null;
  food_item_id: UUID | null;
  servings: number;              // decimal; default 1.0
  // Optional macro override — for when the user ate something close to but
  // not exactly the recipe (e.g., "I had this but no rice"). Null = use the
  // referenced consumable's macros × servings.
  macros_override: Macros | null;
  notes: string | null;
}

// ----- Computed / View types ------------------------------------------------
// These aren't tables — they're shapes the app computes for the UI.

export interface MealEntryResolved extends MealEntry {
  /** The resolved consumable, loaded via the FK. */
  consumable:
    | { kind: 'recipe'; recipe: Recipe }
    | { kind: 'food_item'; food_item: FoodItem };
  /** Computed: macros_override ?? consumable.macros_per_serving × servings */
  effective_macros: Macros;
}

export interface MealSlotResolved extends MealSlot {
  entries: MealEntryResolved[];
  total_macros: Macros;          // sum across entries
}

export interface PlanDayResolved extends PlanDay {
  slots: MealSlotResolved[];
  total_macros: Macros;          // sum across slots
  /** null when neither the day nor the user has a macro target set */
  target: MacroTarget | null;
  /** null when target is null */
  target_status: {
    calories: 'under' | 'on' | 'over';
    protein_g: 'under' | 'on' | 'over';
    carbs_g: 'under' | 'on' | 'over';
    fat_g: 'under' | 'on' | 'over';
  } | null;
}

export interface MealPlanResolved extends MealPlan {
  days: PlanDayResolved[];       // always 7, ordered by date
}

// ----- AI-assisted entry: transient shapes ----------------------------------
// These are NOT database tables. They are the wire shapes for API routes that
// proxy the Claude API. The flow for both recipes and food items is:
//
//   1. User clicks "Add recipe" / "Add food item" in the UI.
//   2. UI POSTs a *Request to a Next.js API route.
//   3. Server calls Claude API, gets back *Candidate object(s).
//   4. UI renders candidates; user picks/edits one.
//   5. UI POSTs the chosen candidate to /api/recipes or /api/food-items,
//      which writes a real row to Supabase.
//
// The AI never touches the database. Candidates only become persisted rows
// when the user explicitly confirms.

// --- Recipe scraping ---

/** Input to the "find recipes online for X" AI call. */
export interface RecipeScrapeRequest {
  query: string;                 // "high-protein chicken dinner"
  max_results?: number;          // default 5
  // Optional URL hints if the user already has candidates in mind.
  candidate_urls?: string[];
}

/** A scraped recipe candidate, NOT yet saved. User picks which to import. */
export interface RecipeCandidate {
  source: RecipeSource;
  name: string;
  description: string | null;
  servings: number;
  prep_time_min: number | null;
  cook_time_min: number | null;
  ingredients: Omit<RecipeIngredient, 'id' | 'recipe_id'>[];
  instructions: string[] | null;
  macros_per_serving: Macros | null;  // null if source didn't provide
  macros_verified: boolean;
  cuisine: string | null;
  image_url: string | null;
}

// --- Food item AI-assisted lookup ---

/** Input to the "look up macros for this food" AI call. */
export interface FoodItemLookupRequest {
  query: string;                 // "Chobani Greek yogurt 0% fat", "medium banana"
  max_results?: number;          // default 3 — usually fewer makes sense
}

/**
 * A candidate food item, NOT yet saved. The AI returns macro estimates from
 * its training data / web search. The user confirms or edits before saving.
 */
export interface FoodItemCandidate {
  name: string;
  brand: string | null;
  serving_size: number;
  serving_unit: ServingUnit;
  macros_per_serving: Macros;
  // Where the macros came from, for transparency. Could be a brand label,
  // a USDA entry the AI cited, or "estimate" if the AI inferred them.
  macros_source: 'brand_label' | 'usda' | 'estimate' | 'other';
  macros_source_note: string | null;  // free text, e.g., "from Chobani.com"
}