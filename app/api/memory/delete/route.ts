import { getUserIdFromHeaders } from "@/lib/auth";
import { badRequest, ok, parseBody } from "@/lib/http";
import { memoryDeleteSchema } from "@/lib/schemas";
import { deleteMemory } from "@/server/store/inMemory";

export async function DELETE(request: Request) {
  try {
    const userId = getUserIdFromHeaders();
    const body = await parseBody(request, memoryDeleteSchema);
    const deleted = deleteMemory(userId, body.memoryId);
    if (!deleted) {
      return badRequest("Memory not found");
    }
    return ok({ ok: true });
  } catch (error) {
    return badRequest((error as Error).message);
  }
}
