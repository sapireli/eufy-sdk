# Preserve independent media sessions when a station-control session closes

## Need

A station can have a control connection carrying one live source and independent
per-camera media connections carrying others. A control connection closing is
not evidence that those other connections closed. `tearDownStation` previously
selected sources by camera-key prefix, disposing every source belonging to the
same station. That also disposed healthy sources owned by independent sessions
and closed their media connections.

The existing `liveSessionKeys` map already records the exact session owning each
source, including reservations written before the source has finished opening.
The repair filters that map by owner **equal to the closing station-control
session key**. It disposes only those sources and removes matching unfinished
ownership claims. Independent media sources and their reservations remain.
Talkback's existing control-session cleanup is unchanged. Explicit `closeAll`
still disposes every source and closes all connections.

This is a separate ownership/lifecycle fix from processing incoming peer END.
It changes no ACK, reorder, gating, encryption, stream selector, quality,
resolution, LAN policy or playback buffering. The accompanying END recovery
candidate needs correct ownership cleanup because it invokes the normal close
path; that does not justify sweeping unrelated sockets.

## Structural proof

Base is eufy-wall source `55dacd367068b0d90460561e20c9410a2ec03724`.
The added regression exercises the actual router factory, session registration,
close-event wiring, real SharedLiveSource/LiveStream fan-out and live consumers.
P2P sockets are represented by EventEmitter sessions; this is **not a physical
HomeBase capture**. A control close must dispose its owned source while the
independent media connection remains connected, its source remains cached and
its consumer continues receiving a synthetic coded-frame event.

On the base router this regression fails: the independent source's dispose spy
is called once when it should not be called. On the repaired router it passes.
Complementary tests verify:

- A dedicated media session waiting for its level-2 key retains its reservation
  when the control session closes; it finishes opening on the same independent
  session once the key wait resolves.
- Explicit `closeAll` closes both live connections, disposes both sources and
  removes all ownership claims.
- Existing autonomous-close tests still remove the sources actually riding the
  station session. Their fixture now seeds the ownership map, matching how the
  actual router creates sources rather than supplying an ownerless source.

The key-wait and explicit-closeAll tests also pass on the base: they are safety
coverage for required lifecycle behavior, not evidence the base fixed anything.
**19 focused tests and all 4,103 tests in 235 files passed**, including the
separately prepared END transport regression; typecheck and build passed.
The ownership regression's base failure is isolated by restoring only the router
source during that run, then restoring the candidate in a finally block.

## Evidence boundary

No physical station-control END has been observed for this fix. The separate
metadata witness documents a standalone peer END, which has no sibling sources.
That witness proves a recovery need for END processing, not physical evidence
that station-control closes caused the measured HomeBase video pauses. There is
no delivered-frame, CPU or source-pause improvement claim for this structural
ownership change. Combined END/ownership production recovery remains a separate
live verification gate.

## Upstream handoff

[Upstream main 7d1f016](https://github.com/mega-yfue/eufy-sdk/blob/7d1f016362465b0747405c5dc83124c86b2c630b/src/transport/p2p/command-router.ts#L1174)
contains the same prefix-based teardown and the same ownership map, so this fix
is directly applicable. Create an isolated branch from current upstream main,
apply only this router ownership change, its tests/fixture correction and this
sanitized evidence, then run that clean branch's gates. Validation reported here
is on eufy-wall and does not substitute for upstream-base validation. Keep the
END transport patch as its own commit/PR; do not import unrelated fork history.
No upstream PR has been opened for this change.
