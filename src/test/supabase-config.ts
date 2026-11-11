export function supabaseTestConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const url = env.TEST_SUPABASE_URL?.trim();
  const publishableKey = env.TEST_SUPABASE_PUBLISHABLE_KEY?.trim();
  const secretKey = env.TEST_SUPABASE_SECRET_KEY?.trim();
  if (!url || !publishableKey || !secretKey) {
    throw new Error(
      "Integration tests require TEST_SUPABASE_URL, TEST_SUPABASE_PUBLISHABLE_KEY and TEST_SUPABASE_SECRET_KEY for a local test instance",
    );
  }
  const parsed = new URL(url);
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
  ) {
    throw new Error(
      "Integration tests only support a local Supabase test instance",
    );
  }
  return { url, publishableKey, secretKey };
}
