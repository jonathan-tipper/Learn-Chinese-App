import { getUserIdFromRequest } from "@/lib/auth";
import { env, isVeniceEnabled } from "@/lib/env";
import { errorResponse, ok, parseBody, withRequestContext } from "@/lib/http";
import { ttsSchema } from "@/lib/schemas";

async function synthesizeSpeechHandler(request: Request) {
  try {
    await getUserIdFromRequest(request);
    const body = await parseBody(request, ttsSchema);
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = body.voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? "EXAVITQu4vr4xnSDxMaL";

    // Chinese text must use a Chinese-capable voice — route directly to Venice regardless of ElevenLabs config
    if (body.lang === "zh") {
      if (!isVeniceEnabled()) {
        throw new Error("Chinese TTS requires Venice API. Set VENICE_API_KEY.");
      }
      const veniceVoice = env.veniceTtsVoice;
      const veniceResponse = await fetch(`${env.veniceBaseUrl}/audio/speech`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
          Authorization: `Bearer ${env.veniceApiKey}`
        },
        body: JSON.stringify({
          model: env.veniceTtsModel,
          input: body.text,
          voice: veniceVoice,
          speed: body.speed ?? 1,
          response_format: "mp3",
          streaming: false
        })
      });
      if (!veniceResponse.ok) {
        throw new Error(`Venice Chinese TTS failed (${veniceResponse.status})`);
      }
      const audio = Buffer.from(await veniceResponse.arrayBuffer()).toString("base64");
      return ok({ provider: "venice", format: "audio/mpeg;base64", voiceId: veniceVoice, audioBase64: audio });
    }

    if (apiKey) {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
          "xi-api-key": apiKey
        },
        body: JSON.stringify({
          text: body.text,
          model_id: process.env.ELEVENLABS_MODEL_ID ?? "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.8,
            speed: body.speed ?? 1
          }
        })
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs request failed (${response.status})`);
      }

      const audioBuffer = Buffer.from(await response.arrayBuffer()).toString("base64");
      return ok({
        provider: "elevenlabs",
        format: "audio/mpeg;base64",
        voiceId,
        audioBase64: audioBuffer
      });
    }

    if (!isVeniceEnabled()) {
      throw new Error("No TTS provider configured. Set ELEVENLABS_API_KEY or VENICE_API_KEY.");
    }

    const veniceVoice = body.voiceId ?? env.veniceTtsVoice;
    const veniceResponse = await fetch(`${env.veniceBaseUrl}/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
        Authorization: `Bearer ${env.veniceApiKey}`
      },
      body: JSON.stringify({
        model: env.veniceTtsModel,
        input: body.text,
        voice: veniceVoice,
        speed: body.speed ?? 1,
        response_format: "mp3",
        streaming: false
      })
    });

    if (!veniceResponse.ok) {
      throw new Error(`Venice TTS request failed (${veniceResponse.status})`);
    }

    const veniceAudio = Buffer.from(await veniceResponse.arrayBuffer()).toString("base64");
    return ok({
      provider: "venice",
      format: "audio/mpeg;base64",
      voiceId: veniceVoice,
      audioBase64: veniceAudio
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export const POST = withRequestContext(synthesizeSpeechHandler);
