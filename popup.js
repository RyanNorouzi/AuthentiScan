// ==================== Tab Switching ====================
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

// ==================== Capture Actions ====================
async function sendToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) return;

  // Cannot inject into chrome://, edge://, about:, or chrome-extension:// pages
  if (/^(chrome|edge|about|chrome-extension|brave):\/\//i.test(tab.url)) {
    alert('AuthentiScan cannot run on this page. Please navigate to a regular website first.');
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
    await new Promise(r => setTimeout(r, 200));
  }

  await chrome.tabs.sendMessage(tab.id, message);
  window.close();
}

// Focus chips toggle
document.querySelectorAll('.focus-chip').forEach(chip => {
  chip.addEventListener('click', () => chip.classList.toggle('active'));
});

function getAnalysisHints() {
  const activeFocuses = [...document.querySelectorAll('.focus-chip.active')].map(c => c.dataset.focus);
  const notes = document.getElementById('focusNotes')?.value?.trim() || '';
  return { focuses: activeFocuses, notes };
}

// Video Recording
document.getElementById('recordFullBtn').addEventListener('click', () => {
  const link = document.getElementById('videoLinkInput')?.value?.trim() || '';
  const hints = getAnalysisHints();
  sendToActiveTab({ action: 'startCapture', mode: 'recordFull', videoLink: link, analysisHints: hints });
});

document.getElementById('recordAreaBtn').addEventListener('click', () => {
  const link = document.getElementById('videoLinkInput')?.value?.trim() || '';
  const hints = getAnalysisHints();
  sendToActiveTab({ action: 'startCapture', mode: 'recordArea', videoLink: link, analysisHints: hints });
});

// Screenshots
document.getElementById('screenshotFullBtn').addEventListener('click', () => {
  sendToActiveTab({ action: 'startCapture', mode: 'screenshotFull' });
});

document.getElementById('screenshotAreaBtn').addEventListener('click', () => {
  sendToActiveTab({ action: 'startCapture', mode: 'screenshotArea' });
});

// ==================== Text Analysis ====================
document.getElementById('analyzeBtn').addEventListener('click', () => {
  const text = document.getElementById('manualInput').value.trim();
  if (!text) return;

  const btn = document.getElementById('analyzeBtn');
  btn.disabled = true;
  btn.textContent = 'Analyzing...';

  chrome.runtime.sendMessage({ action: 'analyze', text, context: { source: 'manual' } }, (result) => {
    btn.disabled = false;
    btn.textContent = 'Analyze Text';
    if (!result) return;

    const el = document.getElementById('manualResult');
    el.classList.remove('hidden');

    const ai = result.aiDetection || {};
    const ver = result.verification || {};
    const confidence = ai.confidence || 0;

    const labelClass = confidence >= 60 ? 'danger' : confidence >= 30 ? 'warning' : 'success';
    const verdictIcon = confidence >= 60 ? 'ALERT' : confidence >= 30 ? 'WARN' : 'OK';
    const verdictColor = confidence >= 60 ? '#f87171' : confidence >= 30 ? '#fbbf24' : '#34d399';

    const confBar = `<div style="margin:10px 0;background:#1e293b;border-radius:8px;height:8px;overflow:hidden">
      <div style="width:${confidence}%;height:100%;background:${verdictColor};border-radius:8px;transition:width 0.5s"></div>
    </div>`;

    const reasonsHtml = (ai.reasons || []).map(r => `<div style="padding:4px 0;border-bottom:1px solid rgba(100,116,139,0.15);font-size:11px;color:#94a3b8">${r}</div>`).join('');

    const claimsHtml = (ver.claims || []).length > 0
      ? `<div style="margin-top:6px;font-size:10px;color:#64748b">${ver.claims.join('<br>')}</div>`
      : '';

    const news = result.newsCrossCheck;
    const newsHtml = news ? `
      <div style="background:rgba(15,23,42,0.5);border:1px solid rgba(250,204,21,0.15);border-radius:10px;padding:10px;margin-top:10px">
        <div style="font-size:11px;font-weight:700;color:#facc15;margin-bottom:6px">📰 News Cross-Check</div>
        <div style="font-size:12px;font-weight:600;color:#e2e8f0;margin-bottom:4px">${news.label || 'N/A'}</div>
        <div style="font-size:10px;color:#64748b;line-height:1.5">${news.details || ''}</div>
        ${(news.matchedArticles || []).length > 0 ? `<div style="margin-top:6px;font-size:10px;color:#94a3b8">${news.matchedArticles.map(a => `• ${a}`).join('<br>')}</div>` : ''}
      </div>` : '';

    el.innerHTML = `
      <div style="background:linear-gradient(135deg,rgba(103,232,249,0.08),rgba(103,232,249,0.02));border:1px solid rgba(103,232,249,0.15);border-radius:12px;padding:14px;margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-size:14px;font-weight:800;color:${verdictColor}">${verdictIcon} — ${ai.label || 'Unknown'}</span>
          <span style="background:${verdictColor}22;color:${verdictColor};padding:2px 10px;border-radius:10px;font-size:12px;font-weight:700">${confidence}%</span>
        </div>
        ${confBar}
        <div style="font-size:10px;color:#64748b">Confidence Level</div>
      </div>

      <div style="background:rgba(15,23,42,0.5);border:1px solid rgba(100,116,139,0.1);border-radius:10px;padding:10px;margin-bottom:10px">
        <div style="font-size:11px;font-weight:700;color:#67e8f9;margin-bottom:6px">Detection Reasons</div>
        ${reasonsHtml || '<div style="font-size:11px;color:#475569">No specific indicators found</div>'}
      </div>

      <div style="background:rgba(15,23,42,0.5);border:1px solid rgba(100,116,139,0.1);border-radius:10px;padding:10px">
        <div style="font-size:11px;font-weight:700;color:#67e8f9;margin-bottom:6px">Verification</div>
        <div style="font-size:12px;font-weight:600;color:#e2e8f0;margin-bottom:4px">${ver.label || 'N/A'}</div>
        <div style="font-size:10px;color:#64748b;line-height:1.5">${ver.details || ''}</div>
        ${claimsHtml}
      </div>
      ${newsHtml}
    `;

    loadStats();
  });
});

