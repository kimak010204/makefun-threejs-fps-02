// Weapons: the numbers table, the view models, firing, reload and spread. Main owns the
// ray and the damage; this module owns the gun in the player's hands. Accuracy is the
// point: still and aimed beats moving and spraying, and every gun punishes the move.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', slot: 1, name: 'P9 SIDEARM', price: 0,
    damage: 26, headMult: 3, mag: 12, reserve: 48, gap: 0.17, reload: 1.5,
    spreadStill: 0.003, spreadMove: 0.02, recoil: 0.011, auto: false, zoom: 0,
  },
  smg: {
    id: 'smg', slot: 2, name: 'RAPTOR SMG', price: 1500,
    damage: 21, headMult: 3, mag: 30, reserve: 120, gap: 0.075, reload: 2.0,
    spreadStill: 0.006, spreadMove: 0.034, recoil: 0.007, auto: true, zoom: 0,
  },
  rifle: {
    id: 'rifle', slot: 3, name: 'VK-47 RIFLE', price: 2700,
    damage: 34, headMult: 4, mag: 30, reserve: 90, gap: 0.11, reload: 2.2,
    spreadStill: 0.0018, spreadMove: 0.03, recoil: 0.013, auto: true, zoom: 0,
  },
  dmr: {
    id: 'dmr', slot: 4, name: 'LONGSHOT DMR', price: 4200,
    damage: 88, headMult: 4, mag: 5, reserve: 20, gap: 1.15, reload: 2.8,
    spreadStill: 0.0006, spreadMove: 0.045, recoil: 0.038, auto: false, zoom: 1,
  },
};
export const GRENADE_PRICE = 300;
export const WEAPON_ORDER = ['pistol', 'smg', 'rifle', 'dmr'];

function buildModel(def) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#14161a'), roughness: 0.55, metalness: 0.4 });
  const group = new THREE.Group();
  const add = (w, h, d, x, y, z, m) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  if (def.id === 'pistol') {
    add(0.06, 0.09, 0.26, 0, 0, -0.1, body);
    add(0.05, 0.12, 0.07, 0, -0.09, 0.02, grip);
    add(0.02, 0.03, 0.02, 0, 0.055, -0.2, dark);
  } else if (def.id === 'smg') {
    add(0.08, 0.09, 0.4, 0, 0, -0.08, body);
    add(0.045, 0.045, 0.34, 0, 0.02, -0.42, grip);
    add(0.06, 0.16, 0.06, 0, -0.12, -0.02, grip);
    add(0.07, 0.07, 0.18, 0, -0.01, 0.24, grip);
  } else if (def.id === 'rifle') {
    add(0.09, 0.1, 0.44, 0, 0, -0.08, body);
    add(0.045, 0.045, 0.42, 0, 0.025, -0.46, grip);
    add(0.075, 0.08, 0.22, 0, -0.02, 0.28, grip);
    add(0.05, 0.05, 0.1, 0, -0.11, 0.02, grip);
    add(0.02, 0.06, 0.02, 0, 0.08, -0.12, dark);
  } else {
    add(0.09, 0.11, 0.55, 0, 0, -0.1, dark);
    add(0.05, 0.05, 0.5, 0, 0.03, -0.55, grip);
    add(0.07, 0.07, 0.1, 0, 0.09, -0.18, body);
    add(0.06, 0.14, 0.06, 0, -0.12, 0.06, grip);
    add(0.075, 0.08, 0.24, 0, -0.02, 0.3, grip);
  }
  return group;
}

function buildGrenadeModel() {
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3f6f4a'), roughness: 0.6, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#14161a'), roughness: 0.5, metalness: 0.4 });
  const group = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), body);
  const pin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.03), dark);
  pin.position.set(0, 0.09, 0);
  group.add(ball, pin);
  return group;
}

