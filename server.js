require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory store for sales data
let salesData = {
  online: { current: 0, target: 5000000, history: [] },
  offline: { current: 0, target: 1000000, history: [] }
};

// In-memory store for financial data
let financialData = {
  artistCost: 0,
  productionCost: 0,
  marketingExpenses: 0,
  flightExpenses: 0,
  sponsorEarnings: 0
};

// ============ WEATHER API ============
app.get('/api/weather', async (req, res) => {
  try {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey || apiKey === 'your_openweathermap_api_key_here') {
      return res.json({
        source: 'demo',
        location: 'Bengaluru, IN',
        current: {
          temp: 28,
          feels_like: 30,
          humidity: 65,
          description: 'Partly Cloudy',
          icon: '02d',
          wind_speed: 12
        },
        forecast: [
          { date: '2026-04-03', temp_max: 32, temp_min: 22, description: 'Sunny', icon: '01d', rain_prob: 10 },
          { date: '2026-04-04', temp_max: 31, temp_min: 21, description: 'Partly Cloudy', icon: '02d', rain_prob: 25 },
          { date: '2026-04-05', temp_max: 30, temp_min: 22, description: 'Light Rain', icon: '10d', rain_prob: 60 },
          { date: '2026-04-06', temp_max: 29, temp_min: 21, description: 'Thunderstorm', icon: '11d', rain_prob: 75 },
          { date: '2026-04-07', temp_max: 31, temp_min: 22, description: 'Cloudy', icon: '03d', rain_prob: 30 }
        ],
        risk_level: 'MEDIUM',
        note: 'Demo data - Add OPENWEATHER_API_KEY to .env for live data'
      });
    }

    // Bengaluru coordinates
    const lat = 12.9716;
    const lon = 77.5946;

    const [currentRes, forecastRes] = await Promise.all([
      fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`),
      fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`)
    ]);

    const current = await currentRes.json();
    const forecast = await forecastRes.json();

    // Process 5-day forecast focusing around April 5
    const dailyForecast = {};
    if (forecast.list) {
      forecast.list.forEach(item => {
        const date = item.dt_txt.split(' ')[0];
        if (!dailyForecast[date]) {
          dailyForecast[date] = {
            date,
            temp_max: item.main.temp_max,
            temp_min: item.main.temp_min,
            description: item.weather[0].description,
            icon: item.weather[0].icon,
            rain_prob: Math.round((item.pop || 0) * 100)
          };
        } else {
          dailyForecast[date].temp_max = Math.max(dailyForecast[date].temp_max, item.main.temp_max);
          dailyForecast[date].temp_min = Math.min(dailyForecast[date].temp_min, item.main.temp_min);
          dailyForecast[date].rain_prob = Math.max(dailyForecast[date].rain_prob, Math.round((item.pop || 0) * 100));
        }
      });
    }

    // Determine risk level based on April 5 forecast
    const april5 = dailyForecast['2026-04-05'];
    let risk_level = 'LOW';
    if (april5) {
      if (april5.rain_prob > 70) risk_level = 'HIGH';
      else if (april5.rain_prob > 40) risk_level = 'MEDIUM';
    }

    res.json({
      source: 'live',
      location: 'Bengaluru, IN',
      current: {
        temp: Math.round(current.main.temp),
        feels_like: Math.round(current.main.feels_like),
        humidity: current.main.humidity,
        description: current.weather[0].description,
        icon: current.weather[0].icon,
        wind_speed: Math.round(current.wind.speed * 3.6)
      },
      forecast: Object.values(dailyForecast).slice(0, 5),
      risk_level
    });
  } catch (error) {
    console.error('Weather API error:', error.message);
    res.status(500).json({ error: 'Failed to fetch weather data' });
  }
});

// ============ MARKET DATA API ============
async function fetchYahooSymbol(s) {
  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s.symbol)}?interval=1d&range=5d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    const data = await response.json();
    const result = data.chart?.result?.[0];
    if (result) {
      const meta = result.meta;
      const prevClose = meta.chartPreviousClose || meta.previousClose;
      const price = meta.regularMarketPrice;
      const change = price - prevClose;
      const changePercent = (change / prevClose) * 100;
      return { ...s, price: price.toFixed(2), change: change.toFixed(2), changePercent: changePercent.toFixed(2), status: 'live' };
    }
    throw new Error('No data');
  } catch {
    return { ...s, price: '--', change: '--', changePercent: '--', status: 'unavailable' };
  }
}

