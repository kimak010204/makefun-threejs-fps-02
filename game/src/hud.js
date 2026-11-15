// The DOM HUD: crosshair, hit marker, health, ammo, money, round timer, score, alive
// counts, kill feed, banners and the buy menu. It never touches the simulation; main.js
// pushes numbers in and reads the buy callbacks out.
import { WEAPONS, WEAPON_ORDER, GRENADE_PRICE } from './weapon.js';

const COPY = {
  start: {
    title: 'SCRAPLINE',
    copy: 'YARD 7 — plant the spike at A or B, or eliminate EMBER. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'SCRAPLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  match: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const grenadeCount = $('grenade-count');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const scoreAttack = $('score-attack');
  const scoreDefend = $('score-defend');
  const aliveAttack = $('alive-attack');
  const aliveDefend = $('alive-defend');
  const killfeed = $('killfeed');
  const hitmarker = $('hitmarker');
  const crosshair = $('crosshair');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const damageVignette = $('damage-vignette');
  const plantBar = $('plant-bar');
  const plantFill = $('plant-fill');
  const plantLabel = $('plant-label');
  const buyMenu = $('buy-menu');
  const buyMoney = $('buy-money');
  const buyGrid = $('buy-grid');
  const hint = $('hint');
  let hitTimer = 0;
  let bannerTimer = 0;
  let lastAmmo = '';
  let lastHealth = -1;
  let lastMoney = -1;
  let lastTimer = '';
  let lastScore = '';
  let lastAlive = '';

  const buyHandlers = new Set();
  for (const id of WEAPON_ORDER) {
    const def = WEAPONS[id];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'buy-card';
    card.dataset.weapon = id;
    card.innerHTML = `<b>${def.name}</b><span class="buy-price">$${def.price}</span>`
      + `<span class="buy-desc">${def.damage} dmg · ${def.mag} rnd · ${def.headMult}x head</span>`
      + `<span class="buy-key">[${def.slot}]</span>`;
    card.addEventListener('click', () => {
      for (const h of buyHandlers) h(id);
    });
    buyGrid.appendChild(card);
  }
  const grenadeCard = document.createElement('button');
  grenadeCard.type = 'button';
  grenadeCard.className = 'buy-card';
  grenadeCard.dataset.weapon = 'grenade';
  grenadeCard.innerHTML = `<b>SPARK FRAG</b><span class="buy-price">$${GRENADE_PRICE}</span>`
    + `<span class="buy-desc">Bounce, beep, boom · max 2</span><span class="buy-key">[G]</span>`;
  grenadeCard.addEventListener('click', () => {
    for (const h of buyHandlers) h('grenade');
  });
  buyGrid.appendChild(grenadeCard);

  function refreshBuy(money, owned, grenades) {
    buyMoney.textContent = `$${money}`;
    for (const card of buyGrid.children) {
      const id = card.dataset.weapon;
      const def = WEAPONS[id];
      const isOwned = id === 'grenade' ? grenades >= 2 : owned.has(id);
      card.classList.toggle('owned', Boolean(isOwned));
      card.classList.toggle('cant', money < (def ? def.price : GRENADE_PRICE) && !isOwned);
      const price = card.querySelector('.buy-price');
      if (price) price.textContent = isOwned ? 'OWNED' : `$${def ? def.price : GRENADE_PRICE}`;
    }
  }

  return {
    setAmmo(mag, reserve, name, grenades) {
      const key = `${mag}|${reserve}|${name}|${grenades}`;
      if (key === lastAmmo) return;
      lastAmmo = key;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      weaponName.textContent = name;
      grenadeCount.textContent = `◉ ${grenades}`;
      document.getElementById('ammo').classList.toggle('empty', mag === 0);
    },
    setHealth(hp) {
      const v = Math.max(0, Math.round(hp));
      if (v === lastHealth) return;
      lastHealth = v;
      healthFill.style.width = `${v}%`;
      healthNum.textContent = String(v);
      healthFill.classList.toggle('low', v <= 30);
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyValue.textContent = `$${value}`;
    },
    setTimer(text, planted) {
      if (text === lastTimer) return;
      lastTimer = text;
      timerValue.textContent = text;
      timerValue.classList.toggle('planted', Boolean(planted));
    },
    setScore(attack, defend) {
      const key = `${attack}-${defend}`;
      if (key === lastScore) return;
      lastScore = key;
      scoreAttack.textContent = String(attack);
      scoreDefend.textContent = String(defend);
    },
    setAlive(attack, defend) {
      const key = `${attack}|${defend}`;
      if (key === lastAlive) return;
      lastAlive = key;
      aliveAttack.textContent = '●'.repeat(attack) + '○'.repeat(4 - attack);
      aliveDefend.textContent = '●'.repeat(defend) + '○'.repeat(4 - defend);
    },
    setCrosshair(spreadPx) {
      crosshair.style.setProperty('--gap', `${Math.round(spreadPx)}px`);
    },
    killfeed(text, good) {
      const line = document.createElement('div');
      line.className = `feed-line${good ? ' good' : ''}`;
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.lastChild.remove();
      setTimeout(() => line.remove(), 6000);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      damageVignette.classList.add('on');
      setTimeout(() => damageVignette.classList.remove('on'), 180);
    },
    banner(titleText, subText, holdMs = 2400) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { banner.hidden = true; }, holdMs);
    },
    hideBanner() {
      banner.hidden = true;
      clearTimeout(bannerTimer);
    },
    setHint(text) {
      hint.textContent = text;
      hint.hidden = !text;
    },
    plantProgress(progress, label) {
      if (progress == null) {
        plantBar.hidden = true;
        return;
      }
      plantBar.hidden = false;
      plantFill.style.width = `${Math.round(progress * 100)}%`;
      plantLabel.textContent = label;
    },
    showBuy(money, owned, grenades, round) {
      document.getElementById('buy-round').textContent = String(round || 1);
      refreshBuy(money, owned, grenades);
      buyMenu.hidden = false;
    },
    hideBuy() {
      buyMenu.hidden = true;
    },
    refreshBuy,
    onBuy(handler) {
      buyHandlers.add(handler);
    },
    showOverlay(mode, scoreText) {
      const text = COPY[mode] || COPY.start;
      title.textContent = text.title;
      copy.textContent = mode === 'match' ? scoreText : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
