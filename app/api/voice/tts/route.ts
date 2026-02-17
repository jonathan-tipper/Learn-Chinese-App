import { badRequest, ok, parseBody } from "@/lib/http";
import { ttsSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    const body = await parseBody(request, ttsSchema);
    // v0.1 placeholder: in production this would proxy ElevenLabs.
    return ok({
      format: "text/mock-audio-url",
      audioUrl: `https://example.invalid/tts?text=${encodeURIComponent(body.text)}`
    });
  } catch (error) {
    return badRequest((error as Error).message);
  }
}
