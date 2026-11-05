import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerEnv } from "@/lib/env";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const origin = getServerEnv().APP_URL;
  if (code) {
    const supabase = await createClient();
    const flowId = params.get("sb_flow_id");
    const { error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (!error) {
      const path = params.get("mode") === "reset" ? "/login?mode=reset" : "/dashboard";
      return NextResponse.redirect(new URL(path, origin), { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    }
  }
  return NextResponse.redirect(new URL("/login?authError=invalid_link", origin), { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
