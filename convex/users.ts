import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";

export const syncUser = internalMutation({
  args: {
    userId: v.string(),
    email: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const existingUser = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .first();

    if (!existingUser) {
      await ctx.db.insert("users", {
        userId: args.userId,
        email: args.email,
        name: args.name,
        isPro: false,
      });
    }
  },
});

export const getUser = query({
  args: { userId: v.string() },

  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Only allow users to query their own data
    if (args.userId !== identity.subject) {
      throw new Error("Unauthorized: can only query own user data");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_user_id")
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .first();

    if (!user) return null;

    return user;
  },
});

export const upgradeToPro = mutation({
  args: {
    email: v.string(),
    lemonSqueezyCustomerId: v.string(),
    lemonSqueezyOrderId: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("email"), args.email))
      .first();

    if (!user) throw new Error("User not found");

    // If user already has a customer ID, verify it matches
    if (user.lemonSqueezyCustomerId) {
      if (user.lemonSqueezyCustomerId !== args.lemonSqueezyCustomerId) {
        throw new Error("Customer ID mismatch - possible account takeover attempt");
      }
    }

    await ctx.db.patch(user._id, {
      isPro: true,
      proSince: Date.now(),
      lemonSqueezyCustomerId: args.lemonSqueezyCustomerId,
      lemonSqueezyOrderId: args.lemonSqueezyOrderId,
    });

    return { success: true };
  },
});
