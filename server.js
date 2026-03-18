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
app.get('/api/markets', async (req, res) => {
  try {
    // Use Yahoo Finance API via public endpoint
    const symbols = [
      { symbol: '^NSEI', name: 'NIFTY 50', market: 'IN' },
      { symbol: '^BSESN', name: 'SENSEX', market: 'IN' },
      { symbol: '^DJI', name: 'DOW JONES', market: 'US' },
      { symbol: '^GSPC', name: 'S&P 500', market: 'US' },
      { symbol: '^IXIC', name: 'NASDAQ', market: 'US' }
    ];

    const results = await Promise.all(
      symbols.map(async (s) => {
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
            return {
              ...s,
              price: price.toFixed(2),
              change: change.toFixed(2),
              changePercent: changePercent.toFixed(2),
              status: 'live'
            };
          }
          throw new Error('No data');
        } catch {
          return { ...s, price: '--', change: '--', changePercent: '--', status: 'unavailable' };
        }
      })
    );

    const indianMarket = results.filter(r => r.market === 'IN');
    const usMarket = results.filter(r => r.market === 'US');

    // Market risk assessment
    const avgChange = results
      .filter(r => r.status === 'live')
      .reduce((sum, r) => sum + parseFloat(r.changePercent || 0), 0) / (results.filter(r => r.status === 'live').length || 1);

    let risk_level = 'LOW';
    if (avgChange < -2) risk_level = 'HIGH';
    else if (avgChange < -0.5) risk_level = 'MEDIUM';

    res.json({ indian: indianMarket, us: usMarket, risk_level });
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
            { title: 'Global tensions remain elevated amid ongoing conflicts', source: 'Demo', publishedAt: new Date().toISOString(), url: '#', description: 'Multiple regions continue to see military activity...' },
            { title: 'Peace talks progress in Eastern Europe diplomatic efforts', source: 'Demo', publishedAt: new Date().toISOString(), url: '#', description: 'Diplomatic channels remain active...' },
            { title: 'Middle East ceasefire negotiations enter new phase', source: 'Demo', publishedAt: new Date().toISOString(), url: '#', description: 'International mediators push for resolution...' }
          ],
          risk_level: 'MEDIUM',
          note: 'Demo data - Add GNEWS_API_KEY to .env for live news'
        },
        lpg: {
          articles: [
            { title: 'LPG prices revised for April 2026 in India', source: 'Demo', publishedAt: new Date().toISOString(), url: '#', description: 'Government announces new LPG cylinder prices...' },
            { title: 'Subsidized LPG distribution reaches new milestone', source: 'Demo', publishedAt: new Date().toISOString(), url: '#', description: 'PM Ujjwala Yojana continues expansion...' },
            { title: 'Commercial LPG cylinder prices see adjustment', source: 'Demo', publishedAt: new Date().toISOString(), url: '#', description: 'Commercial cylinder rates updated...' }
          ],
          risk_level: 'LOW',
          note: 'Demo data - Add GNEWS_API_KEY to .env for live news'
        },
        concerts: {
          articles: [
            { title: 'Several Bengaluru events rescheduled for April', source: 'Demo', publishedAt: new Date().toISOString(), url: '#', description: 'Multiple event organizers adjust schedules...' },
            { title: 'Bengaluru nightlife and event scene update for March 2026', source: 'Demo', publishedAt: new Date().toISOString(), url: '#', description: 'The city entertainment landscape...' }
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

// ============ OVERALL RISK SUMMARY ============
app.get('/api/risk-summary', async (req, res) => {
  try {
    // Aggregate risk from all sources
    const [weather, markets, warNews, lpgNews, concertNews] = await Promise.all([
      fetch(`http://localhost:${PORT}/api/weather`).then(r => r.json()).catch(() => ({ risk_level: 'UNKNOWN' })),
      fetch(`http://localhost:${PORT}/api/markets`).then(r => r.json()).catch(() => ({ risk_level: 'UNKNOWN' })),
      fetch(`http://localhost:${PORT}/api/news/war`).then(r => r.json()).catch(() => ({ risk_level: 'UNKNOWN' })),
      fetch(`http://localhost:${PORT}/api/news/lpg`).then(r => r.json()).catch(() => ({ risk_level: 'UNKNOWN' })),
      fetch(`http://localhost:${PORT}/api/news/concerts`).then(r => r.json()).catch(() => ({ risk_level: 'UNKNOWN' }))
    ]);

    const riskValues = { LOW: 1, MEDIUM: 2, HIGH: 3, UNKNOWN: 0 };
    const risks = [weather.risk_level, markets.risk_level, warNews.risk_level, lpgNews.risk_level, concertNews.risk_level];
    const avgRisk = risks.reduce((sum, r) => sum + (riskValues[r] || 0), 0) / risks.filter(r => r !== 'UNKNOWN').length;

    // Sales risk
    const onlinePct = (salesData.online.current / salesData.online.target) * 100;
    const offlinePct = (salesData.offline.current / salesData.offline.target) * 100;
    const daysToEvent = Math.ceil((new Date('2026-04-05') - new Date()) / (1000 * 60 * 60 * 24));
    let salesRisk = 'LOW';
    if (daysToEvent > 0) {
      const expectedPct = ((30 - daysToEvent) / 30) * 100; // assume 30-day sales window
      if (onlinePct < expectedPct * 0.5 || offlinePct < expectedPct * 0.5) salesRisk = 'HIGH';
      else if (onlinePct < expectedPct * 0.75 || offlinePct < expectedPct * 0.75) salesRisk = 'MEDIUM';
    }

    let overall = 'LOW';
    if (avgRisk > 2.2 || salesRisk === 'HIGH') overall = 'HIGH';
    else if (avgRisk > 1.5 || salesRisk === 'MEDIUM') overall = 'MEDIUM';

    res.json({
      overall,
      breakdown: {
        weather: weather.risk_level,
        markets: markets.risk_level,
        war: warNews.risk_level,
        lpg: lpgNews.risk_level,
        concerts: concertNews.risk_level,
        sales: salesRisk
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
