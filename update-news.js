const axios = require('axios');
const fs = require('fs');

const NEWSAPI_KEY = process.env.NEWSAPI_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const QUERIES = [
  'Bitcoin',
  'Ethereum crypto',
  'cryptocurrency legislation',
  'memecoins DOGE PEPE WIF',
  'DeFi blockchain',
  'Michael Saylor Bitcoin',
  'Anthony Pompliano crypto',
  'Natalie Brunell Bitcoin',
  'Jack Mallers Strike Bitcoin',
  'Vitalik Buterin Ethereum',
  'Changpeng Zhao Binance',
  'Brian Armstrong Coinbase',
  'Lyn Alden Bitcoin macro',
  'Raoul Pal crypto',
  'Cathie Wood Bitcoin ARK',
  'PlanB Bitcoin stock to flow',
  'Andreas Antonopoulos Bitcoin',
  'Balaji Srinivasan crypto',
  'Erik Voorhees crypto',
  'Jack Dorsey Bitcoin Block',
  'Rekt Capital Bitcoin cycle',
  'Scott Melker crypto',
  'Coin Bureau crypto',
  'Altcoin Daily crypto',
  'Laura Shin Unchained',
  'Lark Davis crypto',
  'Miles Deutscher crypto',
  'crypto regulation Congress',
  'Bitcoin strategic reserve',
  'stablecoin legislation',
];

async function fetchArticles() {
  const allArticles = [];
  const seen = new Set();

  for (const q of QUERIES.slice(0, 10)) {
    try {
      const res = await axios.get('https://newsapi.org/v2/everything', {
        params: {
          q,
          language: 'en',
          sortBy: 'publishedAt',
          pageSize: 5,
          apiKey: NEWSAPI_KEY,
        }
      });
      for (const a of res.data.articles || []) {
        if (!seen.has(a.url) && a.title && !a.title.includes('[Removed]')) {
          seen.add(a.url);
          allArticles.push(a);
        }
      }
    } catch (e) {
      console.log(`Query failed: ${q}`);
    }
  }
  return allArticles.slice(0, 30);
}

async function curateWithClaude(articles) {
  const prompt = `You are the editor of Diamond Hands Daily, a bold pro-crypto news aggregator. 

Select the 6 best articles from this list for a crypto-native audience. Prioritize: breaking news, Bitcoin, legislation, major influencer commentary, memecoins, DeFi. Avoid FUD-only pieces.

For each selected article return ONLY valid JSON array with these fields:
- title (punchy, max 12 words, crypto-native tone)
- category (one of: Bitcoin, Ethereum, Memecoins, DeFi, Legislation, Macro, Altcoins)
- summary (1 sentence, max 20 words)
- url
- publishedAt
- source

Articles:
${articles.map((a,i) => `${i+1}. ${a.title} | ${a.source?.name} | ${a.url}`).join('\n')}

Return ONLY the JSON array, no other text.`;

  const res = await axios.post('https://api.anthropic.com/v1/messages', {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }]
  }, {
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    }
  });

  const text = res.data.content[0].text;
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

function getCategoryClass(cat) {
  const map = {
    'Bitcoin': 'btc', 'Ethereum': 'eth', 'Memecoins': 'meme',
    'DeFi': 'defi', 'Legislation': 'law', 'Macro': 'macro', 'Altcoins': 'eth'
  };
  return map[cat] || 'btc';
}

function getCategoryIcon(cat) {
  const map = {
    'Bitcoin': '₿', 'Ethereum': '🔷', 'Memecoins': '🐸',
    'DeFi': '⛓️', 'Legislation': '🏛️', 'Macro': '📊', 'Altcoins': '🔷'
  };
  return map[cat] || '₿';
}

function getPill(i) {
  if (i === 0) return '<span class="card-pill pill-hot">hot</span>';
  if (i < 3) return '<span class="card-pill pill-new">new</span>';
  return '<span class="card-pill pill-live">live</span>';
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 60000);
  if (diff < 60) return `${diff} min ago`;
  if (diff < 1440) return `${Math.floor(diff/60)} hrs ago`;
  return `${Math.floor(diff/1440)} days ago`;
}

async function run() {
  console.log('Fetching articles...');
  const articles = await fetchArticles();
  console.log(`Fetched ${articles.length} articles`);

  let curated;
  try {
    curated = await curateWithClaude(articles);
    console.log(`Curated ${curated.length} articles`);
  } catch(e) {
    console.log('Claude curation failed, using fallback');
    curated = articles.slice(0,6).map(a => ({
      title: a.title,
      category: 'Bitcoin',
      summary: a.description || '',
      url: a.url,
      publishedAt: a.publishedAt,
      source: a.source?.name
    }));
  }

  const newsHtml = curated.map((a, i) => {
    const cls = getCategoryClass(a.category);
    const icon = getCategoryIcon(a.category);
    return `
      <a href="${a.url}" target="_blank" rel="noopener" class="news-card">
        <div class="news-thumb ${cls}"><span style="font-size:48px;">${icon}</span>${getPill(i)}</div>
        <div class="news-body">
          <div class="card-cat">${a.category}</div>
          <div class="card-title">${a.title}</div>
          <div class="card-meta">${timeAgo(a.publishedAt)} · ${a.source || ''}</div>
        </div>
      </a>`;
  }).join('');

  const now = new Date();
  const timestamp = now.toLocaleDateString('en-US', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});

  let html = fs.readFileSync('index.html', 'utf8');
  html = html.replace(
    /<div class="news-grid" id="news-container">[\s\S]*?<\/div>\s*<\/section>/,
    `<div class="news-grid" id="news-container">${newsHtml}</div>\n  </section>`
  );
  html = html.replace(
    /<span class="section-badge" id="news-timestamp">.*?<\/span>/,
    `<span class="section-badge" id="news-timestamp">${timestamp}</span>`
  );

  fs.writeFileSync('index.html', html);
  console.log('index.html updated successfully');
}

run().catch(console.error);
