/* Telegram Mini App monetization bridge */
(() => {
  const tg = window.Telegram?.WebApp || null;
  const API_BASE = window.TG_API_BASE || '';
  const state = {
    me: null,
    initData: tg?.initData || '',
    startParam: tg?.initDataUnsafe?.start_param || '',
    user: tg?.initDataUnsafe?.user || null,
  };

  function emit(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(`tgmon:${name}`, { detail }));
  }

  function alertUser(message) {
    if (tg?.showAlert) tg.showAlert(message);
    else console.log('[TGMonetization]', message);
  }

  async function api(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  async function init() {
    tg?.ready?.();
    tg?.expand?.();
    tg?.setHeaderColor?.('#1299e6');
    tg?.setBackgroundColor?.('#1299e6');
    if (tg?.isVersionAtLeast?.('8.0') && tg?.requestFullscreen) {
      try { tg.requestFullscreen(); } catch (_) {}
    }
    await refreshMe().catch(() => null);
    emit('ready', { me: state.me });
  }

  async function refreshMe() {
    if (!state.initData) return state.me;
    state.me = await api('/api/me', { initData: state.initData, startParam: state.startParam });
    emit('me', { me: state.me });
    return state.me;
  }

  function isPremium() {
    return Date.now() < Number(state.me?.premiumUntil || 0);
  }

  async function buy(productId) {
    if (!tg || !state.initData) {
      alertUser('Покупки Stars работают только внутри Telegram.');
      return false;
    }
    const { invoiceLink } = await api('/api/create-invoice', { initData: state.initData, productId });
    return new Promise((resolve) => {
      tg.openInvoice(invoiceLink, async (status) => {
        if (status === 'paid') {
          await new Promise(r => setTimeout(r, 900));
          await refreshMe().catch(() => null);
          emit('purchase', { productId, status });
          resolve(true);
        } else {
          emit('purchase', { productId, status });
          resolve(false);
        }
      });
    });
  }

  async function showRewarded(placement = 'reward') {
    if (isPremium()) return { ok: true, skippedBecausePremium: true };
    if (window.TG_ADS?.showRewarded) {
      const ok = await window.TG_ADS.showRewarded(placement);
      return { ok: Boolean(ok), skippedBecausePremium: false };
    }
    alertUser('Реклама ещё не подключена.');
    return { ok: false, error: 'ADS_NOT_CONFIGURED' };
  }

  async function consumeSkip() {
    const data = await api('/api/consume-skip', { initData: state.initData });
    await refreshMe().catch(() => null);
    emit('skip', data);
    return data;
  }

  async function claimDaily() {
    const data = await api('/api/claim-daily', { initData: state.initData });
    await refreshMe().catch(() => null);
    emit('daily', data);
    return data;
  }

  async function submitScore(score) {
    return api('/api/score', { initData: state.initData, score: Number(score || 0) });
  }

  async function getLeaderboard() {
    const data = await api('/api/leaderboard');
    return data.items || [];
  }

  function getReferralLink(botUsername, appName) {
    const userId = state.user?.id || state.me?.userId || 'player';
    return `https://t.me/${botUsername}/${appName}?startapp=ref_${userId}`;
  }

  function shareReferral(botUsername, appName) {
    const link = getReferralLink(botUsername, appName);
    const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Заходи в игру, я уже играю!')}`;
    tg?.openTelegramLink ? tg.openTelegramLink(url) : location.href = url;
  }

  function shareScore(botUsername, appName, score) {
    const link = getReferralLink(botUsername, appName);
    const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(`Я набрал ${score} очков! Сможешь больше?`)}`;
    tg?.openTelegramLink ? tg.openTelegramLink(url) : location.href = url;
  }

  window.TGMonetization = {
    init,
    refreshMe,
    buy,
    showRewarded,
    consumeSkip,
    claimDaily,
    submitScore,
    getLeaderboard,
    getReferralLink,
    shareReferral,
    shareScore,
    isPremium,
    get me() { return state.me; },
    get user() { return state.user; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
