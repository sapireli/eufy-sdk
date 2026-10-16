import { writeFileSync } from "node:fs";
import type { SharedLiveSource } from "../shared-live-source.js";
import { EventEmitter } from "node:events";
import { afterAll, describe, expect, it, vi } from "vitest";
import { p2pVideoFrame } from "./live-source-fixtures.js";

/**
 * A camera that finds the station's own session claimed opens a SECOND connection, and that connection
 * carries media alone.
 *
 * The sibling spec seeds both sessions into the manager, so `acquire` answers from its registry and the
 * factory never runs — which leaves the claim in this feature's title resting on bookkeeping. Here
 * `P2PSession` itself is faked, so `openSession` and `makeSession` execute for real and the question
 * "was another connection actually opened" has an answer: two constructions, two distinct instances.
 *
 * It also pins what that second connection must NOT do. A station announces its state to every client
 * that connects, so an announced second connection reports every event twice; and its idle-close must
 * reach the source it carries rather than the station, which has other cameras and its own control
 * traffic riding on it.
 */
const built: FakeSession[] = [];

/** Set before an open to make the NEXT session connect without ever getting a level-2 key. */
let nextSessionHasNoKey = false;

class FakeSession extends EventEmitter {
  isConnected = false;
  traceId = `trace-${built.length}`;
  opts: Record<string, unknown>;
  hasKey: boolean;
  decodeVideoFrame(data: Buffer) {
    return data.subarray(22);
  }
  startLiveMedia = vi.fn();
  stopLiveMedia = vi.fn();
  constructor(opts: Record<string, unknown>) {
    super();
    this.opts = opts;
    this.hasKey = !nextSessionHasNoKey;
    nextSessionHasNoKey = false;
    built.push(this);
  }
  async connect() {
    this.isConnected = true;
  }
  async awaitLevel2Key() {
    return this.hasKey;
  }
  repromptLevel2Key() {
    return false;
  }
  async close() {
    this.isConnected = false;
    this.emit("close");
  }
}

vi.mock("../p2p-session.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../p2p-session.js")>()),
  P2PSession: FakeSession,
}));

const { P2PCommandRouter } = await import("../command-router.js");
type Router = InstanceType<typeof P2PCommandRouter>;

const STATION_SN = "T8010P0000000000";
const CAM_A = "T8114P0000000000";
const CAM_B = "T8210P0000000002";
const ACCOUNT_ID = "0000000000000000000000000000000000000000";
const DID = "XXXXXXX-000000-XXXXX";

const events: string[] = [];
const traceRows: unknown[] = [];
const results: Record<string, unknown>[] = [];

function router() {
  built.length = 0;
  events.length = 0;
  traceRows.length = 0;
  nextSessionHasNoKey = false;
  const record = (sn: string, channel: number, parent?: string) => ({
    sn,
    stationSn: parent ?? sn,
    p2pDid: DID,
    channel: channel,
    raw: { parent_sn: parent, device_channel: channel, p2p_did: DID, member: { admin_user_id: ACCOUNT_ID } },
  });
  return new P2PCommandRouter({
    mega: { getDskKeys: async () => ({}), auth: { userId: ACCOUNT_ID } } as never,
    listDevices: () => [record(STATION_SN, 0), record(CAM_A, 0, STATION_SN), record(CAM_B, 2, STATION_SN)] as never,
    ensureDevices: async () => {},
    onConnect: (sn: string) => events.push(`connect:${sn}`),
    onClose: (sn: string) => events.push(`close:${sn}`),
    onError: () => {},
    logger: {
      debug: (_message: string, data?: unknown) => {
        if (data) traceRows.push(data);
      },
      info() {},
      warn() {},
      error() {},
    },
    onLevel2Ready: (sn: string) => events.push(`level2:${sn}`),
    onFrame: (sn: string) => events.push(`frame:${sn}`),
  });
}

/** The live egress is the only one allowed a connection of its own, so drive the router as `live()` does. */
const openLive = (r: Router, sn: string) =>
  (
    r as unknown as {
      sharedLiveSourceFor(s: string, o: object, m: boolean): Promise<SharedLiveSource>;
    }
  ).sharedLiveSourceFor(sn, {}, true);

const sources = (r: Router) => (r as unknown as { liveSources: Map<string, unknown> }).liveSources;

