import { z } from "zod";
import { env, isPushEnabled } from "@/lib/env";
import { badRequest, errorResponse, ok, parseBody, unauthorized, withRequestContext } from "@/lib/http";
import { sendPushToUser } from "@/server/push";

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
    const result = await sendPushToUser(payload.userId, payload);
    return ok(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export const POST = withRequestContext(sendPushNotificationHandler);
