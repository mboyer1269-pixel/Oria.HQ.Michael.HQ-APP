# Docker public authentication configuration

Next embeds NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY into the client bundle during `next build`. Runtime environment changes cannot repair a bundle built for another project. Build a separate image for each public Supabase configuration; use matching runtime public values for server authentication.

Supply both public build arguments explicitly through the deployment operator's environment:

```sh
docker build --build-arg NEXT_PUBLIC_SUPABASE_URL \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY -t oria-hq:reviewed .
```

The build fails before Next if either value is absent or a stub, the URL is not HTTPS, or the key is not a public publishable key/legacy anon JWT. This validates configuration shape, not project reachability, JWT authenticity, permissions or login success. Supabase service-role keys and secret keys must never be build arguments. Build arguments and public values can be exposed through image metadata and browser assets by design.

Server credentials, Memex handles and Paperclip credentials belong only in the deployment runtime secret mechanism. `.env*` at any depth and common credential artifacts are excluded from the Docker context; do not add exceptions for real environment files. No local environment files are needed for this build.

The existing base pin `node:22.23.1-alpine3.24@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2` was resolved successfully against the official Node registry on 2026-09-29, including linux/amd64. It is retained. The digest pins the base image, not subsequent Alpine repository updates. Record the final built image digest for deployment reproducibility.

Focused validation: `node --test scripts/docker-public-config.test.mjs`. Before deployment, also complete the repository's typecheck/lint/build/smoke gates and an actual browser login/redirect check against the intended HTTPS hostname. Configure the matching Supabase site URL and allowed redirects. These assets do not claim those external checks have passed.
