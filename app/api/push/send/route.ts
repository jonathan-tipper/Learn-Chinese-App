import webpush from "web-push";
import { z } from "zod";
import { env, isPushEnabled } from "@/lib/env";
import { badRequest, errorResponse, ok, parseBody, unauthorized, withRequestContext } from "@/lib/http";
import { getSupabaseServiceClient } from "@/lib/supabase";

const sendSchema = z.object({
  userId:  z.string().uuid(),
  title:   z.string().min(1),
  body:    z.string().min(1),
  url:     z.string().optional().default("/review"),
  icon:    z.string().optional().default("/icons/icon-192.png"),
  badge:   z.string().optional().default("/icons/icon-192.png"),
});

/**
 * POST /api/push/send
 *
 * Server-only endpoint — protected by the Supabase service-role key.
 * Call from a Supabase Edge Function / cron job to send streak reminders.
 *
 * Body: { userId, title, body, url?, icon?, badge? }
 * Auth: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 */
async function sendPushNotificationHandler(request: Request) {
  try {
    // Require service-role key — this endpoint is not for end-user calls
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token || token !== env.supabaseServiceRoleKey) {
      return unauthorized("Admin only");
    }

    if (!isPushEnabled()) {
      return badRequest("Push notifications are not configured (missing VAPID env vars).");
    }

    const payload = await parseBody(request, sendSchema);

    webpush.setVapidDetails(
      env.vapidSubject,
      env.vapidPublicKey,
      env.vapidPrivateKey,
    );

    // Fetch all subscriptions for this user
    const db = getSupabaseServiceClient();
    const { data: subs, error } = await db
      .schema(env.supabaseDbSchema)
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", payload.userId);

    if (error) throw error;
    if (!subs || subs.length === 0) return ok({ sent: 0 });

    const notification = JSON.stringify({
      title: payload.title,
      body:  payload.body,
      icon:  payload.icon,
      badge: payload.badge,
      data:  { url: payload.url },
    });

    // Send to every registered endpoint; collect stale ones to clean up
    const staleEndpoints: string[] = [];
    const results = await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          notification,
        )
      )
    );

    results.forEach((result, i) => {
      if (result.status === "rejected") {
        const err = result.reason as { statusCode?: number };
        // 404 / 410 means the subscription is no longer valid
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          staleEndpoints.push(subs[i].endpoint);
        }
      }
    });

    // Prune stale subscriptions
    if (staleEndpoints.length > 0) {
      await db
        .schema(env.supabaseDbSchema)
        .from("push_subscriptions")
        .delete()
        .eq("user_id", payload.userId)
        .in("endpoint", staleEndpoints);
    }

    const sent = results.filter((r) => r.status === "fulfilled").length;
    return ok({ sent, staleRemoved: staleEndpoints.length });
  } catch (error) {
    return errorResponse(error);
  }
}

export const POST = withRequestContext(sendPushNotificationHandler);
