// ============ UTILITY FUNCTIONS ============
function formatINR(amount) {
  if (amount >= 10000000) return `${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `${(amount / 100000).toFixed(2)} L`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)} K`;
  return amount.toLocaleString('en-IN');
}

function formatINRFull(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

function setRiskBadge(elementId, level) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = level || '--';
  el.className = 'risk-badge small';
  if (level === 'LOW') el.classList.add('low');
  else if (level === 'MEDIUM') el.classList.add('medium');
  else if (level === 'HIGH') el.classList.add('high');
  else el.classList.add('unknown');
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ============ COUNTDOWN ============
function updateCountdown() {
  const eventDate = new Date('2026-04-05T00:00:00+05:30');
  const now = new Date();
  const diff = eventDate - now;
  if (diff <= 0) {
    document.getElementById('countdown').textContent = 'EVENT DAY!';
    return;
  }
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  document.getElementById('countdown').textContent = `${days}d ${hours}h ${minutes}m to Event`;
}

// ============ WEATHER ============
async function loadWeather() {
  try {
    const res = await fetch('/api/weather');
    const data = await res.json();
    setRiskBadge('weatherRisk', data.risk_level);

    let html = `
      <div class="weather-current">
        <img class="weather-icon" src="https://openweathermap.org/img/wn/${data.current.icon}@2x.png" alt="${data.current.description}">
        <div class="weather-temp">${data.current.temp}°C</div>
        <div class="weather-details">
          <div>${data.current.description}</div>
          <div>Feels like ${data.current.feels_like}°C</div>
          <div>Humidity: ${data.current.humidity}% | Wind: ${data.current.wind_speed} km/h</div>
        </div>
      </div>
      <div class="forecast-grid">
    `;
    data.forecast.forEach(day => {
      const isEventDay = day.date === '2026-04-05';
      html += `
        <div class="forecast-day ${isEventDay ? 'event-day' : ''}">
          <div class="forecast-date ${isEventDay ? 'event-label' : ''}">${isEventDay ? 'APR 5 EVENT' : formatDate(day.date)}</div>
          <img class="forecast-icon" src="https://openweathermap.org/img/wn/${day.icon}.png" alt="${day.description}">
          <div class="forecast-temp">${Math.round(day.temp_max)}°/${Math.round(day.temp_min)}°</div>
          <div class="forecast-rain">${day.rain_prob}% rain</div>
        </div>
      `;
    });
    html += '</div>';
    if (data.note) html += `<div class="demo-notice">${data.note}</div>`;
    document.getElementById('weatherBody').innerHTML = html;
  } catch (error) {
    document.getElementById('weatherBody').innerHTML = '<div class="loading">Failed to load weather data</div>';
  }
}

// ============ MARKETS ============
function renderMarketItems(items, locale = 'en-IN') {
  if (!items || !items.length) return '<div class="loading">No data</div>';
  return items.map(m => {
    const chg = parseFloat(m.change);
    const changeClass = chg > 0 ? 'positive' : chg < 0 ? 'negative' : 'neutral';
    const arrow = chg > 0 ? '▲' : chg < 0 ? '▼' : '—';
    const priceStr = m.price !== '--' ? parseFloat(m.price).toLocaleString(locale) : '--';
    const unit = m.unit ? ` <span class="market-unit">${m.unit}</span>` : '';
    return `
      <div class="market-item">
        <div class="market-name">${m.name}${unit}</div>
        <div>
          <div class="market-price ${changeClass}">${priceStr}</div>
          <div class="market-change ${changeClass}">${m.change !== '--' ? `${arrow} ${Math.abs(m.change)} (${m.changePercent}%)` : 'Unavailable'}</div>
        </div>
      </div>
    `;
  }).join('');
}

async function loadMarkets() {
  try {
    const res = await fetch('/api/markets');
    const data = await res.json();

    setRiskBadge('marketRisk',     data.risk_level);
    setRiskBadge('usMarketRisk',   data.risk_level);
    setRiskBadge('asianMarketRisk',data.asianRisk);
    setRiskBadge('meMarketRisk',   data.meRisk);
    setRiskBadge('commodityRisk',  data.commodityRisk);

    document.getElementById('indianMarketBody').innerHTML   = renderMarketItems(data.indian);
    document.getElementById('usMarketBody').innerHTML       = renderMarketItems(data.us, 'en-US');
    document.getElementById('asianMarketBody').innerHTML    = renderMarketItems(data.asian, 'en-US');
    document.getElementById('meMarketBody').innerHTML       = renderMarketItems(data.middleEast, 'en-US');
    document.getElementById('commoditiesBody').innerHTML    = renderMarketItems(data.commodities, 'en-US');
  } catch (error) {
    ['indianMarketBody','usMarketBody','asianMarketBody','meMarketBody','commoditiesBody'].forEach(id => {
      document.getElementById(id).innerHTML = '<div class="loading">Failed to load market data</div>';
    });
  }
}

// ============ FLIGHT FARE TREND ============
function renderRouteChart(route) {
  const maxPrice = Math.max(...route.fares.map(f => f.price));
  let html = `
    <div class="route-section">
      <div class="route-title">${route.label} <span class="route-origin">(from ${route.origin})</span></div>
      <div class="flight-summary">
        <div class="flight-stat">
          <span class="flight-stat-label">Event Day Fare</span>
          <span class="flight-stat-value surge">₹${route.eventDayFare.toLocaleString('en-IN')}</span>
        </div>
        <div class="flight-stat">
          <span class="flight-stat-label">Avg Fare</span>
          <span class="flight-stat-value">₹${route.avgFare.toLocaleString('en-IN')}</span>
        </div>
        <div class="flight-stat">
          <span class="flight-stat-label">Surge Ratio</span>
          <span class="flight-stat-value ${parseFloat(route.surgeRatio) > 1.8 ? 'surge' : ''}">${route.surgeRatio}x</span>
        </div>
      </div>
      <div class="fare-chart">
  `;
  route.fares.forEach(f => {
    const heightPct = Math.round((f.price / maxPrice) * 100);
    const barClass = f.isEventDay ? 'event-day-bar' : heightPct > 75 ? 'high-bar' : heightPct > 50 ? 'mid-bar' : 'low-bar';
    html += `
      <div class="fare-bar-wrapper ${f.isEventDay ? 'event-day-col' : ''}">
        <div class="fare-price-label">₹${(f.price / 1000).toFixed(1)}k</div>
        <div class="fare-bar-track">
          <div class="fare-bar ${barClass}" style="height: ${heightPct}%"></div>
        </div>
        <div class="fare-date-label">${formatDate(f.date)}</div>
      </div>
    `;
  });
  html += `</div></div>`;
  return html;
}

async function loadFlights() {
  try {
    const res = await fetch('/api/flights');
    const data = await res.json();
    setRiskBadge('flightRisk', data.risk_level);

    let html = `<div class="routes-container">`;
    data.routes.forEach(route => { html += renderRouteChart(route); });
    html += `</div>`;
    if (data.note) html += `<div class="demo-notice">${data.note}</div>`;
    document.getElementById('flightBody').innerHTML = html;
  } catch (error) {
    document.getElementById('flightBody').innerHTML = '<div class="loading">Failed to load flight data</div>';
  }
}

// ============ NEWS ============
async function loadNews(category, bodyId, riskId) {
  try {
    const res = await fetch(`/api/news/${category}`);
    const data = await res.json();
    setRiskBadge(riskId, data.risk_level);

    let html = '';
    if (data.articles && data.articles.length > 0) {
      data.articles.forEach(article => {
        const safeUrl = article.url && article.url !== '#' ? article.url : null;
        html += `
          <div class="news-item ${safeUrl ? 'news-item-link' : ''}" ${safeUrl ? `onclick="window.open('${safeUrl}', '_blank')"` : ''}>
            <div class="news-title">${article.title}</div>
            <div class="news-meta">
              <span>${article.source}</span>
              <span>${timeAgo(article.publishedAt)}</span>
              ${safeUrl ? '<span class="news-open">Open ↗</span>' : ''}
            </div>
            ${article.description ? `<div class="news-description">${article.description}</div>` : ''}
          </div>
        `;
      });
    } else {
      html = '<div class="loading">No recent news found</div>';
    }
    if (data.note) html += `<div class="demo-notice">${data.note}</div>`;
    document.getElementById(bodyId).innerHTML = html;
  } catch (error) {
    document.getElementById(bodyId).innerHTML = '<div class="loading">Failed to load news</div>';
  }
}

// ============ SALES ============
async function loadSales() {
  try {
    const res = await fetch('/api/sales');
    const data = await res.json();
    updateSalesUI(data);
  } catch (error) {
    console.error('Failed to load sales:', error);
  }
}

function updateSalesUI(data) {
  const onlinePct = Math.min((data.online.current / data.online.target) * 100, 100);
  document.getElementById('onlineAmount').textContent = formatINRFull(data.online.current);
  document.getElementById('onlineProgressBar').style.width = `${onlinePct}%`;
  document.getElementById('onlineProgressBar').className = `sales-progress-bar ${onlinePct < 30 ? 'danger' : onlinePct > 70 ? 'good' : ''}`;
  document.getElementById('onlinePercentage').textContent = `${onlinePct.toFixed(1)}% of target (${formatINR(data.online.target)})`;

  const offlinePct = Math.min((data.offline.current / data.offline.target) * 100, 100);
  document.getElementById('offlineAmount').textContent = formatINRFull(data.offline.current);
  document.getElementById('offlineProgressBar').style.width = `${offlinePct}%`;
  document.getElementById('offlineProgressBar').className = `sales-progress-bar ${offlinePct < 30 ? 'danger' : offlinePct > 70 ? 'good' : ''}`;
  document.getElementById('offlinePercentage').textContent = `${offlinePct.toFixed(1)}% of target (${formatINR(data.offline.target)})`;

  // Sales feed into P&L — refresh financial widget immediately
  loadFinancial();
}

async function setSales(type) {
  const inputId = type === 'online' ? 'onlineInput' : 'offlineInput';
  const amount = parseFloat(document.getElementById(inputId).value);
  if (isNaN(amount) || amount < 0) { alert('Please enter a valid positive amount'); return; }
  try {
    const res = await fetch('/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, amount }) });
    const data = await res.json();
    if (data.success) { updateSalesUI(data.sales); document.getElementById(inputId).value = ''; }
  } catch { alert('Failed to update sales'); }
}

async function addSales(type) {
  const inputId = type === 'online' ? 'onlineInput' : 'offlineInput';
  const amount = parseFloat(document.getElementById(inputId).value);
  if (isNaN(amount)) { alert('Please enter a valid amount'); return; }
  try {
    const res = await fetch('/api/sales/add', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, amount }) });
    const data = await res.json();
    if (data.success) { updateSalesUI(data.sales); document.getElementById(inputId).value = ''; }
  } catch { alert('Failed to update sales'); }
}

