# Remote control

Remote control lets a paired phone follow Stave while it runs on your computer:
see running tasks, approve or deny a pending request once, and answer a pending
question. It is off by default and is turned on in
**Settings > Integrations > Remote control**.

A phone cannot start tasks, send prompts, stop or archive work, read files, use
terminals, change settings, or grant a persistent "Always allow" approval.

## Set it up

1. Turn on **Allow remote control**. The listener starts on **This computer only**
   (`127.0.0.1`), which only the same computer can open.
2. To reach Stave from a phone, choose a network address under **Address**. Stave
   lists the addresses assigned to this computer and asks you to confirm before
   it listens on one. Wildcard addresses such as `0.0.0.0` are never used.
3. Choose a **Port** from 6500 to 6549 if the default is taken. Settings shows
   an error if the port is in use and keeps your choice so you can change it.
4. Select **Pair a device**. Stave shows an address and a one-time code with a
   five-minute countdown. Open the address on the phone (the code is filled in
   from the address) and select **Pair**.

The phone page shows **Waiting for you** (approvals and questions) and
**Running tasks**, refreshes every five seconds while visible, and has a
**Refresh** button. **Approve once** and **Deny** answer an approval; a question
shows its options, or a text field when it has none, and **Send answer**.

## What the phone can answer

Requests come from the task state the open desktop window shows. A phone's
answer is sent to that window, which re-checks the exact workspace, task, turn,
request and message, then answers through the same respond action a click on
the desktop card or a Fleet row uses. The transcript records the answer exactly
as if it had been given on the desktop.

| Result (as listed in Settings) | Meaning |
| --- | --- |
| Applied | The answer was delivered. |
| Already answered | The request was answered elsewhere, belongs to an earlier turn, or this device already answered it. |
| Not found | No such request, or it can only be answered on the desktop. |
| Not delivered | No desktop window was ready, or delivery failed. Nothing changed; try again. |

Not shown and not answerable from a phone:

- Work owned by another controller (an external client that manages the task),
  as in Fleet.
- Workspaces the desktop has not loaded since it started, and questions with
  more than twelve fields. Answer those on the desktop.

When no desktop window is open or it is reloading, the phone shows that status
is unavailable. Answers are never queued for later.

## Security model

Remote control is meant for a trusted private network or VPN. The connection is
plain HTTP: it does not protect pairing codes, device credentials, questions,
answers or task content from someone who can watch or change network traffic.
Confirming a network address is not a substitute for transport protection.

- **Listener.** Separate from the development bridge and the local tool server.
  Loopback by default; a network address must be assigned to this computer and
  explicitly confirmed. No relay or tunnel. It starts at launch only if you
  left it on, and stops when you turn it off or quit.
- **Pairing.** A random 128-bit code, single use, valid for five minutes. Ten
  pairing requests per minute at most; five wrong codes lock pairing for five
  minutes and cancel the current code. At most 32 paired devices.
- **Device credentials.** Pairing returns a random 256-bit bearer token. Stave
  stores only its SHA-256 digest. The phone keeps the token in the browser
  tab's `sessionStorage`: it survives a reload but not closing the tab, so a
  forgotten tab on a shared or lost phone does not stay signed in. Pairing
  again adds a new device entry; revoke entries you no longer use.
- **Requests.** No cookies. Every API call needs the exact configured `Host`
  and, when the browser sends them, a same-origin `Origin` and fetch metadata.
  Each device may make 60 calls per minute, which bounds polling as well as
  answers. Actions are processed one at a time.
- **Allowlist.** Only approve once, deny, and answer question. Unknown fields
  or action kinds are rejected. A settled request is not dispatched again by
  this listener; an attempt that never reached the desktop may be retried.
- **Phone page.** Served only by the listener under a content security policy
  that allows same-origin script, style and fetch and nothing else: no inline
  script or style, no `eval`, no external requests, no framing. All text is
  inserted as text, never as HTML.
- **Desktop boundary.** Main forwards each snapshot or answer to the open
  window over a validated request and reply, accepts a reply only from the
  window it asked, and gives up after 15 seconds. Settings reach the listener
  through administrative IPC accepted only from the main window. Every hop is
  validated with strict schemas.

## Records

**Paired devices** lists each device with its pairing time and last use.
**Revoke** stops one device at once; **Revoke all** stops every device.

**Recent remote actions** keeps the last 100 answers with device, time, the
request it addressed and the result. The record is written before the answer
is sent and updated with the outcome. It never contains pairing codes, tokens
or question answer text. If Stave stops between sending an answer and saving
its outcome, the record keeps "Not delivered"; the desktop transcript shows
whether the answer landed.

Devices, records and the listener setting are stored in the app's local
database.

## Limitations

- No transport encryption. Use a trusted private network or VPN.
- No QR code; open the address shown in Settings on the phone.
- The phone page polls; it does not push notifications.
- Remote control needs the Stave desktop window to be open.
