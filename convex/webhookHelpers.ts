import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/**
 * Check if a webhook event has already been processed (idempotency).
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
 * Record a webhook event as processed (for idempotency).
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
