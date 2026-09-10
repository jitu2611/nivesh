import { NextResponse } from "next/server";
import { getBrokerAdapter } from "@/lib/broker";

export async function GET() {
  const broker = getBrokerAdapter();
  return NextResponse.json(await broker.status());
}
