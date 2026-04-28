import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    userId: v.string(), // clerkId
    email: v.string(),
    name: v.string(),
    isPro: v.boolean(),
    proSince: v.optional(v.number()),
    lemonSqueezyCustomerId: v.optional(v.string()),
    lemonSqueezyOrderId: v.optional(v.string()),
  })
    .index("by_user_id", ["userId"])
    .index("by_lemon_squeezy_customer_id", ["lemonSqueezyCustomerId"]),

  codeExecutions: defineTable({
    userId: v.string(),
    language: v.string(),
    code: v.string(),
    output: v.optional(v.string()),
    error: v.optional(v.string()),
  }).index("by_user_id", ["userId"]),

  snippets: defineTable({
    userId: v.string(),
    title: v.string(),
    language: v.string(),
    code: v.string(),
    userName: v.string(), // store user's name for easy access
  }).index("by_user_id", ["userId"]),

  snippetComments: defineTable({
    snippetId: v.id("snippets"),
    userId: v.string(),
    userName: v.string(),
    content: v.string(), // Stores plain text/markdown content (sanitized on server)
  }).index("by_snippet_id", ["snippetId"]),

  stars: defineTable({
    userId: v.string(),
    snippetId: v.id("snippets"),
  })
    .index("by_user_id", ["userId"])
    .index("by_snippet_id", ["snippetId"])
    .index("by_user_id_and_snippet_id", ["userId", "snippetId"]),

  rateLimits: defineTable({
    userId: v.string(),
    action: v.string(), // e.g. "createSnippet", "addComment", etc.
    timestamp: v.number(), // when this request was made (for window-based counting)
  }).index("by_user_id_and_action", ["userId", "action"])
    .index("by_user_id_and_action_timestamp", ["userId", "action", "timestamp"]),

  webhookEvents: defineTable({
    eventId: v.string(), // unique event ID from the webhook provider
    provider: v.string(), // "clerk" or "lemon-squeezy"
    eventType: v.string(),
    processedAt: v.number(),
  }).index("by_event_id", ["eventId"])
    .index("by_provider_and_event_id", ["provider", "eventId"]),
});
