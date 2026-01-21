# BAI/0.3 Protocol

## Protocol JSON (BAI/0.3)

See `protocol.json` for the canonical, machine-readable spec.

## Worked examples

### Handshake (assistant)

```bai
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
