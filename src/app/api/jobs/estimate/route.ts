import { ApiError, jsonError } from "@/lib/api";
import { requireAuthenticatedUser } from "@/server/auth/context";
export async function PATCH() {
  try {
    await requireAuthenticatedUser();
    throw new ApiError(
      409,
      "Send an itemized quote for customer approval instead",
      "QUOTE_REQUIRED",
    );
  } catch (error) {
    return jsonError(error);
  }
}