function editSales(type) {
  const label = type === 'online' ? 'Online' : 'Offline';
  const currentEl = document.getElementById(type === 'online' ? 'onlineAmount' : 'offlineAmount');
  const currentText = currentEl.textContent.replace(/[^0-9]/g, '');
  const newAmount = prompt(`Edit ${label} Sales Total (in rupees):`, currentText);
  if (newAmount !== null && newAmount !== '') {
    const amount = parseFloat(newAmount);
    if (!isNaN(amount) && amount >= 0) setSalesDirectly(type, amount);
    else alert('Please enter a valid positive number');
  }
}

async function setSalesDirectly(type, amount) {
  try {
    const res = await fetch('/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, amount }) });
    const data = await res.json();
    if (data.success) updateSalesUI(data.sales);
  } catch { alert('Failed to update sales'); }
}

async function resetSales(type) {
  const label = type === 'online' ? 'Online' : 'Offline';
  if (!confirm(`Reset ${label} Sales to zero? This cannot be undone.`)) return;
  try {
    const res = await fetch('/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, amount: 0 }) });
    const data = await res.json();
    if (data.success) updateSalesUI(data.sales);
  } catch { alert('Failed to reset sales'); }
}

// ============ FINANCIALS ============
async function loadFinancial() {
  try {
    const res = await fetch('/api/financial');
    const data = await res.json();
    updateFinancialUI(data);
  } catch (error) {
    console.error('Failed to load financial data:', error);
  }
}

function updateFinancialUI(data) {
  document.getElementById('artistCostAmount').textContent     = formatINRFull(data.artistCost);
  document.getElementById('productionCostAmount').textContent = formatINRFull(data.productionCost);
  document.getElementById('sponsorAmount').textContent        = formatINRFull(data.sponsorEarnings);
  document.getElementById('marketingAmount').textContent      = formatINRFull(data.marketingExpenses);
  document.getElementById('flightExpAmount').textContent      = formatINRFull(data.flightExpenses);
  setRiskBadge('financeRisk', data.risk_level);
  renderPnL(data);
}

function renderPnL(data) {
  const pnlColor = data.netPnL >= 0 ? 'income-color' : 'expense-color';
  const coverageBar = Math.min(data.coverageRatio, 100);
  const coverageClass = data.coverageRatio < 50 ? 'danger' : data.coverageRatio < 80 ? '' : 'good';
  document.getElementById('pnlBody').innerHTML = `
    <div class="pnl-grid">
      <div class="pnl-row pnl-sub">
        <span class="pnl-label">Online Sales</span>
        <span class="pnl-value income-color">${formatINRFull(data.onlineSales)}</span>
      </div>
      <div class="pnl-row pnl-sub">
        <span class="pnl-label">Offline Sales</span>
        <span class="pnl-value income-color">${formatINRFull(data.offlineSales)}</span>
      </div>
      <div class="pnl-row pnl-sub">
        <span class="pnl-label">Sponsor Earnings</span>
        <span class="pnl-value income-color">${formatINRFull(data.sponsorEarnings)}</span>
      </div>
      <div class="pnl-row pnl-section-total">
        <span class="pnl-label">Total Revenue</span>
        <span class="pnl-value income-color">${formatINRFull(data.totalRevenue)}</span>
      </div>
      <div class="pnl-divider"></div>
      <div class="pnl-row pnl-sub">
        <span class="pnl-label">Artist Cost</span>
        <span class="pnl-value expense-color">− ${formatINRFull(data.artistCost)}</span>
      </div>
      <div class="pnl-row pnl-sub">
        <span class="pnl-label">Production Cost</span>
        <span class="pnl-value expense-color">− ${formatINRFull(data.productionCost)}</span>
      </div>
      <div class="pnl-row pnl-sub">
        <span class="pnl-label">Marketing Expenses</span>
        <span class="pnl-value expense-color">− ${formatINRFull(data.marketingExpenses)}</span>
      </div>
      <div class="pnl-row pnl-sub">
        <span class="pnl-label">Flight Expenses</span>
        <span class="pnl-value expense-color">− ${formatINRFull(data.flightExpenses)}</span>
      </div>
      <div class="pnl-row pnl-section-total">
        <span class="pnl-label">Total Costs</span>
        <span class="pnl-value expense-color">− ${formatINRFull(data.totalCosts)}</span>
      </div>
      <div class="pnl-divider"></div>
      <div class="pnl-row pnl-total">
        <span class="pnl-label">Net P&amp;L</span>
        <span class="pnl-value ${pnlColor}">${data.netPnL >= 0 ? '+' : ''}${formatINRFull(data.netPnL)}</span>
      </div>
    </div>
    <div class="pnl-coverage">
      <div class="pnl-coverage-label">Cost Coverage: ${data.coverageRatio.toFixed(1)}%</div>
      <div class="sales-progress-container">
        <div class="sales-progress-bar ${coverageClass}" style="width: ${coverageBar}%"></div>
      </div>
    </div>
  `;
}

async function setFinancial(field) {
  const inputMap = { artistCost: 'artistCostInput', productionCost: 'productionCostInput', sponsorEarnings: 'sponsorInput', marketingExpenses: 'marketingInput', flightExpenses: 'flightExpInput' };
  const amount = parseFloat(document.getElementById(inputMap[field]).value);
  if (isNaN(amount) || amount < 0) { alert('Please enter a valid positive amount'); return; }
  try {
    const res = await fetch('/api/financial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ field, amount }) });
    const data = await res.json();
    if (data.success) {
      document.getElementById(inputMap[field]).value = '';
      await loadFinancial();
    }
  } catch { alert('Failed to update financial data'); }
}

function editFinancial(field, label) {
  const amountMap = { artistCost: 'artistCostAmount', productionCost: 'productionCostAmount', sponsorEarnings: 'sponsorAmount', marketingExpenses: 'marketingAmount', flightExpenses: 'flightExpAmount' };
  const currentText = document.getElementById(amountMap[field]).textContent.replace(/[^0-9]/g, '');
  const newAmount = prompt(`Edit ${label} (in rupees):`, currentText);
  if (newAmount !== null && newAmount !== '') {
    const amount = parseFloat(newAmount);
    if (!isNaN(amount) && amount >= 0) setFinancialDirectly(field, amount);
    else alert('Please enter a valid positive number');
  }
}

async function setFinancialDirectly(field, amount) {
  try {
    await fetch('/api/financial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ field, amount }) });
    await loadFinancial();
  } catch { alert('Failed to update financial data'); }
}

async function resetFinancial(field) {
  const labels = { artistCost: 'Artist Cost', productionCost: 'Production Cost', sponsorEarnings: 'Sponsor Earnings' };
  if (!confirm(`Reset ${labels[field]} to zero?`)) return;
  await setFinancialDirectly(field, 0);
}

// ============ OVERALL RISK ============
async function loadOverallRisk() {
  try {
    const res = await fetch('/api/risk-summary');
    const data = await res.json();

    const badge = document.getElementById('overallRiskBadge');
    badge.textContent = data.overall;
    badge.className = 'risk-badge';
    if (data.overall === 'LOW') badge.classList.add('low');
    else if (data.overall === 'MEDIUM') badge.classList.add('medium');
    else if (data.overall === 'HIGH') badge.classList.add('high');

    // Update risk breakdown bar
    setRiskBadge('rb-weather',  data.breakdown.weather);
    setRiskBadge('rb-markets',  data.breakdown.inMarkets);
    setRiskBadge('rb-us',       data.breakdown.usMarkets);
    setRiskBadge('rb-asian',    data.breakdown.asian);
    setRiskBadge('rb-me',       data.breakdown.me);
    setRiskBadge('rb-cmd',      data.breakdown.commodities);
    setRiskBadge('rb-flights',  data.breakdown.flights);
    setRiskBadge('rb-sales',    data.breakdown.sales);
    setRiskBadge('rb-finance',  data.breakdown.finance);
    setRiskBadge('rb-war',      data.breakdown.war);
    setRiskBadge('rb-lpg',      data.breakdown.lpg);
    setRiskBadge('rb-concerts', data.breakdown.concerts);
  } catch (error) {
    console.error('Failed to load risk summary:', error);
  }
}

// ============ REFRESH ALL ============
async function refreshAll() {
  document.getElementById('lastUpdated').textContent = 'Refreshing...';
  await Promise.all([
    loadWeather(),
    loadMarkets(),
    loadFlights(),
    loadNews('war', 'warBody', 'warRisk'),
    loadNews('lpg', 'lpgBody', 'lpgRisk'),
    loadNews('concerts', 'concertBody', 'concertRisk'),
    loadSales(),
    loadFinancial()
  ]);
  await loadOverallRisk();
  document.getElementById('lastUpdated').textContent = `Last updated: ${new Date().toLocaleTimeString('en-IN')}`;
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', () => {
  updateCountdown();
  setInterval(updateCountdown, 60000);
  refreshAll();
  setInterval(refreshAll, 5 * 60 * 1000);
});
