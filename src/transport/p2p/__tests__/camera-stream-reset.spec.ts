import { describe, expect, it, vi } from "vitest";
import { P2PCommandRouter } from "../command-router.js";
import { SharedLiveSource } from "../shared-live-source.js";
import { streamFactory, videoFrame, unit, H264 } from "./live-source-fixtures.js";

const STATION = "T8000P0000000000",
  A = "T8000P0000000001",
  B = "T8000P0000000002";

/** Real media sources over synthetic transport, with ownership registered independently. */
function setup(dedicated: boolean) {
  const router = new P2PCommandRouter({
    mega: {} as never,
    listDevices: () =>
      [
        { sn: STATION, stationSn: STATION, raw: {} },
        { sn: A, stationSn: STATION, channel: 1, raw: { parent_sn: STATION, device_channel: 1 } },
        { sn: B, stationSn: STATION, channel: 2, raw: { parent_sn: STATION, device_channel: 2 } },
      ] as never,
    ensureDevices: async () => {},
    onConnect: () => {},
    onClose: () => {},
    onError: () => {},
    onLevel2Ready: () => {},
    onFrame: () => {},
  });
  const state = router as unknown as {
    liveSources: Map<string, SharedLiveSource>;
    liveSessionKeys: Map<string, string>;
    manager: { close: (key: string) => Promise<void> };
  };
  const close = vi.spyOn(state.manager, "close").mockResolvedValue();
  const fa = streamFactory(),
    fb = streamFactory();
  const a = new SharedLiveSource({ makeStream: fa.makeStream, maxQueue: 4 });
  const b = new SharedLiveSource({ makeStream: fb.makeStream, maxQueue: 4 });
  state.liveSources.set(`${STATION}:1`, a);
  state.liveSources.set(`${STATION}:2`, b);
  state.liveSessionKeys.set(`${STATION}:1`, dedicated ? `${STATION}#live:1` : STATION);
  state.liveSessionKeys.set(`${STATION}:2`, STATION);
  return { router, state, a, b, fa, fb, close };
}

describe("camera-scoped media recovery", () => {
  for (const dedicated of [false, true])
    it(`preserves queued and live sibling delivery (${dedicated ? "dedicated" : "shared"} owner)`, async () => {
      const x = setup(dedicated),
        ca = x.a.attach(),
        cb = x.b.attach();
      ca.on("error", () => {});
      cb.on("error", () => {});
      const delivered: unknown[] = [];
      cb.on("video", (f) => delivered.push(f));
      const frame = videoFrame(unit(H264.sps, H264.pps, H264.idr));
      x.fa.streams[0].video(frame);
      x.fb.streams[0].video(frame);
      cb.pause();
      const queued = videoFrame(unit(H264.delta), { keyframe: false });
      x.fb.streams[0].video(queued);
      await x.router.resetCameraStream(A);
      expect(() => x.a.attach()).toThrow(/disposed/);
      expect(x.fa.streams[0].stopped).toBe(1);
      expect(x.fb.streams[0].stopped).toBe(0);
      cb.resume();
      const live = videoFrame(unit(H264.delta), { keyframe: false });
      x.fb.streams[0].video(live);
      expect(delivered).toEqual([frame, queued, live]);
      expect(x.state.liveSources.get(`${STATION}:2`)).toBe(x.b);
      expect(x.close.mock.calls.map((c) => c[0])).toEqual(dedicated ? [`${STATION}#live:1`] : []);
      expect(await x.router.resetCameraStream(A)).toBe(false);
      cb.detach();
      x.b.dispose();
    });
  it("does not acquire a source for an unknown or inactive camera", async () => {
    const x = setup(false);
    expect(await x.router.resetCameraStream("UNKNOWN")).toBe(false);
    x.state.liveSources.delete(`${STATION}:1`);
    expect(await x.router.resetCameraStream(A)).toBe(false);
    expect(x.close).not.toHaveBeenCalled();
    x.a.dispose();
    x.b.dispose();
  });
});
