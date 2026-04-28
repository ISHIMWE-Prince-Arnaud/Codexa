import { cron } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Cron jobs for scheduled maintenance tasks.
 */

// Clean up old rate limit entries every 5 minutes
// This prevents the rateLimits table from growing unbounded
cron(
  "purge-old-rate-limits",
  {
    minute: "*/5", // Every 5 minutes
  },
  internal.rateLimit.purgeOldRateLimits,
  {}
);

// Clean up old webhook events daily at midnight UTC
// This prevents the webhookEvents table from growing unbounded
cron(
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
cron(
  "reconcile-star-counts",
  {
    hour: 1,
    minute: 0,
  },
  internal.snippets.reconcileStarCounts,
  {}
);

// Health check Piston API every minute to reset circuit breaker when it recovers
cron(
  "health-check-piston",
  {
    minute: "*/1", // Every minute
  },
  internal.pistonHealth.healthCheckPiston,
  {}
);
