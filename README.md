# Formspec Web

The public reference UI for Formspec. It is the open-source respondent-facing shell for form-fill deployments now, and the home for verifier and selective-proof viewer surfaces after the MVP cryptographic substrate lands.

## Positioning

formspec-web is for technical evaluators and operators who need to inspect, fork, self-host, and brand the public UI without adopting the proprietary tenant admin surface.

- **Respondent renderer:** the MVP surface. It fills, validates, drafts, submits, and shows plain-language outcomes through typed ports.
- **Verifier:** post-MVP, after the verifier substrate is ready to consume in browser code.
- **Selective-proof viewer:** post-MVP, after selective-disclosure proof support lands upstream.

The SaaS/admin plane lives in `../formspec-cloud/` and `../formspec-server/`. formspec-web is the public respondent plane. One Formspec platform can back many formspec-web deployments, each with its own brand, tenant scope, and identity profile.

## Start Here

```sh
npm ci
npm run dev
```

The app boots in demo mode and renders the bundled sample form when
`VITE_FORMSPEC_WEB_SERVER_URL` is unset.

Docker quickstart:

```sh
npm run check:compose-config
docker compose up --build
```

The compose file starts the public portal on `http://localhost:8080` and the
department profile on `http://localhost:8081`.

See [docs/getting-started.md](docs/getting-started.md).

Automated multi-deployment smoke:

```sh
npm run test:compose-quickstart
npm run test:multi-deployment
```

The compose quickstart gate runs the documented `docker compose up --build`
path on ports 8080/8081. The multi-deployment gate repeats the same profile,
brand, and submit checks with Docker-assigned local ports. Both gates open the
instances in Chromium and fail on browser warnings/errors.

Local gates:

```sh
npm run ci
```

See [docs/testing-plan.md](docs/testing-plan.md) for the full gate matrix,
conformance requirements, and manual release blockers.

## Release State

The current MVP proof is a local web deployment: Docker/nginx serves the static
respondent shell, `docker-compose.yml` boots the `publicPortal` and
`departmentApp` web instances, and `npm run ci` gates release-docs integrity,
port conformance, browser accessibility smoke, bundle budget, deployment
headers, and compose quickstart plus multi-deployment smoke.

Do not treat this as full production release sign-off yet. Manual VoiceOver and
NVDA sweeps are pending, production Locale Documents still depend on the
reference server, full OIDC server validation is blocked by EXT-23, and
server-backed draft resume/update semantics are blocked by EXT-26 and EXT-27.

Container smoke:

```sh
docker build -t formspec-web:test .
docker run --rm -d -p 8080:80 --name formspec-web-test formspec-web:test
curl -sf http://localhost:8080/ > /dev/null
docker stop formspec-web-test
```

## Architecture

The shell is hexagonal per [web ADR-0009](thoughts/adr/0009-hexagonal-architecture-ports-and-adapters.md). The app consumes five MVP ports through `Composition`:

- `DefinitionSource`
- `DraftStore`
- `SubmitTransport`
- `IdentityProvider`
- `NotificationDelivery`

Adapters are deployment examples. The core shell and port definitions must not import a backend/provider SDK directly.

## Upstream Theme Assets

M1 consumes the default theme, token registry, and Tailwind core CSS from the local sibling source packages under `../formspec/packages/`. Those source package manifests declare Apache-2.0. The npm registry artifacts currently report AGPL-3.0-only, so this repo does not install those registry packages.

The copied assets live under `src/theme/upstream/`. Run `npm run check:upstream-theme` when the sibling `../formspec` checkout is available to verify source package licenses and byte-for-byte sync.

## License

Apache-2.0. See [ADR-0003](thoughts/adr/0003-license-apache-2.0.md) and [LICENSE](LICENSE).
