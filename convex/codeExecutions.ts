import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { paginationOptsValidator } from "convex/server";
import { checkRateLimit } from "./rateLimit";

export const saveExecution = mutation({
  args: {
    language: v.string(),
    code: v.string(),
    // we could have either one of them, or both at the same time
    output: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    // Check rate limit
    await checkRateLimit(ctx.db, identity.subject, "saveExecution");

    // Check Pro status for non-JavaScript languages using shared helper
    if (args.language !== "javascript") {
      const isPro = await ctx.runQuery(api.internal.users.isProUser, {
        userId: identity.subject,
      });

      if (!isPro) {
        throw new ConvexError("Pro subscription required to use this language");
      }
    }

    await ctx.db.insert("codeExecutions", {
      ...args,
      userId: identity.subject,
    });

    // Update denormalized user stats
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const existingStats = await ctx.db
      .query("userStats")
      .withIndex("by_user_id")
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();

    if (!existingStats) {
      // First execution - create initial stats
      await ctx.db.insert("userStats", {
        userId: identity.subject,
        totalExecutions: 1,
        last24Hours: 1,
        languages: [args.language],
        languageCounts: { [args.language]: 1 },
        favoriteLanguage: args.language,
        mostStarredLanguage: "N/A", // Will be updated by getUserStats if needed
        lastExecutionAt: now,
      });
    } else {
      // Update existing stats
      const newTotal = existingStats.totalExecutions + 1;

      // Calculate last24Hours: reset if last execution was > 24h ago, otherwise increment
      const newLast24Hours = existingStats.lastExecutionAt < oneDayAgo
        ? 1
        : existingStats.last24Hours + 1;

      // Update language counts
      const newLanguageCounts = { ...existingStats.languageCounts };
      newLanguageCounts[args.language] = (newLanguageCounts[args.language] || 0) + 1;

      // Update languages list
      const newLanguages = existingStats.languages.includes(args.language)
        ? existingStats.languages
        : [...existingStats.languages, args.language];

      // Calculate favorite language
      const favoriteLanguage = Object.entries(newLanguageCounts).reduce(
        (favorite, [lang, count]) => count > (newLanguageCounts[favorite] || 0) ? lang : favorite,
        args.language
      );

      await ctx.db.patch(existingStats._id, {
        totalExecutions: newTotal,
        last24Hours: newLast24Hours,
        languages: newLanguages,
        languageCounts: newLanguageCounts,
        favoriteLanguage,
        lastExecutionAt: now,
      });
    }
  },
});

export const getUserExecutions = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    return await ctx.db
      .query("codeExecutions")
      .withIndex("by_user_id")
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getUserStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    // Get denormalized stats - O(1) lookup instead of loading all executions
    const stats = await ctx.db
      .query("userStats")
      .withIndex("by_user_id")
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();

    if (!stats) {
      // No executions yet
      return {
        totalExecutions: 0,
        languagesCount: 0,
        languages: [],
        last24Hours: 0,
        favoriteLanguage: "N/A",
        languageStats: {},
        mostStarredLanguage: "N/A",
      };
    }

    // Calculate most starred language from stars table
    const starredSnippets = await ctx.db
      .query("stars")
      .withIndex("by_user_id")
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .collect();

    // Use denormalized snippetLanguage from stars table instead of N+1 queries
    const starredLanguages = starredSnippets.reduce(
      (acc, star) => {
        if (star.snippetLanguage) {
          acc[star.snippetLanguage] = (acc[star.snippetLanguage] || 0) + 1;
        }
        return acc;
      },
      {} as Record<string, number>
    );

    const mostStarredLanguage =
      Object.entries(starredLanguages).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "N/A";

    return {
      totalExecutions: stats.totalExecutions,
      languagesCount: stats.languages.length,
      languages: stats.languages,
      last24Hours: stats.last24Hours,
      favoriteLanguage: stats.favoriteLanguage,
      languageStats: stats.languageCounts,
      mostStarredLanguage,
    };
  },
});