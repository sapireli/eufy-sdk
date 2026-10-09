# Receive-buffer sizing when adopting a punch-probe socket

Status: implementation, regression, and live adopted-probe receive-buffer verification completed on 2026-10-09. This change fixes the demonstrated buffer omission; it does not claim uninterrupted playback or resolution of every source pause.

## Scope and mechanism

The primary socket requests a 4 MiB receive buffer after binding. Seven extra sockets are registered during punch probing. A successful probe may replace the primary socket in `onConnected()`, but the replacement previously inherited the operating system default buffer. The fix invokes the existing `requestReceiveBuffer()` helper when adopting a replacement. It changes neither the requested size nor operating system limits and preserves the existing refusal warning/fallback.

The runtime baseline bundle SHA-256 is `5ae12418fb1a7048bdff04c55d44d647009dcd57274897f990bf63453023f193`. Rebuilding source commit `df535e2` reproduces this baseline. The candidate is that source plus the adoption call and its declaration comment. It deliberately excludes subsequent unrelated source changes. A textual comparison of built bundles shows only those two differences.

## Ordinary baseline observation

Measurements on 2026-10-09 used passive UDP metadata capture and `/proc/net/udp`, `/proc/net/snmp`, and `ss -uapnm`; no SDK instrumentation or debugger was active in this bounded interval.

| Observation             | 18:27:12.570 UTC | 18:36:17.076 UTC | Change |
| ----------------------- | ---------------: | ---------------: | -----: |
| Camera A receive buffer |    425,984 bytes |    425,984 bytes |      0 |
| Camera A socket drops   |                0 |                0 |      0 |
| Camera B receive buffer |    425,984 bytes |    425,984 bytes |      0 |
| Camera B socket drops   |                0 |                0 |      0 |
| Camera C receive buffer |    212,992 bytes |    212,992 bytes |      0 |
| Camera C socket drops   |               74 |              771 |   +697 |
| Host UDP RcvbufErrors   |            1,127 |            1,824 |   +697 |

The 544.506-second ordinary observation attributes all newly recorded receive-buffer drops to Camera C. The first two sessions received the existing enlarged request; the adopted probe used the smaller default. Linux clamps the request to its configured limit and reports a doubled socket buffer; the fix does not raise this limit.

Earlier restart/recovery and debugger windows were excluded. The service restarted at 18:25:24 UTC; a cached read inspection ran 18:25:49–18:25:59. The ordinary interval starts after 18:26:10. A later debugger was opened 18:36:21–18:36:37 without setting/querying device state; the bounded baseline ends before it.

## Regression and artifact verification

The existing real local UDP lookup test selects either the primary registered port or the second registered port (a probe), completes peer connection, verifies heartbeat uses that port, and verifies losing ports are released. The new assertion records `setRecvBufferSize()` on the selected bound port and requires the existing 4 MiB request.

On unchanged source the primary case passes and the probe case fails: expected 4,194,304, received undefined. With the adoption fix both pass. The full `npm run verify` gate passed with 219 test files and 3,886 tests, including all documentation, ownership, type-checking, ESM, and example checks. Eighteen focused cases in `receive-buffer.spec.ts`, `lookup-channels.spec.ts`, and `peer-selection.spec.ts` pass, together with type checking, build, formatting, and `git diff --check`.

Reproduce from the source checkout:

```sh
npm run typecheck
npm run build
node node_modules/vitest/vitest.mjs run src/transport/p2p/__tests__/receive-buffer.spec.ts src/transport/p2p/__tests__/lookup-channels.spec.ts src/transport/p2p/__tests__/peer-selection.spec.ts
```

## Live candidate verification

Candidate bundle SHA-256: `81af7c7abd44828ed5316dad421dff11f7283197b92a946612ca47570bd9ce5a`. The exact baseline bundle and source map were backed up before installing this JS/map pair. A hash guard rejected any unexpected baseline or candidate. The service restarted at 19:03:42.955 UTC; the actual loaded file hash was verified afterward. Configuration, stream selectors, and transcoder arguments were unchanged.

