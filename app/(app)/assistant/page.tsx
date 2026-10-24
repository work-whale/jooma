import AssistantView from "@/app/(app)/assistant/AssistantView";

export const metadata = { title: "Ask Jo" };

/** A new, unsaved conversation. The chat row is created on the first message,
 *  so landing here and leaving never litters the sidebar. */
export default function AssistantPage() {
  return <AssistantView />;
}
