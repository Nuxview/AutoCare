import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code = "REQUEST_FAILED") {
    super(message);
  }
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
  if (error instanceof ZodError) return Response.json({ error: { code: "VALIDATION_ERROR", message: "Please correct the highlighted fields", details: error.flatten() } }, { status: 400 });
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
    return Response.json({ error: { code: "CONFLICT", message: "A record with those details already exists" } }, { status: 409 });
  }
  console.error(error);
  return Response.json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } }, { status: 500 });
}
