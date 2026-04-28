import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { PISTON_RUNTIMES, SupportedLanguage } from "./constants";

export const executeCode = action({
  args: {
    language: v.string(),
    code: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate language
    const runtime = PISTON_RUNTIMES[args.language as SupportedLanguage];
    if (!runtime) {
      throw new ConvexError("Unsupported language");
    }

    // Require authentication for all languages (for rate limiting and abuse prevention)
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Authentication required to execute code");
    }

    // Check rate limit before allowing execution
    await ctx.runMutation(internal.rateLimit.checkRateLimitInternal, {
      userId: identity.subject,
      action: "executeCode",
    });

    // Check Pro status for non-JavaScript languages
    if (args.language !== "javascript") {
      const isPro = await ctx.runQuery(internal.users.isProUser, {
        userId: identity.subject,
      });

      if (!isPro) {
        throw new ConvexError("Pro subscription required to use this language");
      }
    }

    // Validate code length
    if (args.code.length > 50000) {
      throw new ConvexError("Code must be less than 50KB");
    }

    // Call Piston API server-side
    try {
      const response = await fetch("https://emkc.org/api/v2/piston/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          language: runtime.language,
          version: runtime.version,
          files: [{ content: args.code }],
        }),
      });

      if (!response.ok) {
        throw new ConvexError(`Piston API error: ${response.status}`);
      }

      const data = await response.json();

      // Handle API-level errors
      if (data.message) {
        return {
          success: false,
          output: "",
          error: data.message,
        };
      }

      // Handle compilation errors
      if (data.compile && data.compile.code !== 0) {
        const error = data.compile.stderr || data.compile.output;
        return {
          success: false,
          output: "",
          error,
        };
      }

      // Handle runtime errors
      if (data.run && data.run.code !== 0) {
        const error = data.run.stderr || data.run.output;
        return {
          success: false,
          output: "",
          error,
        };
      }

      // Successful execution
      return {
        success: true,
        output: data.run.output.trim(),
        error: null,
      };
    } catch (error) {
      throw new ConvexError(
        error instanceof Error ? error.message : "Failed to execute code"
      );
    }
  },
});
