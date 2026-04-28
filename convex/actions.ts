import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

// Piston runtime configuration for each language
const PISTON_RUNTIMES: Record<string, { language: string; version: string }> = {
  javascript: { language: "javascript", version: "18.15.0" },
  typescript: { language: "typescript", version: "5.0.3" },
  python: { language: "python", version: "3.10.0" },
  java: { language: "java", version: "15.0.2" },
  go: { language: "go", version: "1.16.2" },
  rust: { language: "rust", version: "1.68.2" },
  cpp: { language: "cpp", version: "10.2.0" },
  csharp: { language: "csharp", version: "6.12.0" },
  ruby: { language: "ruby", version: "3.0.1" },
  swift: { language: "swift", version: "5.3.3" },
};

export const executeCode = action({
  args: {
    language: v.string(),
    code: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate language
    const runtime = PISTON_RUNTIMES[args.language];
    if (!runtime) {
      throw new ConvexError("Unsupported language");
    }

    // Check Pro status for non-JavaScript languages
    if (args.language !== "javascript") {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        throw new ConvexError("Authentication required for non-JavaScript languages");
      }

      const user = await ctx.runQuery(api.users.getUser, {
        userId: identity.subject,
      });

      if (!user?.isPro) {
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
