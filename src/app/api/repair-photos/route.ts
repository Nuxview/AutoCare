import { z } from "zod";
import { jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { bookingAccess } from "@/server/garage/scope";
import { readImage } from "@/lib/image-file";

export async function GET(request:Request) {
  try {
    const bookingId=z.uuid().parse(new URL(request.url).searchParams.get("bookingId"));
    await bookingAccess(bookingId);
    const admin=createAdminClient();
    const {data,error}=await admin.from("repair_photos").select("id,booking_id,caption,created_at,uploaded_by,storage_path").eq("booking_id",bookingId).order("created_at",{ascending:false});
    if(error) throw error;
    const photos=await Promise.all((data??[]).map(async photo=>{
      const {data:signed,error:signError}=await admin.storage.from("repair-photos").createSignedUrl(photo.storage_path,600);
      if(signError) throw signError;
      return {id:photo.id,caption:photo.caption,createdAt:photo.created_at,uploadedBy:photo.uploaded_by,url:signed.signedUrl};
    }));
    return Response.json({photos});
  } catch(error){return jsonError(error);}
}
export async function POST(request:Request) {
  try {
    const form=await request.formData();
    const bookingId=z.uuid().parse(form.get("bookingId"));
    const caption=z.string().trim().max(240).parse(form.get("caption")??"");
    const file=form.get("file");
    const {bytes,mime}=await readImage(file,5*1024*1024);
    const {user}=await bookingAccess(bookingId);
    const admin=createAdminClient();
    const extension=mime.split("/")[1].replace("jpeg","jpg");
    const path=`${bookingId}/${crypto.randomUUID()}.${extension}`;
    const {error}=await admin.storage.from("repair-photos").upload(path,bytes,{contentType:mime,upsert:false});
    if(error) throw error;
    const {data:photo,error:saveError}=await admin.from("repair_photos").insert({booking_id:bookingId,uploaded_by:user.id,caption:caption||null,storage_path:path}).select("id").single();
    if(saveError) {await admin.storage.from("repair-photos").remove([path]);throw saveError;}
    return Response.json({id:photo.id},{status:201});
  } catch(error){return jsonError(error);}
}
