# Getting Started

Start the local web host:

```bash
npm ci
npm run dev
```

An unconfigured host displays “This site is not ready.” To load a published
form, set `VITE_FORMSPEC_WEB_SERVER_URL` and `VITE_FORMSPEC_WEB_SCOPE_KEY`
from the backend config-check output, then open `/?form=<published-form-id>`.
The host requires an explicit form or a configured signed app.

Docker path:

```bash
docker compose up --build
```

Automated proof for the Docker path:

```bash
npm run check:compose-config
npm run test:compose-quickstart
```

`test:compose-quickstart` runs the documented `docker compose up --build`
path on ports 8080/8081, verifies the isolated runtime profiles and brands, and
checks the neutral configuration refusal in Chromium.

Open `http://localhost:8080` for `publicPortal` and
`http://localhost:8081` for `departmentApp`. To connect a deployed
`formspec-server`, set its URL and scope key; compose forwards both:

```bash
FORMSPEC_WEB_SERVER_URL=https://formspec-server.example.test \
FORMSPEC_WEB_SCOPE_KEY="$DEPLOYMENT_SCOPE_KEY" docker compose up --build
```

With a server URL, `publicPortal` uses the reference anonymous-session draft and
submit path. `departmentApp` is OIDC-required, renders explicit sign-in, and
waits for EXT-23 before full server-backed OIDC validation can be claimed.

Production runtime config is emitted by `docker/40-formspec-runtime-config.sh`
from `FORMSPEC_WEB_*` environment variables.
