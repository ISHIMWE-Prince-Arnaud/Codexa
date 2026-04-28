import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";

// Helper function to check if user is admin - will be inlined in each mutation
// This avoids type compatibility issues between different mutation contexts

/**
 * Admin: Delete any snippet (including comments and stars).
 * Requires admin privileges.
 */
export const adminDeleteSnippet = internalMutation({
  args: {
    snippetId: v.id("snippets"),
  },
  handler: async (ctx, args) => {
    // Check admin privileges
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_user_id")
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();

    if (!currentUser?.isAdmin) {
      throw new ConvexError("Admin privileges required");
    }

    const snippet = await ctx.db.get(args.snippetId);
    if (!snippet) throw new ConvexError("Snippet not found");

    // Delete all comments
    const BATCH_SIZE = 100;
    let hasMoreComments = true;
    while (hasMoreComments) {
      const comments = await ctx.db
        .query("snippetComments")
        .withIndex("by_snippet_id")
        .filter((q) => q.eq(q.field("snippetId"), args.snippetId))
        .take(BATCH_SIZE);

      for (const comment of comments) {
        await ctx.db.delete(comment._id);
      }
      hasMoreComments = comments.length === BATCH_SIZE;
    }

    // Delete all stars
    let hasMoreStars = true;
    while (hasMoreStars) {
      const stars = await ctx.db
        .query("stars")
        .withIndex("by_snippet_id")
        .filter((q) => q.eq(q.field("snippetId"), args.snippetId))
        .take(BATCH_SIZE);

      for (const star of stars) {
        await ctx.db.delete(star._id);
      }
      hasMoreStars = stars.length === BATCH_SIZE;
    }

    // Delete the snippet
    await ctx.db.delete(args.snippetId);

    return { success: true };
  },
});

/**
 * Admin: Delete any comment.
 * Requires admin privileges.
 */
export const adminDeleteComment = internalMutation({
  args: {
    commentId: v.id("snippetComments"),
  },
  handler: async (ctx, args) => {
    // Check admin privileges
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_user_id")
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();

    if (!currentUser?.isAdmin) {
      throw new ConvexError("Admin privileges required");
    }

    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new ConvexError("Comment not found");

    await ctx.db.delete(args.commentId);

    return { success: true };
  },
});

/**
 * Admin: Grant or revoke Pro status for any user.
 * Requires admin privileges.
 */
export const adminToggleUserPro = internalMutation({
  args: {
    userId: v.string(),
    isPro: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Check admin privileges
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_user_id")
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();

    if (!currentUser?.isAdmin) {
      throw new ConvexError("Admin privileges required");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_user_id")
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .first();

    if (!user) throw new ConvexError("User not found");

    await ctx.db.patch(user._id, {
      isPro: args.isPro,
      proSince: args.isPro ? Date.now() : undefined,
    });

    return { success: true, isPro: args.isPro };
  },
});

/**
 * Admin: Set admin status for a user.
 * Requires admin privileges.
 */
export const adminSetUserAdmin = internalMutation({
  args: {
    userId: v.string(),
    isAdmin: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Check admin privileges
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_user_id")
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();

    if (!currentUser?.isAdmin) {
      throw new ConvexError("Admin privileges required");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_user_id")
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .first();

    if (!user) throw new ConvexError("User not found");

    await ctx.db.patch(user._id, { isAdmin: args.isAdmin });

    return { success: true, isAdmin: args.isAdmin };
  },
});
