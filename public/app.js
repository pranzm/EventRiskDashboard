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
  el.textContent = level;
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

    if (data.note) {
      html += `<div class="demo-notice">${data.note}</div>`;
    }

    document.getElementById('weatherBody').innerHTML = html;
  } catch (error) {
    document.getElementById('weatherBody').innerHTML = '<div class="loading">Failed to load weather data</div>';
  }
}

// ============ MARKETS ============
async function loadMarkets() {
  try {
    const res = await fetch('/api/markets');
    const data = await res.json();

    setRiskBadge('marketRisk', data.risk_level);
    setRiskBadge('usMarketRisk', data.risk_level);

    // Indian markets
    let indianHtml = '';
    data.indian.forEach(m => {
      const changeClass = parseFloat(m.change) >= 0 ? 'positive' : parseFloat(m.change) < 0 ? 'negative' : 'neutral';
      const arrow = parseFloat(m.change) >= 0 ? '&#9650;' : '&#9660;';
      indianHtml += `
        <div class="market-item">
          <div class="market-name">${m.name}</div>
          <div>
            <div class="market-price ${changeClass}">${m.price !== '--' ? parseFloat(m.price).toLocaleString('en-IN') : '--'}</div>
            <div class="market-change ${changeClass}">${m.change !== '--' ? `${arrow} ${m.change} (${m.changePercent}%)` : 'Unavailable'}</div>
          </div>
        </div>
      `;
    });
    document.getElementById('indianMarketBody').innerHTML = indianHtml || '<div class="loading">No data</div>';

    // US markets
    let usHtml = '';
    data.us.forEach(m => {
      const changeClass = parseFloat(m.change) >= 0 ? 'positive' : parseFloat(m.change) < 0 ? 'negative' : 'neutral';
      const arrow = parseFloat(m.change) >= 0 ? '&#9650;' : '&#9660;';
      usHtml += `
        <div class="market-item">
          <div class="market-name">${m.name}</div>
          <div>
            <div class="market-price ${changeClass}">${m.price !== '--' ? parseFloat(m.price).toLocaleString('en-US') : '--'}</div>
            <div class="market-change ${changeClass}">${m.change !== '--' ? `${arrow} ${m.change} (${m.changePercent}%)` : 'Unavailable'}</div>
          </div>
        </div>
      `;
    });
    document.getElementById('usMarketBody').innerHTML = usHtml || '<div class="loading">No data</div>';
  } catch (error) {
    document.getElementById('indianMarketBody').innerHTML = '<div class="loading">Failed to load market data</div>';
    document.getElementById('usMarketBody').innerHTML = '<div class="loading">Failed to load market data</div>';
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

    if (data.note) {
      html += `<div class="demo-notice">${data.note}</div>`;
    }

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
  // Online
  const onlinePct = Math.min((data.online.current / data.online.target) * 100, 100);
  document.getElementById('onlineAmount').textContent = formatINRFull(data.online.current);
  document.getElementById('onlineProgressBar').style.width = `${onlinePct}%`;
  document.getElementById('onlineProgressBar').className = `sales-progress-bar ${onlinePct < 30 ? 'danger' : onlinePct > 70 ? 'good' : ''}`;
  document.getElementById('onlinePercentage').textContent = `${onlinePct.toFixed(1)}% of target (${formatINR(data.online.target)})`;

  // Offline
  const offlinePct = Math.min((data.offline.current / data.offline.target) * 100, 100);
  document.getElementById('offlineAmount').textContent = formatINRFull(data.offline.current);
  document.getElementById('offlineProgressBar').style.width = `${offlinePct}%`;
  document.getElementById('offlineProgressBar').className = `sales-progress-bar ${offlinePct < 30 ? 'danger' : offlinePct > 70 ? 'good' : ''}`;
  document.getElementById('offlinePercentage').textContent = `${offlinePct.toFixed(1)}% of target (${formatINR(data.offline.target)})`;
}

async function setSales(type) {
  const inputId = type === 'online' ? 'onlineInput' : 'offlineInput';
  const amount = parseFloat(document.getElementById(inputId).value);
  if (isNaN(amount) || amount < 0) {
    alert('Please enter a valid positive amount');
    return;
  }

  try {
    const res = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, amount })
    });
    const data = await res.json();
    if (data.success) {
      updateSalesUI(data.sales);
      document.getElementById(inputId).value = '';
    }
  } catch (error) {
    alert('Failed to update sales');
  }
}

async function addSales(type) {
  const inputId = type === 'online' ? 'onlineInput' : 'offlineInput';
  const amount = parseFloat(document.getElementById(inputId).value);
  if (isNaN(amount)) {
    alert('Please enter a valid amount');
    return;
  }

  try {
    const res = await fetch('/api/sales/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, amount })
    });
    const data = await res.json();
    if (data.success) {
      updateSalesUI(data.sales);
      document.getElementById(inputId).value = '';
    }
  } catch (error) {
    alert('Failed to update sales');
  }
}

function editSales(type) {
  const label = type === 'online' ? 'Online' : 'Offline';
  const currentEl = document.getElementById(type === 'online' ? 'onlineAmount' : 'offlineAmount');
  const currentText = currentEl.textContent.replace(/[^0-9]/g, '');
  const newAmount = prompt(`Edit ${label} Sales Total (in rupees):`, currentText);
  if (newAmount !== null && newAmount !== '') {
    const amount = parseFloat(newAmount);
    if (!isNaN(amount) && amount >= 0) {
      setSalesDirectly(type, amount);
    } else {
      alert('Please enter a valid positive number');
    }
  }
}

async function setSalesDirectly(type, amount) {
  try {
    const res = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, amount })
    });
    const data = await res.json();
    if (data.success) {
      updateSalesUI(data.sales);
    }
  } catch (error) {
    alert('Failed to update sales');
  }
}

async function resetSales(type) {
  const label = type === 'online' ? 'Online' : 'Offline';
  if (!confirm(`Reset ${label} Sales to zero? This cannot be undone.`)) return;

  try {
    const res = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, amount: 0 })
    });
    const data = await res.json();
    if (data.success) {
      updateSalesUI(data.sales);
    }
  } catch (error) {
    alert('Failed to reset sales');
  }
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
    loadNews('war', 'warBody', 'warRisk'),
    loadNews('lpg', 'lpgBody', 'lpgRisk'),
    loadNews('concerts', 'concertBody', 'concertRisk'),
    loadSales()
  ]);

  // Load risk summary after other data is loaded
  await loadOverallRisk();

  document.getElementById('lastUpdated').textContent = `Last updated: ${new Date().toLocaleTimeString('en-IN')}`;
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', () => {
  updateCountdown();
  setInterval(updateCountdown, 60000);

  refreshAll();

  // Auto-refresh every 5 minutes
  setInterval(refreshAll, 5 * 60 * 1000);
});
