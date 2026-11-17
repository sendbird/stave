# Remote control

## Implementation status

Remote control is under development. The isolated HTTP boundary has no runtime
registration, Settings entry, mobile page, task responder adapter, or durable
storage adapter. It cannot currently be enabled in the desktop app. This
boundary alone does not provide remote access to work.

## Security contract

The intended feature is opt-in. Its listener is separate from the development
bridge and local tool server. Loopback is the default. A non-loopback bind must
name an address assigned to a local interface and requires explicit network
confirmation. Wildcard binds are refused. No relay or tunnel is provided.

Transport encryption is outside this version's scope. Use a trusted private
network or VPN. Plain HTTP does not protect pairing codes, device credentials,
questions, answers or task content against network observers or modification.
Network confirmation is not a substitute for transport protection.

Pairing uses a random 128-bit single-use code with a five-minute lifetime. The
pairing URL carries the code in its fragment. An exchange returns a random
256-bit bearer token; only its digest belongs in storage. Pairing is limited to
ten requests per minute globally. Five failed exchanges lock pairing for five
minutes and invalidate the current code. At most 32 devices may be paired.

APIs do not use cookies. Requests require the exact configured Host; supplied
Origin and fetch metadata must indicate the same origin. No cross-origin access
is granted. Every protected API requires a valid device bearer token, including
reads. Revocation removes that credential. Each device is limited to 60 API
requests per minute, bounding polling as well as mutations.

The strict action allowlist contains approval once, denial, question answer and
one-task stop. Persistent approvals, prompts, delegation, deletion, archiving,
merge and settings operations are absent. Unknown fields are rejected. Adapters
must revalidate the exact task, turn, request and message against current state
and call the existing user responders; transport validation is insufficient.
Work owned by a controller must go through that controller, including stops.

An action intent must be stored before dispatch and its outcome stored after
dispatch, with device identity and time. Codes, bearer tokens and question answer content are excluded
from audit data. Retain the last 100 entries for local display. Recent exact
request replays are refused by the boundary; responders must independently
refuse stale and repeated actions, including after retention pruning. A crash
between dispatch and outcome storage leaves an uncertain intent: do not retry
that request automatically.

## Remaining integration and verification

Before exposing the feature, implement the shared responders, durable storage,
local administrative IPC, Settings controls and network confirmation, pairing
QR, mobile AUI interface, existing attention projection and task-visible audit
records. Update both user-guide sources for the actual workflow. Verify real
HTTP against real responders and a mobile denial reflected in the desktop app.
The current HTTP tests use injected responder and storage ports; they do not
prove desktop integration or controller ownership.
