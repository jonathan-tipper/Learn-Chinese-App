import { getUserIdFromRequest } from "@/lib/auth";
import { errorResponse, ok, withRequestContext } from "@/lib/http";
import { listMemories } from "@/server/store";

async function listMemoriesHandler(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    return ok({ memories: await listMemories(userId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = withRequestContext(listMemoriesHandler);
