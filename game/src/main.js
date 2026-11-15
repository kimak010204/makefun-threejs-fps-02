// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. Owns the round glue — shooting, planting, the economy, death and restart —
// while the modules own their own jobs. ?shot=start|play|buy|end with &seed=N sets up
// a deterministic frame for a capture, renders it twice, then freezes it and sets
// window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createInput } from './input.js';
import { createWeapon, WEAPONS, WEAPON_ORDER } from './weapon.js';
import { createBots } from './bots.js';
import { createRounds } from './rounds.js';
import { createGrenades } from './grenade.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const PLANT_SECONDS = 3.5;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const audio = createAudio();
const world = createWorld(scene);
const effects = createEffects(scene);
const hud = createHud();
const player = createPlayer(world.colliders);
const weapon = createWeapon(camera, audio);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();

const rounds = createRounds({
  onRoundStart(n) {
    respawnAll();
    hud.banner(`ROUND ${n}`, n === 1 ? 'Plant the spike at A or B' : 'Buy up — press B', 2200);
    hud.hideBuy();
  },
  onLiveStart() {
    hud.banner('GO', 'Eliminate EMBER or plant the spike', 1200);
  },
  onRoundEnd(winner, reason) {
    const won = winner === 'attack';
    hud.banner(won ? 'VANGUARD WINS THE ROUND' : 'EMBER WINS THE ROUND', reason, 3200);
    if (won) audio.roundWin();
    else audio.roundLose();
    hud.setScore(rounds.state.wins.attack, rounds.state.wins.defend);
    hideSpike();
  },
  onMatchEnd(winner) {
    const text = winner === 'attack'
      ? `VANGUARD ${rounds.state.wins.attack} — ${rounds.state.wins.defend} EMBER. The yard is yours.`
      : winner === 'defend'
        ? `EMBER ${rounds.state.wins.defend} — ${rounds.state.wins.attack} VANGUARD. The yard holds.`
        : `Draw ${rounds.state.wins.attack} — ${rounds.state.wins.defend}.`;
    hud.showOverlay('match', text);
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onPlant(site) {
    showSpike(site);
    hud.banner('SPIKE PLANTED', `Defend site ${site} until it blows`, 3000);
    hud.killfeed(`Spike planted at ${site} (+$300)`, true);
    audio.plantStart();
    bots.hearShot(spikePos(), 60);
  },
  onDetonate() {
    effects.explosion(spikePos());
    audio.explosion();
    hideSpike();
  },
});

const spikeLight = new THREE.PointLight(new THREE.Color('#ff2e1f'), 0, 9, 1.8);
scene.add(spikeLight);
const spikeMesh = new THREE.Group();
{
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.22, 0.34),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#14161a'), roughness: 0.5, metalness: 0.5 }),
  );
  body.position.y = 0.11;
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2e1f') }),
  );
  lamp.position.y = 0.26;
  spikeMesh.add(body, lamp);
  spikeMesh.visible = false;
  scene.add(spikeMesh);
}

function spikePos() {
  return rounds.state.planted ? rounds.state.planted.pos : new THREE.Vector3();
}
function showSpike(site) {
  const pos = rounds.state.planted.pos;
  spikeMesh.position.copy(pos);
  spikeMesh.visible = true;
  spikeLight.position.set(pos.x, 1.2, pos.z);
}
function hideSpike() {
  spikeMesh.visible = false;
  spikeLight.intensity = 0;
}

const bots = createBots(scene, world, effects, audio, {
  playerPos: () => player.state.position,
  playerAlive: () => game.playerAlive,
  playerCrouching: () => player.state.crouching,
  playerSpeed: () => player.groundSpeed(),
  spikePlanted: () => Boolean(rounds.state.planted),
  spikeSite: () => (rounds.state.planted ? rounds.state.planted.site : null),
  spikePos,
  damagePlayer(amount) {
    if (!game.playerAlive || game.frozen) return;
    game.health -= amount;
    hud.damageFlash();
    hud.setHealth(game.health);
    if (game.health <= 0) {
      game.health = 0;
      game.playerAlive = false;
      hud.setHint('You are down — your squad fights on.');
      hud.banner('YOU ARE DOWN', 'Spectating — the round plays on', 2200);
    }
  },
  onBotDown(bot, byPlayer) {
    hud.killfeed(`${byPlayer ? 'YOU' : bot.team === 'defend' ? 'VANGUARD' : 'EMBER'} ▸ ${bot.name}`, byPlayer);
    if (byPlayer) {
      game.kills += 1;
      rounds.addKillReward();
      audio.kill();
    }
  },
  onDefused(bot) {
    hud.banner('SPIKE DEFUSED', `${bot.name} cut the wires`, 3000);
    rounds.endRound('defend', 'Spike defused');
  },
});

