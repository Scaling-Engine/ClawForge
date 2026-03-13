import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const webSearchTool = tool(
  async ({ query, num_results }) => {
    const apiKey = process.env.BRAVE_API_KEY;
    if (!apiKey) {
      return JSON.stringify({ error: 'BRAVE_API_KEY not configured. Run setup wizard to add it.' });
    }

    const count = Math.min(num_results || 5, 20);
    const params = new URLSearchParams({
      q: query,
      count: count.toString(),
      country: 'US',
    });

    try {
      const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
      });

      if (!response.ok) {
        return JSON.stringify({ error: `Brave Search API error: ${response.status}` });
      }

      const data = await response.json();
      const results = (data.web?.results || [])
        .slice(0, count)
        .map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.description,
          age: r.age || r.page_age || '',
        }));

      return JSON.stringify({ results, total: results.length });
    } catch (err) {
      return JSON.stringify({ error: `Brave Search request failed: ${err.message}` });
    }
  },
  {
    name: 'web_search',
    description:
      'Search the web using Brave Search API. Returns titles, URLs, snippets, and publication age. Use this when the operator asks a question that requires current information, fact-checking, or research beyond your training data.',
    schema: z.object({
      query: z.string(),
      num_results: z.number().optional().describe('Number of results (default: 5, max: 20)'),
    }),
  }
);

export { webSearchTool };
