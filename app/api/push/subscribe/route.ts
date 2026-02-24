import { z } from "zod";
import { getUserIdFromRequest } from "@/lib/auth";
import { badRequest, errorResponse, ok, parseBody } from "@/lib/http";
import { getSupabaseServiceClient } from "@/lib/supabase";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

// POST /api/push/subscribe — save (or refresh) a push subscription for the authenticated user
export async function POST(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    const body = await parseBody(request, subscribeSchema);

    const db = getSupabaseServiceClient();
    const { error } = await db
      .schema("learn_chinese")
      .from("push_subscriptions")
      .upsert(
        {
          user_id: userId,
          endpoint: body.endpoint,
          p256dh:   body.keys.p256dh,
          auth:     body.keys.auth,
        },
        { onConflict: "user_id,endpoint" }
      );

    if (error) throw error;
    return ok({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

// DELETE /api/push/subscribe — remove a subscription (user unsubscribed)
export async function DELETE(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    const body = await parseBody(request, unsubscribeSchema);

    const db = getSupabaseServiceClient();
    const { error } = await db
      .schema("learn_chinese")
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", body.endpoint);

    if (error) throw error;
    return ok({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
