# @moderok/sdk

Lightweight analytics and error tracking for **Manifest V3** browser extensions. Zero runtime dependencies, built for service workers and every extension context.

| Constraint     | Detail                                                         |
| -------------- | -------------------------------------------------------------- |
| Size           | About **5 kB** gzipped (minified)                              |
| Permissions    | `"storage"` only — no `host_permissions` required              |
| Environments   | Service worker, popup, options, side panel, content scripts    |
| Error tracking | **On by default** for uncaught errors and unhandled rejections |

## Install

```bash
npm install @moderok/sdk
```

## Quick start

```js
import { Moderok } from "@moderok/sdk";

Moderok.init({ appKey: "mk_your_app_key" });
Moderok.track("feature_used", { theme: "dark" });
```

Call `init()` at **top level** in your background service worker — synchronously, not after `await` or inside `.then()`. Make sure `"storage"` is listed in your `manifest.json` permissions.

A standalone `moderok.min.js` is also available under `dist/` via [jsDelivr](https://cdn.jsdelivr.net/npm/@moderok/sdk/dist/moderok.min.js) for extensions without a bundler.

## Documentation

Full documentation at **[docs.moderok.dev](https://docs.moderok.dev)** — manifest setup, API reference, error tracking, uninstall tracking, and troubleshooting.

## License

MIT — see [LICENSE](./LICENSE).
