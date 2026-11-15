// Bots: 3 VANGUARD teammates with the player, 4 EMBER defenders. Each bot walks the
// waypoint graph, holds sites, investigates gunfire, and fights with reaction time,
// bursts and spread — so stopping to aim beats spraying, for them and for the player.
// Bot-vs-bot fights use the same line-of-sight and spread as shots at the player.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WAYPOINTS, nearestNode, route, SITE_NODES, SPAWN_NODES } from './waypoints.js';

const RADIUS = 0.34;
const HEIGHT = 1.72;
const WALK_SPEED = 3.7;
const PUSH_SPEED = 4.7;
const VISION_RANGE = 42;
const DEFUSE_TIME = 5;

const NAMES = {
  attack: ['DUST', 'RIVET', 'BOLT'],
  defend: ['ASH', 'COAL', 'SLAG', 'CINDER'],
};

function buildBody(team) {
  const group = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({
    color: new THREE.Color(team === 'attack' ? '#3a4a5e' : '#5e3a2a'), roughness: 0.75, metalness: 0.1,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: new THREE.Color(team === 'attack' ? PALETTE.vanguard : PALETTE.ember),
    roughness: 0.4, metalness: 0.2, emissive: new THREE.Color(team === 'attack' ? PALETTE.vanguard : PALETTE.ember),
    emissiveIntensity: 0.35,
  });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#14161a'), roughness: 0.6, metalness: 0.3 });
  const add = (geo, m, x, y, z) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  add(new THREE.BoxGeometry(0.16, 0.78, 0.16), dark, -0.12, 0.39, 0);
  add(new THREE.BoxGeometry(0.16, 0.78, 0.16), dark, 0.12, 0.39, 0);
  const torso = add(new THREE.BoxGeometry(0.54, 0.72, 0.3), suit, 0, 1.12, 0);
  torso.userData.part = 'torso';
  add(new THREE.BoxGeometry(0.56, 0.1, 0.32), trim, 0, 1.42, 0);
  const head = add(new THREE.SphereGeometry(0.16, 14, 10), suit, 0, 1.62, 0);
  head.userData.part = 'head';
  add(new THREE.BoxGeometry(0.3, 0.07, 0.05), trim, 0, 1.64, 0.14);
  const gun = add(new THREE.BoxGeometry(0.07, 0.09, 0.62), dark, 0.2, 1.18, -0.28);
  gun.rotation.x = 0.06;
  add(new THREE.BoxGeometry(0.34, 0.06, 0.06), trim, 0, 1.52, 0);
  return { group, torso, head };
}

