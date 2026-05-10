import { NextResponse } from "next/server";

const PRESENTON_URL = process.env.PRESENTON_SELF_HOSTED_URL ?? "http://localhost:5000";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const res = await fetch(`${PRESENTON_URL}/api/v1/ppt/presentation/${id}`, {
      cache: "no-store",
    });
    if (!res.ok) return NextResponse.json(null, { status: res.status });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(null, { status: 500 });
  }
}