Passive startup capture directly identified Camera C’s primary socket sending LOCAL_LOOKUP, with seven other registered punch-probe source ports. Actual C media arrived on one of those other ports. Its effective receive buffer was 425,984 bytes after adoption, equal to both primary-session buffers. Before the candidate, a separate baseline reconnect at 18:48:19.871 likewise adopted a probe, but its effective buffer remained 212,992 bytes. This verifies the actual live adoption path without a debugger.

The predefined ordinary candidate interval was 19:04:24.632–19:13:33.325 UTC (548.693 seconds). Its end was the first fixed-interval sample at least 544.506 seconds after the first sample at or after 19:04:20; it was not selected for favorable results. Three source sessions were configured; two unchanged GPU producers and two remote video consumers remained active. One additional consumer went offline at 19:05:57, so total downstream workload was not identical throughout the baseline/candidate comparison. No debugger or settings commands ran during this interval.

| Counter                            | Candidate start | Candidate end | Change |
| ---------------------------------- | --------------: | ------------: | -----: |
| A socket drops                     |               0 |             0 |      0 |
| B socket drops                     |               0 |             0 |      0 |
| C socket drops                     |               0 |             0 |      0 |
| Host UDP RcvbufErrors              |           1,920 |         1,920 |      0 |
| Adopted C effective receive buffer |   425,984 bytes | 425,984 bytes |      0 |

C reconnected during the interval. Its original adopted probe retained effective rb425,984/drop0 through the last sample before retirement; the next primary sampled at 19:10:03.204 and subsequent new primary sampled at 19:10:08.316 also had rb425,984/drop0. Subsequent samples of that new primary remained drop0. The cumulative host counter stayed unchanged across retirement, so socket replacement did not hide new UDP receive-buffer drops. The ordinary result includes that reconnect; no gap was omitted. Raw HTTP delivered 12,723 HEVC first-slice NALs, including 269 IDR first slices, and 50,660,539 chunk bytes. The longest first-slice gap was **26.217 seconds**, 19:09:39.451–19:10:05.668 UTC, overlapping that reconnect. These counts measure compressed delivery, not decoded or displayed frames. This gap explicitly prevents an uninterrupted-playback claim, despite zero new socket drops.

The retained baseline C raw capture is only a separate 79.352-second interval, 18:44:49.604–18:46:08.956, with 1,832 first slices and a 2.131-second longest gap. Maintenance interrupted it at 18:46:09. It does not cover the 544.506-second baseline drop window and cannot support a matched before/after delivery-rate or freeze-cost comparison.

The sanitized machine-readable endpoints and delivery measurements are in [punch-probe-receive-buffer-observation.json](./punch-probe-receive-buffer-observation.json). The observed before/after drop difference supports correcting the missing request on the adopted socket. A single run does not establish that all future bursts fit the operating-system-clamped buffer.

## Boundaries: this does not prove all playback pauses are fixed

Concurrent sessions for Cameras A and B shared a station but used independent UDP ports. Both had zero socket drops during the ordinary interval. Replay of the exact deployed sequence handling over 599.632 seconds (263,245 captured media datagrams across all sessions) found no holes, abandonments, or sequence restarts for A or B, including natural 16-bit sequence rollover. The Camera C wire-only replay had five holes, all repaired within 299 ms. It runs before the known host socket drops and therefore does not represent additional holes or keyframe gating the SDK may have experienced on C. The zero-drop A/B sockets make this a valid negative bound for those two sessions. The passive observer recorded zero capture drops.

The final downstream playback failure at approximately 18:35:25 had continuous raw HTTP delivery from A and B. In 18:35:10–18:36:05 the raw first-slice counts were 820 and 960, with 27 AVC IDRs and 35 HEVC IDRs respectively. The largest raw gaps were 1.219 and 0.925 seconds, and media-wire gaps were at most 0.827 and 0.524 seconds. This places that failure after SDK raw delivery; it is not evidence for the probe-buffer fix. The host kernel independently recorded a shared video-engine GPU hang at 18:35:29 and another reset at 18:35:44. No GPU hang was recorded for the earlier 18:12 decoded-output outage, so those events must not be conflated.

