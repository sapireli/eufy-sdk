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
The new API is not yet live deployed at this report's gate, and no thirty-minute
post-deployment watchdog-survival observation is claimed. The separately measured
heartbeat-alive HomeBase VIDEO pauses remain unresolved.

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
The candidate has not changed the running package during paired transport
captures. Live deployment and a sustained completion/watchdog observation are
separate gates owned by the integrating host.

## Upstream handoff

Port this event/completeness seam, its base-failing tests and sanitized evidence
onto a clean current upstream-main branch; inspect its poll/deviceState contract
first. Run that branch's full required gate. Report the need as operational
poll-loop completion observability, not a correction to unchanged deviceState
or a promise to eliminate all camera pauses. Host integrations must choose their
own watchdog policy; a status-error completion is progress, not successful cloud
state. Do not carry host-specific restart logic or unrelated fork fixes into
this API PR. No upstream PR has been created for this change.
