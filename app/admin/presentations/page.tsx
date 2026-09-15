import { requireSection } from "../access";
import { nf, fmtDateTime } from "../format";

export const dynamic = "force-dynamic";

interface DeckRow {
  id: string;
  email: string | null;
  title: string | null;
  slide_count: number;
  created_at: string;
}

export default async function AdminPresentationsPage() {
  const { supabase } = await requireSection("see_product");
  const { data } = await supabase.rpc("admin_presentations", { lim: 100 });
  const rows = (data ?? []) as DeckRow[];

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ color: "#1D1730" }}>
        Presentations
      </h1>
      <p className="text-sm mb-6" style={{ color: "#6D6683" }}>
        The 100 most recent slideshows across all users.
      </p>

      {rows.length === 0 ? (
        <div
          className="rounded-2xl p-6 border text-sm"
          style={{ backgroundColor: "#FFFFFF", borderColor: "#EAE6F5", color: "#3C3552" }}
        >
          No presentations yet.
        </div>
      ) : (
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ backgroundColor: "#FFFFFF", borderColor: "#EAE6F5" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "#6D6683" }} className="text-left">
                <th className="font-semibold px-4 py-3">Title</th>
                <th className="font-semibold px-4 py-3">Owner</th>
                <th className="font-semibold px-4 py-3 text-right">Slides</th>
                <th className="font-semibold px-4 py-3 text-right">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-t" style={{ borderColor: "#F1ECFC" }}>
                  <td className="px-4 py-3 font-medium max-w-xs truncate" style={{ color: "#1D1730" }}>
                    {d.title || "Untitled Slideshow"}
                  </td>
                  <td className="px-4 py-3" style={{ color: "#3C3552" }}>
                    {d.email || "—"}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: "#3C3552" }}>
                    {nf.format(Number(d.slide_count))}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap" style={{ color: "#6D6683" }}>
                    {fmtDateTime(d.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
