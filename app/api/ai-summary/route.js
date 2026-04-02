export async function POST(request) {
  const { symbol, news } = await request.json();
  const key = process.env.ANTHROPIC_API_KEY;
  
  if (!key) return Response.json({ error: 'AI service unavailable' }, { status: 500 });
  if (!news?.length) return Response.json({ error: 'No news provided' }, { status: 400 });

  const newsText = news.slice(0, 5).map((a, i) =>
    `${i+1}. ${a.headline}`
  ).join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Analyze these news headlines for ${symbol} and respond with JSON only:
${newsText}

{"summary": "2-3 sentence summary", "sentiment": "BULLISH or BEARISH or NEUTRAL", "keyPoint": "one key insight"}`
      }]
    })
  });

  const raw = await res.json();
  
  if (!res.ok) {
    return Response.json({ error: raw.error?.message || 'API error', status: res.status }, { status: 500 });
  }

  const text = raw.content?.[0]?.text || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return Response.json({ error: 'AI response parse error' }, { status: 500 });

  try {
    return Response.json(JSON.parse(match[0]));
  } catch(e) {
    return Response.json({ error: 'AI response parse error' }, { status: 500 });
  }
}