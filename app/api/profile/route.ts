import { getUserIdFromRequest } from "@/lib/auth";
import { errorResponse, ok, withRequestContext } from "@/lib/http";
import { getProfile } from "@/server/store";

async function getProfileHandler(request: Request) {
  try {
    const userId = await getUserIdFromRequest(request);
    const profile = await getProfile(userId);
    return ok({ profile });
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = withRequestContext(getProfileHandler);
