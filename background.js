// AuthentiScan Background Service Worker v2.1

const API_BASE = 'https://npfrbebwjzohlkgkscwi.supabase.co/functions/v1';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZnJiZWJ3anpvaGxrZ2tzY3dpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NTIwMTUsImV4cCI6MjA5MTUyODAxNX0.hnEardFBVKUsVzqrMyQqyY-urKZZIFiXqQ-jwTU-QKo';

// Initialize storage on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    sessionStats: { totalScanned: 0, aiDetected: 0, verified: 0, flagged: 0, suspicious: [], videosAnalyzed: 0, deepfakesDetected: 0 },
    bookmarks: [],
    settings: { tier: 'free', autoScan: true, showBadges: true },
    feedbackLog: []
  });

  chrome.contextMenus.create({
    id: 'authentiscan-analyze',
    title: 'AuthentiScan: Analyze this content',
    contexts: ['selection', 'link']
  });
});

// Context menu
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'authentiscan-analyze') {
    const text = info.selectionText || info.linkUrl || '';
    if (text && tab?.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'analyzeSelection', text });
    }
  }
});

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'analyze':
      handleAnalysis(message.text, message.context).then(sendResponse);
      return true;

    case 'getStats':
      chrome.storage.local.get('sessionStats', (data) => sendResponse(data.sessionStats));
      return true;

    case 'bookmark':
      handleBookmark(message.data).then(sendResponse);
      return true;

    case 'getBookmarks':
      chrome.storage.local.get('bookmarks', (data) => sendResponse(data.bookmarks || []));
      return true;

    case 'removeBookmark':
      removeBookmark(message.id).then(sendResponse);
      return true;

    case 'feedback':
      handleFeedback(message.data).then(sendResponse);
      return true;

    case 'getSettings':
      chrome.storage.local.get('settings', (data) => sendResponse(data.settings));
      return true;

    case 'updateSettings':
      chrome.storage.local.set({ settings: message.settings }, () => sendResponse({ ok: true }));
      return true;

    case 'videoAnalyzed':
      handleVideoStats(message.data).then(sendResponse);
      return true;

    case 'captureTab':
      chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 85 }, (dataUrl) => {
        sendResponse({ dataUrl });
      });
      return true;
  }
});

// ==================== Video Stats ====================
async function handleVideoStats(data) {
  const { sessionStats } = await chrome.storage.local.get('sessionStats');
  const stats = sessionStats || { totalScanned: 0, aiDetected: 0, verified: 0, flagged: 0, suspicious: [], videosAnalyzed: 0, deepfakesDetected: 0 };
  stats.videosAnalyzed = (stats.videosAnalyzed || 0) + 1;
  if (data.label === 'Likely Deepfake') {
    stats.deepfakesDetected = (stats.deepfakesDetected || 0) + 1;
    stats.flagged++;
    stats.suspicious.unshift({ text: `Deepfake detected (${data.confidence}%)`, score: data.confidence, time: Date.now() });
    stats.suspicious = stats.suspicious.slice(0, 20);
  }
  await chrome.storage.local.set({ sessionStats: stats });
  return { ok: true };
}

