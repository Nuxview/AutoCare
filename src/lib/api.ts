import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "REQUEST_FAILED",
  ) {
    super(message);
  }
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError)
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  if (error instanceof ZodError)
    return Response.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Please correct the highlighted fields",
          details: error.flatten(),
        },
      },
      { status: 400 },
    );
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = String(error.message);
    for (const [code, text] of Object.entries({
      CHECKOUT_OPEN: "Another payment is already open for this invoice. Check its status first.",
      INVOICE_NOT_PAYABLE: "This invoice is no longer payable. Refresh the page.",
      WHOLE_KES_REQUIRED: "M-Pesa requires a whole KES balance. Please use card checkout for this invoice.",
      APPROVAL_REQUIRED: "The customer must approve the latest quote first.",
      PARTS_MISMATCH: "Record all approved stock parts used before invoicing.",
      JOB_CLOSED: "This repair is closed or invoiced.",
      INVALID_MILEAGE: "Mileage cannot decrease. Enter a valid reading.",
    })) {
      if (message.includes(code))
        return Response.json(
          { error: { code, message: text } },
          { status: 409 },
        );
    }
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  ) {
    return Response.json(
      {
        error: {
          code: "CONFLICT",
          message: "A record with those details already exists",
        },
      },
      { status: 409 },
    );
  }
  console.error(error);
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong" } },
    { status: 500 },
  );
}
