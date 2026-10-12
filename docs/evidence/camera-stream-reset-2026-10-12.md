# Camera-scoped media recovery ownership

## Need and scope

A host recovering one camera previously inferred transport ownership from a station
key prefix. Closing that base connection and every dedicated media connection
also interrupts healthy sibling cameras. The SDK already knows which connection
owns each cached source; callers should not reconstruct that ownership from names.
This change exposes that existing ownership for a narrow source reset. It does
not explain or repair the original upstream silence that prompted recovery.

Source base: `1fbec7e45aaa62241cdc33acc8ec58baafa88879`.
The change is additive: `EufyMega.resetCameraStream(serial): Promise<boolean>`.
It resolves only loaded camera/channel metadata and returns false without opening
anything when no cached source exists. It removes the affected ownership/cache
entries before disposing the source, avoiding reentrant cleanup closing an owner
twice. Disposal ends its consumers, clears retained/queued media and releases its
session claim. Only a recorded dedicated media connection is closed and awaited.
Base/control connections remain open, including a standalone device's base, so
other control/talkback users are preserved. Transport-wide recovery is separate.

The API does not cancel an external concurrent acquisition. Callers must serialize
recovery against their camera acquisition. The integrating host already sets its
opening flag before its per-station acquisition chain and awaits reset before
opening the replacement; a deferred-cleanup regression verifies that ordering and
coalesces concurrent requests. No camera settings, ACK, reorder, quality, or stream
request defaults change.

## Evidence and gates

Offline synthetic transport tests exercise real SharedLiveSource objects with
independently seeded ownership to verify queued/live sibling ordering and affected
source disposal. Three tests fail on the unchanged base because the API is absent;
that is an API availability regression, not live device evidence.

Two additional tests acquire both cameras through the actual router and actual
SessionManager lifecycle, with only the network session faked. One source owns the
base and the other an independently constructed dedicated connection. Resetting
either source leaves the sibling retained count unchanged and its connection
active. Resetting the base-owned source releases its one media claim while preserving existing temporary lookup holds and
preserving the base connection. Resetting the dedicated source closes only that
connection. Each sibling receives three synthetic pictures in order: one before
reset, one queued across reset, and one afterward. Explicit closeAll then empties
all session entries. No real-world freeze duration is inferred from synchronous
synthetic delivery.

Final focused reset/acquisition/stale-source/start-failure suites: **39 tests in
four files passed**. Typecheck and build passed. Candidate bundle SHA-256:
`d5db321bbd4ce03397dc0d2b8bd92de3603b5edc3f71bfe0be63b5a464835c92`.
The host adapter regressions verify exact serial delegation, refusal of unsafe
prefix fallback with an older SDK, and awaited/coalesced acquisition ordering.
The original host adapter fails the exact-serial safety regression by attempting
to close the shared base connection; the candidate delegates camera recovery
without prefix iteration. Intentional station-wide peer-policy transitions retain
a separately named host operation. Seven focused host adapter/policy tests pass.
## Controlled live ownership checkpoint

The integrating host staged source `d711f98e8f584d14e8685a322cb4784abddc7b01`
with bundle `d5db321bbd4ce03397dc0d2b8bd92de3603b5edc3f71bfe0be63b5a464835c92`.
One public reset of the base-owned camera completed in 15 ms and returned true.
All three public transport-session objects retained their identities and remained
connected afterward. Across the 44.3-second API window, a healthy sibling source
kept its source identity, advanced its media sequence by 1,361, gained 667 input
and 665 output pictures, and never reported idle. The reset camera obtained a new
source identity; three samples reported non-streaming before it recovered.

Both hardware display clients continued increasing the sibling's rendered counters
without an error or reset. However, 16 shared pictures had measured ingress ages
508–739 ms, and the sibling producer recorded 14 additional stale observations.
The inspector instance lookup's timing cost was not measured, and no simultaneous
source-wire observation exists for this reset. These results show ownership
preservation and resumed delivery; they do not prove timing neutrality, that the
reset caused or avoided age tails, or that upstream source silence is repaired.

The initial candidate ran in one host process, but its rollback timer later raced
and restored the preceding SDK. The host subsequently promoted the candidate in
a new process. The subsequent candidate was retained after an ordinary 45-second gate. All four
hardware display feeds had zero queues, no errors, retries, counter resets, or new
500-ms ingress-age misses. Both rollback timer and service were confirmed inactive.
This short ordinary-playback gate is separate from the inspector-confounded reset
window; it does not establish sustained behavior or timing neutrality of recovery.
No upstream PR is claimed here.

## Later upstream handoff

Port this additive lifecycle API and the ownership regressions independently onto
a clean upstream base. Preserve default behavior and the distinction between
source recovery and transport-wide reset. Before making a live recovery claim,
record the exact deployed package hash and a single affected-camera reset while
healthy sibling delivery continues; source silence remains an independent issue.