export function createBots(scene, world, effects, audio, hooks) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const bots = [];
  const hitMeshes = [];
  let now = 0;

  function losClear(from, to) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const dist = dir.length();
    if (dist < 0.01) return true;
    dir.normalize();
    raycaster.set(from, dir);
    raycaster.far = dist;
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    return !hit || hit.distance > dist - 0.3;
  }

  function makeBot(team, index, random) {
    const { group, torso, head } = buildBody(team);
    scene.add(group);
    const bot = {
      id: `${team}-${index}`,
      name: NAMES[team][index],
      team,
      group, torso, head,
      pos: new THREE.Vector3(),
      yaw: 0,
      health: 100,
      alive: true,
      fall: 0,
      state: 'patrol',
      route: [],
      routeIndex: 0,
      holdUntil: 0,
      target: null, // {kind:'player'|'bot', ref, pos}
      lastSeen: new THREE.Vector3(),
      lastSeenAt: -99,
      hearPos: null,
      reaction: 0,
      burstLeft: 0,
      shotTimer: 0,
      strafeDir: 1,
      strafeUntil: 0,
      skill: 0.55 + random() * 0.3,
      reactionBase: 0.5 + random() * 0.5,
      defuseProgress: 0,
      defuseRoute: null,
      defuseRouteIndex: 0,
      defuseTarget: null,
      flash: 0,
      stepPhase: random() * 6,
    };
    torso.userData.bot = bot;
    head.userData.bot = bot;
    hitMeshes.push(torso, head);
    bots.push(bot);
    return bot;
  }

  function spawnRound(random) {
    for (const bot of bots) {
      const nodes = SPAWN_NODES[bot.team];
      const node = WAYPOINTS[nodes[bots.indexOf(bot) % nodes.length]];
      bot.pos.copy(node);
      bot.pos.y = 0;
      bot.yaw = bot.team === 'attack' ? Math.PI : 0;
      bot.health = 100;
      bot.alive = true;
      bot.fall = 0;
      bot.state = 'patrol';
      bot.route = [];
      bot.routeIndex = 0;
      bot.holdUntil = 0;
      bot.target = null;
      bot.hearPos = null;
      bot.defuseProgress = 0;
      bot.defuseRoute = null;
      bot.defuseRouteIndex = 0;
      bot.defuseTarget = null;
      bot.flash = 0;
      bot.group.visible = true;
      bot.group.rotation.set(0, bot.yaw, 0);
      bot.group.position.copy(bot.pos);
      bot.torso.material.emissive?.setHex(0x000000);
      pickDestination(bot, random);
    }
  }

  function pickDestination(bot, random) {
    let dest;
    if (hooks.spikePlanted()) {
      const site = hooks.spikeSite();
      const nodes = SITE_NODES[site];
      dest = nodes[Math.floor(random() * nodes.length)];
    } else if (bot.team === 'defend') {
      const site = random() < 0.5 ? 'A' : 'B';
      const nodes = SITE_NODES[site];
      dest = nodes[Math.floor(random() * nodes.length)];
    } else {
      const site = random() < 0.5 ? 'A' : 'B';
      const nodes = SITE_NODES[site];
      dest = nodes[Math.floor(random() * nodes.length)];
    }
    bot.route = route(nearestNode(bot.pos.x, bot.pos.z), dest).map((i) => WAYPOINTS[i]);
    bot.routeIndex = 0;
    bot.state = 'patrol';
  }

  const probe = new THREE.Box3();
  function blocked(x, z) {
    probe.min.set(x - RADIUS, 0.04, z - RADIUS);
    probe.max.set(x + RADIUS, HEIGHT - 0.04, z + RADIUS);
    for (const collider of world.colliders) if (probe.intersectsBox(collider)) return true;
    return false;
  }

  function moveToward(bot, target, dt, speed) {
    const dx = target.x - bot.pos.x;
    const dz = target.z - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const step = Math.min(dist, speed * dt);
    const nx = bot.pos.x + (dx / dist) * step;
    const nz = bot.pos.z + (dz / dist) * step;
    if (!blocked(nx, bot.pos.z)) bot.pos.x = nx;
    if (!blocked(bot.pos.x, nz)) bot.pos.z = nz;
    bot.yaw = Math.atan2(dx, dz) + Math.PI;
    return dist < 0.7;
  }

  function eyePos(bot) {
    return new THREE.Vector3(bot.pos.x, 1.5, bot.pos.z);
  }

  function playerTargetPos() {
    const p = hooks.playerPos();
    return new THREE.Vector3(p.x, p.y + 1.15, p.z);
  }

  function botTargetPos(other) {
    return new THREE.Vector3(other.pos.x, 1.15, other.pos.z);
  }

  // Can this bot see that point? Range, facing and a clear line.
  function canSee(bot, point, rangeScale = 1) {
    const eye = eyePos(bot);
    const to = new THREE.Vector3().subVectors(point, eye);
    const dist = to.length();
    if (dist > VISION_RANGE * rangeScale) return false;
    if (dist > 6) {
      to.normalize();
      const facing = new THREE.Vector3(Math.sin(bot.yaw + Math.PI), 0, Math.cos(bot.yaw + Math.PI));
      if (facing.dot(to) < 0.15) return false;
    }
    return losClear(eye, point);
  }

  function acquireTarget(bot) {
    let best = null;
    let bestDist = Infinity;
    const playerAlive = hooks.playerAlive();
    if (bot.team === 'defend' && playerAlive) {
      const point = playerTargetPos();
      const rangeScale = hooks.playerCrouching() && hooks.playerSpeed() < 0.5 ? 0.55 : 1;
      if (canSee(bot, point, rangeScale)) {
        const dist = eyePos(bot).distanceTo(point);
        best = { kind: 'player', pos: point };
        bestDist = dist;
      }
    }
    for (const other of bots) {
      if (!other.alive || other.team === bot.team) continue;
      const point = botTargetPos(other);
      if (!canSee(bot, point)) continue;
      const dist = eyePos(bot).distanceTo(point);
      if (dist < bestDist) {
        bestDist = dist;
        best = { kind: 'bot', ref: other, pos: point };
      }
    }
    return best;
  }

  const ray = new THREE.Ray();
  const playerBox = new THREE.Box3();
  const playerHead = new THREE.Sphere();
  function shootAt(bot, target, dt, random) {
    // Fire one hitscan round at the target with spread from skill, distance and motion.
    const muzzle = eyePos(bot);
    muzzle.y -= 0.25;
    const aim = new THREE.Vector3().subVectors(target.pos, muzzle).normalize();
    const dist = eyePos(bot).distanceTo(target.pos);
    const moving = target.kind === 'player' ? hooks.playerSpeed() : 3;
    const spread = (0.012 + dist * 0.0009 + moving * 0.004) * (1.25 - bot.skill * 0.5);
    aim.x += (random() * 2 - 1) * spread;
    aim.y += (random() * 2 - 1) * spread;
    aim.z += (random() * 2 - 1) * spread;
    aim.normalize();
    ray.set(muzzle, aim);
    let hitPoint = null;
    let hitBot = null;
    let hitPlayer = false;
    let headshot = false;
    if (target.kind === 'player') {
      const p = hooks.playerPos();
      playerBox.min.set(p.x - 0.34, p.y, p.z - 0.34);
      playerBox.max.set(p.x + 0.34, p.y + 1.72, p.z + 0.34);
      playerHead.center.set(p.x, p.y + 1.52, p.z);
      playerHead.radius = 0.17;
      const headHit = ray.intersectsSphere(playerHead);
      const bodyHit = ray.intersectsBox(playerBox);
      if (headHit || bodyHit) {
        headshot = headHit;
        hitPlayer = true;
        const t = ray.distanceToPoint(playerHead.center);
        hitPoint = muzzle.clone().addScaledVector(aim, Math.max(1, t));
      }
    } else {
      raycaster.set(muzzle, aim);
      raycaster.far = 60;
      const hit = raycaster.intersectObjects([target.ref.torso, target.ref.head], false)[0];
      if (hit) {
        hitBot = target.ref;
        headshot = hit.object.userData.part === 'head';
        hitPoint = hit.point;
      }
    }
    if (!hitPoint) {
      raycaster.set(muzzle, aim);
      raycaster.far = 60;
      const wall = raycaster.intersectObjects(world.shootables, false)[0];
      hitPoint = wall ? wall.point : muzzle.clone().addScaledVector(aim, 40);
      if (wall) effects.burst(wall.point, 0xffd9a0, 2);
    }
    effects.tracer(muzzle, hitPoint);
    const distToPlayer = hooks.playerPos().distanceTo(muzzle);
    if (distToPlayer < 34) audio.enemyShot(distToPlayer);
    if (hitPlayer) {
      const dmg = Math.round((headshot ? 26 : 11) * (0.85 + random() * 0.3));
      hooks.damagePlayer(dmg, bot.pos);
    } else if (hitBot) {
      damageBot(hitBot, headshot ? 34 : 13, bot, random);
    }
  }

  function damageBot(bot, amount, attacker, random) {
    if (!bot.alive) return;
    bot.health -= amount;
    bot.flash = 0.12;
    if (attacker && attacker.kind === 'player') {
      bot.lastSeen.copy(hooks.playerPos());
      bot.lastSeenAt = now;
      bot.hearPos = hooks.playerPos().clone();
    }
    if (bot.health > 0) return;
    bot.alive = false;
    bot.fall = 0;
    bot.defuseProgress = 0;
    hooks.onBotDown(bot, attacker && attacker.kind === 'player');
  }

  function stepBot(bot, dt, random) {
    if (!bot.alive) {
      if (bot.fall < 1) {
        bot.fall = Math.min(1, bot.fall + dt / 0.45);
        bot.group.rotation.x = -bot.fall * 1.45;
        bot.group.position.y = -bot.fall * 0.12;
      }
      return;
    }
    bot.flash = Math.max(0, bot.flash - dt);
    bot.torso.material.emissive.setHex(bot.flash > 0 ? 0x881111 : 0x000000);

    // Defuse: the nearest living defender channels on the planted spike.
    if (hooks.spikePlanted() && bot.team === 'defend') {
      const spikePos = hooks.spikePos();
      const distToSpike = Math.hypot(spikePos.x - bot.pos.x, spikePos.z - bot.pos.z);
      const nearestDefender = bots
        .filter((b) => b.alive && b.team === 'defend')
        .sort((a, b) => Math.hypot(hooks.spikePos().x - a.pos.x, hooks.spikePos().z - a.pos.z)
          - Math.hypot(hooks.spikePos().x - b.pos.x, hooks.spikePos().z - b.pos.z))[0];
      if (nearestDefender === bot) {
        if (distToSpike > 1.4) {
          // Route via the waypoint graph: a straight walk gets stuck on the
          // site walls (a defender north of the site can never walk through
          // its north wall). The last leg closes in on the spike directly.
          if (!bot.defuseRoute || bot.defuseRouteIndex >= bot.defuseRoute.length
            || !bot.defuseTarget || bot.defuseTarget.distanceToSquared(spikePos) > 0.25) {
            const dest = nearestNode(spikePos.x, spikePos.z);
            bot.defuseRoute = route(nearestNode(bot.pos.x, bot.pos.z), dest).map((i) => WAYPOINTS[i]);
            bot.defuseRoute.push(spikePos.clone());
            bot.defuseRouteIndex = 0;
            bot.defuseTarget = spikePos.clone();
          }
          const node = bot.defuseRoute[bot.defuseRouteIndex];
          if (moveToward(bot, node, dt, PUSH_SPEED)) bot.defuseRouteIndex += 1;
          bot.defuseProgress = 0;
        } else {
          bot.defuseProgress += dt / DEFUSE_TIME;
          bot.yaw = Math.atan2(spikePos.x - bot.pos.x, spikePos.z - bot.pos.z) + Math.PI;
          if (Math.floor(now * 2) !== Math.floor((now - dt) * 2)) audio.defuseBeep();
          if (bot.defuseProgress >= 1) hooks.onDefused(bot);
          return;
        }
      }
    }

    const target = acquireTarget(bot);
    if (target) {
      bot.target = target;
      bot.lastSeen.copy(target.pos);
      bot.lastSeenAt = now;
      if (bot.state !== 'engage') {
        bot.state = 'engage';
        bot.reaction = bot.reactionBase * (0.7 + random() * 0.6);
        bot.burstLeft = 0;
        bot.shotTimer = 0;
      }
    } else if (bot.state === 'engage') {
      if (now - bot.lastSeenAt > 1.6) {
        bot.state = 'patrol';
        bot.target = null;
        if (bot.hearPos) {
          bot.route = [bot.hearPos.clone()];
          bot.routeIndex = 0;
          bot.hearPos = null;
        } else {
          pickDestination(bot, random);
        }
      } else {
        // Keep the last seen corner in view while the target is briefly hidden.
        bot.target = { kind: 'point', pos: bot.lastSeen };
      }
    }

    if (bot.state === 'engage' && bot.target) {
      const toTarget = new THREE.Vector3().subVectors(bot.target.pos, bot.pos);
      const dist = Math.hypot(toTarget.x, toTarget.z);
      bot.yaw = Math.atan2(toTarget.x, toTarget.z) + Math.PI;
      // Strafe sideways, close in when far, back off when too close.
      if (now > bot.strafeUntil) {
        bot.strafeDir = random() < 0.5 ? -1 : 1;
        bot.strafeUntil = now + 0.7 + random() * 0.9;
      }
      const side = new THREE.Vector3(-toTarget.z, 0, toTarget.x).normalize().multiplyScalar(bot.strafeDir);
      const toward = dist > 20 ? 1 : dist < 6 ? -1 : 0;
      const move = side.addScaledVector(toTarget.clone().normalize(), toward * 0.7).normalize();
      const step = move.multiplyScalar(WALK_SPEED * 0.75 * dt);
      if (!blocked(bot.pos.x + step.x, bot.pos.z)) bot.pos.x += step.x;
      if (!blocked(bot.pos.x, bot.pos.z + step.z)) bot.pos.z += step.z;
      if (bot.target.kind !== 'point') {
        if (bot.reaction > 0) {
          bot.reaction -= dt;
        } else {
          if (bot.burstLeft === 0) {
            bot.burstLeft = 3 + Math.floor(random() * 3);
            bot.shotTimer = 0;
          }
          bot.shotTimer -= dt;
          if (bot.shotTimer <= 0 && bot.burstLeft > 0) {
            shootAt(bot, bot.target, dt, random);
            bot.burstLeft -= 1;
            bot.shotTimer = bot.burstLeft > 0 ? 0.13 : 0.55 + random() * 0.5;
          }
        }
      }
    } else if (bot.state === 'patrol') {
      if (now < bot.holdUntil) {
        // Holding a position: scan slowly.
        bot.yaw += dt * 0.35;
      } else if (bot.route.length && bot.routeIndex < bot.route.length) {
        const node = bot.route[bot.routeIndex];
        if (moveToward(bot, node, dt, hooks.spikePlanted() ? PUSH_SPEED : WALK_SPEED)) {
          bot.routeIndex += 1;
          if (bot.routeIndex >= bot.route.length) {
            bot.holdUntil = now + 2.5 + random() * 5;
            if (random() < 0.6) pickDestination(bot, random);
          }
        }
      } else {
        pickDestination(bot, random);
      }
    }

    bot.group.position.copy(bot.pos);
    bot.group.rotation.set(0, bot.yaw, 0);
  }

  function createAll(random) {
    for (let i = 0; i < 3; i += 1) makeBot('attack', i, random);
    for (let i = 0; i < 4; i += 1) makeBot('defend', i, random);
  }

  return {
    bots,
    hitMeshes,
    createAll,
    spawnRound,
    damageBot,
    step(dt, time, random) {
      now = time;
      for (const bot of bots) stepBot(bot, dt, random);
    },
    hearShot(fromPos, radius = 30) {
      for (const bot of bots) {
        if (!bot.alive) continue;
        if (bot.pos.distanceTo(fromPos) < radius) {
          bot.hearPos = fromPos.clone();
          if (bot.state === 'patrol' && bot.routeIndex >= bot.route.length - 1) {
            bot.route = [fromPos.clone()];
            bot.routeIndex = 0;
          }
        }
      }
    },
    aliveCounts() {
      return {
        attack: bots.filter((b) => b.alive && b.team === 'attack').length,
        defend: bots.filter((b) => b.alive && b.team === 'defend').length,
      };
    },
    defuseProgress() {
      const defuser = bots.find((b) => b.alive && b.team === 'defend' && b.defuseProgress > 0);
      return defuser ? defuser.defuseProgress : 0;
    },
    reset() {
      for (const bot of bots) {
        bot.group.visible = false;
        bot.alive = false;
      }
    },
  };
}
