import { getUserIdFromRequest } from "@/lib/auth";
import { badRequest, errorResponse, ok, parseBody, withRequestContext } from "@/lib/http";
import { memoryDeleteSchema } from "@/lib/schemas";
import { deleteMemory } from "@/server/store";

async function deleteMemoryHandler(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    const body = await parseBody(request, memoryDeleteSchema);
    const deleted = await deleteMemory(userId, body.memoryId);
    if (!deleted) {
      return badRequest("Memory not found");
    }
    return ok({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export const DELETE = withRequestContext(deleteMemoryHandler);
