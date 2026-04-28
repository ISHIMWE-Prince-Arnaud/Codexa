import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    userId: v.string(), // clerkId
    email: v.string(),
    name: v.string(),
    isPro: v.boolean(),
    isAdmin: v.optional(v.boolean()), // Defaults to false (undefined)
    proSince: v.optional(v.number()),
    lemonSqueezyCustomerId: v.optional(v.string()),
    lemonSqueezyOrderId: v.optional(v.string()),
  })
    .index("by_user_id", ["userId"])
    .index("by_email", ["email"])
    .index("by_lemon_squeezy_customer_id", ["lemonSqueezyCustomerId"]),

  codeExecutions: defineTable({
    userId: v.string(),
    language: v.string(),
    code: v.string(),
    output: v.optional(v.string()),
    error: v.optional(v.string()),
  }).index("by_user_id", ["userId"]),

  // Denormalized user stats for efficient retrieval without loading all executions
  userStats: defineTable({
    userId: v.string(),
    totalExecutions: v.number(),
    last24Hours: v.number(),
    languages: v.array(v.string()), // List of used languages
    languageCounts: v.record(v.string(), v.number()), // language -> count
    favoriteLanguage: v.string(),
    mostStarredLanguage: v.string(),
    lastExecutionAt: v.number(), // timestamp of last execution for 24h window calculation
  }).index("by_user_id", ["userId"]),

  snippets: defineTable({
    userId: v.string(),
    title: v.string(),
    language: v.string(),
    code: v.string(),
    userName: v.string(), // store user's name for easy access
    starCount: v.optional(v.number()), // denormalized star count
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
    // Denormalized snippet data to avoid N+1 queries in getStarredSnippets
    snippetTitle: v.optional(v.string()),
    snippetLanguage: v.optional(v.string()),
    snippetCode: v.optional(v.string()),
    snippetUserName: v.optional(v.string()),
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

  // Circuit breaker health tracking for Piston API
  pistonHealth: defineTable({
    // Single document with id "singleton"
    consecutiveFailures: v.number(),
    circuitOpenUntil: v.optional(v.number()), // Timestamp when circuit closes
    lastChecked: v.optional(v.number()),
  }),
});
