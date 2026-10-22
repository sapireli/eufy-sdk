# Upstream PR guide for this fork

This guide records what has helped contributions from this fork survive upstream review. Read the
current upstream `CODING_STANDARDS.md`, `CONTRIBUTING.md` and PR template first. Those files govern
upstream submissions; this guide adds practical checks learned while preparing and revising them.
It does not promise acceptance or replace maintainer judgment.

## Start from the current upstream

The fork is `sapireli/eufy-sdk`. Upstream contributions go to `mega-yfue/eufy-sdk`, normally targeting
`beta-0.5.0`. Fetch both remotes and confirm the active release branch before using that name.

Prepare each contribution in a fresh worktree based directly on the target beta. A green fork run
cannot validate an upstream PR: the fork has additional APIs, fixtures and lifecycle behavior.
Inspect the complete base-to-head diff, including files introduced by earlier commits. Never carry
another open PR's commits into a new submission. Wait for its merge and branch from the result.

Search open, closed and merged issues and PRs by symptom and affected files before changing code.
If the fix already merged, stop. If an open PR covers the need, contribute evidence there. Finish
changes-requested reviews before opening another PR.

## Establish the need and keep the scope

Name who encounters the problem today and what happens without the change. An actual report or
observed device run establishes need. A synthetic test establishes behavior under its inputs; it
cannot establish that those inputs occurred naturally.

Keep one problem per PR. Reuse the primitive that already owns the operation before introducing a
helper, flag, provider or export. Remove a speculative branch when review shows no reachable need
for it. A smaller patch still needs a supported premise.

The SDK implements device and protocol behavior established by the current vendor app and device
evidence. Host policy stays with the host. An operator's preferred retry deadline does not establish
a device recovery bound. Read and write verification are separate: a verified read does not authorize
a guessed write. New options preserve existing behavior by default.

## Match each claim to its evidence

Separate natural device observations, controlled interventions, synthetic regressions and operator
reports. State which produced each result. Keep the base and candidate commit, runtime, relevant
configuration, observation window, measured outcome and limitations with the evidence.

Identify the exact boundary being measured. SDK arrival, retained delivery, network departure,
decoder output and sensor capture are different events. A local UDP send callback establishes send
completion, not a remote acknowledgement. An arrival timestamp establishes SDK receipt, not camera
capture time. Avoid elapsed-time claims across unsynchronized clocks.

A natural pause followed by automatic recovery proves a pause. It does not establish that replacing
the source would improve recovery. To propose retirement after existing recovery, obtain persistent
natural starvation, a controlled comparison, or vendor-app behavior that establishes the missing
operation and its bound. Choosing a timeout just above one observed pause cannot supply that proof.

For the live-stream recovery work, distinguish initial warm-up, reused-source recovery and an
already attached stream going silent. Their watches have different lifetimes and success conditions.
Check whether audio clears a watch, whether its budget starts before the observed stall, and whether
its failure type still describes a stream that already delivered video.

Keep reproducibility details in the commit and PR body. Do not add new measurement reports to the
published SDK guides. Existing fork evidence is historical; verify its claims against the code being
submitted. Share synthetic identifiers and sanitized observations. Never publish raw captures,
serials, account IDs, addresses, session files, keys or credentials. Hashes establish byte identity;
they do not by themselves establish a decoder fault or its cause.

## Write regressions that distinguish the fix

Run the regression on the unmodified upstream base and verify that its relevant assertion fails.
A test passing on base does not support the fix. Fold useful negative assertions into the actual
regression rather than adding unrelated baseline checks.

Use the real boundary where practical. A loopback UDP peer can distinguish an END datagram actually
leaving the socket from a mocked call. Repeated experimental trials belong in the evidence; a bounded
single trial usually suffices for the suite. Always close sockets and consumers in cleanup.

Fixtures must honor the contract being tested. If a helper gains a completion callback, a fake must
complete it. A timeout caused by an incomplete fake is a fixture bug. Avoid proving delivery through
a fixture that silently replays cached frames or bypasses the production keyframe gate.

For shared video changes, check both codecs, delayed listener installation, video and media
subscriptions, configuration announcements, backpressure, raw and object Readables, snapshots with
their actual defaults, explicit prebuffer replay and sibling session ownership. A cached IDR followed
by current deltas may omit reference pictures. A corrected stream boundary alone does not prove that
every decoder exhibits the same visible failure.

## Write for the reviewer

Use the current PR template. Explain the concrete need, what changes, why the existing behavior fails,
the evidence, validation, and what remains unverified or deferred. Write concise developer prose and
apply the installed prose editing rules. Explain the SDK-wide trigger and benefit without naming a
particular consumer or its stack. Avoid universal claims when the evidence covers one device family.

Call out behavior changes and costs. Waiting for the next live IDR preserves its reference chain and
can delay a new consumer until that IDR arrives. Do not sell that tradeoff as an unconditional latency
improvement. Keep device evidence separate from downstream presentation choices.

Before posting, reread the whole description against the final diff. Remove abandoned approaches,
old test counts and claims that the latest revision no longer supports. Keep contributor credit and
third-party provenance intact.

## Validate and publish the tested tree

Run focused regressions and typechecking, then inspect the diff for redundant helpers and setup.
Run the complete `npm run verify` gate on the final tree using the required Node version from `.nvmrc`.
On this macOS setup, put GNU coreutils and GNU sed ahead of the system utilities so shell guards use
the expected tools. Validate another supported runtime when the change affects runtime behavior.

Sign commits. Inspect the existing signing setup before creating a new key. GitHub's
`createCommitOnBranch` can produce a verified commit when local signing is unavailable. Use an
expected head, include deletions, fetch the result and compare its entire tree to the tree that passed
validation. A matching title or patch excerpt is insufficient. Recheck any code changed after the gate.

Do not change the fork or a deployed service as a side effect of publishing an upstream PR. Track
those as separate updates with their own validation and exact source revision.

## Work through review to completion

Read all review threads and general comments at the current head. Address the underlying concern,
including scope reductions. Reply respectfully with the change, commit and relevant validation, or
explain why the evidence does not answer the request. Do not describe a withdrawn proposal as fixed.

Upstream's default rule is that only the reviewer resolves a review thread. Follow an explicit user
instruction authorizing author-side resolution when it overrides that workflow. In that case, publish
and verify the fix first, then use GitHub's resolve-conversation action for each addressed thread and
confirm its resolved state. Answering a comment alone does not resolve it. Leave genuine blockers
unresolved. Request re-review after the addressed revision is available.

Check merge state, head, CI and new comments again before reporting completion. A stale
changes-requested badge can remain after threads are addressed. Describe that state accurately;
never call a pending PR approved or merged.

## Keep the fork current without losing behavior

Back up the original fork head before rebasing or consolidating history. Audit every fork-only
commit, including corrections made in old merge commits. Classify its effective behavior as retained,
replaced by an upstream implementation, or intentionally retired with a stated reason. Patch IDs
alone cannot identify fixes upstream rewrote during review.

Prefer upstream's implementation when it meets the current need. During the beta rebase, the
fork's receipt metadata was retired in favor of upstream `arrivalTime`: the current bridge source
used neither receipt envelopes nor monotonic receipt IDs. Upstream timestamps preserve original SDK
arrival across delayed delivery, but do not supply monotonic timing or source-sequence identity.
Any future diagnostic needing those properties must account for that difference explicitly.

Run the combined suite after resolving conflicts. Keep the original remote head as the expected
value for a force-with-lease update, and compare the published tree with the validated tree. Preserve
untracked local work. A branch update does not establish that a running service has been upgraded.
