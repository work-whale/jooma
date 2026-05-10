import { NextResponse } from "next/server";

const PRESENTON_URL = process.env.PRESENTON_SELF_HOSTED_URL ?? "http://localhost:5000";

export async function GET() {
  try {
    const res = await fetch(`${PRESENTON_URL}/api/v1/ppt/presentation/all`, {
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json([]);
    const data = await res.json();
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch {
    return NextResponse.json([]);
  }
}
