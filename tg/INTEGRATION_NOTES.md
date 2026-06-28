# Кнопки монетизации для игры

## Рекомендуемая схема кнопок

### 🎁 Смотреть рекламу

Награда должна быть полезной, но слабее Stars-покупки.

Хорошие варианты:

- получить 1 подсказку;
- убрать 2-3 мешающих объекта;
- продолжить после ошибки;
- x2 награда за уровень.

```js
const result = await TGMonetization.showRewarded('hint');
if (result.ok || result.skippedBecausePremium) {
  giveHint();
}
```

### ⭐ Пропустить уровень

Это лучше, чем продавать просто монеты. Игрок покупает решение конкретной боли.

```js
async function onSkipLevelClick() {
  let result = await TGMonetization.consumeSkip();
  if (!result.ok) {
    const paid = await TGMonetization.buy('skip_level_1');
    if (paid) result = await TGMonetization.consumeSkip();
  }
  if (result.ok) completeLevelAsSkipped();
}
```

### 👑 Premium

Premium даёт:

- отключение interstitial/rewarded рекламы;
- ежедневный бонус 250 монет;
- можно добавить красивую корону в меню.

```js
if (!TGMonetization.isPremium()) {
  await showInterstitialAd();
}
```

```js
const paid = await TGMonetization.buy('premium_30d');
```

### 🔁 Пригласить друга

В BotFather после создания Mini App у тебя будут `botUsername` и `appName`.

```js
TGMonetization.shareReferral('YOUR_BOT_USERNAME', 'YOUR_APP_NAME');
```

Бонусы уже заложены на сервере:

- приглашённому: +100 монет;
- пригласившему: +150 монет.

### 🏆 Рекорд

```js
await TGMonetization.submitScore(bestScore);
const leaders = await TGMonetization.getLeaderboard();
TGMonetization.shareScore('YOUR_BOT_USERNAME', 'YOUR_APP_NAME', bestScore);
```

## Где лучше показывать покупки

1. После проигрыша: `Спасти попытку ⭐10`.
2. На сложном уровне: `Пропустить уровень ⭐15`.
3. После 2-3 показов рекламы: `Premium без рекламы ⭐149`.
4. После победы: `x2 награда за рекламу` + `поделиться рекордом`.

## Что поменять в старой Yandex-версии

Найди старые функции типа:

```js
ysdk.adv.showRewardedVideo(...)
ysdk.adv.showFullscreenAdv(...)
```

И замени их на:

```js
TGMonetization.showRewarded(...)
```

А interstitial показывай только если игрок не Premium:

```js
if (!TGMonetization.isPremium()) maybeShowInterstitial();
```
