import { getUserIdFromRequest } from "@/lib/auth";
import { errorResponse, ok, withRequestContext } from "@/lib/http";
import { isValidCharacterEntry } from "@/server/agents/characterCards";
import { listStudiedEntries } from "@/server/store";

async function listCharactersHandler(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    const entries = (await listStudiedEntries(userId)).filter((item) => isValidCharacterEntry(item.entry));
    return ok({ entries });
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = withRequestContext(listCharactersHandler);
