# Telegram Mini App Monetization Kit

Это заготовка для переноса HTML5-игры из Яндекс Игр в Telegram Mini App.

## Что добавлено

- 🎁 Rewarded ad: награда за просмотр рекламы.
- ⭐ Telegram Stars: пропуск уровня и полезные покупки.
- 👑 Premium: отключение рекламы + ежедневный бонус.
- 🔁 Реферальная ссылка через `startapp`.
- 🏆 Лидерборд и шаринг результата.

## Быстрое подключение к существующей игре

В `index.html` игры добавь в `<head>` перед игровыми скриптами:

```html
<script src="https://telegram.org/js/telegram-web-app.js?62"></script>
<script src="./tg/telegram-bridge.js"></script>
```

Потом замени старые вызовы Яндекс-рекламы и покупок на функции из `window.TGMonetization`.

### Rewarded ad

```js
async function onRewardButton() {
  const result = await TGMonetization.showRewarded('level_help');
  if (result.ok || result.skippedBecausePremium) {
    // выдай полезную награду: подсказку, очистку 3 объектов, продолжение и т.д.
    giveRewardToPlayer();
  }
}
```

### Купить пропуск уровня за Stars

```js
async function buySkipLevel() {
  const paid = await TGMonetization.buy('skip_level_1');
  if (paid) {
    await TGMonetization.refreshMe();
    showToast('Пропуск уровня куплен!');
  }
}
```

### Использовать пропуск уровня

```js
async function skipCurrentLevel() {
  const result = await TGMonetization.consumeSkip();
  if (result.ok) {
    // твоя функция завершения уровня
    completeLevelAsSkipped();
  } else {
    await TGMonetization.buy('skip_level_1');
  }
}
```

### Premium

```js
async function buyPremium() {
  const paid = await TGMonetization.buy('premium_30d');
  if (paid) {
    await TGMonetization.refreshMe();
    showToast('Premium активирован!');
  }
}

function shouldShowInterstitial() {
  return !TGMonetization.isPremium();
}
```

### Ежедневный бонус Premium

```js
async function claimPremiumDaily() {
  const result = await TGMonetization.claimDaily();
  if (result.ok) {
    addCoins(result.coins);
  }
}
```

### Лидерборд

```js
await TGMonetization.submitScore(bestScore);
const top = await TGMonetization.getLeaderboard();
```

## Сервер

Сервер лежит в `tg/server.js`.

```bash
cd tg
npm install
cp .env.example .env
npm start
```

В `.env` надо вставить токен бота из BotFather.

## Важно

Для цифровых товаров внутри Telegram надо использовать Telegram Stars (`XTR`). Не продавай пропуск уровня, Premium или бустеры через сторонние платежи внутри Telegram — это может сломать доступность Mini App на iOS/Android.
