import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const resetSchema = z.object({
  email: z.string().email(),
});

/**
 * Initiates the password recovery flow via Supabase Auth.
 * Always returns a neutral 200 OK response to prevent email enumeration.
 *
 * @param request Request containing the JSON payload with user email
 * @returns Standard neutral JSON response
 */
export async function POST(request: Request) {
  try {
    const json = await request.json();
    const { email } = resetSchema.parse(json);

    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.APP_URL || "http://localhost:3000"}/auth/callback?mode=reset`,
    });
    // Keep the public response neutral, but make delivery failures diagnosable.
    if (error) console.error("Password recovery delivery failed", { code: error.code, status: error.status });

    return NextResponse.json({
      success: true,
      message: "If that email is in our system, we've sent instructions to reset your password.",
    });
  } catch {
    return NextResponse.json({
      success: true,
      message: "If that email is in our system, we've sent instructions to reset your password.",
    });
  }
}
