import { getUserIdFromRequest } from "@/lib/auth";
import { errorResponse, ok } from "@/lib/http";
import { listMemories } from "@/server/store";

export async function GET(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    return ok({ memories: await listMemories(userId) });
  } catch (error) {
    return errorResponse(error);
  }
}
