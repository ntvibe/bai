# BAI/0.3 Protocol

## COPY_THIS_TO_CHATGPT

Use this protocol to talk to the browser extension. The extension will scan the full chat transcript (both user and assistant messages) for:

- The initial handshake JSON inside the `bai` code block below.
- Any `BAI_ACK { ... }` lines that acknowledge the handshake.
- Any `BAI_ACTION { ... }` lines that describe actions to execute.

When you paste this message into chat, the extension looks for the handshake block to establish the workflow ID. After you send the handshake, wait for the extension to respond with an ACK line, then continue by responding with action lines. The extension keeps scanning the page for those exact prefixes, so keep the lines unwrapped and on their own lines.

```bai
{"protocol":"BAI/0.3","workflow_id":"{{RANDOM_UUID}}","kind":"handshake","state":"awaiting_extension_ack","capabilities":["action_lines"]}
```

## Extension config (machine-readable)

```json
{
  "protocol": "BAI/0.3",
  "handshake_block_language": "bai",
  "handshake_line_prefix": null,
  "action_line_prefix": "BAI_ACTION",
  "ack_line_prefix": "BAI_ACK",
  "handshake_state_awaiting_ack": "awaiting_extension_ack",
  "ack_state": "extension_acknowledged"
}
```

## Worked examples

### Handshake (assistant)

```json
{"protocol":"BAI/0.3","workflow_id":"wf_123","kind":"handshake","state":"awaiting_extension_ack","capabilities":["action_lines"]}
```

### ACK (extension)

BAI_ACK {"protocol":"BAI/0.3","workflow_id":"wf_123","kind":"ack","state":"extension_acknowledged","ack_nonce":"n_7d8f1c"}

### Action sequence (assistant, 5 lines total)

BAI_ACTION {"protocol":"BAI/0.3","workflow_id":"wf_123","kind":"action","ack_nonce":"n_7d8f1c","action_id":1,"type":"click","payload":{"selector":{"type":"css","value":"#login"}}}
BAI_ACTION {"protocol":"BAI/0.3","workflow_id":"wf_123","kind":"action","ack_nonce":"n_7d8f1c","action_id":2,"type":"input_text","payload":{"selector":{"type":"aria","value":"Email"},"text":"user@example.com"}}
BAI_ACTION {"protocol":"BAI/0.3","workflow_id":"wf_123","kind":"action","ack_nonce":"n_7d8f1c","action_id":3,"type":"input_text","payload":{"selector":{"type":"aria","value":"Password"},"text":"••••••••"}}
BAI_ACTION {"protocol":"BAI/0.3","workflow_id":"wf_123","kind":"action","ack_nonce":"n_7d8f1c","action_id":4,"type":"click","payload":{"selector":{"type":"text","value":"Sign in"}}}
BAI_ACTION {"protocol":"BAI/0.3","workflow_id":"wf_123","kind":"action","ack_nonce":"n_7d8f1c","action_id":5,"type":"done","payload":{"success":true,"summary":"Signed in"}}

## Compatibility notes

### Breaking changes from BAI/0.2

- Handshake JSON must include `kind`, `state`, and `capabilities` and be the only `bai` code block.
- No actions before a single ACK line; actions must include `kind` and `ack_nonce`.
- `action_id` must be strictly increasing within a workflow.
- Lifecycle includes `done` terminal action and explicit states.

### Non-breaking changes

- Selector payload supports object form while still accepting string `selector` (css).

### Migration strategy

- Extension should branch on `protocol` value from the handshake.
- Accept both 0.2 and 0.3 during migration; enforce `ack_nonce` and `kind` only for 0.3.
- Treat string `selector` as css for both versions.
