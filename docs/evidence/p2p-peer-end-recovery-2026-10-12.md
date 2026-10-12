# Honor a connected peer's END without waiting for heartbeat timeout

## Need and scope

A peer can explicitly end its PPCS connection with the four-byte F1F0 END
message. Ignoring that message keeps a dead connection logically connected,
permits media keepalives to continue and postpones consumer termination until a
separate silence watchdog detects the failure. This affects any device/session
that sends END; it is not a model-specific video decoder or stream-quality fix.

This candidate handles END only from the currently selected peer's exact host
and port, received on the active socket while connected, with a complete four-byte
transport envelope whose declared payload length matches actual bytes. Opaque
nonempty END payloads are permitted; they are not interpreted as reason codes. It invokes the existing
idempotent close path, including socket release, heartbeat/punch/retransmit timer
cleanup, level-2 waiter settlement and the existing close event. LiveStream
subscribes to that close event to stop its own keepalive/stall timers and emit
stop, including direct callers without a command router. Router-managed shared
sources already dispose on session close. A separate ownership companion commit `55d3fea` filters station-control cleanup
by the actual owning session, preserving independent media siblings and pending
reservations. The observed standalone witness has no sibling sources; this
structural companion is not represented as a physical station-control END test. An END from a different endpoint cannot
terminate the current connection. The stale-peer regression uses a previous
endpoint with a different port; this protocol envelope has no generation token
and cannot identify a delayed END from an identical reused endpoint.

ACK encoding/scheduling, reorder waits, loss gating, encryption, media selectors,
source quality, resolution, LAN peer policy and playback buffering are unchanged.
The patch does not explain why the peer chose to close, or repair selective VIDEO
pauses on a connection where PING/control continue.

## Physical-interface witness on the original code

A passive metadata-only 120-second interface capture ran
2026-10-12 18:42:52.225802–18:44:52.228083 UTC. It retained fixed header fields,
transport type, sequence, anonymous peer/socket identity and timestamps, without
pictures, encrypted bodies, device identifiers or keys. There were 89,804 records
and zero tap drops, truncations or missing timestamps. No Inspector hooks or
camera commands were issued by the observer.

The affected standalone connection last received VIDEO at 18:42:56.113669 UTC,
then received peer END at **18:42:56.151354 UTC**, 37.685486 ms later. END was the
last incoming packet of any kind on that old session. Media keepalive 1139 and
PING nevertheless continued. STOP 1004 was emitted at 18:43:12.122681 UTC,
**16.009012 seconds after VIDEO ceased**; host logs then reported stopped/feed
ended/reopening. A new connection's outer 1700 start was sent at 18:43:18.671776,
and VIDEO resumed at 18:43:18.794922. The observed cross-connection VIDEO gap
was **22,681.253485 ms**. The stop came after the silence and was a recovery
operation, not evidence that it caused the initial cessation.

In the same capture the two attached sessions had largest VIDEO quiet intervals
832.938643 and 333.479425 ms, with no outgoing DATA to their parent peer for the
entire 120 seconds. Heartbeat remained alive during the larger pause. Those are
a distinct unresolved source-delivery issue; this candidate must not be described
as its repair.

Original runtime source: `55dacd367068b0d90460561e20c9410a2ec03724`.
Original deployed bundle SHA-256:
`4ddbf934ccab2ebee30832fdacb7a1874e308278f3db2f41aa98503b6e938cf4`.
Private metadata artifact `command-nic-120.jsonl` SHA-256:
`e479c547e2e2131008597994f5fd81be1496c697d5b736629810aaea15463292`.
Private selected-boundary analysis is `command-nic-120-analysis.json`.
These artifacts remain outside the public SDK repository.

## Protocol/source corroboration

The SDK's codec names F1F0 `ResponseMessageType.END`, and its outbound close
already sends the same END message. The private witness retained actual UDP body length four bytes,
so no bytes followed the fixed transport header; its declared length field was
not retained and is not claimed byte-exact. Its `onMessage` previously had no incoming
END branch, so the observed packet reached the UNHANDLED case.

