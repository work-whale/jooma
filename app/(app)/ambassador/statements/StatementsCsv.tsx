"use client";

import { DownloadSimple } from "@phosphor-icons/react";
import { downloadCsv, toCsv } from "@/app/lib/csv";
import s from "@/app/components/ambassador/programme.module.css";

export interface CsvStatement {
  month: string;
  paidOn: string;
  commission: string;
  adjustments: string;
  net: string;
  status: string;
}

/** Every statement as a CSV, for their own records. */
export default function StatementsCsv({ rows }: { rows: CsvStatement[] }) {
  return (
    <button
      type="button"
      className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}
      disabled={rows.length === 0}
      onClick={() =>
        downloadCsv(
          toCsv(
            ["For", "Paid on", "Commission (GBP)", "Adjustments (GBP)", "Total (GBP)", "Status"],
            rows.map((r) => [r.month, r.paidOn, r.commission, r.adjustments, r.net, r.status]),
          ),
          `jooma-ambassador-statements-${new Date().toISOString().slice(0, 10)}.csv`,
        )
      }
    >
      <DownloadSimple size={15} weight="bold" /> Download all as CSV
    </button>
  );
}
