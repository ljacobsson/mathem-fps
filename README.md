# IRL mode – an unofficial fan project for Mathem

> **Not affiliated with or endorsed by Mathem.** This is an independent, non-commercial fan project.
> "Mathem" and its logo are trademarks of their respective owner. No Mathem content (product data,
> images, fonts) is included in this repository; it is loaded at runtime from mathem.se in your own
> browser session, just as when you visit the site.

Chrome extension that turns [mathem.se](https://www.mathem.se/se/) into a first-person supermarket.
Categories become aisles, real products (live prices, real photos) stand on the shelves, and you push
a cart around while your hand picks things off the shelf and drops them in.

## Install

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this folder
3. Open https://www.mathem.se/se/ and click **Toggle IRL mode** (top right)

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | Walk (the cart follows) |
| Mouse | Look (click the view to capture the mouse) |
| Shift | Run |
| Click | Pick the highlighted product |
| R / right-click | Put the last item back |
| E | Pay at a checkout lane |
| M | Sound on/off |
| Esc | Pause |

At the checkout you can push the cart contents into your **real** Mathem cart. Nothing is added
unless you press that button.

## How it works

- `content.js` adds the button and lazy-loads `game/main.js` (three.js, ES modules, no build step).
- Data comes from the same JSON API the site uses (`/api/v1/app-components/...`), so assortment and
  prices match your session. ~48 products per category are sampled across a few subcategories.
- Product images have no CORS headers, so `background.js` proxies them; white studio backgrounds
  are flood-filled away so products stand on shelves as cut-outs, packed into one texture atlas per
  category and rendered with instanced meshes.
- Customers, staff and cashiers walk a waypoint graph, browse shelves, queue at checkouts and chat.
- All audio (muzak, cart rattle, scanner beeps, PA chime) is synthesised with WebAudio; PA
  announcements use the browser's Swedish speech voice if available.

## Network etiquette

The extension tries to cost Mathem no more than a normal visit:

- API responses are cached in extension storage (categories for 12 h, products and offers for 3 h),
  so reopening the store within that window makes no API requests at all.
- API calls are throttled to 2 at a time, at least 100 ms apart (a first visit makes about 22).
- Product images are kept in the extension's Cache API between launches (up to 3,000 images), so
  each image is downloaded once. New ones are fetched like a browser would: 6 at a time, capped at
  about 40 per second.

On a first visit the shelves nearest you fill first and the rest stream in while you play.

## Licence

[PolyForm Noncommercial 1.0.0](LICENSE.md): free to use, modify and share for any noncommercial
purpose. Bundled three.js (`game/vendor/three`) is under its own MIT licence.

## Updating three.js

`npm install && npm run vendor` copies the needed three.js files into `game/vendor/three` and
rewrites bare `three` imports (content scripts can't use import maps).
# mathem-fps