const grenades = createGrenades(scene, world.colliders, effects, audio, (pos, radius, damage) => {
  // Blast: bots and the player take falloff damage.
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = bot.pos.distanceTo(pos);
    if (d < radius) bots.damageBot(bot, Math.round(damage * (1 - d / radius) + 10), { kind: 'player' }, random);
  }
  if (game.playerAlive) {
    const p = player.state.position;
    const d = Math.hypot(p.x - pos.x, p.z - pos.z);
    if (d < radius) {
      game.health -= Math.round(damage * (1 - d / radius) * 0.7 + 8);
      hud.damageFlash();
      hud.setHealth(game.health);
      if (game.health <= 0) {
        game.health = 0;
        game.playerAlive = false;
        hud.setHint('You are down — your squad fights on.');
      }
    }
  }
});

const game = {
  health: 100,
  playerAlive: true,
  kills: 0,
  frozen: false,
  plantProgress: 0,
  plantSite: null,
  buyOpen: false,
  suppressPause: false,
  wasFiring: false,
  lastStep: 0,
  elapsed: 0,
};
const body = player.state;

function shootTargets() {
  return world.shootables.concat(bots.hitMeshes);
}

function respawnAll() {
  const spawn = world.spawns.attack[Math.floor(random() * world.spawns.attack.length)];
  player.teleport(spawn.x, spawn.z, 0);
  game.health = 100;
  game.playerAlive = true;
  game.plantProgress = 0;
  game.plantSite = null;
  weapon.refill();
  grenades.reset();
  bots.spawnRound(random);
  hud.setHealth(100);
  hud.setScore(rounds.state.wins.attack, rounds.state.wins.defend);
  hud.setMoney(rounds.state.money);
  hud.setHint('');
  hud.plantProgress(null);
}

function restartMatch() {
  weapon.resetEconomy();
  rounds.startMatch();
  hud.setScore(0, 0);
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    audio.unlock();
    hud.hideOverlay();
    if (game.buyOpen) closeBuy();
  } else if (!game.suppressPause && rounds.state.phase !== 'match') {
    hud.showOverlay(game.playerAlive ? 'paused' : 'paused', '');
    if (game.buyOpen) closeBuy();
  }
}

hud.onPlay(() => {
  if (shot) return;
  if (rounds.state.phase === 'match') restartMatch();
  audio.unlock();
  input.requestLock();
});

function openBuy() {
  if (rounds.state.phase !== 'buy' || game.buyOpen) return;
  game.buyOpen = true;
  game.suppressPause = true;
  hud.showBuy(rounds.state.money, weapon.owned, weapon.state.grenades, rounds.state.round);
  if (document.pointerLockElement) document.exitPointerLock();
}

function closeBuy() {
  if (!game.buyOpen) return;
  game.buyOpen = false;
  game.suppressPause = false;
  hud.hideBuy();
  if (!shot) input.requestLock();
}

hud.onBuy((id) => {
  if (rounds.state.phase !== 'buy') return;
  let cost = null;
  if (id === 'grenade') cost = weapon.buyGrenade(rounds.state.money);
  else cost = weapon.buy(id, rounds.state.money);
  if (cost != null) {
    rounds.spend(cost);
    hud.setMoney(rounds.state.money);
    hud.refreshBuy(rounds.state.money, weapon.owned, weapon.state.grenades);
    if (id !== 'grenade') weapon.select(id);
    syncAmmoHud();
  }
});

