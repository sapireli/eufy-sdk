# PR 397 paired source-retirement experiment

Base: `5c43bef0f865cd7a9cddfe332c6598e4ef131536`. This evidence branch adds only
PR #397's router reset method and the experiment. It is not another pull request.

Run `npx vitest run src/transport/p2p/__tests__/pr397-paired-experiment.spec.ts`.
The real router, session manager, LiveStream and SharedLiveSource run against
synthetic P2P sessions. Five repetitions of each arm pass. Results are written
to `/tmp/pr397-paired-results.json`. Full verification passes with 4,153 tests.

After an initial keyframe, the target receives no more video for 120 seconds.
The sibling continues receiving frames. No close/path-stale signal is injected.

| Action                                       | Same source | Modeled wait | Sibling retained |
| -------------------------------------------- | ----------- | ------------ | ---------------- |
| Automatic reassertion                        | yes         | another 9 s  | yes              |
| Detach all, wait, reopen                     | no          | 8,001 ms     | yes              |
| Detach one while another stays, wait, reopen | yes         | 8,001 ms     | yes              |
| Explicit reset, reopen                       | no          | 0 ms         | yes              |

The test peer supplies fresh synthetic frames after replacement. This proves
lifecycle behavior, not physical-camera recovery. The partial-detach result is
observed at rejoin; it does not exclude a later reuse timeout.

## Controlled live comparison, 16 October 2026

A router bundled from this source used an isolated P2P router/source, a T8425,
and the existing authenticated cloud client. The production bridge package
remained installed. No second cloud login or camera-setting write was performed.
The measured source was HomeBase-attached and base-owned.

After real keyframe/video delivery, command 1300 dispatch was suppressed in the
probe's own LiveStream instance for 25 seconds. Audio, replies and reassertions
continued. Across 40 samples in eight arms, video stayed flat and the session
stayed connected; maximum path silence was 4,965 ms. No automatic stop/error
occurred before recovery. This was deliberate source-local suppression, not a
spontaneous camera failure. Replacing that stream removes the injected filter
by construction, so it cannot prove recovery from an arbitrary device fault.

| Repetition | Detach all, wait 8.5 s, reopen to three frames | Reset, reopen to three frames |
| ---------- | ---------------------------------------------- | ----------------------------- |
| 1          | 8,932 ms                                       | 318 ms                        |
| 2          | 9,029 ms                                       | 533 ms                        |
| 3          | 8,819 ms                                       | 436 ms                        |

Medians were 8,932 ms and 436 ms. A partial-detach control retained the source
while an observer stayed attached. An automatic control retained its source;
removing the filter restored video on that same source in 101 ms. Reset is
therefore an alternative to removing source-local state, not the only way to
restore video when the underlying cause can be removed.

Reset preserved the base transport. All probe sessions and injected handlers
were cleaned up. The production process survived, and all three active Eufy
streams stayed live with unchanged stall counters at the pre/post checkpoints.
Those counters do not prove physical display smoothness. A preliminary run with
an extra observer was excluded before comparison results.

The experiment distinguishes post-start silence from a failed cold start whose
warm timeout already retires its source. It measures the immediate-retirement
operation against full quiescence and a retained observer. It does not establish
the original natural freeze's cause or prove that this public API is the only
valid design; bounded automatic escalation is another option. No device,
account, peer or capture identifiers are published here.
