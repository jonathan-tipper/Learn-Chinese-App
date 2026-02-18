import { env, isVeniceEnabled } from "@/lib/env";
import { badRequest, ok } from "@/lib/http";
import { VENICE_MODEL_OPTIONS } from "@/lib/venice";

type VeniceModel = {
  id?: string;
};

type VeniceModelsResponse = {
  data?: VeniceModel[];
};

export async function GET() {
  try {
    if (!isVeniceEnabled()) {
      return badRequest("VENICE_API_KEY is required.");
    }

    const response = await fetch(`${env.veniceBaseUrl}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.veniceApiKey}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Venice models request failed (${response.status})`);
    }

    const payload = (await response.json()) as VeniceModelsResponse;
    const remoteModels = (payload.data ?? [])
      .map((model) => model.id)
      .filter((id): id is string => Boolean(id && id.trim()));

    const models = Array.from(new Set([...remoteModels, ...VENICE_MODEL_OPTIONS]));

    return ok({
      models,
      defaults: {
        simple: env.veniceSimpleModel,
        complex: env.veniceComplexModel
      }
    });
  } catch (error) {
    return badRequest((error as Error).message);
  }
}