// ==================== Stats ====================
function loadStats() {
  chrome.runtime.sendMessage({ action: 'getStats' }, (stats) => {
    if (!stats) return;
    document.getElementById('totalScanned').textContent = stats.totalScanned || 0;
    document.getElementById('aiDetected').textContent = stats.aiDetected || 0;
    document.getElementById('verified').textContent = stats.verified || 0;
    document.getElementById('flagged').textContent = stats.flagged || 0;
    document.getElementById('videosAnalyzed').textContent = stats.videosAnalyzed || 0;
    document.getElementById('deepfakesDetected').textContent = stats.deepfakesDetected || 0;

    const pct = stats.totalScanned > 0 ? Math.round((stats.aiDetected / stats.totalScanned) * 100) : 0;
    document.getElementById('aiPercent').textContent = pct + '%';
    document.getElementById('aiPercentBar').style.width = pct + '%';

    const list = document.getElementById('suspiciousList');
    if (stats.suspicious?.length > 0) {
      list.innerHTML = stats.suspicious.slice(0, 5).map(s => `
        <div class="suspicious-item">
          <span class="suspicious-text">${escapeHtml(s.text)}</span>
          <span class="suspicious-score">${s.score}%</span>
        </div>
      `).join('');
    }
  });
}

// ==================== Settings ====================
function loadSettings() {
  chrome.runtime.sendMessage({ action: 'getSettings' }, (settings) => {
    if (!settings) return;
    document.getElementById('autoScan').checked = settings.autoScan !== false;
    document.getElementById('showBadges').checked = settings.showBadges !== false;
  });
}

['autoScan', 'showBadges'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    const settings = {
      autoScan: document.getElementById('autoScan').checked,
      showBadges: document.getElementById('showBadges').checked,
      tier: document.getElementById('tierBadge').textContent.toLowerCase()
    };
    chrome.runtime.sendMessage({ action: 'updateSettings', settings });
  });
});

document.getElementById('resetBtn').addEventListener('click', () => {
  if (confirm('Reset all AuthentiScan data? This cannot be undone.')) {
    chrome.storage.local.set({
      sessionStats: { totalScanned: 0, aiDetected: 0, verified: 0, flagged: 0, suspicious: [], videosAnalyzed: 0, deepfakesDetected: 0 },
      bookmarks: [],
      feedbackLog: []
    }, () => { loadStats(); });
  }
});

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ==================== Theme Toggle ====================
const themeCheckbox = document.getElementById('themeCheckbox');
chrome.storage.local.get('theme', ({ theme }) => {
  if (theme === 'light') {
    document.body.classList.add('light');
    themeCheckbox.checked = true;
  }
});
themeCheckbox.addEventListener('change', () => {
  const isLight = themeCheckbox.checked;
  document.body.classList.toggle('light', isLight);
  chrome.storage.local.set({ theme: isLight ? 'light' : 'dark' });
});

// ==================== Init ====================
loadStats();
loadSettings();