function syncAmmoHud() {
  const def = weapon.currentDef();
  const slot = weapon.ammo[weapon.state.current];
  hud.setAmmo(slot.mag, slot.reserve, weapon.state.grenadeMode ? 'SPARK FRAG' : def.name, weapon.state.grenades);
}

function syncCamera() {
  const deathDrop = game.playerAlive ? 0 : 1.1;
  camera.position.set(body.position.x, body.position.y + body.eye - deathDrop, body.position.z);
  camera.rotation.set(body.pitch + (game.playerAlive ? 0 : 0.35), body.yaw, game.playerAlive ? 0 : 0.25, 'YXZ');
  const targetFov = weapon.state.zoomed ? 42 : 74;
  if (Math.abs(camera.fov - targetFov) > 0.2) {
    camera.fov += (targetFov - camera.fov) * 0.25;
    camera.updateProjectionMatrix();
  }
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function muzzleWorld() {
  camera.getWorldPosition(muzzle);
  camera.getWorldDirection(direction);
  muzzle.addScaledVector(direction, 0.55);
  muzzle.y -= 0.12;
  return muzzle;
}

function shoot() {
  const def = weapon.currentDef();
  if (!weapon.takeRound()) {
    audio.dry();
    return;
  }
  const spread = weapon.spread(player.groundSpeed()) * (input.state.aiming && !weapon.state.zoomed ? 0.7 : 1);
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const from = muzzleWorld().clone();
  const hit = raycaster.intersectObjects(shootTargets(), false)[0];
  const end = hit ? hit.point : camera.position.clone().addScaledVector(direction, 60);
  effects.tracer(from, end);
  if (hit) {
    const bot = hit.object.userData.bot;
    if (bot && bot.alive) {
      const headshot = hit.object.userData.part === 'head';
      const dmg = Math.round(def.damage * (headshot ? def.headMult : 1));
      bots.damageBot(bot, dmg, { kind: 'player' }, random);
      hud.hitMarker(bot.health <= 0, bot.health <= 0 ? 4000 : 90);
      if (bot.health > 0) audio.hit();
      effects.burst(hit.point, 0xff5a3c, 2.4);
    } else {
      effects.burst(hit.point, 0xffd9a0, 1.6);
    }
  }
  weapon.pullTrigger();
  player.recoil(def.recoil * (0.9 + random() * 0.25), (random() * 2 - 1) * def.recoil * 0.3);
  bots.hearShot(player.state.position, 30);
  syncAmmoHud();
}

function throwGrenade() {
  if (!weapon.throwGrenade()) return;
  camera.getWorldDirection(direction);
  grenades.throwFrom(
    new THREE.Vector3(body.position.x, body.position.y + body.eye - 0.1, body.position.z),
    direction.clone(),
    13,
  );
  syncAmmoHud();
}

function nearSite() {
  for (const site of ['A', 'B']) {
    const center = world.sites[site].center;
    const d = Math.hypot(body.position.x - center.x, body.position.z - center.z);
    if (d < world.sites[site].radius) return site;
  }
  return null;
}

function step(dt) {
  game.elapsed += dt;
  const pressed = input.takePressed();
  const phase = rounds.state.phase;

  if (pressed.has('KeyB')) {
    if (game.buyOpen) closeBuy();
    else openBuy();
  }
  if (game.buyOpen) {
    // Digit keys buy directly while the menu is open.
    const digitMap = { Digit1: 'pistol', Digit2: 'smg', Digit3: 'rifle', Digit4: 'dmr' };
    for (const [code, id] of Object.entries(digitMap)) {
      if (!pressed.has(code)) continue;
      let cost = null;
      if (rounds.state.phase === 'buy') {
        cost = weapon.buy(id, rounds.state.money);
        if (cost != null) {
          rounds.spend(cost);
          hud.setMoney(rounds.state.money);
          hud.refreshBuy(rounds.state.money, weapon.owned, weapon.state.grenades);
          weapon.select(id);
          syncAmmoHud();
        }
      }
    }
    if (pressed.has('KeyG')) {
      const cost = weapon.buyGrenade(rounds.state.money);
      if (cost != null) {
        rounds.spend(cost);
        hud.setMoney(rounds.state.money);
        hud.refreshBuy(rounds.state.money, weapon.owned, weapon.state.grenades);
        syncAmmoHud();
      }
    }
  } else {
    for (const id of WEAPON_ORDER) {
      if (pressed.has(`Digit${WEAPONS[id].slot}`)) {
        if (weapon.select(id)) syncAmmoHud();
      }
    }
    if (pressed.has('KeyG')) {
      if (weapon.select('grenade')) syncAmmoHud();
    }
  }

  rounds.step(dt);
  if (phase === 'buy') {
    // Buy phase: the player may walk the spawn; bots hold.
    player.step(dt, input.state.keys);
    weapon.step(dt, input.state.aiming);
    effects.step(dt);
  } else if (phase === 'live') {
    player.step(dt, input.state.keys);
    weapon.step(dt, input.state.aiming);
    bots.step(dt, game.elapsed, random);
    grenades.step(dt);
    effects.step(dt);

    // Firing.
    const def = weapon.currentDef();
    const firing = input.state.firing && game.playerAlive && input.state.locked;
    const freshClick = firing && !game.wasFiring;
    if (weapon.state.grenadeMode) {
      if (freshClick) throwGrenade();
    } else if (firing && weapon.ready() && (def.auto || freshClick)) {
      shoot();
    }
    game.wasFiring = firing;
    if (pressed.has('KeyR')) weapon.reload();

    // Footsteps.
    if (player.state.stepped > 2.2) {
      player.state.stepped = 0;
      if (player.groundSpeed() > 1) audio.footstep();
    }

    // Planting: hold E inside a site.
    const site = nearSite();
    if (game.playerAlive && site && !rounds.state.planted && input.state.keys.has('KeyE')) {
      game.plantSite = site;
      game.plantProgress += dt / PLANT_SECONDS;
      hud.plantProgress(game.plantProgress, `PLANTING SPIKE — SITE ${site}`);
      if (Math.floor(game.elapsed * 2) !== Math.floor((game.elapsed - dt) * 2)) audio.plantBeep();
      if (game.plantProgress >= 1) {
        const center = world.sites[site].center;
        rounds.plant(site, new THREE.Vector3(center.x, 0, center.z));
        game.plantProgress = 0;
        hud.plantProgress(null);
      }
    } else {
      if (game.plantProgress > 0) {
        game.plantProgress = Math.max(0, game.plantProgress - dt / 1.5);
        hud.plantProgress(game.plantProgress > 0 ? game.plantProgress : null);
      }
      if (site && game.playerAlive && !rounds.state.planted) {
        hud.setHint('Hold E to plant the spike');
      } else if (rounds.state.planted) {
        hud.setHint(`Spike live — defend site ${rounds.state.planted.site}`);
      } else {
        hud.setHint('');
      }
    }

    // Defuse warning.
    const defuse = bots.defuseProgress();
    if (defuse > 0) {
      hud.plantProgress(defuse, 'EMBER IS DEFUSING THE SPIKE');
    } else if (game.plantProgress <= 0) {
      hud.plantProgress(null);
    }

    // Elimination checks. If the spike is planted and every attacker is dead,
    // the round is NOT over: defenders must defuse before the fuse runs out.
    const counts = bots.aliveCounts();
    const attackAlive = counts.attack + (game.playerAlive ? 1 : 0);
    if (counts.defend === 0) {
      rounds.endRound('attack', rounds.state.planted ? 'Site cleared' : 'EMBER eliminated');
    } else if (attackAlive === 0 && !rounds.state.planted) {
      rounds.endRound('defend', 'VANGUARD eliminated');
    }

    // Spike blink.
    if (rounds.state.planted) {
      spikeLight.intensity = 6 + Math.sin(game.elapsed * 9) * 5;
    }
  } else {
    // Round over / match over: world settles, bots idle.
    effects.step(dt);
    weapon.step(dt, false);
  }

  // HUD numbers, every step.
  hud.setHealth(game.health);
  hud.setMoney(rounds.state.money);
  hud.setTimer(rounds.timerText(), Boolean(rounds.state.planted));
  hud.setScore(rounds.state.wins.attack, rounds.state.wins.defend);
  const counts = bots.aliveCounts();
  hud.setAlive(counts.attack + (game.playerAlive ? 1 : 0), counts.defend);
  const spreadPx = 4 + weapon.spread(player.groundSpeed()) * 900;
  hud.setCrosshair(spreadPx);
  syncAmmoHud();
}

let accumulator = 0;
let lastTime = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!game.frozen) {
    const look = input.takeLook();
    if (game.playerAlive) player.look(look.x, look.y);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      game.frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBanner();
  rounds.startMatch();
  if (name === 'start') {
    player.teleport(0, 15.5, 0);
    settle(10);
    aimAt(new THREE.Vector3(0, 1.6, -4));
    hud.showOverlay('start', '');
  } else if (name === 'play') {
    // Mid-fight down the open mid lane: player at mid-south looking north at an EMBER
    // bot in the open, a VANGUARD mate to the right, the crane and site A behind.
    player.teleport(0, 10, 0);
    settle(10);
    const enemy = bots.bots.find((b) => b.team === 'defend');
    enemy.pos.set(0, 0, 0);
    enemy.group.position.copy(enemy.pos);
    enemy.yaw = Math.PI;
    enemy.group.rotation.set(0, enemy.yaw, 0);
    const mate = bots.bots.find((b) => b.team === 'attack');
    mate.pos.set(4.5, 0, 3);
    mate.group.position.copy(mate.pos);
    mate.yaw = Math.PI * 0.75;
    mate.group.rotation.set(0, mate.yaw, 0);
    rounds.state.phase = 'live';
    rounds.state.phaseTime = 87;
    weapon.owned.add('rifle');
    weapon.select('rifle');
    syncAmmoHud();
    settle(30);
    aimAt(new THREE.Vector3(enemy.pos.x, 1.15, enemy.pos.z));
    shoot();
    settle(8);
    aimAt(new THREE.Vector3(enemy.pos.x, 1.15, enemy.pos.z));
    shoot();
    settle(8);
    aimAt(new THREE.Vector3(enemy.pos.x, 1.15, enemy.pos.z));
    shoot();
    settle(10);
  } else if (name === 'buy') {
    player.teleport(0, 15.5, 0);
    settle(10);
    aimAt(new THREE.Vector3(0, 1.6, -4));
    rounds.state.money = 4700;
    hud.setMoney(4700);
    hud.showBuy(4700, weapon.owned, weapon.state.grenades);
  } else if (name === 'end') {
    rounds.state.wins.attack = 4;
    rounds.state.wins.defend = 2;
    rounds.state.phase = 'over';
    rounds.state.lastReason = 'Spike detonated';
    player.teleport(-10.5, -5.5, 0);
    settle(10);
    const enemy = bots.bots.find((b) => b.team === 'defend');
    enemy.pos.set(-15, 0, -10);
    enemy.group.position.copy(enemy.pos);
    enemy.alive = false;
    enemy.fall = 1;
    enemy.group.rotation.x = -1.45;
    enemy.group.position.y = -0.12;
    aimAt(new THREE.Vector3(-15, 1.2, -11));
    hud.banner('VANGUARD WINS THE ROUND', 'Spike detonated', 60000);
    hud.setScore(4, 2);
  }
  hud.setAmmo(weapon.ammo[weapon.state.current].mag, weapon.ammo[weapon.state.current].reserve,
    weapon.currentDef().name, weapon.state.grenades);
  hud.setHealth(game.health);
  hud.setScore(rounds.state.wins.attack, rounds.state.wins.defend);
  hud.setTimer(rounds.timerText(), Boolean(rounds.state.planted));
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.__game = {
  game, rounds, bots, weapon, player,
  state() {
    return {
      phase: rounds.state.phase,
      round: rounds.state.round,
      wins: rounds.state.wins,
      money: rounds.state.money,
      health: game.health,
      playerAlive: game.playerAlive,
      kills: game.kills,
      alive: bots.aliveCounts(),
      planted: Boolean(rounds.state.planted),
    };
  },
};

bots.createAll(random);
rounds.startMatch();
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
