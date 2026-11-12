// The shape the model writes one activity in (Phonics, Early Years Plan),
// arranged into blocks by app/lib/sheets/activity.ts.

import { strictObject } from "@/app/lib/sheets/schema";

const str = { type: "string" } as const;
const strList = { type: "array", items: str } as const;

export function activitySchema() {
  return strictObject({
    title: str,
    focus: str,
    resources: strList,
    steps: strList,
    vocabulary: strList,
    support: str,
    challenge: str,
  });
}
