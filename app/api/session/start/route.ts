import { getUserIdFromRequest } from "@/lib/auth";
import { badRequest, ok, parseBody } from "@/lib/http";
import { sessionStartSchema } from "@/lib/schemas";
import { createSession } from "@/server/store";

export async function POST(request: Request) {
  try {
    const body = await parseBody(request, sessionStartSchema);
    const userId = await getUserIdFromRequest(request);
    const session = await createSession(userId, body.mode);

    return ok({
      sessionId: session.id,
      startedAt: session.startedAt,
      planSnippet: "Today: review + short roleplay + one practical sentence"
    });
  } catch (error) {
    return badRequest((error as Error).message);
  }
}
