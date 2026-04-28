import type { GenericDatabaseWriter } from "convex/server";
import type { DataModel } from "./_generated/dataModel";

interface RateLimitConfig {
  // Maximum number of requests allowed within the window
  limit: number;
  // Window duration in milliseconds
  windowMs: number;
}

// Rate limit configurations per action
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  createSnippet: { limit: 10, windowMs: 60 * 1000 }, // 10 per minute
  addComment: { limit: 20, windowMs: 60 * 1000 }, // 20 per minute
  starSnippet: { limit: 30, windowMs: 60 * 1000 }, // 30 per minute
  saveExecution: { limit: 30, windowMs: 60 * 1000 }, // 30 per minute
};

/**
 * Check and enforce rate limit for a given user and action.
 * Uses a sliding window counter: one document per (userId, action) pair.
 * - If within the current window and count < limit, increment and allow.
 * - If within the current window and count >= limit, reject.
 * - If outside the current window, reset the window and allow.
 *
 * Must be called with a writable database context.
 */
export async function checkRateLimit(
  db: GenericDatabaseWriter<DataModel>,
  userId: string,
  action: string
): Promise<void> {
  const config = RATE_LIMITS[action];
  if (!config) return; // No rate limit configured for this action

  const now = Date.now();

  const existing = await db
    .query("rateLimits")
    .withIndex("by_user_id_and_action")
    .filter((q) => q.eq(q.field("userId"), userId) && q.eq(q.field("action"), action))
    .first();

  if (existing) {
    const windowElapsed = now - existing.windowStart;

    if (windowElapsed < config.windowMs) {
      // Within the current window
      if (existing.count >= config.limit) {
        const retryAfterMs = config.windowMs - windowElapsed;
        throw new Error(
          `Rate limit exceeded for ${action}. Try again in ${Math.ceil(retryAfterMs / 1000)} seconds.`
        );
      }
      // Increment the counter
      await db.patch(existing._id, { count: existing.count + 1 });
    } else {
      // Window expired — reset the counter
      await db.patch(existing._id, { count: 1, windowStart: now });
    }
  } else {
    // First request — create a new rate limit entry
    await db.insert("rateLimits", {
      userId,
      action,
      count: 1,
      windowStart: now,
    });
  }
}
