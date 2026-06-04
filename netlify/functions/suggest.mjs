/*
 * suggest.mjs — Netlify Function (v2)
 *
 * Contract (the frontend is built against this exactly):
 *   GET /.netlify/functions/suggest?term=<urlencoded>
 *   ALWAYS responds 200 with JSON { "suggestions": [ ...strings ] }.
 *   Headers: Content-Type: application/json
 *            Access-Control-Allow-Origin: *
 *            Cache-Control: public, max-age=86400  (suggestions are stable; cache a day)
 *
 *   On empty/invalid/too-long term (>80 chars after trim), a missing API key,
 *   or ANY error (LLM failure, network, parse), returns 200 with { "suggestions": [] }.
 *   This function NEVER throws to the client — the frontend treats a missing
 *   value or non-array as empty.
 *
 * What it does:
 *   Calls the Anthropic Messages API (claude-haiku-4-5) to get 4-6 short,
 *   news-relevant related search terms (aliases, alternative names, related
 *   entities/people/nicknames) for the supplied term. Output is parsed
 *   defensively: first JSON array in the text is extracted, filtered to
 *   non-empty strings, deduped case-insensitively, with the input term
 *   removed, capped at 6.
 */

const MAX_TERM_LENGTH = 80;
const MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const empty = () =>
  new Response(JSON.stringify({ suggestions: [] }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400',
    },
  });

const ok = (suggestions) =>
  new Response(JSON.stringify({ suggestions }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400',
    },
  });

// Pull the first JSON array out of arbitrary model text and normalise it.
function parseSuggestions(text, term) {
  if (typeof text !== 'string') return [];

  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return [];

  let arr;
  try {
    arr = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];

  const termLower = term.trim().toLowerCase();
  const seen = new Set();
  const out = [];

  for (const item of arr) {
    if (typeof item !== 'string') continue;
    const s = item.trim();
    if (!s) continue;
    const lower = s.toLowerCase();
    if (lower === termLower) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(s);
    if (out.length >= 6) break;
  }

  return out;
}

export default async (req) => {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get('term');
    const term = (raw || '').trim();

    if (!term || term.length > MAX_TERM_LENGTH) {
      return empty();
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return empty();
    }

    const prompt =
      `Give related NEWS search terms for the topic: "${term}".\n` +
      `Return 4-6 SHORT terms a news reader tracking this topic would also search for: ` +
      `aliases, alternative names, closely-related entities, people, organisations or nicknames. ` +
      `Exclude the input term itself.\n` +
      `Respond with ONLY a JSON array of strings. No prose, no markdown, no code fences. ` +
      `Example: term "Arteta" -> ["Mikel Arteta","Arsenal","Arsenal manager","The Gunners","Arsenal FC"].`;

    let response;
    try {
      response = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 150,
          temperature: 0.3,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
    } catch {
      return empty();
    }

    if (!response.ok) {
      return empty();
    }

    let data;
    try {
      data = await response.json();
    } catch {
      return empty();
    }

    // Anthropic returns { content: [{ type: 'text', text: '...' }, ...] }
    const text = Array.isArray(data?.content)
      ? data.content
          .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
          .map((b) => b.text)
          .join('')
      : '';

    return ok(parseSuggestions(text, term));
  } catch {
    // Absolute last-resort guard — never throw to the client.
    return empty();
  }
};
