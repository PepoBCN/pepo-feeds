// fetch-rss.mjs — proxy + de-dupe for the Google News RSS feed.
// Fetches a Google News RSS URL (CORS-free for the browser preview AND the
// actual subscribable feed), then collapses near-duplicate headlines (the same
// story syndicated across many outlets) into one. Returns valid RSS.

// Collapse items whose headline is the same once you strip Google News's
// " - Publisher" suffix and normalise. Keeps the first occurrence, preserves
// channel header/footer. Never throws — on any trouble, returns the input.
function dedupeRss(xml) {
  try {
    const firstIdx = xml.search(/<item\b/i);
    const lastIdx = xml.lastIndexOf('</item>');
    if (firstIdx === -1 || lastIdx === -1 || lastIdx <= firstIdx) return xml;

    const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
    if (items.length < 2) return xml;

    const seen = new Set();
    const kept = [];
    for (const it of items) {
      const m = /<title>([\s\S]*?)<\/title>/i.exec(it);
      let title = m ? m[1] : '';
      title = title.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
      // strip the trailing " - Source" Google News appends, then normalise
      const key = title
        .replace(/\s+[-–—]\s+[^-–—]+$/, '')
        .toLowerCase()
        .replace(/&[a-z#0-9]+;/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
      if (!key) { kept.push(it); continue; }
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(it);
    }
    if (kept.length === items.length) return xml; // nothing to collapse
    const before = xml.slice(0, firstIdx);
    const after = xml.slice(lastIdx + '</item>'.length);
    return before + kept.join('\n') + after;
  } catch {
    return xml;
  }
}

export default async (req) => {
  const url = new URL(req.url);
  const rssUrl = url.searchParams.get('url');

  if (!rssUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }
  if (!rssUrl.startsWith('https://news.google.com/rss/')) {
    return new Response('Only Google News RSS URLs are allowed', { status: 403 });
  }

  try {
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'PepoFeeds/1.0',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
    });
    if (!response.ok) {
      return new Response(`Upstream returned ${response.status}`, { status: response.status });
    }
    const body = await response.text();
    const deduped = dedupeRss(body);

    return new Response(deduped, {
      status: 200,
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (err) {
    return new Response('Failed to fetch RSS feed', { status: 502 });
  }
};
