import { getUserIdFromRequest } from "@/lib/auth";
import { errorResponse, ok } from "@/lib/http";
import { getProfile } from "@/server/store";

export async function GET(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    const profile = await getProfile(userId);
    return ok({ profile });
  } catch (error) {
    return errorResponse(error);
  }
}