const wireFrame = (channel: number, keyframe = true) =>
  p2pVideoFrame({ nal: Buffer.from([keyframe ? 0x65 : 0x41, 0x11]), keyframe, width: 1920, height: 1080, channel });

describe("paired post-start source recovery on latest upstream plus reset-only overlay", () => {
  for (let run = 1; run <= 5; run++)
    for (const mode of ["automatic", "detach-all", "detach-one", "explicit-reset"] as const) {
      it(`${mode} repeat ${run}`, async () => {
        vi.useFakeTimers();
        const r = router();
        let ticker: ReturnType<typeof setInterval> | undefined;
        try {
          const sibling = await openLive(r, CAM_A);
          const siblingConsumer = sibling.attach();
          const siblingFrames = vi.fn();
          siblingConsumer.on("video", siblingFrames);
          siblingConsumer.on("error", () => {});
          const siblingSession = built[0];
          siblingSession.emit("data", wireFrame(0));
          const target = await openLive(r, CAM_B);
          let consumer = target.attach();
          const targetFrames = vi.fn();
          consumer.on("video", targetFrames);
          consumer.on("error", () => {});
          const observer = mode === "detach-one" || mode === "explicit-reset" ? target.attach() : undefined;
          observer?.on("video", () => {});
          observer?.on("error", () => {});
          const targetSession = built[1];
          targetSession.emit("data", wireFrame(2));
          expect(targetFrames).toHaveBeenCalledOnce();
          ticker = setInterval(() => siblingSession.emit("data", wireFrame(0, false)), 1000);
          await vi.advanceTimersByTimeAsync(120000);
          expect(targetFrames).toHaveBeenCalledOnce();
          expect(target.state).toBe("live");
          expect(targetSession.isConnected).toBe(true);
          expect(targetSession.startLiveMedia.mock.calls.length).toBeGreaterThan(20);
          expect(traceRows).toContainEqual(expect.objectContaining({ phase: "channel-silent", outcome: "reasserted" }));
          const began = Date.now();
          let replacement = target;
          let sameSource = true;
          let freshFrames = 0;
          if (mode === "automatic") {
            await vi.advanceTimersByTimeAsync(9000);
            expect(sources(r).get(`${STATION_SN}:2`)).toBe(target);
            expect(target.state).toBe("live");
          } else {
            if (mode === "explicit-reset") {
              expect(await r.resetCameraStream(CAM_B)).toBe(true);
              expect(targetSession.isConnected).toBe(false);
              expect(target.consumerCount).toBe(0);
            } else {
              consumer.detach();
              await vi.advanceTimersByTimeAsync(8001);
              if (mode === "detach-all") expect(target.state).toBe("stopped");
              else {
                expect(target.state).toBe("live");
                expect(target.consumerCount).toBe(1);
              }
            }
            replacement = await openLive(r, CAM_B);
            sameSource = replacement === target;
            consumer = replacement.attach();
            const received = vi.fn();
            consumer.on("video", received);
            consumer.on("error", () => {});
            if (sameSource) {
              await vi.advanceTimersByTimeAsync(0);
              expect(mode).toBe("detach-one");
              expect(received).toHaveBeenCalledOnce();
            } else {
              expect(mode === "detach-all" || mode === "explicit-reset").toBe(true);
              built.at(-1)!.emit("data", wireFrame(2));
              expect(received).toHaveBeenCalledOnce();
              freshFrames = 1;
            }
          }
          expect(siblingSession.isConnected).toBe(true);
          expect(sources(r).get(`${STATION_SN}:0`)).toBe(sibling);
          expect(siblingFrames.mock.calls.length).toBeGreaterThan(120);
          results.push({
            run,
            mode,
            silenceMs: 120000,
            automaticStarts: targetSession.startLiveMedia.mock.calls.length,
            sameSource,
            waitMs: Date.now() - began,
            freshFrames,
            siblingFrames: siblingFrames.mock.calls.length,
            siblingSessionPreserved: siblingSession.isConnected,
            remainingTargetConsumers: replacement.consumerCount,
          });
        } finally {
          if (ticker) clearInterval(ticker);
          await r.closeAll();
          vi.useRealTimers();
        }
      });
    }
  afterAll(() => writeFileSync("/tmp/pr397-paired-results.json", JSON.stringify(results, null, 2)));
});
