# alertmanager-gchat

> **Archived.** Use [calert](https://github.com/mr-karan/calert) instead. [`calert/`](calert/)
> holds the configuration and card template I moved to, ready to adapt.

This was a small Node.js relay that turned Prometheus Alertmanager webhooks into Google Chat
cards. A relay is still needed: Alertmanager has no Google Chat receiver
([prometheus/alertmanager#2940](https://github.com/prometheus/alertmanager/issues/2940)), and a
webhook receiver's body cannot be templated, while Google Chat accepts only its own message
format. But this one did little beyond that:

- one card layout, hard-coded in `index.js`;
- one Chat space per deployment, no retries, and the first three alerts of a group only;
- no threading, so firing and resolved notifications were unrelated messages;
- Node 18, which is past end of life.

calert does the same job and is maintained. It renders a Go template, retries (429 included),
posts every message about an alert group into one Chat thread, exports Prometheus metrics, and
ships as a static binary in a scratch image.

## Moving to calert

1. **Copy [`calert/config.toml`](calert/config.toml) and
   [`calert/alert-card.tmpl`](calert/alert-card.tmpl).** The config defines one room, `alerts`,
   in group threading mode: one message per Alertmanager notification, threaded per group. Its
   webhook comes from the environment (`CALERT_PROVIDERS__ALERTS__ENDPOINT`), so it stays a secret.
2. **Edit the block marked `EDIT FOR YOUR SETUP`** in the template. calert hands a template the
   alerts but not the Alertmanager they came through, so the template maps each alert's
   generator URL (the Prometheus or vmalert that raised it) to an Alertmanager address a browser
   can open, for the Silence button.
3. **Deploy it.** [`calert/kubernetes.yaml`](calert/kubernetes.yaml) is a Deployment and Service
   that read the webhook from the same `alertmanager-gchat` Secret this repo used.
4. **Point Alertmanager at it**, with `send_resolved` on, because group threading needs it:

   ```yaml
   receivers:
     - name: default-receiver
       webhook_configs:
         - send_resolved: true
           url: http://calert:6000/dispatch?room_name=alerts
   ```

5. **Remove this relay** once a notification has arrived through calert.

## The card

Each notification is a single message:

- **A one-line text**, for example `🟠 HighMemory: 3 firing · prod/web`. A phone notification shows
  this line, not the card.
- **The card's title** is the severity colour and the alert name.
- **The subtitle** is the counts, then the group's `cluster/namespace · service`. These keys mirror
  `route.group_by`, because calert does not pass group labels to a template, so keep them in step.
- **One collapsed section.** Opening it shows:
  - Runbook, Dashboard, Query and Silence buttons, each only when its link is usable;
  - then every alert as a bold title (🔸 firing, a green ✔ resolved) over its description,
    the labels that set it apart, and the time it started.

A link becomes a button only when it is an absolute URL, because Google Chat rejects the whole
message for a malformed one. Missing labels or annotations simply drop their line, so an alert
from outside a cluster, or one with nothing but a name, still renders.

The template is read once at start, so restart calert after changing it.
