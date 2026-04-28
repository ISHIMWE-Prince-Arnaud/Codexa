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

    // Validate code length before consuming rate limit quota
    if (args.code.length > 50000) {
      throw new ConvexError("Code must be less than 50KB");
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

/**
 * Execute code and save the result in one atomic operation.
 * This prevents clients from bypassing Pro-gating by directly calling saveExecution
 * with a different language than what was actually executed.
 */
export const executeAndSaveCode = action({
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

    // Validate code length before consuming rate limit quota
    if (args.code.length > 50000) {
      throw new ConvexError("Code must be less than 50KB");
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

    // Check Piston API circuit breaker
    const pistonAvailable = await ctx.runQuery(internal.pistonHealth.isPistonAvailable);
    if (!pistonAvailable) {
      throw new ConvexError("Code execution temporarily unavailable. Please try again in a minute.");
    }

    // Call Piston API server-side
    let result: { success: boolean; output: string; error: string | null };
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
        result = {
          success: false,
          output: "",
          error: data.message,
        };
      }
      // Handle compilation errors
      else if (data.compile && data.compile.code !== 0) {
        const error = data.compile.stderr || data.compile.output;
        result = {
          success: false,
          output: "",
          error,
        };
      }
      // Handle runtime errors
      else if (data.run && data.run.code !== 0) {
        const error = data.run.stderr || data.run.output;
        result = {
          success: false,
          output: "",
          error,
        };
      }
      // Successful execution
      else {
        result = {
          success: true,
          output: data.run.output.trim(),
          error: null,
        };
      }

      // Record successful Piston API call
      await ctx.runMutation(internal.pistonHealth.recordPistonResult, { success: true });
    } catch (error) {
      // Record failed Piston API call
      await ctx.runMutation(internal.pistonHealth.recordPistonResult, { success: false });

      throw new ConvexError(
        error instanceof Error ? error.message : "Failed to execute code"
      );
    }

    // Save the execution result (uses internalMutation so client cannot directly call)
    await ctx.runMutation(internal.codeExecutions.saveExecution, {
      language: args.language,
      code: args.code,
      output: result.output || undefined,
      error: result.error || undefined,
    });

    return result;
  },
});
