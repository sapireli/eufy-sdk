import { P2PSession, STATION_CHANNEL } from "../p2p-session.js";
import { parseDataFrameHeader } from "../codec.js";

/** Offline candidate contract: authenticate the real serialized START before checking its request slot. */
function capture() {
  const session = new P2PSession({ stationSn: "T8000P0000000000", p2pDid: "XXXXXXX-000000-XXXXX" });
  const inner = session as unknown as {
    connectAddress: { host: string; port: number };
    send: (...args: unknown[]) => void;
    decryptLevel2: (payload: Buffer, signCode: number) => Buffer | undefined;
  };
  inner.connectAddress = { host: "203.0.113.1", port: 32100 };
  session.setLevel2Key(Buffer.alloc(32, 7));
  const sent: Buffer[] = [];
  inner.send = (_address, _type, data) => sent.push(data as Buffer);
  return {
    session,
    read: (index: number) => {
      const data = sent[index];
      const header = parseDataFrameHeader(data.subarray(4));
      const plain = inner.decryptLevel2(data.subarray(20, 20 + header.bytesToRead), header.signCode);
      if (!plain) throw Error("synthetic command failed authenticated level-2 decryption");
      return { header, magic: data.subarray(14, 16), value: JSON.parse(plain.toString("utf8")) };
    },
  };
}

describe("attached START request slots", () => {
  it("gives channel-zero STARTs generated slots while preserving the selected camera", () => {
    const { session, read } = capture();
    session.startLiveMedia(0, "synthetic-account", true, { streamType: 2 });
    session.startLiveMedia(0, "synthetic-account", true, { streamType: 2 });
    const first = read(0),
      second = read(1);
    expect(first.header).toMatchObject({ commandId: 1350, channel: 0, signCode: 8, type: 11 });
    expect(second.header).toMatchObject({ commandId: 1350, channel: 0, signCode: 8, type: 12 });
    for (const command of [first, second]) {
      expect(command.magic).toEqual(Buffer.from([8, 0]));
      expect(command.value.cmd).toBe(1003);
      expect(command.value.mChannel).toBe(0);
      expect(command.value.mValue3).toBe(1003);
      expect(command.value.account_id).toBe("synthetic-account");
      expect(command.value.payload.streamtype).toBe(2);
      expect(command.value.payload.key).toHaveLength(256);
    }
  });

  it("uses distinct request slots across repeated channel-zero STARTs", () => {
    const { session, read } = capture();
    session.startLiveMedia(0, "synthetic-account", true, { streamType: 2 });
    session.startLiveMedia(0, "synthetic-account", true, { streamType: 2 });
    expect(read(1).header.type).not.toBe(read(0).header.type);
  });

  it("keeps the channel-zero STOP at type zero with its existing empty payload", () => {
    const { session, read } = capture();
    session.startLiveMedia(0, "synthetic-account", true);
    session.stopLiveMedia(0, "synthetic-account", true);
    const stop = read(1);
    expect(stop.header).toMatchObject({ commandId: 1350, channel: 0, signCode: 8, type: 0 });
    expect(stop.value).toEqual({ account_id: "synthetic-account", cmd: 1004, mChannel: 0, mValue3: 1004, payload: {} });
  });

  it("keeps generated slots on nonzero camera STARTs and zero on station STARTs", () => {
    const { session, read } = capture();
    session.startLiveMedia(2, "synthetic-account", true);
    session.startLiveMedia(STATION_CHANNEL, "synthetic-account", true);
    expect(read(0).header).toMatchObject({ channel: 2, type: 11 });
    expect(read(0).value.mChannel).toBe(2);
    expect(read(1).header).toMatchObject({ channel: STATION_CHANNEL, type: 0 });
    expect(read(1).value.mChannel).toBe(STATION_CHANNEL);
  });
});
