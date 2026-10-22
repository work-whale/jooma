import type { Page } from "@playwright/test";

/*
 * Stand-ins for the browser's voice hardware, so the voice features can be
 * driven by a test and nothing is spent: the microphone (Web Speech API), the
 * speaker (an <audio> that ends at once) and a Live call (WebRTC).
 */

/**
 * A microphone that hears each phrase in `window.__heard` in turn, one per
 * start(), and reports it the way Chrome on Android does: the result list
 * holds a growing copy for every word so far, and the event fires per word.
 * Nothing left to hear is silence. `window.__starts` counts the starts.
 */
export async function fakeMicrophone(page: Page, heard: string[]) {
  await page.addInitScript((phrases) => {
    const w = window as unknown as { __heard: string[]; __starts: number; SpeechRecognition: unknown; webkitSpeechRecognition: unknown };
    w.__heard = phrases;
    w.__starts = 0;
    class FakeRecognition {
      continuous = false;
      interimResults = false;
      lang = "";
      onresult: ((e: unknown) => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      private stopped = false;
      start() {
        w.__starts++;
        const phrase = w.__heard.shift();
        const words = phrase ? phrase.split(" ") : [];
        let i = 0;
        const step = () => {
          if (this.stopped) return;
          if (i < words.length) {
            i++;
            const results = Array.from({ length: i }, (_, k) => [{ transcript: words.slice(0, k + 1).join(" ") }]);
            this.onresult?.({ results });
            setTimeout(step, 40);
          } else {
            this.onend?.();
          }
        };
        setTimeout(step, 40);
      }
      stop() {
        this.stopped = true;
        this.onend?.();
      }
      abort() {
        this.stopped = true;
      }
    }
    // Both names: current Chromium has the unprefixed one, which wins.
    w.SpeechRecognition = FakeRecognition;
    w.webkitSpeechRecognition = FakeRecognition;
  }, heard);
}

/** Audio that "plays" at once and ends a moment later, so the queue moves on. */
export async function fakeSpeaker(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("jooma:jo-read-aloud", "1");
    HTMLMediaElement.prototype.play = function () {
      setTimeout(() => this.dispatchEvent(new Event("ended")), 30);
      return Promise.resolve();
    };
  });
}

/**
 * A Live call with no network: getUserMedia hands back a silent track, and
 * RTCPeerConnection "connects" once it has an answer. `window.__live.push(e)`
 * plays a server event into the call's data channel; `window.__live.sent`
 * holds every event the page sent back.
 */
export async function fakeLiveCall(page: Page) {
  await page.addInitScript(() => {
    const live = { sent: [] as unknown[], channel: null as EventTarget | null, push(event: unknown) {
      live.channel?.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(event) }));
    } };
    (window as unknown as { __live: typeof live }).__live = live;

    class FakeChannel extends EventTarget {
      readyState = "open";
      send(data: string) {
        live.sent.push(JSON.parse(data));
      }
      close() {
        this.readyState = "closed";
      }
    }
    class FakePeer {
      connectionState = "new";
      ontrack: unknown = null;
      onconnectionstatechange: (() => void) | null = null;
      addTrack() {}
      createDataChannel() {
        const channel = new FakeChannel();
        live.channel = channel;
        return channel;
      }
      async createOffer() {
        return { type: "offer", sdp: "v=0 fake offer" };
      }
      async setLocalDescription() {}
      async setRemoteDescription() {
        setTimeout(() => {
          this.connectionState = "connected";
          this.onconnectionstatechange?.();
        }, 30);
      }
      close() {
        this.connectionState = "closed";
      }
    }
    const track = { enabled: true, stop() {} };
    const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
    (window as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection = FakePeer;
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: async () => stream }, configurable: true });
  });
}

/** Answers /api/jo/live as the real route would, without opening a call. */
export async function answerLive(page: Page, opened: unknown[] = []) {
  await page.route("**/api/jo/live", (route) => {
    opened.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sdp: "v=0 fake answer", callId: "rtc_test", maxSeconds: 600 }) });
  });
}

/** The teacher saying something in a Live call: committed, then transcribed. */
export async function liveHeard(page: Page, itemId: string, transcript: string) {
  await page.evaluate(
    ({ itemId, transcript }) => {
      const live = (window as unknown as { __live: { push(e: unknown): void } }).__live;
      live.push({ type: "input_audio_buffer.committed", item_id: itemId });
      live.push({ type: "conversation.item.input_audio_transcription.completed", item_id: itemId, transcript });
    },
    { itemId, transcript },
  );
}

/** Any server event, played into the call. */
export async function livePush(page: Page, event: unknown) {
  await page.evaluate((e) => (window as unknown as { __live: { push(e: unknown): void } }).__live.push(e), event);
}

/** Everything the page has sent down the call's data channel. */
export async function liveSent(page: Page): Promise<{ type: string; item?: { call_id?: string; output?: string } }[]> {
  return page.evaluate(() => (window as unknown as { __live: { sent: never[] } }).__live.sent);
}