export function createWeapon(camera, audio) {
  const models = {};
  for (const id of WEAPON_ORDER) {
    const model = buildModel(WEAPONS[id]);
    model.position.set(0.24, -0.2, -0.42);
    model.visible = false;
    camera.add(model);
    models[id] = model;
  }
  const grenadeModel = buildGrenadeModel();
  grenadeModel.position.set(0.22, -0.18, -0.4);
  grenadeModel.visible = false;
  camera.add(grenadeModel);

  // Muzzle flash: a soft radial glow sprite, always facing the camera.
  const flashCanvas = document.createElement('canvas');
  flashCanvas.width = 64;
  flashCanvas.height = 64;
  {
    const ctx = flashCanvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255, 220, 140, 1)');
    grad.addColorStop(0.4, 'rgba(245, 168, 48, 0.85)');
    grad.addColorStop(1, 'rgba(245, 168, 48, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(flashCanvas), transparent: true, opacity: 0.9,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  flash.position.set(0.24, -0.16, -0.95);
  flash.scale.set(0.34, 0.34, 1);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const ammo = {};
  for (const id of WEAPON_ORDER) ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
  const owned = new Set(['pistol']);
  const state = {
    current: 'pistol', cooldown: 0, reloadLeft: 0, flash: 0, kick: 0,
    grenades: 0, grenadeMode: false, zoomed: false,
  };

  function currentDef() {
    return WEAPONS[state.current];
  }

  function select(id) {
    if (state.grenadeMode && id !== 'grenade') {
      state.grenadeMode = false;
      grenadeModel.visible = false;
    }
    if (id === 'grenade') {
      if (state.grenades <= 0) return false;
      state.grenadeMode = true;
      for (const key of WEAPON_ORDER) models[key].visible = false;
      grenadeModel.visible = true;
      state.reloadLeft = 0;
      audio?.click();
      return true;
    }
    if (!owned.has(id)) return false;
    state.current = id;
    state.reloadLeft = 0;
    for (const key of WEAPON_ORDER) models[key].visible = key === id;
    audio?.click();
    return true;
  }

  function step(dt, aiming) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const def = currentDef();
    const model = models[state.current];
    const baseZ = -0.42 + (aiming && def.zoom ? 0.1 : 0);
    const baseX = aiming && def.zoom ? 0 : 0.24;
    const baseY = aiming && def.zoom ? -0.155 : -0.2;
    model.position.z = baseZ + state.kick;
    model.position.x += (baseX - model.position.x) * Math.min(1, dt * 16);
    model.position.y += (baseY - model.position.y) * Math.min(1, dt * 16);
    model.rotation.x = state.kick * 2.2;
    grenadeModel.position.z = -0.4 + state.kick;
    grenadeModel.rotation.x = state.kick * 2;
    flash.visible = state.flash > 0;
    flash.material.opacity = state.flash > 0 ? 0.9 : 0;
    flashLight.intensity = state.flash > 0 ? 12 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def.reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const slot = ammo[state.current];
        const need = def.mag - slot.mag;
        const take = Math.min(need, slot.reserve);
        slot.mag += take;
        slot.reserve -= take;
      }
    }
    state.zoomed = Boolean(aiming && def.zoom);
  }

  return {
    state,
    ammo,
    owned,
    step,
    select,
    currentDef,
    ready() {
      if (state.grenadeMode) return state.cooldown === 0;
      return ammo[state.current].mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = currentDef().gap;
      state.flash = 0.06;
      state.kick = 0.055 + currentDef().recoil * 0.6;
      audio?.shot(state.current);
    },
    takeRound() {
      const slot = ammo[state.current];
      if (slot.mag <= 0) return false;
      slot.mag -= 1;
      return true;
    },
    reload() {
      const def = currentDef();
      const slot = ammo[state.current];
      if (state.reloadLeft > 0 || slot.mag === def.mag || slot.reserve === 0) return;
      state.reloadLeft = def.reload;
      audio?.reload();
    },
    spread(speed) {
      const def = currentDef();
      const moving = Math.min(1, speed / 5.2);
      let spread = def.spreadStill + moving * def.spreadMove;
      if (state.zoomed) spread *= 0.35;
      return spread;
    },
    buy(id, money) {
      const def = WEAPONS[id];
      if (!def || owned.has(id) || money < def.price) return null;
      owned.add(id);
      ammo[id] = { mag: def.mag, reserve: def.reserve };
      audio?.buy();
      return def.price;
    },
    buyGrenade(money) {
      if (state.grenades >= 2 || money < GRENADE_PRICE) return null;
      state.grenades += 1;
      audio?.buy();
      return GRENADE_PRICE;
    },
    throwGrenade() {
      if (!state.grenadeMode || state.grenades <= 0 || state.cooldown > 0) return false;
      state.grenades -= 1;
      state.cooldown = 0.5;
      state.grenadeMode = false;
      grenadeModel.visible = false;
      select(state.current);
      return true;
    },
    refill() {
      for (const id of owned) {
        ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      select('pistol');
    },
    resetEconomy() {
      owned.clear();
      owned.add('pistol');
      state.grenades = 0;
      this.refill();
    },
  };
}
