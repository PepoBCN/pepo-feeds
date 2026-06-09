// guardian.mjs — deep Guardian feed via the Guardian Open Platform API.
// Used when the user's only chosen publisher is theguardian.com: instead of a
// shallow Google News `site:` search, this hits the Guardian's own API for full,
// reliable coverage. Single source, so there's no overlap (and no dupes) with the
// Google News feed; we also de-dupe by headline within, for safety. Returns RSS.

const ENDPOINT = 'https://content.guardianapis.com/search';

function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function normKey(t) {
  return String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// "1d","7d","30d","1y","12h" -> a from-date (YYYY-MM-DD), or '' if not parseable.
function fromDate(when) {
  const m = /^(\d+)\s*([hdwmy])$/i.exec(String(when || '').trim());
  if (!m) return '';
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const days = unit === 'h' ? Math.max(1, Math.ceil(n / 24))
    : unit === 'd' ? n
    : unit === 'w' ? n * 7
    : unit === 'm' ? n * 30
    : unit === 'y' ? n * 365
    : 0;
  if (!days) return '';
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString().slice(0, 10);
}

function rss(items) {
  const now = new Date().toUTCString();
  const parts = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0"><channel>',
    '<title>Pepo Feeds — The Guardian</title>',
    '<link>https://www.theguardian.com/</link>',
    '<description>Deep Guardian coverage via the Guardian Open Platform API.</description>',
    '<lastBuildDate>' + xmlEscape(now) + '</lastBuildDate>',
    '<generator>Pepo Feeds</generator>',
  ];
  for (const it of items) {
    parts.push('<item>');
    if (it.title) parts.push('<title>' + xmlEscape(it.title) + '</title>');
    if (it.link) { parts.push('<link>' + xmlEscape(it.link) + '</link>'); parts.push('<guid isPermaLink="true">' + xmlEscape(it.link) + '</guid>'); }
    if (it.pubDate) parts.push('<pubDate>' + xmlEscape(it.pubDate) + '</pubDate>');
    if (it.desc) parts.push('<description>' + xmlEscape(it.desc) + '</description>');
    parts.push('<source url="https://www.theguardian.com/">The Guardian</source>');
    parts.push('</item>');
  }
  parts.push('</channel></rss>');
  return new Response(parts.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

export default async (req) => {
  try {
    const url = new URL(req.url);
    const key = process.env.GUARDIAN_API_KEY;
    if (!key) return rss([]); // not configured -> empty feed, never throws

    const q = (url.searchParams.get('q') || '').slice(0, 500);
    const when = url.searchParams.get('when') || '';

    // relevance (not newest): newest returns any article mentioning the term in
    // passing; relevance surfaces articles actually ABOUT it. We include pubDate so
    // the reader still sorts newest-first. Phrase-quoting (done client-side) tightens
    // multi-word brands further.
    const params = new URLSearchParams({
      'api-key': key,
      'order-by': 'relevance',
      'page-size': '50',
      'show-fields': 'trailText',
    });
    if (q.trim()) params.set('q', q.trim());
    const fd = fromDate(when);
    if (fd) params.set('from-date', fd);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    let data;
    try {
      const r = await fetch(`${ENDPOINT}?${params.toString()}`, { signal: ctrl.signal });
      if (!r.ok) return rss([]);
      data = await r.json();
    } finally { clearTimeout(timer); }

    const results = (data && data.response && Array.isArray(data.response.results)) ? data.response.results : [];
    const seen = new Set();
    const items = [];
    for (const a of results) {
      const title = (a && a.webTitle ? String(a.webTitle) : '').trim();
      const link = (a && a.webUrl ? String(a.webUrl) : '').trim();
      if (!title || !link) continue;
      const k = normKey(title);
      if (k && seen.has(k)) continue; // de-dupe by headline
      if (k) seen.add(k);
      let pub = '';
      if (a.webPublicationDate) { const d = new Date(a.webPublicationDate); if (!isNaN(d.getTime())) pub = d.toUTCString(); }
      const desc = (a.fields && a.fields.trailText) ? String(a.fields.trailText) : '';
      items.push({ title, link, pubDate: pub, desc });
    }
    return rss(items);
  } catch {
    return rss([]);
  }
};
