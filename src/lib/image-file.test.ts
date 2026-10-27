import { describe,expect,it } from "vitest";
import { readImage } from "./image-file";

describe("repair image validation",()=>{
  it("accepts an image signature and rejects a spoofed content type",async()=>{
    const png=new File([new Uint8Array([137,80,78,71,13,10,26,10,1])],"repair.png",{type:"image/png"});
    await expect(readImage(png,1024)).resolves.toMatchObject({mime:"image/png"});
    const spoof=new File(["not an image"],"repair.png",{type:"image/png"});
    await expect(readImage(spoof,1024)).rejects.toMatchObject({code:"INVALID_FILE"});
  });
});
