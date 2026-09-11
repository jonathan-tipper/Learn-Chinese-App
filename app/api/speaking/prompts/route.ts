import { getUserIdFromRequest } from "@/lib/auth";
import { errorResponse, ok, withRequestContext } from "@/lib/http";
import { getSpeakingPrompts } from "@/server/agents/speakingPrompts";

async function speakingPromptsHandler(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    const { searchParams } = new URL(request.url);
    const result = await getSpeakingPrompts(userId, {
      count: Number(searchParams.get("count") ?? 4) || 4,
      force: searchParams.get("refresh") === "1"
    });
    return ok(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = withRequestContext(speakingPromptsHandler);
