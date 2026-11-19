# Independent review cancellation: next implementation

Business decision received: separately authorized cancellation owner. Posted cases continue through correction approval and reversal.

Source audit: RBAC has no cancel permission or role. The review service, original route and workbench have no independent cancel action. Existing source-removal cancellation is authorized only by original source deletion; preserve it and do not reuse its permission for independent cancellation.

Required implementation: separate permission and addon role without automatic grants to acceptors or finalizers. Original transaction/lock must recheck current account/person, whole participant scope and case revision. Require reason and auditable request identity with safe retries. Atomically close case/channel and cancel only pending notifications. Preserve source work, dispatch, batches, opinions, final decisions and ledger. Reject any posting evidence, including zero-hour records, receipts, adjustments and role results. Do not reopen a closed channel.

Required proof: RBAC isolation, scope and revocation, cancellation versus finalization/posting concurrency, audit rollback, exact replay, posted-case rejection, original browser flow and both database restore checks. This file records the inspected gap and next work, not completion.
