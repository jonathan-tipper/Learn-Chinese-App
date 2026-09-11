import webpush from "web-push";
import { env, isPushEnabled } from "@/lib/env";
import { getSupabaseServiceClient } from "@/lib/supabase";

export interface PushNotification {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
  tag?: string;
}

let vapidConfigured = false;

function ensureVapid() {
  if (!isPushEnabled()) throw new Error("Push notifications are not configured (missing VAPID env vars).");
  if (!vapidConfigured) {
    webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
    vapidConfigured = true;
  }
}

/** Send one notification to every registered endpoint of a user; prunes dead subscriptions. */
export async function sendPushToUser(userId: string, notification: PushNotification) {
  ensureVapid();
  const db = getSupabaseServiceClient();
  const { data: subs, error } = await db
    .schema(env.supabaseDbSchema)
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId)
    .returns<Array<{ endpoint: string; p256dh: string; auth: string }>>();

  if (error) throw error;
  if (!subs || subs.length === 0) return { sent: 0, staleRemoved: 0 };

  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    icon: notification.icon ?? "/icons/icon-192.png",
    badge: notification.badge ?? "/icons/icon-192.png",
    data: { url: notification.url ?? "/" },
    tag: notification.tag
  });

  const staleEndpoints: string[] = [];
  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
    )
  );

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      const failure = result.reason as { statusCode?: number };
      if (failure?.statusCode === 404 || failure?.statusCode === 410) staleEndpoints.push(subs[index].endpoint);
    }
  });

  if (staleEndpoints.length > 0) {
    await db
      .schema(env.supabaseDbSchema)
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .in("endpoint", staleEndpoints);
  }

  return { sent: results.filter((result) => result.status === "fulfilled").length, staleRemoved: staleEndpoints.length };
}
