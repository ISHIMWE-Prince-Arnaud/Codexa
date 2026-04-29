import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { Id } from "./_generated/dataModel";

const CIRCUIT_OPEN_DURATION_MS = 60 * 1000; // 60 seconds
const MAX_CONSECUTIVE_FAILURES = 5;

// Singleton document ID - will be set after first initialization
let cachedHealthId: Id<"pistonHealth"> | null = null;

/**
 * Get or initialize the Piston health document.
 */
async function getOrInitHealth(ctx: {
  db: {
    get: (id: Id<"pistonHealth">) => Promise<{ _id: Id<"pistonHealth">; consecutiveFailures: number; circuitOpenUntil?: number; lastChecked?: number } | null>;
    query: (table: "pistonHealth") => { first: () => Promise<{ _id: Id<"pistonHealth">; consecutiveFailures: number; circuitOpenUntil?: number; lastChecked?: number } | null> };
    insert: (table: "pistonHealth", data: { consecutiveFailures: number }) => Promise<Id<"pistonHealth">>;
  };
}) {
  // Try to use cached ID first
  if (cachedHealthId) {
    const health = await ctx.db.get(cachedHealthId);
    if (health) return health;
  }

  // Query for first document
  let health = await ctx.db.query("pistonHealth").first();

  if (!health) {
    // Create initial document
    const id = await ctx.db.insert("pistonHealth", {
      consecutiveFailures: 0,
    });
    health = { _id: id, consecutiveFailures: 0 };
    cachedHealthId = id;
  } else {
    cachedHealthId = health._id;
  }

  return health;
}

/**
 * Check if Piston API is available (circuit closed).
 */
export const isPistonAvailable = internalQuery({
  args: {},
  handler: async (ctx) => {
    const health = await ctx.db.query("pistonHealth").first();

    if (!health) return true; // No health record means no failures yet

    // If circuit is open, check if it's time to try again
    if (health.circuitOpenUntil && health.circuitOpenUntil > Date.now()) {
      return false;
    }

    return true;
  },
});

/**
 * Record a Piston API call result.
 * Opens circuit after MAX_CONSECUTIVE_FAILURES failures.
 */
export const recordPistonResult = internalMutation({
  args: {
    success: v.boolean(),
  },
  handler: async (ctx, args) => {
    const health = await getOrInitHealth(ctx);

    if (args.success) {
      // Reset failures on success
      if (health.consecutiveFailures > 0 || health.circuitOpenUntil) {
        await ctx.db.patch(health._id, {
          consecutiveFailures: 0,
          circuitOpenUntil: undefined,
          lastChecked: Date.now(),
        });
      }
      return { available: true };
    }

    // Increment failures
    const newFailures = health.consecutiveFailures + 1;

    // Open circuit if threshold reached
    if (newFailures >= MAX_CONSECUTIVE_FAILURES) {
      await ctx.db.patch(health._id, {
        consecutiveFailures: newFailures,
        circuitOpenUntil: Date.now() + CIRCUIT_OPEN_DURATION_MS,
        lastChecked: Date.now(),
      });
      return { available: false, circuitOpen: true };
    }

    // Just increment failures
    await ctx.db.patch(health._id, {
      consecutiveFailures: newFailures,
      lastChecked: Date.now(),
    });

    return { available: true };
  },
});

/**
 * Health check cron - periodically ping Piston to reset circuit.
 */
export const healthCheckPiston = internalMutation({
  args: {},
  handler: async (ctx) => {
    const health = await ctx.db.query("pistonHealth").first();

    // Only check if circuit is currently open
    if (health?.circuitOpenUntil && health.circuitOpenUntil > Date.now()) {
      return { circuitOpen: true, retryAfter: health.circuitOpenUntil - Date.now() };
    }

    // Try a simple Piston API call
    try {
      const response = await fetch("https://emkc.org/api/v2/piston/runtimes");

      if (response.ok) {
        // Reset failures if successful
        if (health && (health.consecutiveFailures > 0 || health.circuitOpenUntil)) {
          await ctx.db.patch(health._id, {
            consecutiveFailures: 0,
            circuitOpenUntil: undefined,
            lastChecked: Date.now(),
          });
        }
        return { available: true };
      }

      return { available: false, status: response.status };
    } catch (error) {
      return { available: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
});
