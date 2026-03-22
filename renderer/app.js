// ═══════════════════════════════════════════
//  AEGIS — JARVIS-style HUD Shell
// ═══════════════════════════════════════════

(() => {
  // ─── Activity state ───
  let activityLevel = 0;
  let decayTimer;
  const activityBar = document.getElementById('activity-bar');
  const statusText = document.getElementById('status-text');
  const linkStatus = document.getElementById('link-status');

  function pulseActivity() {
    activityLevel = Math.min(100, activityLevel + 8);
    activityBar.style.width = activityLevel + '%';
    statusText.textContent = 'ACTIVE';
    linkStatus.textContent = 'CONNECTED';
    linkStatus.classList.add('online');
    clearTimeout(decayTimer);
    decayTimer = setTimeout(decayActivity, 300);
  }

  function decayActivity() {
    activityLevel = Math.max(0, activityLevel - 2);
    activityBar.style.width = activityLevel + '%';
    if (activityLevel <= 0) statusText.textContent = 'STANDBY';
    if (activityLevel > 0) decayTimer = setTimeout(decayActivity, 50);
  }

  // ─── Terminal Setup ───
  try {
    const TerminalCtor = window.Terminal?.Terminal || window.Terminal;
    const FitAddonCtor = window.FitAddon?.FitAddon || window.FitAddon;
    if (!TerminalCtor) throw new Error('Terminal constructor not found');

    const term = new TerminalCtor({
      fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', Consolas, monospace",
      fontSize: 14, lineHeight: 1.3,
      cursorBlink: true, cursorStyle: 'bar', cursorWidth: 2,
      theme: {
        background: 'transparent', foreground: '#b0bec5',
        cursor: '#00e5ff', cursorAccent: '#0a0e17',
        selectionBackground: '#00e5ff33', selectionForeground: '#ffffff',
        black: '#0a0e17', red: '#ff1744', green: '#00e676', yellow: '#ffea00',
        blue: '#448aff', magenta: '#e040fb', cyan: '#00e5ff', white: '#b0bec5',
        brightBlack: '#37474f', brightRed: '#ff5252', brightGreen: '#69f0ae',
        brightYellow: '#ffff00', brightBlue: '#82b1ff', brightMagenta: '#ea80fc',
        brightCyan: '#18ffff', brightWhite: '#eceff1',
      },
      allowTransparency: true, scrollback: 5000, convertEol: true,
    });

    const fitAddon = FitAddonCtor ? new FitAddonCtor() : null;
    if (fitAddon) term.loadAddon(fitAddon);

    const termEl = document.getElementById('terminal');
    term.open(termEl);
    if (fitAddon) fitAddon.fit();

    window.aegis.onData((data) => {
      term.write(data);
      pulseActivity();
      parseTerminalData(data);
    });
    window.aegis.onExit((code) => {
      term.write(`\r\n\x1b[38;2;0;229;255m[AEGIS]\x1b[0m Session ended (code ${code}). Press any key to close.\r\n`);
      term.onKey(() => window.aegis.close());
    });
    term.onData((data) => window.aegis.sendInput(data));
    term.onResize(({ cols, rows }) => window.aegis.resize(cols, rows));

    const ro = new ResizeObserver(() => {
      if (fitAddon) {
        fitAddon.fit();
        window.aegis.resize(term.cols, term.rows);
      }
    });
    ro.observe(termEl);
    // Fit and sync PTY size after layout settles
    setTimeout(() => {
      if (fitAddon) fitAddon.fit();
      term.focus();
      // Send actual terminal dimensions to PTY
      window.aegis.resize(term.cols, term.rows);
    }, 300);
    // Also re-sync on every resize
    setTimeout(() => {
      if (fitAddon) fitAddon.fit();
      window.aegis.resize(term.cols, term.rows);
    }, 1000);

    // Click anywhere on terminal container to focus
    document.getElementById('terminal-container').addEventListener('click', () => term.focus());
    // Also focus on window focus
    window.addEventListener('focus', () => term.focus());

    console.log('[AEGIS] Terminal initialized');
  } catch (err) {
    console.error('[AEGIS] Terminal init failed:', err);
    document.getElementById('terminal').innerHTML =
      `<div style="color:#ff1744;padding:20px;font-family:monospace;">[AEGIS] Terminal failed: ${err.message}</div>`;
  }

  // ─── Window Controls ───
  document.getElementById('btn-min').addEventListener('click', () => window.aegis.minimize());
  document.getElementById('btn-max').addEventListener('click', () => window.aegis.maximize());
  document.getElementById('btn-close').addEventListener('click', () => window.aegis.close());

  // ─── Opacity toggle ───
  let darkMode = false;
  const opacityBtn = document.getElementById('btn-opacity');

  // ─── Voice toggle ───
  const voiceBtn = document.getElementById('btn-voice');
  voiceBtn.addEventListener('click', () => {
    window.aegis.sendInput('/voice\n');
  });

  opacityBtn.addEventListener('click', () => {
    darkMode = !darkMode;
    document.body.classList.toggle('dark-mode', darkMode);
    opacityBtn.title = darkMode ? 'Switch to transparent mode' : 'Switch to dark mode';
  });

  // ─── Terminal data parsing (tokens, cost, model, voice) ───
  const tokensEl = document.getElementById('tokens');
  const modelEl = document.getElementById('model');
  const voiceStatusEl = document.getElementById('voice-status');
  let voiceActive = false;
  let sessionCost = null;
  let totalCharsReceived = 0;
  // Rough estimate: ~4 chars per token for English
  const CHARS_PER_TOKEN = 4;

  function parseTerminalData(data) {
    totalCharsReceived += data.length;

    // Strip ANSI escape codes for pattern matching
    const clean = data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');

    // Cost pattern — Claude Code shows "$X.XX" in status
    const costMatch = clean.match(/\$(\d+\.\d{2,4})/);
    if (costMatch) {
      sessionCost = costMatch[1];
    }

    // Model detection
    const modelMatch = clean.match(/(?:claude-|model[:\s]+)(opus|sonnet|haiku|claude-[a-z0-9.-]+)/i);
    if (modelMatch) {
      const m = modelMatch[1].toUpperCase();
      modelEl.textContent = m.length > 10 ? m.substring(0, 10) : m;
    }

    // Voice mode detection
    if (clean.includes('Voice mode') || clean.includes('listening') || clean.includes('Recording')) {
      voiceActive = true;
      voiceStatusEl.textContent = 'ACTIVE';
      voiceStatusEl.classList.add('online');
    }
    if (clean.includes('Voice mode off') || clean.includes('stopped listening')) {
      voiceActive = false;
      voiceStatusEl.textContent = 'READY';
      voiceStatusEl.classList.remove('online');
    }

    // Update token estimate display
    const estimatedTokens = Math.round(totalCharsReceived / CHARS_PER_TOKEN);
    if (estimatedTokens > 1000) {
      tokensEl.textContent = (estimatedTokens / 1000).toFixed(1) + 'K';
    } else {
      tokensEl.textContent = String(estimatedTokens);
    }
  }

  // ─── Uptime ───
  const startTime = Date.now();
  const uptimeEl = document.getElementById('uptime');
  setInterval(() => {
    const e = Date.now() - startTime;
    uptimeEl.textContent =
      `${String(Math.floor(e/3600000)).padStart(2,'0')}:${String(Math.floor((e%3600000)/60000)).padStart(2,'0')}:${String(Math.floor((e%60000)/1000)).padStart(2,'0')}`;
  }, 1000);

  // ═══════════════════════════════════════════
  //  WEATHER (Open-Meteo, free, no API key)
  // ═══════════════════════════════════════════

  let weather = null;
  let weatherLocation = '';
  let weatherError = null;

  const WMO_CODES = {
    0: 'Clear', 1: 'Mostly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
    45: 'Foggy', 48: 'Rime Fog',
    51: 'Light Drizzle', 53: 'Drizzle', 55: 'Heavy Drizzle',
    61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain',
    71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow',
    77: 'Snow Grains', 80: 'Light Showers', 81: 'Showers', 82: 'Heavy Showers',
    85: 'Light Snow Showers', 86: 'Snow Showers',
    95: 'Thunderstorm', 96: 'Thunderstorm + Hail', 99: 'Severe Thunderstorm',
  };

  async function fetchWeather(lat, lon) {
    try {
      // Get location name via reverse geocode
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`);
      if (geoRes.ok) {
        const geo = await geoRes.json();
        weatherLocation = geo.address?.city || geo.address?.town || geo.address?.village || geo.address?.county || '';
      }

      // Get weather
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,surface_pressure&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      weather = await res.json();
      console.log('[AEGIS] Weather loaded:', weatherLocation, weather.current);
    } catch (err) {
      weatherError = err.message;
      console.error('[AEGIS] Weather fetch failed:', err);
    }
  }

  // Try browser geolocation, fall back to IP-based
  function initWeather() {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
        () => ipFallback(),
        { timeout: 5000 }
      );
    } else {
      ipFallback();
    }
  }

  async function ipFallback() {
    try {
      const res = await fetch('https://ipapi.co/json/');
      if (!res.ok) throw new Error('IP lookup failed');
      const data = await res.json();
      fetchWeather(data.latitude, data.longitude);
    } catch (err) {
      weatherError = 'Location unavailable';
      console.error('[AEGIS] IP fallback failed:', err);
    }
  }

  initWeather();
  // Refresh weather every 15 minutes
  setInterval(() => initWeather(), 15 * 60 * 1000);

  // ═══════════════════════════════════════════
  //  HUD CANVAS
  // ═══════════════════════════════════════════

  const C = document.getElementById('hud-canvas');
  const ctx = C.getContext('2d');

  function resize() { C.width = window.innerWidth; C.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);

  const CYAN = [0, 229, 255];
  const BLUE = [30, 136, 229];

  function rgba(color, a) { return `rgba(${color[0]},${color[1]},${color[2]},${a})`; }

  // ─── Ring cluster: group of concentric arcs at a position ───
  function drawCluster(time, cx, cy, maxR, config) {
    const pulse = 0.8 + (activityLevel / 100) * 0.2;
    const breathe = 0.9 + Math.sin(time * 0.0015) * 0.1;

    config.forEach((ring) => {
      const r = maxR * ring.rFrac;
      const rot = time * ring.speed;
      const a = ring.alpha * pulse * breathe;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);

      // Main arcs
      ctx.strokeStyle = rgba(ring.color || CYAN, a);
      ctx.lineWidth = ring.width;
      ctx.shadowColor = rgba(ring.color || CYAN, a * 0.7);
      ctx.shadowBlur = ring.glow || 10;

      const segAngle = (Math.PI * 2) / ring.segs;
      for (let s = 0; s < ring.segs; s++) {
        ctx.beginPath();
        ctx.arc(0, 0, r, s * segAngle + ring.gap, (s + 1) * segAngle - ring.gap);
        ctx.stroke();
      }

      // Tick marks
      if (ring.ticks) {
        ctx.strokeStyle = rgba(ring.color || CYAN, a * 0.4);
        ctx.lineWidth = 1;
        ctx.shadowBlur = 3;
        const tickAngle = (Math.PI * 2) / ring.ticks;
        for (let t = 0; t < ring.ticks; t++) {
          const angle = t * tickAngle;
          const len = ring.tickLen || 5;
          ctx.beginPath();
          ctx.moveTo(Math.cos(angle) * (r - len), Math.sin(angle) * (r - len));
          ctx.lineTo(Math.cos(angle) * (r + len), Math.sin(angle) * (r + len));
          ctx.stroke();
        }
      }

      ctx.restore();
    });

    ctx.shadowBlur = 0;
  }

  // ─── Dark backing panel for readability on transparent bg ───
  function drawBackingPanel(x, y, w, h, alpha) {
    ctx.fillStyle = `rgba(6, 10, 16, ${alpha || 0.7})`;
    ctx.strokeStyle = rgba(CYAN, 0.15);
    ctx.lineWidth = 1;
    const r = 4;
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // ─── Data readout decoration ───
  function drawDataLine(x, y, w, label, value, alpha) {
    ctx.font = '9px Consolas, monospace';
    ctx.fillStyle = rgba(CYAN, alpha * 0.6);
    ctx.fillText(label, x, y);
    ctx.fillStyle = rgba(CYAN, alpha);
    ctx.fillText(value, x + w * 0.55, y);

    ctx.strokeStyle = rgba(CYAN, alpha * 0.2);
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(x, y + 3); ctx.lineTo(x + w, y + 3); ctx.stroke();
  }

  // ─── Horizontal scan lines (subtle) ───
  function drawScanLines(ctx, w, h, time) {
    const scanY = (time * 0.05) % h;
    const grad = ctx.createLinearGradient(0, scanY - 20, 0, scanY + 20);
    grad.addColorStop(0, 'rgba(0, 229, 255, 0)');
    grad.addColorStop(0.5, 'rgba(0, 229, 255, 0.03)');
    grad.addColorStop(1, 'rgba(0, 229, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, scanY - 20, w, 40);
  }

  // ─── Grid ───
  function drawGrid(time) {
    ctx.strokeStyle = rgba(CYAN, 0.02);
    ctx.lineWidth = 0.5;
    const sp = 50;
    for (let x = (time * 0.008) % sp; x < C.width; x += sp) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, C.height); ctx.stroke();
    }
    for (let y = (time * 0.006) % sp; y < C.height; y += sp) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(C.width, y); ctx.stroke();
    }
  }

  // ─── Particles ───
  const particles = [];
  for (let i = 0; i < 50; i++) {
    particles.push({
      x: Math.random() * 2000, y: Math.random() * 1200,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
      size: Math.random() * 1.5 + 0.5, alpha: Math.random() * 0.3 + 0.08,
    });
  }

  function drawParticles() {
    particles.forEach((p) => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = C.width; if (p.x > C.width) p.x = 0;
      if (p.y < 0) p.y = C.height; if (p.y > C.height) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = rgba(CYAN, p.alpha);
      ctx.fill();
    });
  }

  // ─── Date & Time display (JARVIS-style) ───
  function drawDateTime(x, y, alpha) {
    const now = new Date();
    const months = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
    const days = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];

    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const day = now.getDate();
    const month = months[now.getMonth()];
    const dayName = days[now.getDay()];

    // Big time
    ctx.font = 'bold 28px Consolas, monospace';
    ctx.fillStyle = rgba(CYAN, alpha);
    ctx.shadowColor = rgba(CYAN, alpha * 0.5);
    ctx.shadowBlur = 10;
    ctx.fillText(timeStr, x, y);
    ctx.shadowBlur = 0;

    // Date below
    ctx.font = '10px Consolas, monospace';
    ctx.fillStyle = rgba(CYAN, alpha * 0.6);
    ctx.fillText(`${dayName}`, x, y + 16);
    ctx.fillStyle = rgba(CYAN, alpha * 0.8);
    ctx.fillText(`${day} ${month} ${now.getFullYear()}`, x, y + 30);
  }

  // ─── Weather display ───
  function drawWeather(x, y, alpha) {
    if (!weather || !weather.current) {
      ctx.font = '9px Consolas, monospace';
      ctx.fillStyle = rgba(CYAN, alpha * 0.4);
      ctx.fillText(weatherError || 'LOCATING...', x, y);
      return;
    }

    const cur = weather.current;
    const temp = Math.round(cur.temperature_2m);
    const condition = WMO_CODES[cur.weather_code] || 'Unknown';
    const humidity = cur.relative_humidity_2m;
    const wind = Math.round(cur.wind_speed_10m);
    const pressure = Math.round(cur.surface_pressure);

    // Location
    if (weatherLocation) {
      ctx.font = '9px Consolas, monospace';
      ctx.fillStyle = rgba(CYAN, alpha * 0.5);
      ctx.fillText(weatherLocation.toUpperCase(), x, y);
    }

    // Temperature (big)
    ctx.font = 'bold 22px Consolas, monospace';
    ctx.fillStyle = rgba(CYAN, alpha);
    ctx.shadowColor = rgba(CYAN, alpha * 0.4);
    ctx.shadowBlur = 8;
    ctx.fillText(`${temp}°C`, x, y + 22);
    ctx.shadowBlur = 0;

    // Condition
    ctx.font = '10px Consolas, monospace';
    ctx.fillStyle = rgba(CYAN, alpha * 0.7);
    ctx.fillText(condition.toUpperCase(), x, y + 36);

    // Details
    ctx.font = '9px Consolas, monospace';
    const detailY = y + 52;
    ctx.fillStyle = rgba(CYAN, alpha * 0.5);
    ctx.fillText('HUMIDITY', x, detailY);
    ctx.fillStyle = rgba(CYAN, alpha * 0.8);
    ctx.fillText(`${humidity}%`, x + 65, detailY);

    ctx.fillStyle = rgba(CYAN, alpha * 0.5);
    ctx.fillText('WIND', x, detailY + 14);
    ctx.fillStyle = rgba(CYAN, alpha * 0.8);
    ctx.fillText(`${wind} km/h`, x + 65, detailY + 14);

    ctx.fillStyle = rgba(CYAN, alpha * 0.5);
    ctx.fillText('PRESSURE', x, detailY + 28);
    ctx.fillStyle = rgba(CYAN, alpha * 0.8);
    ctx.fillText(`${pressure} hPa`, x + 65, detailY + 28);
  }

  // ─── Corner bracket decorations ───
  function drawBrackets(w, h) {
    const s = 35, o = 15, a = 0.4;
    ctx.strokeStyle = rgba(CYAN, a);
    ctx.lineWidth = 2;
    ctx.shadowColor = rgba(CYAN, 0.5);
    ctx.shadowBlur = 8;

    ctx.beginPath(); ctx.moveTo(o, o+s); ctx.lineTo(o, o); ctx.lineTo(o+s, o); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w-o-s, o); ctx.lineTo(w-o, o); ctx.lineTo(w-o, o+s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(o, h-o-s); ctx.lineTo(o, h-o); ctx.lineTo(o+s, h-o); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w-o-s, h-o); ctx.lineTo(w-o, h-o); ctx.lineTo(w-o, h-o-s); ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // ─── Mini bar chart decoration ───
  function drawMiniChart(x, y, w, h, time, alpha) {
    const bars = 12;
    const barW = w / bars - 2;
    for (let i = 0; i < bars; i++) {
      const barH = (Math.sin(time * 0.003 + i * 0.5) * 0.5 + 0.5) * h * (0.3 + (activityLevel/100) * 0.7);
      ctx.fillStyle = rgba(CYAN, alpha * (0.3 + (barH / h) * 0.5));
      ctx.fillRect(x + i * (barW + 2), y + h - barH, barW, barH);
    }
  }

  // ─── Circular progress arc ───
  function drawProgressArc(cx, cy, r, progress, time, alpha) {
    // Background ring
    ctx.strokeStyle = rgba(CYAN, alpha * 0.15);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();

    // Progress
    ctx.strokeStyle = rgba(CYAN, alpha * 0.8);
    ctx.lineWidth = 3;
    ctx.shadowColor = rgba(CYAN, alpha * 0.6);
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI/2, -Math.PI/2 + (Math.PI * 2 * progress));
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Center text
    ctx.font = 'bold 10px Consolas, monospace';
    ctx.fillStyle = rgba(CYAN, alpha * 0.9);
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(progress * 100) + '%', cx, cy + 4);
    ctx.textAlign = 'start';
  }

  // Waveform
  const waveCanvas = document.getElementById('waveform-canvas');
  const waveCtx = waveCanvas.getContext('2d');

  function resizeWave() {
    waveCanvas.width = waveCanvas.parentElement.clientWidth;
    waveCanvas.height = waveCanvas.parentElement.clientHeight;
  }
  resizeWave();
  window.addEventListener('resize', resizeWave);

  function drawWaveform(time) {
    const w = waveCanvas.width, h = waveCanvas.height;
    waveCtx.clearRect(0, 0, w, h);
    const voiceBoost = voiceActive ? 2.5 : 1;
    const amp = (4 + (activityLevel / 100) * 12) * voiceBoost;
    const spd = time * 0.003;

    // Draw 3 layered waves
    [0.7, 1, 0.5].forEach((intensity, idx) => {
      waveCtx.beginPath();
      waveCtx.moveTo(0, h/2);
      const phase = idx * 1.2;
      for (let x = 0; x < w; x++) {
        const y = h/2 +
          Math.sin(x * 0.02 + spd + phase) * amp * intensity +
          Math.sin(x * 0.05 + spd * 1.3 + phase) * amp * 0.3 * intensity;
        waveCtx.lineTo(x, y);
      }
      const grad = waveCtx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, rgba(CYAN, 0));
      grad.addColorStop(0.3, rgba(CYAN, 0.3 * intensity));
      grad.addColorStop(0.5, rgba(CYAN, 0.6 * intensity));
      grad.addColorStop(0.7, rgba(CYAN, 0.3 * intensity));
      grad.addColorStop(1, rgba(CYAN, 0));
      waveCtx.strokeStyle = grad;
      waveCtx.lineWidth = 2 * intensity;
      waveCtx.shadowColor = rgba(CYAN, 0.4 * intensity);
      waveCtx.shadowBlur = 6;
      waveCtx.stroke();
    });
    waveCtx.shadowBlur = 0;
  }

  // ═══════════════════════════════════════════
  //  CLUSTER CONFIGURATIONS
  // ═══════════════════════════════════════════

  // Top-left cluster (large, prominent)
  const clusterTL = [
    { rFrac: 1,    segs: 6,  gap: 0.12, width: 3,   speed: 0.0004,  alpha: 0.7,  glow: 15, ticks: 24, tickLen: 6 },
    { rFrac: 0.85, segs: 8,  gap: 0.08, width: 2,   speed: -0.0003, alpha: 0.5,  glow: 10, ticks: 32, tickLen: 4 },
    { rFrac: 0.7,  segs: 4,  gap: 0.2,  width: 2.5, speed: 0.0006,  alpha: 0.6,  glow: 12 },
    { rFrac: 0.55, segs: 12, gap: 0.04, width: 1,   speed: -0.0005, alpha: 0.35, glow: 6 },
    { rFrac: 0.4,  segs: 3,  gap: 0.3,  width: 2,   speed: 0.0008,  alpha: 0.5,  glow: 10 },
  ];

  // Bottom-right cluster (medium)
  const clusterBR = [
    { rFrac: 1,    segs: 5,  gap: 0.15, width: 2.5, speed: -0.0005, alpha: 0.6,  glow: 12, ticks: 20, tickLen: 5 },
    { rFrac: 0.8,  segs: 10, gap: 0.06, width: 1.5, speed: 0.0004,  alpha: 0.4,  glow: 8 },
    { rFrac: 0.6,  segs: 4,  gap: 0.2,  width: 2,   speed: -0.0007, alpha: 0.55, glow: 10 },
    { rFrac: 0.4,  segs: 6,  gap: 0.1,  width: 1.5, speed: 0.0009,  alpha: 0.45, glow: 8 },
  ];

  // Top-right cluster (small, data-focused)
  const clusterTR = [
    { rFrac: 1,    segs: 8,  gap: 0.08, width: 2,   speed: 0.0006,  alpha: 0.5,  glow: 10, color: BLUE },
    { rFrac: 0.75, segs: 4,  gap: 0.2,  width: 2,   speed: -0.0004, alpha: 0.45, glow: 8,  color: BLUE },
    { rFrac: 0.5,  segs: 6,  gap: 0.1,  width: 1.5, speed: 0.0008,  alpha: 0.5,  glow: 8 },
  ];

  // Bottom-left cluster (small accent)
  const clusterBL = [
    { rFrac: 1,    segs: 3,  gap: 0.25, width: 2.5, speed: -0.0004, alpha: 0.55, glow: 12 },
    { rFrac: 0.7,  segs: 6,  gap: 0.1,  width: 1.5, speed: 0.0006,  alpha: 0.4,  glow: 8 },
    { rFrac: 0.45, segs: 8,  gap: 0.05, width: 1,   speed: -0.0008, alpha: 0.35, glow: 6,  color: BLUE },
  ];

  // ═══════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════

  function render(time) {
    const w = C.width, h = C.height;
    ctx.clearRect(0, 0, w, h);

    // Dark mode: solid background. Transparent mode: desktop shows through
    if (darkMode) {
      const bg = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, w * 0.7);
      bg.addColorStop(0, '#0d1520');
      bg.addColorStop(1, '#060a10');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
    }

    drawGrid(time);
    drawScanLines(ctx, w, h, time);
    drawParticles();

    // Ring clusters — positioned in the exposed areas around the terminal
    // Terminal occupies roughly x:172 to w-172, y:48 to h-52
    drawCluster(time, 85,  110, 75,  clusterTL);   // Top-left (in left panel area)
    drawCluster(time, w-85, h-80, 65, clusterBR);  // Bottom-right
    drawCluster(time, w-85, 130, 50,  clusterTR);   // Top-right (near session panel)
    drawCluster(time, 85,  h-80, 50,  clusterBL);   // Bottom-left

    // Date & Time — bottom-left area
    const dataAlpha = 0.6 + (activityLevel / 100) * 0.4;
    drawBackingPanel(10, h - 195, 160, 55, 0.75);
    drawDateTime(18, h - 178, dataAlpha);

    // Weather — bottom-right area
    drawBackingPanel(w - 158, h - 195, 150, weather?.current ? 105 : 30, 0.75);
    drawWeather(w - 148, h - 183, dataAlpha);

    // Data readouts — left side below panel
    drawBackingPanel(10, 232, 150, 110, 0.75);
    drawDataLine(18, 250, 130, 'FREQ', '2.41 GHz', dataAlpha);
    drawDataLine(18, 268, 130, 'LOAD', Math.round(activityLevel) + '%', dataAlpha);
    drawDataLine(18, 286, 130, 'PROC', 'NOMINAL', dataAlpha);
    drawDataLine(18, 304, 130, 'LATENCY', '12ms', dataAlpha);
    drawDataLine(18, 322, 130, 'BUFFER', '64KB', dataAlpha);

    // Data readouts — right side below panel
    drawBackingPanel(w - 158, 232, 150, 82, 0.75);
    drawDataLine(w - 148, 250, 130, 'MEMORY', '2.1GB', dataAlpha);
    drawDataLine(w - 148, 268, 130, 'CONTEXT', '128K', dataAlpha);
    drawDataLine(w - 148, 286, 130, 'STREAM', 'ACTIVE', dataAlpha);
    drawDataLine(w - 148, 304, 130, 'COST', sessionCost ? '$' + sessionCost : '--', dataAlpha);

    // Mini bar chart — left side
    drawBackingPanel(10, 348, 150, 50, 0.75);
    drawMiniChart(18, 352, 130, 40, time, dataAlpha * 0.7);

    // Progress arc — right side
    drawBackingPanel(w - 115, 325, 65, 65, 0.75);
    const progress = (Math.sin(time * 0.001) * 0.5 + 0.5);
    drawProgressArc(w - 83, 358, 22, progress, time, dataAlpha);

    // Corner brackets
    drawBrackets(w, h);

    drawWaveform(time);
    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
  console.log('[AEGIS] HUD initialized');
  setTimeout(() => { statusText.textContent = 'READY'; }, 1500);
})();
