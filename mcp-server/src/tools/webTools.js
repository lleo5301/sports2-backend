const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Parse search results from DuckDuckGo HTML lite.
 * Returns an array of { title, url, snippet }.
 */
async function duckduckgoSearch(query, maxResults = 5) {
  const params = new URLSearchParams({ q: query });
  const response = await fetch(`https://html.duckduckgo.com/html/?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(10000)
  });

  const html = await response.text();
  const results = [];

  // Parse result blocks: each result has class="result__body"
  const resultBlocks = html.split('class="result__body"');
  for (let i = 1; i < resultBlocks.length && results.length < maxResults; i++) {
    const block = resultBlocks[i];

    // Extract title
    const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)</);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // Extract URL
    const urlMatch = block.match(/href="([^"]+)"[^>]*class="result__a"/);
    let url = '';
    if (urlMatch) {
      url = urlMatch[1];
      // DuckDuckGo wraps URLs in redirect — extract the actual URL
      const actualUrl = url.match(/uddg=([^&]+)/);
      if (actualUrl) {
        url = decodeURIComponent(actualUrl[1]);
      }
    }

    // Extract snippet
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    let snippet = snippetMatch ? snippetMatch[1] : '';
    // Strip HTML tags from snippet
    snippet = snippet.replace(/<[^>]+>/g, '').trim();

    if (title && (url || snippet)) {
      results.push({ title, url, snippet });
    }
  }

  return results;
}

/**
 * Fetch a webpage and extract text content (strips HTML tags).
 * Returns first ~4000 chars to stay within token limits.
 */
async function fetchPageText(url, maxChars = 4000) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(10000),
    redirect: 'follow'
  });

  let text = await response.text();

  // Remove script and style blocks
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<header[\s\S]*?<\/header>/gi, '');
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');

  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Clean up whitespace
  text = text.replace(/\s+/g, ' ').trim();

  // Truncate
  if (text.length > maxChars) {
    text = text.substring(0, maxChars) + '... [truncated]';
  }

  return text;
}

module.exports = [
  {
    name: 'web_search',
    description: 'Search the web for information not available in the local database. Use this to find opponent team stats, player profiles, news, rankings, or any external baseball data. Returns search result titles, URLs, and snippets.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query — be specific. Example: "Millenia Atlantic University baseball 2026 roster stats"'
        },
        max_results: {
          type: 'integer',
          description: 'Max number of results to return (default 5, max 10)'
        }
      },
      required: ['query']
    },
    handler: async (input) => {
      const results = await duckduckgoSearch(input.query, Math.min(input.max_results || 5, 10));
      if (results.length === 0) {
        return { results: [], message: 'No search results found. Try a different query.' };
      }
      return { results, count: results.length };
    }
  },

  {
    name: 'fetch_webpage',
    description: 'Fetch and extract text content from a specific URL. Use this after web_search to get detailed stats from a team page, roster page, or stats page. Returns plain text (HTML stripped).',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Full URL to fetch (e.g., a team stats page from the search results)'
        },
        max_chars: {
          type: 'integer',
          description: 'Max characters to return (default 4000, max 8000)'
        }
      },
      required: ['url']
    },
    handler: async (input) => {
      const text = await fetchPageText(input.url, Math.min(input.max_chars || 4000, 8000));
      if (!text || text.length < 50) {
        return { error: 'Could not extract meaningful text from this URL.' };
      }
      return { url: input.url, text, chars: text.length };
    }
  }
];
