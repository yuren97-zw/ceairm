# Remaining cancellation verification

Current service, route, separate RBAC addon and original workbench form implemented. PostgreSQL 103 service tests and 147-table/6337-row full restore passed; revoked cancellation owner replays denied twice after restore with source retained, no hours and stats readable. Current ordinary RBAC superuser semantics remain as in the review services; no user role assignments were added outside synthetic fixtures.

Still required: current role/person/scope revocation during actual lock wait; finalization/posting versus cancellation races; restored cancellation exact replay; original browser desktop/mobile confirmation, error retry and access revocation. Existing concurrency suite runs original matrix and does not prove these new cancellation races. Component UI test covers lost successful response with identical request retry; it is not browser evidence.

Current authorization denial clears previous private detail and pending drafts; a dedicated component regression passes. Test full cross-period/task cancellation projections without altering old authorizations. P0-15 remains partial.
