import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
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
  executeCode: { limit: 20, windowMs: 60 * 1000 }, // 20 per minute (for code execution)
};

/**
 * Check and enforce rate limit for a given user and action.
 * Uses a sliding window with document-counting to avoid race conditions (TOCTOU).
 * Each request creates a document. We count documents in the window atomically.
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
  const windowStart = now - config.windowMs;

  // Count existing requests in the current window
  // This query is atomic - no race condition possible
  const recentRequests = await db
    .query("rateLimits")
    .withIndex("by_user_id_and_action_timestamp")
    .filter(
      (q) =>
        q.eq(q.field("userId"), userId) &&
        q.eq(q.field("action"), action) &&
        q.gt(q.field("timestamp"), windowStart)
    )
    .collect();

  if (recentRequests.length >= config.limit) {
    // Find the oldest request in the window to calculate retry time
    const oldestRequest = recentRequests.reduce((oldest, current) =>
      current.timestamp < oldest.timestamp ? current : oldest
    );
    const retryAfterMs = oldestRequest.timestamp + config.windowMs - now;
    throw new Error(
      `Rate limit exceeded for ${action}. Try again in ${Math.ceil(Math.max(0, retryAfterMs) / 1000)} seconds.`
    );
  }

  // Record this request
  await db.insert("rateLimits", {
    userId,
    action,
    timestamp: now,
  });

  // Cleanup old entries (optional, can also be done via scheduled job)
  // Keep only the most recent entries to prevent table bloat
  const maxEntriesToKeep = config.limit * 2;
  if (recentRequests.length > maxEntriesToKeep) {
    const entriesToDelete = recentRequests
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, recentRequests.length - maxEntriesToKeep);

    for (const entry of entriesToDelete) {
      await db.delete(entry._id);
    }
  }
}

/**
 * Internal mutation to check rate limits from actions.
 * This wraps checkRateLimit for use with ctx.runMutation from actions.
 */
export const checkRateLimitInternal = internalMutation({
  args: {
    userId: v.string(),
    action: v.string(),
  },
  handler: async (ctx, args) => {
    await checkRateLimit(ctx.db, args.userId, args.action);
  },
});
