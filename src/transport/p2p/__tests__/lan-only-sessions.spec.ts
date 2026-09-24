import { describe, expect, it, vi } from "vitest";
import { frameMessage, ResponseMessageType, RequestMessageType } from "../codec.js";
import { P2PSession } from "../p2p-session.js";

/**
 * An RFC-1918 restriction rejects a public cloud candidate before CHECK_CAM and refuses an unsolicited
 * public CAM_ID before connecting.
 */
const STATION_SN = "T8000P0000000000";
const P2P_DID = "XXXXXXX-000000-XXXXX";

function harness(lanOnly = false) {
  const session = new P2PSession({
    stationSn: STATION_SN,
    p2pDid: P2P_DID,
    lanOnly,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  });
  session.on("error", () => undefined);
  const sent: { addr: { host: string; port: number }; type: Buffer }[] = [];
  const target = session as unknown as {
    socket: object;
    onMessage: (message: Buffer, info: { address: string; port: number }) => void;
    send: (addr: { host: string; port: number }, type: Buffer) => void;
  };
  target.socket = {};
  target.send = (addr, type) => sent.push({ addr, type });
  return {
    session,
    sent,
    lookupAddress: (host: string, port = 4000) => {
      const payload = Buffer.alloc(8);
      payload.writeUInt16LE(port, 2);
      payload.set(host.split(".").map(Number).reverse(), 4);
      target.onMessage(frameMessage(ResponseMessageType.LOOKUP_ADDR, payload), { address: "203.0.113.1", port: 32100 });
    },
    /** A station answering our CHECK_CAM from `host` — the moment a peer would be kept. */
    answerFrom: (host: string, port = 4000) =>
      target.onMessage(frameMessage(ResponseMessageType.CAM_ID), { address: host, port }),
  };
}

describe("restricting a session to a private IPv4 peer", () => {
  it("does not hole-punch a public cloud candidate", () => {
    const { lookupAddress, sent } = harness(true);
    lookupAddress("203.0.113.9");
    expect(sent.some(({ type }) => type.equals(RequestMessageType.CHECK_CAM))).toBe(false);
    lookupAddress("192.168.1.50");
    expect(
      sent.some(({ addr, type }) => addr.host === "192.168.1.50" && type.equals(RequestMessageType.CHECK_CAM)),
    ).toBe(true);
  });

  it("keeps a private peer", () => {
    const { session, answerFrom } = harness(true);
    answerFrom("192.168.1.50");
    expect(session.isConnected).toBe(true);
  });

  it("refuses a peer outside it, and tells the station to drop the session it opened", () => {
    const { session, sent, answerFrom } = harness(true);
    answerFrom("203.0.113.9");

    expect(session.isConnected).toBe(false);
    expect(sent.some(({ addr, type }) => addr.host === "203.0.113.9" && type.equals(RequestMessageType.END))).toBe(
      true,
    );
  });

  it("still settles on a local peer that answers after one was refused", () => {
    const { session, answerFrom } = harness(true);
    answerFrom("203.0.113.9");
    answerFrom("192.168.1.50");
    expect(session.isConnected).toBe(true);
  });

  it("keeps whichever peer answers first when unrestricted", () => {
    const { session, answerFrom } = harness();
    answerFrom("203.0.113.9");
    expect(session.isConnected).toBe(true);
  });
});
