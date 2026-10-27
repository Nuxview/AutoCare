import { ApiError } from "@/lib/api";

export async function readImage(file:FormDataEntryValue|null,maxBytes:number){
  if(!(file instanceof File)||file.size===0||file.size>maxBytes||!["image/jpeg","image/png","image/webp"].includes(file.type)) throw new ApiError(400,`Choose a JPG, PNG or WebP image under ${Math.round(maxBytes/1024/1024)} MB`,"INVALID_FILE");
  const bytes=new Uint8Array(await file.arrayBuffer());
  const valid=file.type==="image/jpeg"?bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff:file.type==="image/png"?bytes.slice(0,8).every((v,i)=>v===[137,80,78,71,13,10,26,10][i]):String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP";
  if(!valid) throw new ApiError(400,"The file does not match its image type","INVALID_FILE");
  return {bytes,mime:file.type};
}
