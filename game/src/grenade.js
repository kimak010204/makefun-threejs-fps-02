// SPARK frag grenades: thrown on an arc, they bounce once or twice off the map, beep,
// then detonate. Damage falls off with distance; the blast also hurts the thrower, so
// the arc matters. One mesh per live grenade, reused from a small pool.
import * as THREE from 'three';

const GRAVITY = 14;
const MAX_LIVE = 4;
const BLAST_RADIUS = 6.5;
const BLAST_DAMAGE = 95;

export function createGrenades(scene, colliders, effects, audio, onExplode) {
  const pool = [];
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3f6f4a'), roughness: 0.6, metalness: 0.3 });
  const ballGeo = new THREE.SphereGeometry(0.09, 12, 9);
  for (let i = 0; i < MAX_LIVE; i += 1) {
    const mesh = new THREE.Mesh(ballGeo, bodyMat);
    mesh.visible = false;
    mesh.castShadow = true;
    scene.add(mesh);
    pool.push({ mesh, pos: new THREE.Vector3(), vel: new THREE.Vector3(), fuse: 0, bounced: false, live: false });
  }

  const probe = new THREE.Box3();
  function overlaps(x, y, z) {
    probe.min.set(x - 0.09, y - 0.09, z - 0.09);
    probe.max.set(x + 0.09, y + 0.09, z + 0.09);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  function explode(slot) {
    slot.live = false;
    slot.mesh.visible = false;
    effects.explosion(slot.pos);
    audio.explosion();
    onExplode(slot.pos.clone(), BLAST_RADIUS, BLAST_DAMAGE);
  }

  return {
    throwFrom(from, dir, speed = 13) {
      const slot = pool.find((s) => !s.live);
      if (!slot) return false;
      slot.live = true;
      slot.pos.copy(from);
      slot.vel.copy(dir).multiplyScalar(speed);
      slot.vel.y += 3.2;
      slot.fuse = 2.4;
      slot.bounced = false;
      slot.mesh.visible = true;
      slot.mesh.position.copy(slot.pos);
      return true;
    },
    liveCount() {
      return pool.filter((s) => s.live).length;
    },
    step(dt) {
      for (const slot of pool) {
        if (!slot.live) continue;
        slot.fuse -= dt;
        slot.vel.y -= GRAVITY * dt;
        const next = slot.pos.clone().addScaledVector(slot.vel, dt);
        const hit = overlaps(next.x, next.y, next.z);
        if (hit) {
          // Cheap bounce: reverse the axis that moved into the box most.
          const cx = Math.abs(next.x - slot.pos.x);
          const cz = Math.abs(next.z - slot.pos.z);
          const cy = Math.abs(next.y - slot.pos.y);
          if (cy >= cx && cy >= cz) slot.vel.y = -slot.vel.y * 0.45;
          else if (cx >= cz) slot.vel.x = -slot.vel.x * 0.45;
          else slot.vel.z = -slot.vel.z * 0.45;
          slot.vel.multiplyScalar(0.7);
          if (!slot.bounced) {
            slot.bounced = true;
            slot.fuse = Math.min(slot.fuse, 1.4);
          }
        } else {
          slot.pos.copy(next);
        }
        if (slot.pos.y < 0.09) {
          slot.pos.y = 0.09;
          slot.vel.y = Math.abs(slot.vel.y) * 0.45;
          slot.vel.x *= 0.7;
          slot.vel.z *= 0.7;
          if (!slot.bounced) {
            slot.bounced = true;
            slot.fuse = Math.min(slot.fuse, 1.4);
          }
        }
        slot.mesh.position.copy(slot.pos);
        if (slot.fuse <= 0) explode(slot);
      }
    },
    reset() {
      for (const slot of pool) {
        slot.live = false;
        slot.mesh.visible = false;
      }
    },
  };
}
