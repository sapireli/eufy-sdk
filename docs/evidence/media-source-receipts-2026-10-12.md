> Historical fork evidence. The beta rebase retired this receipt API in favor of upstream
> `arrivalTime`. The measurements below describe the earlier implementation.

# Preserve original monotonic media receipt across retained delivery

## Need and source boundary

A host observing a cached keyframe through object-mode Readable cannot recover
when the SDK originally received it. The shared source retains a TimedMediaFrame
with a wall-clock arrival timestamp, but the Readable emits only LiveVideoFrame.
A host consequently measuring freshness when its callback runs labels a retained
picture as newly received. The existing SDK reuse-watch regression also documents
why a primed keyframe is evidence about the past, not new source progress.

An executed offline fixture used the actual SharedLiveSource,
openReadableFromConsumer, and the integrating host's receipt recorder. It delivered
one frame at wall time 1,000 ms and process-monotonic time 1,000,000 us, detached,
and rejoined inside linger at 6,000 ms / 6,000,000 us. The identical frame object
was replayed. Consumer.onMedia retained timestampMs = 1000 (age 5,000 ms), while
the host reminted receipt time 6,000,000 us and a new identity, reporting age zero.
This is an original-receipt observability defect, not a camera-capture clock
measurement or an explanation for upstream media pauses.

Base source is 830fa1c962efea746b053821c50d92a76442d5e9. The fixture checkout
HEAD was 51bf8df21c71bb5067cb6a7e0ee5c4c18a57bfef, a documentation-only change;
the audited source files are unchanged from 830fa1c. Original runtime bundle:
`b23b4ddaa58ad4669cd3a528de71f9570c3f14ffe7609062820be822c281b83b`.
The original fixture bundled source, not that exact deployed dist artifact.
No upstream-base verification or live receipt-preservation proof is implied.

## Narrow additive API

`openReadable({ objectMode: true, receiptMetadata: true })` yields frozen
ReceivedVideoFrame envelopes:

<!-- typecheck: skip — illustrative envelope shape, not executable TypeScript -->

```ts
{
  frame: LiveVideoFrame,
  receipt: {
    sourceId: string,
    sequence: bigint,
    monotonicUs: bigint,
  },
}
```

The original frame/buffer remains unchanged. Defaults still yield raw bytes or
ordinary object-mode frames with the original frame identity; ordinary video
and audio events do not gain fields. receiptMetadata requires objectMode; an
invalid combination rejects and detaches its newly attached consumer.

The source creates one frozen MediaReceipt at original video/audio arrival:
an opaque UUID identifies this SharedLiveSource instance; a bigint sequence
advances per original media arrival; process.hrtime supplies monotonic microseconds.
The source retains the same object in its timed item, queue, ring and keyframe
prime. Replay/drain does not mint another receipt or identity. Video and audio
share that sequence; a video-sequence jump is not a count of lost pictures.
A new source instance has a different identity. Receipts are within this SDK
process's monotonic domain, not UTC, first-network-packet receipt, device time,
or sensor exposure time.

The optional non-enumerable, non-writable TimedMediaFrame receipt property keeps
default timed-item Object.keys/JSON enumeration intact and existing external/synthetic
item shapes type-compatible; actual shared-source arrivals always supply it.
Opted-in Readable metadata is delivered via the existing timed media route;
its video listener preserves the existing keyframe-prime trigger. Missing receipt
metadata fails that reader rather than inventing arrival time. Queue limits,
drop-to-keyframe behavior, codec/config announcements, source retry timers,
stream requests, ACK/reordering and camera quality are unchanged.

## Regression and gates

The same six-case test was copied to the clean base. Five cases fail there:
aged-prime receipt/identity, queued delivery/configuration, overflow survivors,
backwards wall-clock correction, and contradictory raw+receipt selection.
The default raw/object-shape case also passes on the base and is safety coverage.
The candidate passes all six. Assertions exercise real source/readable objects
over synthetic frame transport and independently controlled clocks:

- Retained prime keeps its 5,000 ms age, receipt object identity and sequence.
- Queued frames retain original 1/2/3-second receipts and ordering at a later
  delivery time; frame references and coded configurations remain correct.
- Overflow preserves the existing drop-to-keyframe result and surviving receipts.
- A backwards wall-clock jump cannot rewrite monotonic receipt or sequence.
- Defaults preserve frame identity/raw bytes and add no field to ordinary frames.
- Invalid option selection does not leak a shared-source consumer attachment.

The initial candidate passed **40 focused tests** and the full fork gate:
**4,114 tests in 237 files**. That gate built the interim bundle
`dcf1ffcc5ec6fab9b9f28aa2c27a69ab10b14c1db7d305a2dbd07da580df864f`.
A subsequent compatibility refinement made the timed-item receipt property
non-enumerable, preserving default JSON/Object.keys behavior. The final refinement
passed the six receipt regressions, typecheck, build, consumer-agnostic,
decorrelation and doc-reference guards, plus git diff --check. The full fork
gate was not repeated after that narrow refinement. Final bundle SHA-256:
`a5fc1853c9ed07ed04a46bbbd6de1c039c922492714457621d8992a1ee4ff1cf`.
The final bundle was staged
with the integrating host and exercised through live Readable delivery. A bounded
single-reader probe joined an already-active source, received a frozen envelope
and receipt with that source identity, and observed an original monotonic receipt
585.427 ms older than the observation. The reader was destroyed immediately.
Its receipt did not equal the retained keyframe object read before the asynchronous
open: a newer keyframe arrived during that opening interval. This establishes
preserved age on the real delivery route, but not exact identity of that earlier
retained keyframe. The synthetic regression remains the exact cached-prime identity
proof. Runtime CPU/memory cost remains unmeasured.

The probe attached one reader to an existing source and could nudge the existing
start-join watch. It did not create an encoder, change quality or transport policy,
or retain coded media. The temporary inspector and forwarded connection were
closed afterward; prior inspector state was disabled. Host-level normal playback
and recovery results are recorded separately by the integrating host.

Private metadata-only artifacts retain the original fixture, result and
base/candidate test outputs. Their host evidence references carry hashes;
no camera bytes, device/account identifiers, addresses or keys are attached.

## Separate limits and upstream handoff

This exposes retention truth; it does not itself choose what a host displays,
what maximum age it accepts, or when it declares source progress. Host integration
must use the preserved receipt instead of recreating it from callback time.
A wall-clock timestamp cannot be retrospectively substituted for this monotonic
contract because host wall corrections are independent.

Existing keyframe-prime behavior replays a retained IDR before future frames.
Whether omitted intervening GOP references affect a particular downstream decoder
is a separate issue; this change does not alter prime/retry/decoder policy and
does not claim to repair reference-chain corruption or source pauses.

Before an upstream PR claim, retain the integrating host's deployment record with
source/runtime hashes, delivered frames and interruption boundaries. Preserve
the distinction between live delivery-age evidence and synthetic exact prime/queue
identity proof. Port this
single observability seam and meaningful regressions onto a clean current
upstream base, run its required gate and keep the live evidence scope precise.
No upstream PR or source-pause cure is claimed.
