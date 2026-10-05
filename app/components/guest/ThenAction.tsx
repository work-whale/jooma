"use client";

import { useEffect } from "react";
import { isThenAction } from "@/app/lib/guest-actions";

/**
 * Runs `?then=<action>` once: finds the button marked `data-then="<action>"`
 * and presses it, then takes the parameter off the URL so a refresh does not
 * press it again.
 *
 * This is how a guest who pressed Export on /create, then signed up, arrives
 * in the editor with the export menu already open. The page itself needs no
 * knowledge of it beyond the attribute on its button, so the editor and the
 * result panel stay as they were.
 *
 * Waits for the button rather than assuming it is there: the editor loads the
 * deck after mount, and the result panel renders only once a run is restored.
 * Gives up quietly after a few seconds.
 */
export default function ThenAction() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const then = url.searchParams.get("then");
    if (!isThenAction(then)) return;

    url.searchParams.delete("then");
    window.history.replaceState(window.history.state, "", url.toString());

    let done = false;
    const press = () => {
      if (done) return;
      const host = document.querySelector<HTMLElement>(`[data-then="${then}"]`);
      if (!host) return;
      const button = host.matches("button") ? host : host.querySelector<HTMLElement>("button");
      if (!button || (button as HTMLButtonElement).disabled) return;
      done = true;
      button.click();
    };

    const observer = new MutationObserver(press);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    press();
    const stop = window.setTimeout(() => observer.disconnect(), 10_000);
    return () => {
      observer.disconnect();
      window.clearTimeout(stop);
    };
  }, []);

  return null;
}
