# P2P fragmented-frame reassembly: copy cost and live verification

Date: 2026-10-12. This records the evidence for the isolated linear-reassembly change.

## Need and scope

A P2P logical frame can span hundreds of UDP datagrams. Concatenating the accumulated
payload with each continuation copies earlier bytes repeatedly: for a payload of P
bytes split into N similar fragments, cumulative copying grows approximately with
P×N/2 rather than P. This is a general cost of fragmented logical frames, independent
of camera model, codec or one particular resolution. On the measured host, roughly
230 KB keyframe payloads required about 26 MB of copying and 22 ms median synchronous
assembly work before frame dispatch. Other simultaneous streams paid the same cost.

The change retains payload slices and a byte count until completion, then concatenates
once. A split logical header is assembled separately within its fixed 16-byte length.
Already-complete frames remain slices. Packed following frames, zero-length payloads,
empty datagrams, retransmissions, sequence wrap and independent data types are preserved.

ACK bytes and timing policy, reorder waits, loss/keyframe gating, keepalive, encryption,
stream selection, quality and codec defaults are outside this change and remain unchanged.

## Exact deployment boundaries

| Item                          | Value                                                              |
| ----------------------------- | ------------------------------------------------------------------ |
| Tested SDK branch             | `eufy-wall`                                                        |
| Base revision                 | `35b9581d79d414602c63e7240677cb15aa09cf63`                         |
| Before running bundle SHA-256 | `3a15c296a54311782f242aa5446b23971671e4ee6016d43ecb927f4ec7fc3fc8` |
| After running bundle SHA-256  | `4ddbf934ccab2ebee30832fdacb7a1874e308278f3db2f41aa98503b6e938cf4` |
| Upstream `main` inspected     | `7d1f016362465b0747405c5dc83124c86b2c630b`                         |

The host verified both installed bundle hashes and restarted for the candidate.
The package version and lock revision alone do not identify the uncommitted candidate
bundle: its exact hash above does. At the time of this report the change has not been
validated as a clean upstream-main PR. The inspected upstream main still contains the
same growing `pending.buf` concatenation algorithm, so the isolated algorithm change
is applicable there; unrelated fork commits must not accompany it.

## Deterministic byte and allocation regression

The regression feeds the actual session receive path a synthetic 234,129-byte logical
payload split into 234 datagrams. Its first header spans several datagrams; an empty
datagram, a zero-length packed frame and a following packed payload are included.
Input packets are constructed before allocation tracking. Received command IDs and
payload bytes match exactly.

| Measured `Buffer.concat` output bytes during receive processing |     Before |   After |
| --------------------------------------------------------------- | ---------: | ------: |
| Total copied bytes, including ACK payload construction          | 26,967,943 | 235,549 |
| Concatenations larger than 1,400 bytes                          |        228 |       1 |
| Final large payload bytes                                       |    234,129 | 234,129 |

The test fails against the base algorithm and passes against the candidate. The
remaining candidate total is the payload, a 16-byte reconstructed header and six
ACK-payload bytes per datagram. This is a copying measurement, not peak memory or
a real-device latency benchmark.

## Live comparison on the constrained host

Before: 18:10:40.405–18:11:40.419 UTC. After: 18:21:07.696–18:22:07.699 UTC.

Two sequential 60-second captures ran on the same host with the same three streaming
sources and the existing two hardware encoders. No source quality, decoder defaults,
ACK policy or deliberate buffers were changed. Scenes and encoded keyframe sizes
were not identical, and the sessions were reopened by deployment.

The observer times synchronous reassembly segments before `handleFrame`, excluding
that handler and its consumers. It includes OS preemption and clock-read overhead.
Only completed logical-video records are retained. Both captures had zero row overflow;
records already partial at capture start are excluded from keyframe summaries. The
updated observer distinguishes the old growing buffer from the new chunk-list state.

