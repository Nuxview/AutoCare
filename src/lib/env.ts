import { z } from "zod";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  FIELD_ENCRYPTION_KEY: z.string().min(1),
  APP_URL: z.url().default("http://localhost:3000"),
});

export function getServerEnv() {
  return serverEnvSchema.parse(process.env);
}