Separate ordinary source pauses were captured earlier: one shared-station media pause of roughly 3.5–3.9 seconds occurred while heartbeat/control traffic continued and the independent camera continued sending. A later Camera B media-wire pause lasted 14.457 seconds (18:34:38.107–18:34:52.564), followed by a 14.509-second raw NAL gap. Its adjacent media sequences were consecutive, the previous datagram was acknowledged after 67.17 ms, and heartbeat traffic continued on that session while the sibling session continued media delivery. Raw HTTP NAL delivery paused correspondingly. This observation identifies a distinct upstream media-availability issue but does not establish its cause. Neither that issue nor an earlier decoded-output-only outage is claimed to be solved by this change.

Private packet captures are not committed. Their fingerprints below identify retained observations; sanitized endpoints are published separately. Identities, addresses, account data, and packet payloads remain private.

## Private baseline artifact fingerprints

These hashes identify retained private observations without publishing device or network data:

| Artifact                                 | SHA-256                                                            |
| ---------------------------------------- | ------------------------------------------------------------------ |
| Passive UDP metadata, baseline           | `45d38a7b4099251de8e1700aeb2be4a7af40596eed9c51ae050136baa8fce2bb` |
| Ordinary socket and host counters        | `9237a003dec7dc7aef82e3622bc636e2e8212e7069f8966a1b3198ebb518c7c8` |
| Raw HTTP chunk and first-slice times     | `a2cd55b712eea9badba329239edde8ce5d372244b6d067e47053b2fa0aa5a361` |
| Exact baseline sequence replay summary   | `4bdd7291b9a2b5f1267e182357a5e88daeca8338c87cbd47a8f3474158aed7c4` |
| Existing kernel video-engine error state | `d54f6931179144388345ca7e752479bbaf2a755253196f3bc6ac100b74938e26` |

Counters can be reproduced with read-only commands on the host:

```sh
ssh -i <ssh-key> <user>@<host> 'cat /proc/net/snmp /proc/net/udp /proc/net/udp6; ss -uapnm'
```

Take timestamped samples at a fixed interval while three live sessions run, mapping each socket to its media geometry using a passive metadata observer. Record host UDP receive-buffer errors and the per-socket drop fields together. Exclude debugger, restart, or unrelated settings-change windows. Capture startup separately to identify whether the connected socket is a probe rather than the primary. Record both the concurrent source workload and downstream consumer changes; changes limit before/after attribution. Record delivery at the raw byte and first-slice NAL boundaries separately from decoded/displayed frames.

## Source parent and verification environment

The source patch is based on fork parent `773b7481d657c49e5bac986c9f8324f840b87a5b`. Live baseline reproduction uses `df535e27f013dea610d2a5b2f775105a71407293` because that was the deployed source. The intervening five-file difference adds unrelated stream-selector guards and documentation/tests (45 insertions, 28 deletions); those changes were excluded from the runtime experiment. The same receive-buffer call and regression assertion apply to both parents. The candidate source-map SHA-256 is `0934bda758a6c1ca9ff7838c5948df45d5cfe16f1719cecab6b2beb88870eca4`.

The full verification command uses GNU coreutils and GNU sed first in PATH on macOS. The unchanged capability-ownership guard uses GNU `paste -sd` stdin behavior and GNU sed uppercase replacement; native macOS paste rejects that invocation. No repository guard was modified to bypass it.

```sh
PATH=/usr/local/opt/coreutils/libexec/gnubin:/usr/local/opt/gnu-sed/libexec/gnubin:$PATH npm run verify
```

## Private candidate artifact fingerprints

| Artifact                                                               | SHA-256                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Raw C HTTP chunk/first-slice timestamps, complete 660-second collector | `3f93cc7dcf4a7526ec72023d0638f47b0958e0354cd66f2f3535e5b908e0587d` |
| Fixed-interval host/socket counter collector                           | `e16916e6f219dc66f6902ec8d42711b4c8e944d0d1d5adf18ba0f0d8c87d6fc1` |
| Passive UDP metadata including startup/adoption                        | `1ea2c258462fb6bf7dd15c808cebafacbca66ff2b05db15df5c33c57c6d3f557` |
