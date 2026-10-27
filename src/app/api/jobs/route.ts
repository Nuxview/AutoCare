import { z } from "zod";
import { jsonError } from "@/lib/api";
import { createJobFromBooking, listVisibleJobs } from "@/server/jobs/service";

export async function GET() { try { return Response.json({ jobs: await listVisibleJobs() }); } catch (error) { return jsonError(error); } }
export async function POST(request: Request) { try { const { bookingId } = z.object({ bookingId: z.uuid() }).parse(await request.json()); return Response.json({ job: await createJobFromBooking(bookingId) }, { status: 201 }); } catch (error) { return jsonError(error); } }
