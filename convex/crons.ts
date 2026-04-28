import { crons } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Cron jobs for scheduled maintenance tasks.
 */

const cron = crons();

// Clean up old rate limit entries every 5 minutes
// This prevents the rateLimits table from growing unbounded
export const purgeOldRateLimits = cron.cron(
  "purge-old-rate-limits",
  {
    minute: "*/5", // Every 5 minutes
  },
  internal.rateLimit.purgeOldRateLimits,
  {}
);

// Clean up old webhook events daily at midnight UTC
// This prevents the webhookEvents table from growing unbounded
export const purgeOldWebhookEvents = cron.cron(
  "purge-old-webhook-events",
  {
    hour: 0,
    minute: 0,
  },
  internal.webhookHelpers.purgeOldWebhookEvents,
  {}
);

// Reconcile star counts daily at 1 AM UTC
// Safety net to fix any drift between denormalized starCount and actual star counts
export const reconcileStarCounts = cron.cron(
  "reconcile-star-counts",
  {
    hour: 1,
    minute: 0,
  },
  internal.snippets.reconcileStarCounts,
  {}
);

// Health check Piston API every minute to reset circuit breaker when it recovers
export const healthCheckPiston = cron.cron(
  "health-check-piston",
  {
    minute: "*/1", // Every minute
  },
  internal.pistonHealth.healthCheckPiston,
  {}
);