The established [eufy-security-client implementation at 3bfef13](https://github.com/bropat/eufy-security-client/blob/3bfef130bdcbff8f2f68286a5f63ec7e48177202/src/p2p/session.ts#L1318)
explicitly interprets incoming END as the device closing its connection and
invokes onClose. This is corroborating primary implementation source, not an
independent vendor protocol specification. Our current-peer/socket guard is
necessary to avoid applying a foreign or stale endpoint's teardown to the
selected connection.

Inspected [SDK upstream main at 7d1f016](https://github.com/mega-yfue/eufy-sdk/blob/7d1f016362465b0747405c5dc83124c86b2c630b/src/transport/p2p/p2p-session.ts)
also lacks an incoming END branch, and its LiveStream lacks a session-close
listener. The fix is applicable there without importing unrelated fork changes.

## Verification and remaining gate

`peer-end.spec.ts` uses actual bound UDP sockets for CAM_ID connection, DATA
ACKs, current-peer END, an END from another source port and a delayed END from
the previous connection after reconnecting to a different peer. It verifies
prompt close/LiveStream stop, no further UDP packets after close, and actual
rebinding of the released client port. The foreign-host guard is additionally
exercised through the receive method with a synthetic address; macOS does not
provide a second loopback alias by default. This host case is not represented
as a separate on-wire packet experiment.

On base 55dacd3 the first two regression cases failed because current-peer END
never closed the connection or stopped its live stream. Both pass with the
candidate; the added actual stale-connection case passes as well. The prompt
close checks allow at most 500 ms for local test scheduling; they are not live
recovery measurements. The malformed-peer END cases (two/three-byte truncated envelopes and mismatched
payload lengths) preserve the session; a well-framed END with a one-byte opaque
payload still closes it. **17 focused lifecycle/peer tests and all 4,100 tests
in 235 files passed**, as did typecheck, build and diff whitespace validation.

Combined candidate bundle SHA-256 (END changes plus the separate ownership
companion 55d3fea):
`48372212a4e16a45fd2601febc5239e21f503339303ad975e79aca78583cddb5`.
## Deployed natural-END verification

The combined candidate was deployed unchanged, SHA-256 above, as runtime PID
23635 with service start at 2026-10-12 19:27:11 UTC. A passive physical-interface
capture began before deployment and ran **19:26:25.065381–19:36:25.068802 UTC**.
It retained **502,375 metadata records**, with **zero tap drops, truncations or
missing timestamps**. No Inspector hooks, stream-start injection, quality,
selector, LAN policy or buffer changes were made by the observer. Temporary
packet-tap resources closed at completion. A final read-only hash check confirmed
the same deployed bundle and PID.

At **19:30:50.149400431 UTC**, the candidate's actively streaming standalone
peer sent END on its selected endpoint: actual packet length **4 bytes** and
wire-declared payload length **0**. It was not a lookup probe or old-SDK shutdown
packet. That connection had received tens of thousands of video datagrams; its
last VIDEO before END arrived at 19:30:50.107804508. No further outgoing DATA
commands were observed on the ended connection after END.

| Boundary | UTC | Elapsed from physical END |
| --- | --- | ---: |
| Incoming valid END | 19:30:50.149400431 | 0 ms |
| Bridge stopped journal entry | 19:30:50.169291 | 19.890569 ms |
| Bridge feed-ended/reopening journal entry | 19:30:50.175066 | 25.665569 ms |
| New peer CAM_ID on replacement connection | 19:30:52.602102675 | 2,452.702244 ms |
| New outer 1700 media start | 19:30:52.908975601 | 2,759.575170 ms |
| First VIDEO on replacement connection | 19:30:53.028899084 | **2,879.498653 ms** |
| Bridge reports streaming again | 19:30:53.162833 | 3,013.432569 ms |

Journal timing includes host packet delivery, SDK/bridge work and logging; it is
not an independently instrumented SDK close-call timestamp. There was one late
old-endpoint VIDEO datagram 0.541162 ms after END; a physical packet reaching an
ended socket does not establish SDK delivery. The before-END VIDEO to first-new
VIDEO interval was 2,921.094576 ms. The physical final-old datagram to first-new
interval was 2,878.957491 ms. Neither metric is a decoded/rendered frame count.
The journal streaming event separately establishes that the bridge feed resumed.

The two HomeBase sessions continued receiving **242 and 636 VIDEO datagrams**
during the 2.879-second standalone recovery. This establishes that those distinct
connections remained active; it is not a physical station-control END test of
the ownership companion. Their separate VIDEO pauses remain unresolved: the same
window includes a 9.808-second pause with heartbeat/control still alive, and a
2.797-second pause with no outgoing parent-peer DATA command within ±5 seconds.
Those pauses are not repaired by END processing and must not be conflated with
this result.

Three other incoming END packets during startup were on known **old SDK active
ports**, after the new process started but before those previous peer senders
stopped. They are excluded by connection identity; time-after-start alone would
misclassify them as candidate recovery. Only the natural active-candidate END
above supports the deployed recovery claim.

The original ignored-END witness had a 22,681.253485-ms cross-connection VIDEO
gap and continued keepalives after peer END. The candidate honors a natural END
promptly and resumes transport in 2,879.498653 ms after END. These are distinct
sequential live events, not identical-scene/randomized timing measurements. The
causal claim is removal of ignored explicit-close waiting, corroborated by the
base-failing UDP regression and zero post-END commands; the entire timing
difference is not attributed exclusively to one function. Why the peer closed
remains unverified. No general source-pause, sensor-capture-age, decoder or
peak-memory improvement is claimed.

Private immutable provenance:

| Artifact | SHA-256 |
| --- | --- |
| `end-candidate-nic-600.jsonl` | `2ce9fb1504ce2b061181e69c496a4029b29bf71e07183cd04ffb14e63e490c43` |
| `end-candidate-journal.jsonl` | `fd866edb9526ecaaafc418c952a5a51983dd04a7b5c4deb09bda02fed28cc7fb` |

`end-candidate-analysis.json` retains selected metadata and precise journal
boundaries privately. Source-level validation with the separate ownership
companion passed **4,103 tests in 235 files**, typecheck and build. No SDK source
or built artifact changed between this gate, deployment and the final hash check.

## Upstream handoff

Use a fresh branch from upstream main, apply only the incoming END guard and
LiveStream close-listener lifecycle changes, this regression file and sanitized
evidence. Run the clean upstream full suite/typecheck/build; the current gate is
on the eufy-wall fork and does not replace that validation. Do not merge unrelated
fork history. The PR's need is prompt explicit peer-close recovery with endpoint
isolation, not lower camera quality or a cure for all upstream delivery pauses.
No upstream PR has been created for this candidate.
