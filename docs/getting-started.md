# Getting Started

Five-minute local path from clone to rendered demo form:

```bash
npm ci
npm run dev
```

The app starts in demo mode when `VITE_FORMSPEC_WEB_SERVER_URL` is unset. Demo
mode wires stub adapters and renders `src/demo/sample-form.json`.

Docker path:

```bash
docker compose up --build
```

Open `http://localhost:8080`. The default image also starts in demo mode. To run
against a real `formspec-server`, set `FORMSPEC_WEB_SERVER_URL`:

```bash
FORMSPEC_WEB_SERVER_URL=https://formspec-server.example.test docker compose up --build
```

Production runtime config is emitted by `docker/40-formspec-runtime-config.sh`
from `FORMSPEC_WEB_*` environment variables.