| Stream       | Median keyframe bytes, before → after | Assembly elapsed median, before → after | p95, before → after | Maximum, before → after |
| ------------ | ------------------------------------: | --------------------------------------: | ------------------: | ----------------------: |
| A, channel 0 |                   132,822.5 → 145,426 |                       10.044 → 3.282 ms |   17.499 → 6.328 ms |       22.934 → 7.524 ms |
| B, channel 1 |                   146,262 → 144,402.5 |                       11.639 → 3.054 ms |   13.514 → 3.594 ms |       26.068 → 4.313 ms |
| C, channel 2 |                   230,249.5 → 234,475 |                       22.096 → 3.686 ms |   30.149 → 5.329 ms |       32.542 → 5.786 ms |

The rows contain 32/29/30 before keyframes and 30/30/30 after keyframes for A/B/C.
Estimated median keyframe copying before was 8.72 / 10.54 / 26.03 MB; after it equaled
the original logical payload length for each stream. This establishes substantially
lower assembly work across different frame sizes, not a benefit limited to one model.

Whole Node-process CPU time was 34.301 seconds before and 26.000 seconds after, per
60-second window. That aggregate includes unrelated runtime, media and observer work;
it is an observed reduction, not an isolated attribution of every saved CPU second.
Peak RSS, retained incoming-packet backing storage and end-user display age were not
measured by this comparison.

## Delivered records, pauses and packet-capture limits

| Stream | Delivered logical-video records, before → after | Longest logical-video dispatch gap, before → after |
| ------ | ----------------------------------------------: | -------------------------------------------------: |
| A      |                                   1,487 → 1,501 |                                       435 → 801 ms |
| B      |                                       899 → 901 |                                     515 → 3,183 ms |
| C      |                                       914 → 901 |                                     1,008 → 849 ms |

These are transport logical-video records, not a decoder's rendered-frame count.
The change **did not cure source arrival pauses**; stream B's longest gap was worse
in the after window. A same-host kernel packet tap located 3,162.907 ms of its
3,183.405 ms logical-dispatch gap before SDK receipt, between consecutive video UDP
sequences. The last video datagram's ACK left the interface 1.423 ms after arrival,
and local pending-video-ACK accounting then stayed zero. During that video silence,
the same session continued both-direction PING/PONG and CONTROL traffic with ACKs.
This rules against a whole-process freeze for that interval, but does not prove the
peer received or accepted an ACK or identify the camera/station's internal cause.

The before stream-B worst 515 ms logical gap contained 407.807 ms of consecutive-sequence
physical video silence. Both before/after physical taps reported zero capture drops,
missing timestamps and truncation. Retransmitted duplicate sequences were present;
zero packet-tap loss is not a claim of zero network loss or zero SDK gating drops.

Physical RX-to-outbound-ACK p99 decreased from about 107/152/347 ms to 26/60/62 ms
for A/B/C in the overlapping capture windows. The median was not uniformly better
(C: 15.4 → 18.9 ms), so this is not proof that ACK scheduling or remote sender stalls
are solved. Session endpoints, scene content and capture boundaries differ.

## Verification and next upstream PR

- Typecheck and build passed; full fork suite: 234 files / 4,097 tests.
- Focused reassembly/video/live-stream suite: 71 tests passed.
- Allocation regression fails against the base and verifies byte identity on the candidate.
- Host observer tests cover old and new assembly state and exclude consumer dispatch time.
- Live candidate bundle was hash-verified; capture hooks and export caches were removed afterward.

Create a clean branch from a freshly verified upstream `main`. Apply only the pending
state/reassembly edit, the allocation regression and the evidence appropriate for that
PR; do not merge the fork branch or carry ACK, gating, timer or host changes. Search
open/closed/merged PRs and issues for an existing equivalent fix first. Run the upstream
repository's full verification gate and prove that its base fails the allocation
regression. Describe the need as avoidable copying/host work for fragmented frames.
Do not promise removal of source pauses or hard sensor-to-display latency bounds.

Private source artifacts are retained by the host operator and not committed:
`sdk-reassembly-goal-before.json`, `sdk-reassembly-goal-after.json`,
`goal-nic-before.jsonl`, `goal-nic-after.jsonl`,
`sdk-reassembly-allocation-regression.json`,
`sdk-reassembly-before-after-summary.json`,
`sdk-reassembly-garage-quiet-correlation.json`, and
`sdk-reassembly-physical-ack-before-after.json`.
