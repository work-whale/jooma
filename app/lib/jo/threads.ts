// A document's conversation with Jo, kept so reopening the document brings it
// back. Browser Supabase client under owner RLS, as assistantChats.ts:
// user_id comes from the column default, so it is never passed.
//
// Written from the browser once a turn finishes, for the same reason the
// assistant's chats are: the route hands its response off before the answer
// is complete, so only the page sees the whole turn.
import { createClient } from "@/app/lib/auth/client";
import type { JoClarify } from "./types";

export type JoDocRef = { kind: "presentation" | "tool_run"; id: string };

/** An op as remembered: what Jo said it was doing, and where it landed. */
export interface JoDoneOp {
  label: string;
  focus: string | null;
}

export interface JoStoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  clarify: JoClarify | null;
  ops: JoDoneOp[] | null;
  summary: string | null;
  created_at: string;
}

const COLUMNS = "id, role, content, clarify, ops, summary, created_at";

/** The thread for a document, created on first use. */
export async function getOrCreateThread(doc: JoDocRef): Promise<string> {
  const supabase = createClient();
  const { data: found, error } = await supabase
    .from("jo_threads")
    .select("id")
    .eq("doc_kind", doc.kind)
    .eq("doc_id", doc.id)
    .maybeSingle();
  if (error) throw error;
  if (found) return (found as { id: string }).id;

  const { data, error: insertError } = await supabase
    .from("jo_threads")
    .insert({ doc_kind: doc.kind, doc_id: doc.id })
    .select("id")
    .single();
  if (insertError) {
    // Two tabs racing to start the same thread: the unique key lets one win,
    // and the other reads the winner's row.
    const { data: again } = await supabase
      .from("jo_threads")
      .select("id")
      .eq("doc_kind", doc.kind)
      .eq("doc_id", doc.id)
      .maybeSingle();
    if (again) return (again as { id: string }).id;
    throw insertError;
  }
  return (data as { id: string }).id;
}

/** A document's earlier turns, oldest first. Empty when there is no thread. */
export async function listJoMessages(doc: JoDocRef): Promise<JoStoredMessage[]> {
  const supabase = createClient();
  const { data: thread, error } = await supabase
    .from("jo_threads")
    .select("id")
    .eq("doc_kind", doc.kind)
    .eq("doc_id", doc.id)
    .maybeSingle();
  if (error || !thread) return [];
  const { data, error: listError } = await supabase
    .from("jo_messages")
    .select(COLUMNS)
    .eq("thread_id", (thread as { id: string }).id)
    .order("created_at", { ascending: true })
    .limit(200);
  if (listError) return [];
  return (data ?? []) as JoStoredMessage[];
}

export async function saveJoMessage(
  threadId: string,
  msg: { role: "user" | "assistant"; content: string; clarify?: JoClarify | null; ops?: JoDoneOp[] | null; summary?: string | null },
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("jo_messages").insert({
    thread_id: threadId,
    role: msg.role,
    content: msg.content,
    clarify: msg.clarify ?? null,
    ops: msg.ops ?? null,
    summary: msg.summary ?? null,
  });
  if (error) throw error;
}
