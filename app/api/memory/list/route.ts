import { getUserIdFromRequest } from "@/lib/auth";
import { ok } from "@/lib/http";
import { listMemories } from "@/server/store";

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  return ok({ memories: await listMemories(userId) });
}
