# Pepo Feeds

A browser-based builder for advanced Google News RSS feeds, with an optional deeper feed that merges in full-text search from The Guardian and The New York Times, deduped so the same story never shows up twice.

Live at [pepo-feeds.netlify.app](https://pepo-feeds.netlify.app).

## Why this exists

Google News lets you build a custom RSS feed with advanced search operators (all these words, any of these words, exact phrase, exclude words, from/not from these publishers), but you have to hand-write the query string and know the URL format. Most people never find this, or give up on the syntax.

Pepo Feeds is a form: fill in what you're tracking in plain fields, watch a live preview of matching headlines update as you type, and copy a ready-to-use RSS URL into Feedly, Inoreader, or any reader. No account, no login, no server-side state, everything is built client-side into a URL.

## What's included

- **A visual query builder** for Google News RSS: all-of-these-words, any-of-these-words, exact phrase, exclude-words, and publisher include/exclude, each as chip-style inputs rather than raw query syntax.
- **A publisher typeahead** covering curated UK and US news outlets, so you can type "BBC" and get the right domain rather than guessing it.
- **A live preview** of the feed while you build it.
- **A merged deep feed** (via a Netlify function) that adds full-text results from the Guardian and New York Times APIs on top of the Google News results for the same query, and dedupes across all three by normalised headline so a story picked up by multiple sources only appears once.
- **Related-term suggestions** powered by a small Claude Haiku call, offering aliases and related names for whatever you're searching (falls back to no suggestions if the API key isn't set or the call fails, it never blocks the core feature).
- **Save and organise feeds** into named folders locally in the browser, so you can build a small library of feeds you check regularly.

## How it works

The whole builder runs in a single `index.html`, no framework, no build step. It compiles your form fields into a Google News RSS query string and constructs the standard `https://news.google.com/rss/search?q=...` URL. Netlify Functions (`netlify/functions/`) add the parts that need a server: `feed.mjs` merges Google News with the Guardian and NYT APIs and dedupes the result, `guardian.mjs` serves a Guardian-only deep archive feed, `suggest.mjs` calls Claude for related search terms, and `fetch-rss.mjs` proxies a plain Google News fetch around CORS.

## Install and run locally

```bash
git clone https://github.com/PepoBCN/pepo-feeds.git
cd pepo-feeds
npm install -g netlify-cli   # if you don't already have it
netlify dev
```

`netlify dev` serves `index.html` and the functions in `netlify/functions/` together, matching how it runs in production.

To open the plain static page without the serverless functions (query builder and preview work, the deep merged feed and suggestions won't), just open `index.html` directly in a browser.

## Environment variables

The deep-feed features need API keys, set these in your Netlify site's environment settings (or a local `.env` for `netlify dev`):

| Variable | Required for | Notes |
|---|---|---|
| `GUARDIAN_API_KEY` | Guardian results in the merged feed and the Guardian-only deep feed | Free tier available from the [Guardian Open Platform](https://open-platform.theguardian.com/) |
| `NYT_API_KEY` | New York Times results in the merged feed | Free tier available from the [NYT Developer Portal](https://developer.nytimes.com/) |
| `ANTHROPIC_API_KEY` | Related-term suggestions | Without it, the suggestions box just stays empty, the rest of the app is unaffected |

## Example

Say you want everything about Arsenal's transfer business, but not from the club's own website and not general match reports. In the builder you'd set:

- All of these words: `Arsenal`
- Any of these words: `transfer, signing, deal`
- Exclude words: `preview, ratings`
- Not from these publishers: `arsenal.com`

The live preview updates as you type, and the resulting RSS URL is ready to paste into any feed reader, or to expand into the merged Guardian/NYT view for deeper coverage of the same query.

## Deploy

The site is a static Netlify deploy with functions (`netlify.toml` sets `publish = "."` and `functions = "netlify/functions"`). Pushing to `main` triggers a Netlify build if the site is connected to this repo; otherwise `netlify deploy --prod` from a checkout with the environment variables above configured.

## License

MIT, see [LICENSE](LICENSE).
