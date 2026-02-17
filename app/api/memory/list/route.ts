import { getUserIdFromHeaders } from "@/lib/auth";
import { ok } from "@/lib/http";
import { listMemories } from "@/server/store/inMemory";

export async function GET() {
  const userId = getUserIdFromHeaders();
  return ok({ memories: listMemories(userId) });
}
