import { getUserIdFromHeaders } from "@/lib/auth";
import { badRequest, ok, parseBody } from "@/lib/http";
import { sessionStartSchema } from "@/lib/schemas";
import { createSession } from "@/server/store/inMemory";

export async function POST(request: Request) {
  try {
    const body = await parseBody(request, sessionStartSchema);
    const userId = getUserIdFromHeaders();
    const session = createSession(userId, body.mode);

    return ok({
      sessionId: session.id,
      startedAt: session.startedAt,
      planSnippet: "Today: review + short roleplay + one practical sentence"
    });
  } catch (error) {
    return badRequest((error as Error).message);
  }
}