function marketRisk(items) {
  const live = items.filter(m => m.status === 'live');
  if (!live.length) return 'UNKNOWN';
  const avg = live.reduce((s, m) => s + parseFloat(m.changePercent || 0), 0) / live.length;
  return avg < -2 ? 'HIGH' : avg < -0.5 ? 'MEDIUM' : 'LOW';
}

app.get('/api/markets', async (req, res) => {
  try {
    const allSymbols = [
      { symbol: '^NSEI',    name: 'NIFTY 50',    market: 'IN' },
      { symbol: '^BSESN',   name: 'SENSEX',       market: 'IN' },
      { symbol: '^DJI',     name: 'DOW JONES',    market: 'US' },
      { symbol: '^GSPC',    name: 'S&P 500',      market: 'US' },
      { symbol: '^IXIC',    name: 'NASDAQ',       market: 'US' },
      { symbol: '^N225',    name: 'NIKKEI 225',   market: 'AS' },
      { symbol: '^HSI',     name: 'HANG SENG',    market: 'AS' },
      { symbol: '000001.SS',name: 'SHANGHAI',     market: 'AS' },
      { symbol: '^TASI',    name: 'SAUDI TASI',   market: 'ME' },
      { symbol: '^DFMGI',   name: 'DUBAI DFM',    market: 'ME' },
      { symbol: 'GC=F',     name: 'GOLD',         market: 'CMD', unit: '$/oz' },
      { symbol: 'CL=F',     name: 'CRUDE OIL WTI',market: 'CMD', unit: '$/bbl' },
      { symbol: 'BZ=F',     name: 'BRENT CRUDE',  market: 'CMD', unit: '$/bbl' }
    ];

    const results = await Promise.all(allSymbols.map(fetchYahooSymbol));

    const indian      = results.filter(r => r.market === 'IN');
    const us          = results.filter(r => r.market === 'US');
    const asian       = results.filter(r => r.market === 'AS');
    const middleEast  = results.filter(r => r.market === 'ME');
    const commodities = results.filter(r => r.market === 'CMD');

    // Commodity risk: fuel (crude) up > 3% = HIGH, gold up > 2% = MEDIUM (safe-haven buying = fear)
    const crudeLive = commodities.find(c => c.symbol === 'CL=F' && c.status === 'live');
    const goldLive  = commodities.find(c => c.symbol === 'GC=F' && c.status === 'live');
    let cmdRisk = 'LOW';
    if (crudeLive && parseFloat(crudeLive.changePercent) > 3) cmdRisk = 'HIGH';
    else if (crudeLive && parseFloat(crudeLive.changePercent) > 1.5) cmdRisk = 'MEDIUM';
    else if (goldLive && parseFloat(goldLive.changePercent) > 2) cmdRisk = 'MEDIUM';

    res.json({
      indian, us, asian, middleEast, commodities,
      risk_level:    marketRisk([...indian, ...us]),
      asianRisk:     marketRisk(asian),
      meRisk:        marketRisk(middleEast),
      commodityRisk: cmdRisk
    });
  } catch (error) {
    console.error('Market API error:', error.message);
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
});

// ============ NEWS API (War, LPG, Concert Cancellations) ============
app.get('/api/news/:category', async (req, res) => {
  const { category } = req.params;
  const apiKey = process.env.GNEWS_API_KEY;

  const queries = {
    war: 'war OR military conflict OR geopolitical crisis',
    lpg: 'LPG India OR cooking gas India OR LPG price India',
    concerts: 'concert cancelled Bengaluru OR event cancelled Bangalore OR show cancelled Karnataka'
  };

  const query = queries[category];
  if (!query) {
    return res.status(400).json({ error: 'Invalid category. Use: war, lpg, concerts' });
  }

  try {
    if (!apiKey || apiKey === 'your_gnews_api_key_here') {
      // Demo data
      const demoData = {
        war: {
          articles: [
            { title: 'Global tensions remain elevated amid ongoing conflicts', source: 'Google News', publishedAt: new Date().toISOString(), url: 'https://news.google.com/search?q=war%20military%20conflict', description: 'Multiple regions continue to see military activity...' },
            { title: 'Peace talks progress in Eastern Europe diplomatic efforts', source: 'Google News', publishedAt: new Date().toISOString(), url: 'https://news.google.com/search?q=peace%20talks%20Europe', description: 'Diplomatic channels remain active...' },
            { title: 'Middle East ceasefire negotiations enter new phase', source: 'Google News', publishedAt: new Date().toISOString(), url: 'https://news.google.com/search?q=Middle%20East%20ceasefire', description: 'International mediators push for resolution...' }
          ],
          risk_level: 'MEDIUM',
          note: 'Demo data - Add GNEWS_API_KEY to .env for live news'
        },
        lpg: {
          articles: [
            { title: 'LPG prices revised for April 2026 in India', source: 'Google News', publishedAt: new Date().toISOString(), url: 'https://news.google.com/search?q=LPG%20price%20India%202026', description: 'Government announces new LPG cylinder prices...' },
            { title: 'Subsidized LPG distribution reaches new milestone', source: 'Google News', publishedAt: new Date().toISOString(), url: 'https://news.google.com/search?q=LPG%20subsidy%20India', description: 'PM Ujjwala Yojana continues expansion...' },
            { title: 'Commercial LPG cylinder prices see adjustment', source: 'Google News', publishedAt: new Date().toISOString(), url: 'https://news.google.com/search?q=commercial%20LPG%20India', description: 'Commercial cylinder rates updated...' }
          ],
          risk_level: 'LOW',
          note: 'Demo data - Add GNEWS_API_KEY to .env for live news'
        },
        concerts: {
          articles: [
            { title: 'Several Bengaluru events rescheduled for April', source: 'Google News', publishedAt: new Date().toISOString(), url: 'https://news.google.com/search?q=Bengaluru%20events%20cancelled%20April%202026', description: 'Multiple event organizers adjust schedules...' },
            { title: 'Bengaluru nightlife and event scene update for March 2026', source: 'Google News', publishedAt: new Date().toISOString(), url: 'https://news.google.com/search?q=Bengaluru%20concert%20cancelled%20March%202026', description: 'The city entertainment landscape...' }
          ],
          risk_level: 'LOW',
          note: 'Demo data - Add GNEWS_API_KEY to .env for live news'
        }
      };
      return res.json(demoData[category]);
    }

    const response = await fetch(
      `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&max=5&apikey=${apiKey}`
    );
    const data = await response.json();

    const articles = (data.articles || []).map(a => ({
      title: a.title,
      source: a.source?.name || 'Unknown',
      publishedAt: a.publishedAt,
      url: a.url,
      description: a.description
    }));

    // Basic risk assessment based on article count and keywords
    let risk_level = 'LOW';
    const highRiskWords = ['crisis', 'war', 'attack', 'cancelled', 'banned', 'shortage', 'surge', 'hike'];
    const riskCount = articles.reduce((count, a) => {
      const text = (a.title + ' ' + a.description).toLowerCase();
      return count + highRiskWords.filter(w => text.includes(w)).length;
    }, 0);

    if (riskCount > 5) risk_level = 'HIGH';
    else if (riskCount > 2) risk_level = 'MEDIUM';

    res.json({ articles, risk_level });
  } catch (error) {
    console.error(`News API error (${category}):`, error.message);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// ============ SALES TRACKER ============
app.get('/api/sales', (req, res) => {
  res.json(salesData);
});

app.post('/api/sales', (req, res) => {
  const { type, amount } = req.body;
  if (!type || !['online', 'offline'].includes(type)) {
    return res.status(400).json({ error: 'Type must be "online" or "offline"' });
  }
  if (typeof amount !== 'number' || amount < 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }

  salesData[type].current = amount;
  salesData[type].history.push({
    amount,
    timestamp: new Date().toISOString()
  });

  res.json({ success: true, sales: salesData });
});

app.post('/api/sales/add', (req, res) => {
  const { type, amount } = req.body;
  if (!type || !['online', 'offline'].includes(type)) {
    return res.status(400).json({ error: 'Type must be "online" or "offline"' });
  }
  if (typeof amount !== 'number') {
    return res.status(400).json({ error: 'Amount must be a number' });
  }

  salesData[type].current += amount;
  salesData[type].history.push({
    amount: salesData[type].current,
    timestamp: new Date().toISOString()
  });

  res.json({ success: true, sales: salesData });
});

app.post('/api/sales/reset', (req, res) => {
  salesData = {
    online: { current: 0, target: 5000000, history: [] },
    offline: { current: 0, target: 1000000, history: [] }
  };
  res.json({ success: true, sales: salesData });
});

// ============ FINANCIAL TRACKER ============
app.get('/api/financial', (req, res) => {
  const onlineSales = salesData.online.current;
  const offlineSales = salesData.offline.current;
  const totalRevenue = onlineSales + offlineSales + financialData.sponsorEarnings;
  const totalCosts = financialData.artistCost + financialData.productionCost + financialData.marketingExpenses + financialData.flightExpenses;
  const netPnL = totalRevenue - totalCosts;
  const coverageRatio = totalCosts > 0 ? (totalRevenue / totalCosts) * 100 : 100;

  let risk_level = 'LOW';
  if (totalCosts > 0) {
    if (coverageRatio < 50) risk_level = 'HIGH';
    else if (coverageRatio < 80) risk_level = 'MEDIUM';
  }

  res.json({ ...financialData, onlineSales, offlineSales, totalRevenue, totalCosts, netPnL, coverageRatio, risk_level });
});

app.post('/api/financial', (req, res) => {
  const { field, amount } = req.body;
  const allowed = ['artistCost', 'productionCost', 'marketingExpenses', 'flightExpenses', 'sponsorEarnings'];
  if (!allowed.includes(field)) return res.status(400).json({ error: 'Invalid field' });
  if (typeof amount !== 'number' || amount < 0) return res.status(400).json({ error: 'Amount must be a positive number' });
  financialData[field] = amount;
  res.json({ success: true, financial: financialData });
});

// ============ FLIGHT FARE TREND ============
function buildRouteFares(basePrices) {
  // basePrices: { far, nearish, close, near, eventDay }
  const eventDate = new Date('2026-04-05');
  const fares = [];
  for (let i = -8; i <= 8; i++) {
    const d = new Date(eventDate);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const absDiff = Math.abs(i);
    let price;
    if (absDiff === 0) price = basePrices.eventDay;
    else if (absDiff === 1) price = basePrices.near;
    else if (absDiff === 2) price = basePrices.close;
    else if (absDiff <= 4) price = basePrices.nearish;
    else price = basePrices.far + Math.round(Math.random() * basePrices.farVariance);
    fares.push({ date: dateStr, price: Math.round(price), isEventDay: i === 0 });
  }
  const eventDayFare = fares.find(f => f.isEventDay).price;
  const avgFare = Math.round(fares.reduce((s, f) => s + f.price, 0) / fares.length);
  const surgeRatio = (eventDayFare / avgFare).toFixed(2);
  return { fares, eventDayFare, avgFare, surgeRatio };
}

app.get('/api/flights', (req, res) => {
  // GAU → BLR (Guwahati to Bengaluru): longer route, higher base fares
  const gauData = buildRouteFares({ far: 5500, farVariance: 1200, nearish: 7800, close: 10500, near: 13000, eventDay: 15500 });
  // BOM → BLR (Mumbai to Bengaluru): short route, lower base fares
  const bomData = buildRouteFares({ far: 3000, farVariance: 800, nearish: 4800, close: 7200, near: 9500, eventDay: 11800 });

  // Overall risk = worst of the two routes' surge ratios
  const maxSurge = Math.max(parseFloat(gauData.surgeRatio), parseFloat(bomData.surgeRatio));
  let risk_level = 'LOW';
  if (maxSurge > 2.5) risk_level = 'HIGH';
  else if (maxSurge > 1.8) risk_level = 'MEDIUM';

  res.json({
    routes: [
      { id: 'gau', label: 'GAU → BLR', origin: 'Guwahati', ...gauData },
      { id: 'bom', label: 'BOM → BLR', origin: 'Mumbai',   ...bomData }
    ],
    risk_level,
    note: 'Estimated fare trend — connect a Skyscanner/Amadeus API key for live data'
  });
});

// ============ OVERALL RISK SUMMARY (Weighted Algorithm) ============
// Weights: weather=20%, IN markets=8%, US markets=5%, Asian=4%, ME=3%,
//          commodities=5%, concerts=12%, sales=13%, financials=10%,
//          flights=5%, war=8%, lpg=4%, faretrend=3%
app.get('/api/risk-summary', async (req, res) => {
  try {
    const [weather, markets, warNews, lpgNews, concertNews, flights, financial] = await Promise.all([
      fetch(`http://localhost:${PORT}/api/weather`).then(r => r.json()).catch(() => ({ risk_level: 'UNKNOWN' })),
      fetch(`http://localhost:${PORT}/api/markets`).then(r => r.json()).catch(() => ({ risk_level: 'UNKNOWN', indian: [], us: [], asian: [], middleEast: [], commodities: [], asianRisk: 'UNKNOWN', meRisk: 'UNKNOWN', commodityRisk: 'UNKNOWN' })),
      fetch(`http://localhost:${PORT}/api/news/war`).then(r => r.json()).catch(() => ({ risk_level: 'UNKNOWN' })),
      fetch(`http://localhost:${PORT}/api/news/lpg`).then(r => r.json()).catch(() => ({ risk_level: 'UNKNOWN' })),
      fetch(`http://localhost:${PORT}/api/news/concerts`).then(r => r.json()).catch(() => ({ risk_level: 'UNKNOWN' })),
      fetch(`http://localhost:${PORT}/api/flights`).then(r => r.json()).catch(() => ({ risk_level: 'UNKNOWN' })),
      fetch(`http://localhost:${PORT}/api/financial`).then(r => r.json()).catch(() => ({ risk_level: 'UNKNOWN' }))
    ]);

    const rv = { LOW: 1, MEDIUM: 2, HIGH: 3, UNKNOWN: null };

    const inMarketRisk  = marketRisk(markets.indian || []);
    const usMarketRisk  = marketRisk(markets.us || []);
    const asianRisk     = markets.asianRisk || marketRisk(markets.asian || []);
    const meRisk        = markets.meRisk    || marketRisk(markets.middleEast || []);
    const commodityRisk = markets.commodityRisk || 'LOW';

    // Sales risk
    const daysToEvent = Math.max(0, Math.ceil((new Date('2026-04-05') - new Date()) / (1000 * 60 * 60 * 24)));
    const onlinePct = (salesData.online.current / salesData.online.target) * 100;
    const offlinePct = (salesData.offline.current / salesData.offline.target) * 100;
    let salesRisk = 'LOW';
    if (daysToEvent > 0) {
      const expectedPct = Math.min(100, ((30 - daysToEvent) / 30) * 100);
      if (onlinePct < expectedPct * 0.5 || offlinePct < expectedPct * 0.5) salesRisk = 'HIGH';
      else if (onlinePct < expectedPct * 0.75 || offlinePct < expectedPct * 0.75) salesRisk = 'MEDIUM';
    }

    // Weighted score
    const weighted = [
      { key: 'weather',    level: weather.risk_level,    w: 0.20 },
      { key: 'inMarkets',  level: inMarketRisk,           w: 0.08 },
      { key: 'usMarkets',  level: usMarketRisk,           w: 0.05 },
      { key: 'asian',      level: asianRisk,              w: 0.04 },
      { key: 'me',         level: meRisk,                 w: 0.03 },
      { key: 'commodities',level: commodityRisk,          w: 0.05 },
      { key: 'concerts',   level: concertNews.risk_level, w: 0.12 },
      { key: 'sales',      level: salesRisk,              w: 0.13 },
      { key: 'finance',    level: financial.risk_level,   w: 0.10 },
      { key: 'flights',    level: flights.risk_level,     w: 0.05 },
      { key: 'war',        level: warNews.risk_level,     w: 0.08 },
      { key: 'lpg',        level: lpgNews.risk_level,     w: 0.04 },
      { key: 'faretrend',  level: flights.risk_level,     w: 0.03 }
    ];

    let totalWeight = 0, weightedScore = 0;
    weighted.forEach(item => {
      const score = rv[item.level];
      if (score !== null) { weightedScore += score * item.w; totalWeight += item.w; }
    });
    const finalScore = totalWeight > 0 ? weightedScore / totalWeight : 1;
    const overall = finalScore > 2.2 ? 'HIGH' : finalScore > 1.5 ? 'MEDIUM' : 'LOW';

    res.json({
      overall,
      score: finalScore.toFixed(2),
      breakdown: {
        weather: weather.risk_level,
        inMarkets: inMarketRisk,
        usMarkets: usMarketRisk,
        asian: asianRisk,
        me: meRisk,
        commodities: commodityRisk,
        war: warNews.risk_level,
        lpg: lpgNews.risk_level,
        concerts: concertNews.risk_level,
        sales: salesRisk,
        finance: financial.risk_level,
        flights: flights.risk_level
      },
      daysToEvent
    });
  } catch (error) {
    console.error('Risk summary error:', error.message);
    res.status(500).json({ error: 'Failed to compute risk summary' });
  }
});

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🎯 ASOB Risk Dashboard running on http://localhost:${PORT}`);
  console.log(`📅 Event Date: April 5, 2026`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
});
