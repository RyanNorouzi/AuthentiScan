// AuthentiScan Content Script v2.1
(function () {
  if (window.__authentiscan_v2) return;
  window.__authentiscan_v2 = true;
  let videoLink = '';

  const API_BASE = 'https://npfrbebwjzohlkgkscwi.supabase.co/functions/v1';
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZnJiZWJ3anpvaGxrZ2tzY3dpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NTIwMTUsImV4cCI6MjA5MTUyODAxNX0.hnEardFBVKUsVzqrMyQqyY-urKZZIFiXqQ-jwTU-QKo';

  // ==================== MESSAGE HANDLER ====================
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'ping') {
      sendResponse({ ok: true });
      return;
    }
    if (msg.action === 'startCapture') {
      videoLink = msg.videoLink || '';
      window.__authentiscan_hints = msg.analysisHints || null;
      handleCapture(msg.mode);
      sendResponse({ ok: true });
      return;
    }
    if (msg.action === 'analyzeSelection' && msg.text) {
      chrome.runtime.sendMessage({ action: 'analyze', text: msg.text, context: { url: location.href } }, (result) => {
        if (result) showFloatingTextResult(result);
      });
    }
  });

  // ==================== CAPTURE ROUTER ====================
  function handleCapture(mode) {
    console.log('[AuthentiScan] handleCapture:', mode);
    switch (mode) {
      case 'recordFull': startRecording(); break;
      case 'recordArea': startAreaSelection('record'); break;
      case 'screenshotFull': captureScreenshot(); break;
      case 'screenshotArea': startAreaSelection('screenshot'); break;
    }
  }

  // ==================== AREA SELECTION ====================
  function startAreaSelection(purpose) {
    removeElement('.authentiscan-area-overlay');
    removeElement('.authentiscan-area-instructions');
    removeElement('.authentiscan-area-selection');

    const overlay = document.createElement('div');
    overlay.className = 'authentiscan-area-overlay';

    const instructions = document.createElement('div');
    instructions.className = 'authentiscan-area-instructions';
    instructions.textContent = purpose === 'record'
      ? 'Click and drag to select recording area. Press ESC to cancel.'
      : 'Click and drag to select screenshot area. Press ESC to cancel.';

    let startX = 0;
    let startY = 0;
    let selBox = null;
    let isSelecting = false;

    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      startX = e.clientX;
      startY = e.clientY;
      isSelecting = true;
      if (selBox) selBox.remove();
      selBox = document.createElement('div');
      selBox.className = 'authentiscan-area-selection';
      selBox.style.cssText = `left:${startX}px;top:${startY}px;width:0;height:0;`;
      document.body.appendChild(selBox);
    };

    const onMouseMove = (e) => {
      if (!isSelecting || !selBox) return;
      e.preventDefault();
      e.stopPropagation();
      const x = Math.min(e.clientX, startX);
      const y = Math.min(e.clientY, startY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);
      selBox.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
    };

    const onMouseUp = (e) => {
      if (!isSelecting || !selBox) return;
      e.preventDefault();
      e.stopPropagation();
      const x = Math.min(e.clientX, startX);
      const y = Math.min(e.clientY, startY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);

      cleanup();
      if (w < 20 || h < 20) return;

      const cropArea = { x, y, w, h, devicePixelRatio: window.devicePixelRatio };
      if (purpose === 'record') startRecording(cropArea);
      else captureScreenshot(cropArea);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') cleanup();
    };

    function cleanup() {
      isSelecting = false;
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('mouseup', onMouseUp, true);
      document.removeEventListener('keydown', onKeyDown, true);
      overlay.remove();
      instructions.remove();
      if (selBox) selBox.remove();
      selBox = null;
    }

    document.body.appendChild(overlay);
    document.body.appendChild(instructions);
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mouseup', onMouseUp, true);
    document.addEventListener('keydown', onKeyDown, true);
  }

  // ==================== SCREEN RECORDING ====================
  let activeRecorder = null;
  let recordingTimer = null;
  let recordingSeconds = 0;
  let capturedFrames = [];
  let frameInterval = null;

  async function startRecording(cropArea) {
    showNotification('Requesting screen access...');

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 5 },
        audio: false
      });

      removeElement('.authentiscan-notification');
      recordingSeconds = 0;
      capturedFrames = [];

      const videoTrack = stream.getVideoTracks()[0];
      const trackSettings = videoTrack.getSettings();
      const srcW = trackSettings.width || 1280;
      const srcH = trackSettings.height || 720;

      const captureCanvas = document.createElement('canvas');
      const maxW = 512;
      const scale = Math.min(1, maxW / srcW);
      captureCanvas.width = srcW * scale;
      captureCanvas.height = srcH * scale;
      const captureCtx = captureCanvas.getContext('2d');

      const liveVideo = document.createElement('video');
      liveVideo.srcObject = stream;
      liveVideo.muted = true;
      liveVideo.playsInline = true;
      liveVideo.play();

      function grabFrame() {
        if (capturedFrames.length >= 4) return;
        try {
          if (cropArea) {
            const dpr = cropArea.devicePixelRatio || 1;
            const scaleX = srcW / window.screen.width;
            const scaleY = srcH / window.screen.height;
            const cw = Math.min(512, cropArea.w * dpr);
            const ch = (cropArea.h / cropArea.w) * cw;
            captureCanvas.width = cw;
            captureCanvas.height = ch;
            captureCtx.drawImage(liveVideo,
              cropArea.x * scaleX, cropArea.y * scaleY,
              cropArea.w * scaleX, cropArea.h * scaleY,
              0, 0, cw, ch
            );
          } else {
            captureCtx.drawImage(liveVideo, 0, 0, captureCanvas.width, captureCanvas.height);
          }
          const dataUrl = captureCanvas.toDataURL('image/jpeg', 0.7);
          capturedFrames.push(dataUrl);
          console.log('[AuthentiScan] Captured live frame', capturedFrames.length);
        } catch (e) {
          console.log('[AuthentiScan] Live frame capture error:', e);
        }
      }

      setTimeout(() => {
        grabFrame();
        frameInterval = setInterval(grabFrame, 3000);
      }, 1000);

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9' : 'video/webm';
      activeRecorder = new MediaRecorder(stream, { mimeType });

      activeRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(recordingTimer);
        clearInterval(frameInterval);
        removeElement('.authentiscan-recording-bar');
        liveVideo.srcObject = null;

        if (capturedFrames.length < 4) {
          try {
            if (liveVideo.videoWidth > 0) grabFrame();
          } catch (e) { /* stream already stopped */ }
        }

        showVideoReviewPanel();
      };

      activeRecorder.start(1000);
      showRecordingBar();

      videoTrack.addEventListener('ended', () => {
        if (activeRecorder?.state === 'recording') activeRecorder.stop();
      });

    } catch (err) {
      removeElement('.authentiscan-notification');
      showNotification('Screen capture was cancelled or denied.', 4000);
      console.log('[AuthentiScan] getDisplayMedia error:', err);
    }
  }

  // ---- Recording Bar ----
  function showRecordingBar() {
    removeElement('.authentiscan-recording-bar');

    const bar = document.createElement('div');
    bar.className = 'authentiscan-recording-bar';
    bar.innerHTML = `
      <div class="authentiscan-recording-dot"></div>
      <span class="authentiscan-recording-label">REC</span>
      <div class="authentiscan-recording-timer">0:00</div>
      <span class="authentiscan-recording-frames">0 frames</span>
      <button class="authentiscan-recording-stop">Stop Recording</button>
    `;

    bar.querySelector('.authentiscan-recording-stop').addEventListener('click', () => {
      if (activeRecorder?.state === 'recording') activeRecorder.stop();
    });

    document.body.appendChild(bar);

    recordingTimer = setInterval(() => {
      recordingSeconds++;
      const mins = Math.floor(recordingSeconds / 60);
      const secs = recordingSeconds % 60;
      const timerEl = bar.querySelector('.authentiscan-recording-timer');
      if (timerEl) timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
      const framesEl = bar.querySelector('.authentiscan-recording-frames');
      if (framesEl) framesEl.textContent = `${capturedFrames.length} frame${capturedFrames.length !== 1 ? 's' : ''}`;
    }, 1000);
  }

  // ---- Review Panel ----
  function showVideoReviewPanel() {
    removeElement('.authentiscan-review-panel');

    const panel = document.createElement('div');
    panel.className = 'authentiscan-review-panel';

    const mins = Math.floor(recordingSeconds / 60);
    const secs = recordingSeconds % 60;

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div style="font-size:15px;font-weight:800;color:#67e8f9">Recording Complete</div>
        <button class="authentiscan-review-close" style="background:none;border:none;color:#475569;cursor:pointer;font-size:18px;padding:0 4px">X</button>
      </div>
      <div style="background:rgba(103,232,249,0.06);border-radius:10px;padding:14px;margin-bottom:14px;border:1px solid rgba(103,232,249,0.1)">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:40px;height:40px;border-radius:8px;background:rgba(239,68,68,0.15);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#ef4444">REC</div>
          <div>
            <div style="font-weight:700;color:#f1f5f9;font-size:14px">Screen Recording</div>
            <div style="font-size:11px;color:#64748b">Duration: ${mins}:${secs.toString().padStart(2, '0')} | ${capturedFrames.length} frames captured</div>
          </div>
        </div>
      </div>
      ${capturedFrames.length === 0
        ? '<div style="color:#f87171;font-size:12px;margin-bottom:12px">No frames captured. Try recording for at least 3 seconds.</div>'
        : ''
      }
      <button class="authentiscan-review-send" ${capturedFrames.length === 0 ? 'disabled style="opacity:0.4;cursor:not-allowed"' : ''}>Send to AI for Analysis</button>
      <button class="authentiscan-review-discard">Discard</button>
    `;

    panel.querySelector('.authentiscan-review-close').addEventListener('click', () => panel.remove());
    panel.querySelector('.authentiscan-review-discard').addEventListener('click', () => {
      capturedFrames = [];
      panel.remove();
    });

    if (capturedFrames.length > 0) {
      panel.querySelector('.authentiscan-review-send').addEventListener('click', async () => {
        panel.remove();
        await sendFramesToAI();
      });
    }

    document.body.appendChild(panel);
  }

  async function sendFramesToAI() {
    if (capturedFrames.length === 0) return;

    showProcessing(`Analyzing ${capturedFrames.length} frames for deepfakes...`);
    try {
      const analysis = await analyzeFrames(capturedFrames, videoLink);
      removeElement('.authentiscan-processing');
      showFloatingResult(analysis, 'video');
      chrome.runtime.sendMessage({ action: 'videoAnalyzed', data: { label: analysis.label, confidence: analysis.confidence, url: location.href } });
    } catch (err) {
      removeElement('.authentiscan-processing');
      showFloatingResult({ label: 'Error', confidence: 0, reasons: [err.message], details: 'AI analysis failed. Try again.' }, 'video');
    }
    capturedFrames = [];
  }

  // ==================== SCREENSHOT ====================
  async function captureScreenshot(cropArea) {
    showProcessing('Capturing screenshot...');

    chrome.runtime.sendMessage({ action: 'captureTab' }, async (response) => {
      if (!response?.dataUrl) {
        removeElement('.authentiscan-processing');
        showFloatingResult({ label: 'Error', confidence: 0, reasons: ['Failed to capture screen'], details: 'Try again.' }, 'screenshot');
        return;
      }

      let imageData = response.dataUrl;
      if (cropArea) {
        imageData = await cropImage(response.dataUrl, cropArea);
      }

      showProcessing('Analyzing image with AI...');
      try {
        const analysis = await analyzeFrames([imageData]);
        removeElement('.authentiscan-processing');
        showFloatingResult(analysis, 'screenshot');
        chrome.runtime.sendMessage({ action: 'videoAnalyzed', data: { label: analysis.label, confidence: analysis.confidence, url: location.href } });
      } catch (err) {
        removeElement('.authentiscan-processing');
        showFloatingResult({ label: 'Error', confidence: 0, reasons: [err.message], details: 'Analysis failed.' }, 'screenshot');
      }
    });
  }

  function cropImage(dataUrl, crop) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const dpr = crop.devicePixelRatio || 1;
        const canvas = document.createElement('canvas');
        canvas.width = crop.w * dpr;
        canvas.height = crop.h * dpr;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, crop.x * dpr, crop.y * dpr, crop.w * dpr, crop.h * dpr, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = dataUrl;
    });
  }

  // ==================== API CALL ====================
  async function analyzeFrames(frames, link) {
    const body = { frames };
    if (link) body.videoLink = link;
    if (window.__authentiscan_hints) body.analysisHints = window.__authentiscan_hints;
    const resp = await fetch(`${API_BASE}/analyze-video-frame`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }

    return resp.json();
  }

  // ==================== UI HELPERS ====================
  function removeElement(selector) {
    document.querySelectorAll(selector).forEach(el => el.remove());
  }

  function showNotification(text, duration = 0) {
    removeElement('.authentiscan-notification');
    const el = document.createElement('div');
    el.className = 'authentiscan-notification';
    el.textContent = text;
    document.body.appendChild(el);
    if (duration > 0) setTimeout(() => el.remove(), duration);
  }

  function showProcessing(text) {
    removeElement('.authentiscan-processing');
    const el = document.createElement('div');
    el.className = 'authentiscan-processing';
    el.innerHTML = `<div class="authentiscan-spinner"></div>${text}`;
    document.body.appendChild(el);
  }

  function showFloatingResult(analysis, type) {
    removeElement('.authentiscan-float-result');

    const div = document.createElement('div');
    div.className = 'authentiscan-float-result';

    const isError = analysis.label === 'Error';
    const isDanger = analysis.label?.includes('Deepfake') || analysis.label?.includes('AI');
    const isSafe = analysis.label?.includes('Authentic') || analysis.label?.includes('Human');
    const accentColor = isError || isDanger ? '#f87171' : isSafe ? '#34d399' : '#fbbf24';
    const accentBg = isError || isDanger ? 'rgba(248,113,113,0.08)' : isSafe ? 'rgba(52,211,153,0.08)' : 'rgba(251,191,36,0.08)';
    const verdictLabel = isError || isDanger ? 'ALERT' : isSafe ? 'OK' : 'WARN';

    const typeLabel = type === 'video' ? 'Video Analysis' : type === 'screenshot' ? 'Screenshot Analysis' : 'Analysis';
    const confidence = analysis.confidence || 0;

    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:32px;height:32px;border-radius:8px;background:rgba(103,232,249,0.08);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#67e8f9">${type === 'video' ? 'VID' : type === 'screenshot' ? 'IMG' : 'TXT'}</div>
          <div>
            <div style="font-size:13px;font-weight:800;color:#67e8f9;letter-spacing:-0.3px">AuthentiScan</div>
            <div style="font-size:9px;color:#3b4c63;text-transform:uppercase;letter-spacing:0.8px;font-weight:600">${typeLabel}</div>
          </div>
        </div>
        <button style="background:rgba(30,41,59,0.4);border:none;color:#4b5e77;cursor:pointer;font-size:14px;padding:4px 8px;border-radius:6px;transition:all 0.2s" onmouseover="this.style.color='#e2e8f0';this.style.background='rgba(51,65,85,0.4)'" onmouseout="this.style.color='#4b5e77';this.style.background='rgba(30,41,59,0.4)'">X</button>
      </div>

      <div style="background:${accentBg};border-radius:12px;padding:14px;margin-bottom:12px;border:1px solid ${accentColor}15">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-size:15px;font-weight:800;color:${accentColor}">${verdictLabel} — ${analysis.label || 'Unknown'}</span>
          ${confidence ? `<span style="background:${accentColor}18;color:${accentColor};padding:3px 12px;border-radius:10px;font-size:13px;font-weight:800;font-variant-numeric:tabular-nums">${confidence}%</span>` : ''}
        </div>
        <div style="background:rgba(15,23,42,0.5);border-radius:6px;height:5px;overflow:hidden">
          <div style="width:${confidence}%;height:100%;background:${accentColor};border-radius:6px;animation:authentiscan-confbar 0.8s ease"></div>
        </div>
      </div>

      ${(analysis.reasons || []).length > 0 ? `
      <div style="background:rgba(15,23,42,0.4);border:1px solid rgba(100,116,139,0.06);border-radius:10px;padding:10px 12px;margin-bottom:8px">
        <div style="font-size:10px;font-weight:700;color:#67e8f9;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Reasons</div>
        <div style="font-size:11px;color:#8892a6;line-height:1.6">${analysis.reasons.map(r => '- ' + r).join('<br>')}</div>
      </div>` : ''}

      ${analysis.details ? `
      <div style="background:rgba(15,23,42,0.4);border:1px solid rgba(100,116,139,0.06);border-radius:10px;padding:10px 12px;margin-bottom:8px">
        <div style="font-size:10px;font-weight:700;color:#67e8f9;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Details</div>
        <div style="font-size:11px;color:#8892a6;line-height:1.6">${analysis.details}</div>
      </div>` : ''}

      ${(analysis.flags || []).length > 0 ? `
      <div style="background:rgba(248,113,113,0.03);border:1px solid rgba(248,113,113,0.08);border-radius:10px;padding:10px 12px;margin-bottom:8px">
        <div style="font-size:10px;font-weight:700;color:#f87171;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Flags</div>
        <div style="font-size:11px;color:#8892a6;line-height:1.6">${analysis.flags.map(f => '- ' + f).join('<br>')}</div>
      </div>` : ''}

      ${analysis.crossCheckNotes ? `
      <div style="background:rgba(103,232,249,0.03);border:1px solid rgba(103,232,249,0.06);border-radius:10px;padding:10px 12px">
        <div style="font-size:10px;font-weight:700;color:#67e8f9;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Cross-Check</div>
        <div style="font-size:11px;color:#8892a6;line-height:1.6">${analysis.crossCheckNotes}</div>
      </div>` : ''}
    `;

    div.querySelector('button').addEventListener('click', () => div.remove());
    document.body.appendChild(div);
    setTimeout(() => { if (div.parentNode) div.remove(); }, 45000);
  }

  function showFloatingTextResult(result) {
    removeElement('.authentiscan-float-result');
    const div = document.createElement('div');
    div.className = 'authentiscan-float-result';
    const { aiDetection, verification } = result;
    const confidence = aiDetection?.confidence || 0;
    const accentColor = confidence >= 60 ? '#f87171' : confidence >= 30 ? '#fbbf24' : '#34d399';
    const verdictLabel = confidence >= 60 ? 'ALERT' : confidence >= 30 ? 'WARN' : 'OK';

    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:28px;height:28px;border-radius:6px;background:rgba(103,232,249,0.08);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:#67e8f9">TXT</div>
          <span style="font-weight:800;color:#67e8f9;font-size:13px">AuthentiScan | Text</span>
        </div>
        <button style="background:rgba(30,41,59,0.4);border:none;color:#4b5e77;cursor:pointer;font-size:14px;padding:4px 8px;border-radius:6px">X</button>
      </div>

      <div style="background:${accentColor}0d;border-radius:10px;padding:12px;margin-bottom:10px;border:1px solid ${accentColor}15">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-weight:800;color:${accentColor};font-size:14px">${verdictLabel} — ${aiDetection?.label || 'Unknown'}</span>
          <span style="background:${accentColor}18;color:${accentColor};padding:2px 10px;border-radius:8px;font-size:12px;font-weight:800">${confidence}%</span>
        </div>
        <div style="background:rgba(15,23,42,0.5);border-radius:5px;height:4px;overflow:hidden">
          <div style="width:${confidence}%;height:100%;background:${accentColor};border-radius:5px;animation:authentiscan-confbar 0.6s ease"></div>
        </div>
      </div>

      ${(aiDetection?.reasons || []).length > 0 ? `<div style="font-size:11px;color:#8892a6;line-height:1.6;margin-bottom:8px">${aiDetection.reasons.map(r => '- ' + r).join('<br>')}</div>` : ''}

      <div style="background:rgba(15,23,42,0.4);border-radius:8px;padding:8px 10px;border:1px solid rgba(100,116,139,0.06)">
        <div style="font-size:10px;font-weight:700;color:#67e8f9;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px">Verification</div>
        <div style="font-size:12px;font-weight:600;color:#e2e8f0">${verification?.label || 'N/A'}</div>
        ${verification?.details ? `<div style="font-size:10px;color:#4b5e77;margin-top:2px;line-height:1.4">${verification.details}</div>` : ''}
      </div>
    `;
    div.querySelector('button').addEventListener('click', () => div.remove());
    document.body.appendChild(div);
    setTimeout(() => { if (div.parentNode) div.remove(); }, 20000);
  }

})();