// ==================== AI-Powered Text Analysis ====================
async function handleAnalysis(text, context = {}) {
  let aiResult;

  try {
    // Call AI edge function for text analysis
    const resp = await fetch(`${API_BASE}/analyze-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ text: text.substring(0, 3000) }),
    });

    if (resp.ok) {
      aiResult = await resp.json();
    } else {
      console.error('AI text analysis failed:', resp.status);
      // Fall back to local heuristics
      aiResult = null;
    }
  } catch (err) {
    console.error('AI text analysis error:', err);
    aiResult = null;
  }

  // Use AI result or fall back to local heuristics
  const ai = aiResult?.aiDetection || detectAIContentLocal(text);
  const verification = aiResult?.verification || simulateVerificationLocal(text);

  const result = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    timestamp: new Date().toISOString(),
    textSnippet: text.substring(0, 200),
    aiDetection: ai,
    verification,
    context
  };

  // Update stats
  const { sessionStats } = await chrome.storage.local.get('sessionStats');
  const stats = sessionStats || { totalScanned: 0, aiDetected: 0, verified: 0, flagged: 0, suspicious: [], videosAnalyzed: 0, deepfakesDetected: 0 };
  stats.totalScanned++;
  if (ai.label === 'Likely AI-Generated') stats.aiDetected++;
  if (verification.label?.includes('✅')) stats.verified++;
  if (ai.confidence >= 60 || verification.label?.includes('❌')) {
    stats.flagged++;
    stats.suspicious.unshift({ text: text.substring(0, 80), score: ai.confidence, time: Date.now() });
    stats.suspicious = stats.suspicious.slice(0, 20);
  }
  await chrome.storage.local.set({ sessionStats: stats });

  return result;
}

// ==================== Local Fallback Detection ====================
function detectAIContentLocal(text) {
  if (!text || text.length < 20) return { label: 'Uncertain', confidence: 0, reasons: ['Text too short to analyze'] };

  let score = 0;
  const reasons = [];

  const words = text.split(/\s+/);
  const avgWordLen = words.reduce((s, w) => s + w.length, 0) / Math.max(words.length, 1);
  if (avgWordLen > 5.5) { score += 15; reasons.push('Unusually high average word length'); }

  const sentences = text.split(/[.!?]+/).filter(Boolean);
  const avgSentLen = sentences.reduce((s, se) => s + se.split(/\s+/).length, 0) / Math.max(sentences.length, 1);
  if (avgSentLen > 20 && avgSentLen < 30) { score += 10; reasons.push('Uniform sentence length typical of AI'); }

  const aiPhrases = ['it is important to note', 'in conclusion', 'it\'s worth mentioning', 'here are some', 'let me explain', 'as an ai', 'certainly!', 'absolutely!', 'great question', 'in today\'s world', 'in this article', 'dive into', 'delve into', 'crucial', 'landscape', 'comprehensive', 'streamline', 'leverage', 'multifaceted', 'navigate the complexities'];
  const lower = text.toLowerCase();
  const matched = aiPhrases.filter(p => lower.includes(p));
  score += matched.length * 12;
  if (matched.length > 0) reasons.push(`AI-typical phrases: "${matched.slice(0, 3).join('", "')}"`);

  const uniqueRatio = new Set(words.map(w => w.toLowerCase())).size / Math.max(words.length, 1);
  if (uniqueRatio < 0.5) { score += 15; reasons.push('High word repetition rate'); }

  const contractions = ["don't", "can't", "won't", "it's", "i'm", "we're", "they're", "shouldn't", "wouldn't", "couldn't"];
  if (!contractions.some(c => lower.includes(c)) && text.length > 200) { score += 10; reasons.push('No contractions — formal AI style'); }

  score = Math.min(score, 95);
  const label = score >= 60 ? 'Likely AI-Generated' : score >= 30 ? 'Uncertain' : 'Likely Human';
  if (reasons.length === 0) reasons.push('No strong AI indicators detected');

  return { label, confidence: score, reasons };
}

function simulateVerificationLocal(text) {
  const claims = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 15)
    .filter(s => /\b(breaking|confirmed|reported|according to|sources say|just happened|shocking|exposed|revealed|discovered|announced|official)\b/i.test(s))
    .slice(0, 5);

  if (claims.length === 0) {
    return { label: 'ℹ️ No factual claims to verify', claims: [], details: 'No specific factual claims found to cross-check. (Local fallback — AI analysis unavailable)' };
  }

  return { label: '⚠️ Some claims unverifiable', claims, details: 'Claims detected but could not be verified via AI. (Local fallback)' };
}

async function handleBookmark(data) {
  const { bookmarks } = await chrome.storage.local.get('bookmarks');
  const list = bookmarks || [];
  list.unshift({ ...data, savedAt: new Date().toISOString() });
  await chrome.storage.local.set({ bookmarks: list.slice(0, 100) });
  return { ok: true };
}

async function removeBookmark(id) {
  const { bookmarks } = await chrome.storage.local.get('bookmarks');
  await chrome.storage.local.set({ bookmarks: (bookmarks || []).filter(b => b.id !== id) });
  return { ok: true };
}

async function handleFeedback(data) {
  const { feedbackLog } = await chrome.storage.local.get('feedbackLog');
  const log = feedbackLog || [];
  log.unshift({ ...data, timestamp: new Date().toISOString() });
  await chrome.storage.local.set({ feedbackLog: log.slice(0, 500) });
  return { ok: true };
}
