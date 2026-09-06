import { getUserIdFromRequest } from "@/lib/auth";
import { badRequest, errorResponse, ok, withRequestContext } from "@/lib/http";
import { getOrCreateCharacterCard, isValidCharacterEntry } from "@/server/agents/characterCards";
import { logAgentRun } from "@/server/store";

async function characterCardHandler(request: Request, context: { params: Promise<{ entry: string }> }) {
  try {
    const userId = await getUserIdFromRequest(request);
    const { entry: rawEntry } = await context.params;
    const entry = decodeURIComponent(rawEntry ?? "").trim();
    if (!isValidCharacterEntry(entry)) {
      return badRequest("Provide 1 to 4 Chinese characters.");
    }

    const { searchParams } = new URL(request.url);
    const result = await getOrCreateCharacterCard(entry, {
      force: searchParams.get("refresh") === "1",
      pinyin: searchParams.get("pinyin") ?? undefined,
      english: searchParams.get("english") ?? undefined
    });

    if (!result.cached && result.usage) {
      await logAgentRun({
        userId,
        nodeName: "CharacterCard",
        provider: result.model ? `venice:${result.model}` : "venice",
        tokens: result.usage.totalTokens,
        latencyMs: 0,
        costEstimate: result.costUsd ?? 0
      });
    }

    return ok({ card: result.card, cached: result.cached });
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = withRequestContext(characterCardHandler);
