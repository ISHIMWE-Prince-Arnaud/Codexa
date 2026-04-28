"use node";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { createHmac, timingSafeEqual } from "crypto";

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const hmac = createHmac("sha256", secret);
  const computedSignature = hmac.update(payload).digest("hex");
  const sigBuf = Buffer.from(signature, "hex");
  const compBuf = Buffer.from(computedSignature, "hex");
  if (sigBuf.length !== compBuf.length) return false;
  return timingSafeEqual(sigBuf, compBuf);
}

export const verifyWebhook = internalAction({
  args: {
    payload: v.string(),
    signature: v.string(),
  },
  handler: async (ctx, args) => {
    const webhookSecret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error("Missing LEMON_SQUEEZY_WEBHOOK_SECRET environment variable");
    }

    const isValid = verifySignature(args.payload, args.signature, webhookSecret);

    if (!isValid) {
      throw new Error("Invalid signature");
    }

    return JSON.parse(args.payload);
  },
});