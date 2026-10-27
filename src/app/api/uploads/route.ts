export async function POST() {
  return Response.json({ error: { code: "STORAGE_NOT_CONFIGURED", message: "File uploads are disabled until Supabase Storage is configured." } }, { status: 501 });
}
