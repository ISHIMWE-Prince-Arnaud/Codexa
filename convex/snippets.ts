import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import sanitizeHtml from "sanitize-html";
import { checkRateLimit } from "./rateLimit";
import { SUPPORTED_LANGUAGES } from "./constants";

// Build a union validator for supported languages
const languageValidator = v.union(
  ...SUPPORTED_LANGUAGES.map((lang) => v.literal(lang))
);

export const createSnippet = mutation({
  args: {
    title: v.string(),
    language: languageValidator,
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    // Validate input lengths
    if (args.title.length > 200) throw new ConvexError("Title must be less than 200 characters");
    if (args.code.length > 50000) throw new ConvexError("Code must be less than 50KB");

    // Check rate limit
    await checkRateLimit(ctx.db, identity.subject, "createSnippet");

    const user = await ctx.db
      .query("users")
      .withIndex("by_user_id")
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();

    if (!user) throw new ConvexError("User not found");

    const snippetId = await ctx.db.insert("snippets", {
      userId: identity.subject,
      userName: user.name,
      title: args.title,
      language: args.language,
      code: args.code,
      starCount: 0, // Initialize denormalized star count
    });

    return snippetId;
  },
});

export const deleteSnippet = mutation({
  args: {
    snippetId: v.id("snippets"),
  },

  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    const snippet = await ctx.db.get(args.snippetId);
    if (!snippet) throw new ConvexError("Snippet not found");

    if (snippet.userId !== identity.subject) {
      throw new ConvexError("Not authorized to delete this snippet");
    }

    // Delete all comments in batches to prevent orphaning
    // Convex mutations are atomic — if anything fails, all changes are rolled back
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

    // Delete all stars in batches to prevent orphaning
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

    // Delete the snippet last
    await ctx.db.delete(args.snippetId);
  },
});

export const updateSnippet = mutation({
  args: {
    snippetId: v.id("snippets"),
    title: v.string(),
    language: languageValidator,
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    const snippet = await ctx.db.get(args.snippetId);
    if (!snippet) throw new ConvexError("Snippet not found");

    if (snippet.userId !== identity.subject) {
      throw new ConvexError("Not authorized to update this snippet");
    }

    // Validate input lengths
    if (args.title.length > 200) throw new ConvexError("Title must be less than 200 characters");
    if (args.code.length > 50000) throw new ConvexError("Code must be less than 50KB");

    // Update the snippet
    await ctx.db.patch(args.snippetId, {
      title: args.title,
      language: args.language,
      code: args.code,
    });

    // Update denormalized data in all stars for this snippet
    // This ensures starred snippets show up-to-date information
    const BATCH_SIZE = 100;
    let hasMoreStars = true;
    while (hasMoreStars) {
      const stars = await ctx.db
        .query("stars")
        .withIndex("by_snippet_id")
        .filter((q) => q.eq(q.field("snippetId"), args.snippetId))
        .take(BATCH_SIZE);

      for (const star of stars) {
        await ctx.db.patch(star._id, {
          snippetTitle: args.title,
          snippetLanguage: args.language,
          snippetCode: args.code,
        });
      }

      hasMoreStars = stars.length === BATCH_SIZE;
    }

    return { success: true };
  },
});

