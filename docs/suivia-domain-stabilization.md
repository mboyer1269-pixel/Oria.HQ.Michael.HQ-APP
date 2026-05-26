# Suivia Domain Stabilization

Repo-side domain and CTA changes must stay app-side and non-operational while the Suivia DNS setup is being stabilized.

- Do not migrate DNS until Lovable custom nameserver support is confirmed.
- Prefer stabilizing `suivia.ca` in Lovable first.
- Do not touch `notify.suivia.ca` while it is Pending.
- Do not add worker or external execution during DNS/domain changes.
- Cloudflare migration is deferred until Option A/B is confirmed.
