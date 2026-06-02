/**
 * YouTube Shorts 視聴時間アラート
 * 10分ごとに右上ポップアップで通知
 */

(function () {
  'use strict';

  // ---- 状態管理 ----
  const ALERT_INTERVAL_MS = 10 * 60 * 1000; // 10分
  const POPUP_DURATION_MS = 15 * 1000;       // 15秒表示
  const TICK_MS = 1000;                       // 1秒ごとに更新

  let sessionStartTime = null;  // このセッションの開始時刻
  let totalWatchedMs = 0;       // 累計視聴時間（ms）
  let lastAlertAt = 0;          // 最後にアラートを出した累計時間（ms）
  let tickInterval = null;
  let popupEl = null;
  let popupTimeout = null;
  let isOnShorts = false;

  // ---- ユーティリティ ----
  function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}時間${minutes}分`;
    } else if (minutes > 0) {
      return `${minutes}分${seconds}秒`;
    } else {
      return `${seconds}秒`;
    }
  }

  // ---- ポップアップ ----
  function createPopupEl() {
    if (document.getElementById('yt-shorts-timer-popup')) return;

    const el = document.createElement('div');
    el.id = 'yt-shorts-timer-popup';
    el.innerHTML = `
      <div class="yst-inner">
        <div class="yst-icon">⏱</div>
        <div class="yst-body">
          <div class="yst-label">Shorts 視聴中</div>
          <div class="yst-time" id="yt-shorts-timer-time"></div>
          <div class="yst-sub">連続視聴しています</div>
        </div>
        <button class="yst-close" id="yt-shorts-timer-close">✕</button>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #yt-shorts-timer-popup {
        position: fixed;
        top: 72px;
        right: 20px;
        z-index: 2147483647;
        font-family: 'Hiragino Sans', 'Noto Sans JP', 'Yu Gothic', sans-serif;
        pointer-events: all;
        opacity: 0;
        transform: translateX(120%) scale(0.92);
        transition: opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1),
                    transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      }

      #yt-shorts-timer-popup.yst-show {
        opacity: 1;
        transform: translateX(0) scale(1);
      }

      #yt-shorts-timer-popup.yst-hide {
        opacity: 0;
        transform: translateX(120%) scale(0.92);
      }

      .yst-inner {
        display: flex;
        align-items: center;
        gap: 10px;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
        border: 1px solid rgba(255, 60, 60, 0.4);
        border-radius: 14px;
        padding: 12px 14px 12px 12px;
        box-shadow:
          0 8px 32px rgba(0,0,0,0.6),
          0 0 0 1px rgba(255,255,255,0.05) inset,
          0 0 20px rgba(255, 60, 60, 0.15);
        min-width: 200px;
        max-width: 260px;
        position: relative;
        overflow: hidden;
      }

      .yst-inner::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255,100,100,0.6), transparent);
      }

      .yst-icon {
        font-size: 26px;
        line-height: 1;
        flex-shrink: 0;
        filter: drop-shadow(0 0 6px rgba(255,120,120,0.8));
        animation: yst-pulse 2s ease-in-out infinite;
      }

      @keyframes yst-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.12); }
      }

      .yst-body {
        flex: 1;
        min-width: 0;
      }

      .yst-label {
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.08em;
        color: rgba(255, 100, 100, 0.85);
        text-transform: uppercase;
        margin-bottom: 2px;
      }

      .yst-time {
        font-size: 20px;
        font-weight: 800;
        color: #ffffff;
        letter-spacing: -0.02em;
        line-height: 1.2;
        text-shadow: 0 0 12px rgba(255,80,80,0.5);
      }

      .yst-sub {
        font-size: 10px;
        color: rgba(255,255,255,0.45);
        margin-top: 2px;
      }

      .yst-close {
        background: none;
        border: none;
        color: rgba(255,255,255,0.35);
        font-size: 12px;
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 4px;
        flex-shrink: 0;
        align-self: flex-start;
        transition: color 0.2s, background 0.2s;
        line-height: 1;
      }

      .yst-close:hover {
        color: rgba(255,255,255,0.9);
        background: rgba(255,255,255,0.1);
      }

      /* カウントダウンバー */
      .yst-inner::after {
        content: '';
        position: absolute;
        bottom: 0; left: 0;
        height: 2px;
        background: linear-gradient(90deg, #ff3c3c, #ff8c42);
        border-radius: 0 0 14px 14px;
        animation: yst-countdown var(--yst-duration, 15s) linear forwards;
      }

      @keyframes yst-countdown {
        from { width: 100%; }
        to   { width: 0%; }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(el);

    document.getElementById('yt-shorts-timer-close').addEventListener('click', () => {
      hidePopup();
    });

    popupEl = el;
  }

  function showPopup(ms) {
    createPopupEl();

    const timeEl = document.getElementById('yt-shorts-timer-time');
    if (timeEl) timeEl.textContent = formatTime(ms);

    // カウントダウンバーをリセット
    const inner = popupEl.querySelector('.yst-inner');
    inner.style.setProperty('--yst-duration', `${POPUP_DURATION_MS / 1000}s`);
    // アニメーションをリセット
    inner.style.animation = 'none';
    void inner.offsetHeight; // reflow
    inner.style.animation = '';

    // 表示
    popupEl.classList.remove('yst-hide');
    void popupEl.offsetHeight;
    popupEl.classList.add('yst-show');

    // 既存タイマーをクリア
    if (popupTimeout) clearTimeout(popupTimeout);
    popupTimeout = setTimeout(() => hidePopup(), POPUP_DURATION_MS);
  }

  function hidePopup() {
    if (!popupEl) return;
    popupEl.classList.add('yst-hide');
    popupEl.classList.remove('yst-show');
    if (popupTimeout) {
      clearTimeout(popupTimeout);
      popupTimeout = null;
    }
  }

  // ---- タイマーロジック ----
  function startTracking() {
    if (tickInterval) return;
    sessionStartTime = Date.now();

    tickInterval = setInterval(() => {
      const now = Date.now();
      totalWatchedMs = (now - sessionStartTime);

      // 10分ごとにアラート
      const nextAlertAt = lastAlertAt + ALERT_INTERVAL_MS;
      if (totalWatchedMs >= nextAlertAt) {
        lastAlertAt = nextAlertAt;
        showPopup(totalWatchedMs);
      }
    }, TICK_MS);
  }

  function stopTracking() {
    if (tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
    // セッション終了時は累計をリセット（Shorts離脱とみなす）
    sessionStartTime = null;
  }

  // ---- URL 監視（YouTube SPAナビゲーション対応） ----
  function checkUrl() {
    const onShorts = location.pathname.startsWith('/shorts/');

    if (onShorts && !isOnShorts) {
      // Shortsに入った
      isOnShorts = true;
      // 累計はリセットせず継続（連続視聴カウント）
      if (!sessionStartTime) {
        sessionStartTime = Date.now() - totalWatchedMs;
      }
      startTracking();
    } else if (!onShorts && isOnShorts) {
      // Shortsから離れた
      isOnShorts = false;
      stopTracking();
      hidePopup();
      // 離脱したらセッションリセット
      totalWatchedMs = 0;
      lastAlertAt = 0;
    }
  }

  // pushState / replaceState をフック
  const _pushState = history.pushState.bind(history);
  const _replaceState = history.replaceState.bind(history);

  history.pushState = function (...args) {
    _pushState(...args);
    setTimeout(checkUrl, 50);
  };
  history.replaceState = function (...args) {
    _replaceState(...args);
    setTimeout(checkUrl, 50);
  };

  window.addEventListener('popstate', () => setTimeout(checkUrl, 50));

  // 初期チェック
  checkUrl();

})();
