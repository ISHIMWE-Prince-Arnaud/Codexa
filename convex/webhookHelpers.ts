import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/**
 * Check if a webhook event has already been processed (idempotency).
 * Kept for backward compatibility but prefer recordWebhookEventIfNew for atomic idempotency.
 */
export const checkWebhookEvent = internalQuery({
  args: {
    eventId: v.string(),
    provider: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("webhookEvents")
      .withIndex("by_provider_and_event_id")
      .filter(
        (q) =>
          q.eq(q.field("provider"), args.provider) &&
          q.eq(q.field("eventId"), args.eventId)
      )
      .first();

    return existing !== null;
  },
});

/**
 * Atomically record a webhook event. Returns { alreadyProcessed: true } if the event
 * was already recorded, preventing the check-then-act race condition.
 * Uses the unique by_provider_and_event_id index to detect duplicates on insert.
 */
export const recordWebhookEventIfNew = internalMutation({
  args: {
    eventId: v.string(),
    provider: v.string(),
    eventType: v.string(),
  },
  handler: async (ctx, args) => {
    // Check first as a fast path (avoids unnecessary insert attempts)
    const existing = await ctx.db
      .query("webhookEvents")
      .withIndex("by_provider_and_event_id")
      .filter(
        (q) =>
          q.eq(q.field("provider"), args.provider) &&
          q.eq(q.field("eventId"), args.eventId)
      )
      .first();

    if (existing) {
      return { alreadyProcessed: true };
    }

    // Attempt insert — if a concurrent request already inserted, the unique index
    // will cause a duplicate error which we treat as already processed
    try {
      await ctx.db.insert("webhookEvents", {
        eventId: args.eventId,
        provider: args.provider,
        eventType: args.eventType,
        processedAt: Date.now(),
      });
      return { alreadyProcessed: false };
    } catch (error) {
      // Convex throws a document conflict error for duplicate unique index entries
      if (error instanceof Error && "code" in error && (error as { code?: string }).code === "DUPLICATE_ENTRY") {
        return { alreadyProcessed: true };
      }
      throw error;
    }
  },
});

/**
 * Record a webhook event as processed (for idempotency).
 * Prefer recordWebhookEventIfNew for atomic idempotency.
 */
export const recordWebhookEvent = internalMutation({
  args: {
    eventId: v.string(),
    provider: v.string(),
    eventType: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("webhookEvents", {
      eventId: args.eventId,
      provider: args.provider,
      eventType: args.eventType,
      processedAt: Date.now(),
    });
  },
});

/**
 * Cron job to purge old webhook event entries.
 * Deletes events older than 7 days to prevent table bloat.
 */
export const purgeOldWebhookEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    // Get all webhook events older than 7 days
    const oldEvents = await ctx.db
      .query("webhookEvents")
      .withIndex("by_event_id")
      .filter((q) => q.lt(q.field("processedAt"), sevenDaysAgo))
      .collect();

    // Delete in batches to avoid overwhelming the database
    const BATCH_SIZE = 100;
    for (let i = 0; i < oldEvents.length; i += BATCH_SIZE) {
      const batch = oldEvents.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map((event) => ctx.db.delete(event._id)));
    }

    return { deleted: oldEvents.length };
  },
});
