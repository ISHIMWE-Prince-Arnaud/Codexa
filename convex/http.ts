import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { Webhook } from "svix";
import { WebhookEvent } from "@clerk/nextjs/server";
import { internal } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error("Missing CLERK_WEBHOOK_SECRET environment variable");
    }

    const svix_id = request.headers.get("svix-id");
    const svix_signature = request.headers.get("svix-signature");
    const svix_timestamp = request.headers.get("svix-timestamp");

    if (!svix_id || !svix_signature || !svix_timestamp) {
      return new Response("Error occurred -- no svix headers", {
        status: 400,
      });
    }

    const payload = await request.json();
    const body = JSON.stringify(payload);

    const wh = new Webhook(webhookSecret);
    let evt: WebhookEvent;

    try {
      evt = wh.verify(body, {
        "svix-id": svix_id,
        "svix-timestamp": svix_timestamp,
        "svix-signature": svix_signature,
      }) as WebhookEvent;
    } catch {
      return new Response("Error occurred", { status: 400 });
    }

    // Check for duplicate events (idempotency)
    const clerkEventId = (evt.data as { id?: string }).id ?? svix_id ?? evt.type;
    const eventId = `clerk:${clerkEventId}`;

    const alreadyProcessed = await ctx.runQuery(internal.webhookHelpers.checkWebhookEvent, {
      eventId,
      provider: "clerk",
    });

    if (alreadyProcessed) {
      return new Response("Already processed", { status: 200 });
    }

    const eventType = evt.type;
    if (eventType === "user.created" || eventType === "user.updated") {
      // save the user to convex db (or update if existing)
      const data = evt.data as { id: string; email_addresses: { email_address: string }[]; first_name?: string; last_name?: string };
      const { id, email_addresses, first_name, last_name } = data;

      const email = email_addresses[0].email_address;
      const name = `${first_name || ""} ${last_name || ""}`.trim();

      try {
        await ctx.runMutation(internal.users.syncUser, {
          userId: id,
          email,
          name,
        });
      } catch {
        return new Response("Error syncing user", { status: 500 });
      }
    }

    // Record that we've processed this event
    await ctx.runMutation(internal.webhookHelpers.recordWebhookEvent, {
      eventId,
      provider: "clerk",
      eventType,
    });

    return new Response("Webhook processed successfully", { status: 200 });
  }),
});

http.route({
  path: "/lemon-squeezy-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const payloadString = await request.text();
    const signature = request.headers.get("X-Signature");

    if (!signature) {
      return new Response("Missing X-Signature header", { status: 400 });
    }

    try {
      const payload = await ctx.runAction(internal.lemonSqueezy.verifyWebhook, {
        payload: payloadString,
        signature,
      });

      // Check for duplicate events (idempotency)
      const payloadData = payload as { meta: { event_id?: string; event_name: string }; data: { id: string; attributes: { user_email: string; customer_id: number; total: number } } };
      const lemonEventId = payloadData.meta.event_id ?? payloadData.data.id ?? signature.slice(0, 16);
      const eventId = `lemon-squeezy:${lemonEventId}`;

      const alreadyProcessed = await ctx.runQuery(internal.webhookHelpers.checkWebhookEvent, {
        eventId,
        provider: "lemon-squeezy",
      });

      if (alreadyProcessed) {
        return new Response("Already processed", { status: 200 });
      }

      if (payloadData.meta.event_name === "order_created") {
        const { data } = payloadData;

        const { success } = await ctx.runMutation(internal.users.upgradeToPro, {
          email: data.attributes.user_email,
          lemonSqueezyCustomerId: data.attributes.customer_id.toString(),
          lemonSqueezyOrderId: data.id,
          amount: data.attributes.total,
        });

        if (success) {
          // optionally do anything here
        }
      }

      // Record that we've processed this event
      await ctx.runMutation(internal.webhookHelpers.recordWebhookEvent, {
        eventId,
        provider: "lemon-squeezy",
        eventType: payloadData.meta.event_name,
      });

      return new Response("Webhook processed successfully", { status: 200 });
    } catch {
      return new Response("Error processing webhook", { status: 500 });
    }
  }),
});

export default http;