export const starSnippet = mutation({
  args: {
    snippetId: v.id("snippets"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    // Check rate limit
    await checkRateLimit(ctx.db, identity.subject, "starSnippet");

    // Get snippet details for denormalization
    const snippet = await ctx.db.get(args.snippetId);
    if (!snippet) throw new ConvexError("Snippet not found");

    // Use compound index to find existing star
    const existing = await ctx.db
      .query("stars")
      .withIndex("by_user_id_and_snippet_id")
      .filter(
        (q) =>
          q.eq(q.field("userId"), identity.subject) && q.eq(q.field("snippetId"), args.snippetId)
      )
      .first();

    if (existing) {
      // Unstar: delete the existing star and decrement count
      await ctx.db.delete(existing._id);
      const newCount = (snippet.starCount || 1) - 1;
      await ctx.db.patch(args.snippetId, { starCount: Math.max(0, newCount) });
      return { starred: false };
    } else {
      // Star: insert new star with denormalized data and increment count
      try {
        await ctx.db.insert("stars", {
          userId: identity.subject,
          snippetId: args.snippetId,
          snippetTitle: snippet.title,
          snippetLanguage: snippet.language,
          snippetCode: snippet.code,
          snippetUserName: snippet.userName,
        });
        const newCount = (snippet.starCount || 0) + 1;
        await ctx.db.patch(args.snippetId, { starCount: newCount });
        return { starred: true };
      } catch (error) {
        // Handle race condition: if another concurrent call already inserted, treat as success
        if (error instanceof Error && "code" in error && (error as { code?: string }).code === "DUPLICATE_ENTRY") {
          return { starred: true };
        }
        throw new ConvexError(`Failed to star snippet: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  },
});

export const addComment = mutation({
  args: {
    snippetId: v.id("snippets"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    // Check rate limit
    await checkRateLimit(ctx.db, identity.subject, "addComment");

    const user = await ctx.db
      .query("users")
      .withIndex("by_user_id")
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .first();

    if (!user) throw new ConvexError("User not found");

    // Validate content length
    if (args.content.length > 5000) throw new ConvexError("Comment must be less than 5000 characters");

    // Sanitize content to prevent XSS - strip all HTML tags
    const sanitizedContent = sanitizeHtml(args.content, {
      allowedTags: [],
      allowedAttributes: {},
    });

    return await ctx.db.insert("snippetComments", {
      snippetId: args.snippetId,
      userId: identity.subject,
      userName: user.name,
      content: sanitizedContent,
    });
  },
});

export const deleteComment = mutation({
  args: { commentId: v.id("snippetComments") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");

    const comment = await ctx.db.get(args.commentId);
    if (!comment) throw new ConvexError("Comment not found");

    // Check if the user is the comment author
    if (comment.userId !== identity.subject) {
      throw new ConvexError("Not authorized to delete this comment");
    }

    await ctx.db.delete(args.commentId);
  },
});

export const getSnippets = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    const snippets = await ctx.db.query("snippets").order("desc").take(limit);

    // Get authenticated user's identity to compute isOwner
    const identity = await ctx.auth.getUserIdentity();
    const currentUserId = identity?.subject;

    // Return snippets with isOwner computed, not raw userId
    return snippets.map((snippet) => ({
      ...snippet,
      isOwner: snippet.userId === currentUserId,
    }));
  },
});

export const getSnippetById = query({
  args: { snippetId: v.id("snippets") },
  handler: async (ctx, args) => {
    const snippet = await ctx.db.get(args.snippetId);
    if (!snippet) throw new ConvexError("Snippet not found");

    // Get authenticated user's identity to compute isOwner
    const identity = await ctx.auth.getUserIdentity();
    const isOwner = snippet.userId === identity?.subject;

    // Return snippet with isOwner computed, not raw userId
    return {
      ...snippet,
      isOwner,
    };
  },
});

export const getComments = query({
  args: { snippetId: v.id("snippets") },
  handler: async (ctx, args) => {
    const comments = await ctx.db
      .query("snippetComments")
      .withIndex("by_snippet_id")
      .filter((q) => q.eq(q.field("snippetId"), args.snippetId))
      .order("desc")
      .collect();

    return comments;
  },
});

export const isSnippetStarred = query({
  args: {
    snippetId: v.id("snippets"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;

    const star = await ctx.db
      .query("stars")
      .withIndex("by_user_id_and_snippet_id")
      .filter(
        (q) =>
          q.eq(q.field("userId"), identity.subject) && q.eq(q.field("snippetId"), args.snippetId)
      )
      .first();

    return !!star;
  },
});

export const getSnippetStarCount = query({
  args: { snippetId: v.id("snippets") },
  handler: async (ctx, args) => {
    const snippet = await ctx.db.get(args.snippetId);
    if (!snippet) return 0;

    // Use denormalized starCount for O(1) lookup instead of O(N) collection scan
    return snippet.starCount || 0;
  },
});

export const getStarredSnippets = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const stars = await ctx.db
      .query("stars")
      .withIndex("by_user_id")
      .filter((q) => q.eq(q.field("userId"), identity.subject))
      .collect();

    // Fetch live snippet data instead of using potentially stale denormalized data
    // This ensures deleted snippets are filtered out and edits are reflected
    const snippets = await Promise.all(
      stars.map(async (star) => {
        const snippet = await ctx.db.get(star.snippetId);
        return snippet;
      })
    );

    // Filter out deleted snippets and map to response format with isOwner
    return snippets
      .filter((snippet): snippet is NonNullable<typeof snippet> => snippet !== null)
      .map((snippet) => ({
        ...snippet,
        isOwner: snippet.userId === identity.subject,
      }));
  },
});

/**
 * Reconciles denormalized starCount with actual star counts.
 * Safety net for any drift between starCount and actual star count.
 * Processes in batches to avoid overwhelming the database.
 */
export const reconcileStarCounts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const BATCH_SIZE = 100;
    let reconciled = 0;
    let checked = 0;
    let hasMore = true;

    // Process in batches using take() instead of paginate()
    // to avoid Convex's "single paginated query per function" limit
    while (hasMore) {
      // Get batch of snippets
      const snippets = await ctx.db
        .query("snippets")
        .take(BATCH_SIZE);

      if (snippets.length === 0) {
        break;
      }

      for (const snippet of snippets) {
        checked++;

        // Count actual stars for this snippet
        const stars = await ctx.db
          .query("stars")
          .withIndex("by_snippet_id")
          .filter((q) => q.eq(q.field("snippetId"), snippet._id))
          .collect();

        const actualCount = stars.length;
        const denormalizedCount = snippet.starCount || 0;

        // Fix if there's a mismatch
        if (actualCount !== denormalizedCount) {
          await ctx.db.patch(snippet._id, { starCount: actualCount });
          reconciled++;
        }
      }

      // Continue if we got a full batch (there might be more)
      hasMore = snippets.length === BATCH_SIZE;
    }

    return { checked, reconciled };
  },
});