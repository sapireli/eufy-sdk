# Observe settled cloud-poll progress independently of device changes

## Need and contract

`deviceState` describes a device reporting new last-seen state. It deliberately
does not fire when a cloud poll returns the same timestamp and values, nor for
initial discovery. Hosts therefore cannot use that event as evidence that the
SDK's periodic poll loop is running. Changing deviceState to fire on every poll
would falsify its device-report semantics.

This isolated API addition emits typed **pollComplete({status})** once after
an individual poll pass settles:

- `ok`: the house/device-list queries were complete and the pass applied normally.
- `partial`: the existing registry tolerated at least one house/device-list query
  failure and returned a partial result; the pass still settled.
- `error`: the pass threw, reported its existing error and settled.

A pending/hung poll emits no completion. Disabled periodic polling (`pollMs:0`)
starts no pass and emits none. The payload is a single fixed status label; it
contains no device/account identity, state values, errors, keys or addresses.
It reports **loop progress**, not cloud availability, camera reachability,
next-poll scheduling, capture-age or media freshness. A partial/error pass can
still re-arm through the existing scheduler finally path. Actual authentication
expiry remains the existing error/session lifecycle's responsibility.

The registry exposes its already-maintained completeness decision through
internal PollDiff.complete. No query, failure-tolerance, deviceState, parameter,
SDK poll cadence, media request, ACK, quality or buffering semantics change.
The facade emits completion from pollOnce finally after application/error
handling, preserving the existing state-change events.

## Observed integration failure that requires this seam

At **2026-10-12 19:57:17.039457 UTC**, a host logged:
`realtime stalled (poll idle 1800s) — re-establishing`.
It then stopped three previously active live feeds at
19:57:17.062126–19:57:17.065402 and logged their feed-ended/reopening events
19:57:17.064262–19:57:17.065824. The deployed SDK bundle was
`48372212a4e16a45fd2601febc5239e21f503339303ad975e79aca78583cddb5`,
source `a9424bf9f92adc0a388aba66157763b4b45f24b2`.

The host's inactivity timer was reset by deviceState, although the SDK emits
that event only for diff.reported whose lastSeenMs advanced. The existing
unchanged-last-seen regression explicitly verifies no deviceState emission.
The host consequently lacked a periodic loop-progress signal and treated silence
on a state-change event as a poll stall. The host watchdog integration is a
separate repair; this API makes the needed observation possible without changing
device-state semantics.

**Proof limit:** poll completions before that trigger were not instrumented.
The witness proves the forced recovery and the incompatible event contract; it
does not independently prove every preceding HTTP poll succeeded or completed.
At the original source-commit gate, the API was not live deployed and no thirty-minute
survival observation was claimed. The later checkpoint below supersedes that
deployment status only. Heartbeat-alive HomeBase VIDEO pauses remain unresolved.

Private journal artifact `poll-watchdog-trigger-journal.jsonl` SHA-256:
`33bfa33701df550ca2837a236da4bb7baa1b40a2d6e881ac7fe93262bebca25e`.
Raw journal device identifiers remain private and are not attached here.

## Regression and verification

The new regression drives a real DeviceRegistry over a synthetic cloud for
complete unchanged and tolerated partial-house responses. It verifies exactly
one completion per pass and unchanged deviceState silence. Additional cases
cover thrown errors followed by recovery, a genuinely pending promise (no event
until resolution), and disabled periodic scheduling (no query or completion).
Four new cases fail against base a9424bf because no completion arrives; all five
pass on the candidate. The disabled case also passes on the base and is required
lifecycle safety coverage, not a base defect claim.

Focused poll/device-state suites: **44 tests passed**. Full fork suite:
**4,108 tests in 236 files passed**. Typecheck, build and diff whitespace checks
passed. Candidate bundle SHA-256:
`b23b4ddaa58ad4669cd3a528de71f9570c3f14ffe7609062820be822c281b83b`.
The candidate did not change the running package during the earlier paired
transport captures. The later live checkpoint below records deployment and
sustained completion separately from the unit/build gates.

## Later live deployment checkpoint

The integration deployed source `830fa1c962efea746b053821c50d92a76442d5e9`
with bundle `b23b4ddaa58ad4669cd3a528de71f9570c3f14ffe7609062820be822c281b83b`
at **20:12:31 UTC on 12 October 2026**. All 155 dist files plus package.json
(156 package files) matched the built candidate byte for byte. This later
record is documentation only; it does not rebuild or change that source bundle.

A 366-row private health record sampled approximately every five seconds from
**20:15:24.483332 to 20:45:49.483455 UTC** (1,825.000123 seconds between first
and last samples). The same deployed process remained alive at every sample.
Authentication was `ok`, sessionLost was false, go2rtc was running, reported
stalls were zero, and health was ok at every sample. Three actual settled poll
completions reached the integrating host, all with status `ok`:

- 20:22:43.317 UTC.
- 20:32:44.432 UTC.
- 20:42:45.314 UTC.

The fifteen-minute rollback timer was canceled only after the first observed
completion and healthy checks; the terminal health record confirms cancellation.
The bounded 20:12:31–20:47:00 UTC service journal contains 109 rows and **no
`realtime stalled`** event. The process survived more than 33 minutes from
its deployment through the final health sample, beyond the original watchdog's
30-minute threshold. This verifies the deployed poll-completion/watchdog contract
for this observation, not all future cloud conditions.

**Media continuity limit:** all three selected sources appeared in 365 of 366
health samples. One sample at 20:24:54.483723 listed two sources. The journal
shows one feed stopped at 20:24:52.150943, feed-ended/reopening at
20:24:52.154226, and streaming again at 20:24:55.015341; neighboring health
samples listed all three. There was no poll-idle reset or process restart at
that boundary. Its underlying cause was not established by this health/journal
record. Do not claim uninterrupted media or resolution of the distinct source
pauses from this watchdog proof.

Private metadata artifacts (identities remain private):

- `poll-completion-live-1830s.jsonl`, SHA-256
  `ea25fe47ef54a0227a1b49850315f8e4dbf31a93d7eaec3f92f94767203dbc60`.
- `poll-completion-live-journal.jsonl`, SHA-256
  `3f90289f85d63a514b67c7220bc843f1210fd9f79b2b5471d426fd83687f2ec2`.
- Full deployed-dist manifest SHA-256
  `aeeb899f2cc699c81314a98986cc6f2bd57ff6538154be768a08aee805ece6d0`.

## Upstream handoff

Port this event/completeness seam, its base-failing tests and sanitized evidence
onto a clean current upstream-main branch; inspect its poll/deviceState contract
first. Run that branch's full required gate. Report the need as operational
poll-loop completion observability, not a correction to unchanged deviceState
or a promise to eliminate all camera pauses. Host integrations must choose their
own watchdog policy; a status-error completion is progress, not successful cloud
state. Do not carry host-specific restart logic or unrelated fork fixes into
this API PR. No upstream PR has been created for this change.
