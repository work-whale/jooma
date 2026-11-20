// The IP recorded beside a typed signature, as evidence (ambassador
// applications and agreement acceptances).
//
// The real peer is the LAST x-forwarded-for entry: Vercel appends it, so a
// spoofed header only adds hops in front of it.
export function signerIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1].slice(0, 64);
  }
  return req.headers.get("x-real-ip")?.slice(0, 64) ?? null;
}
