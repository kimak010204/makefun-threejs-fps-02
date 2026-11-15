// Transient combat effects, all pooled: tracers, impact sparks and the spike explosion.
// Nothing is allocated per frame in the hot path; pools are created once and reused.
import * as THREE from 'three';

const TRACER_POOL = 14;
const BURST_POOL = 10;
const BURST_PARTICLES = 14;

export function createEffects(scene) {
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false,
    }));
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  const bursts = [];
  for (let i = 0; i < BURST_POOL; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BURST_PARTICLES * 3), 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffc46b, size: 0.09, transparent: true, opacity: 0, depthWrite: false,
    }));
    points.visible = false;
    points.frustumCulled = false;
    scene.add(points);
    bursts.push({ points, life: 0, velocities: new Float32Array(BURST_PARTICLES * 3) });
  }
  let burstIndex = 0;

  const boom = new THREE.Mesh(
    new THREE.SphereGeometry(1, 18, 12),
    new THREE.MeshBasicMaterial({ color: 0xff8c2e, transparent: true, opacity: 0, depthWrite: false }),
  );
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(0xff8c2e, 0, 22, 1.6);
  scene.add(boomLight);
  let boomLife = 0;

  const tmp = new THREE.Vector3();

  function tracer(from, to) {
    const slot = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % TRACER_POOL;
    const pos = slot.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    slot.line.visible = true;
    slot.life = 0.09;
    slot.line.material.opacity = 0.85;
  }

  function burst(point, color = 0xffc46b, speed = 3.2) {
    const slot = bursts[burstIndex];
    burstIndex = (burstIndex + 1) % BURST_POOL;
    slot.points.material.color.setHex(color);
    const pos = slot.points.geometry.attributes.position;
    for (let i = 0; i < BURST_PARTICLES; i += 1) {
      pos.setXYZ(i, point.x, point.y, point.z);
      const a = Math.random() * Math.PI * 2;
      const b = (Math.random() - 0.5) * Math.PI;
      const s = speed * (0.4 + Math.random() * 0.8);
      slot.velocities[i * 3] = Math.cos(a) * Math.cos(b) * s;
      slot.velocities[i * 3 + 1] = Math.abs(Math.sin(b)) * s + 1.2;
      slot.velocities[i * 3 + 2] = Math.sin(a) * Math.cos(b) * s;
    }
    pos.needsUpdate = true;
    slot.points.visible = true;
    slot.life = 0.35;
    slot.points.material.opacity = 1;
  }

  function explosion(point) {
    burst(point, 0xff8c2e, 7);
    burst(point, 0xffe08a, 4.5);
    boom.position.copy(point);
    boom.visible = true;
    boomLife = 0.45;
    boomLight.position.copy(point);
    boomLight.position.y += 0.5;
    boomLight.intensity = 160;
  }

  function step(dt) {
    for (const slot of tracers) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      slot.line.material.opacity = Math.max(0, slot.life / 0.09) * 0.85;
      if (slot.life <= 0) slot.line.visible = false;
    }
    for (const slot of bursts) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      const pos = slot.points.geometry.attributes.position;
      for (let i = 0; i < BURST_PARTICLES; i += 1) {
        slot.velocities[i * 3 + 1] -= 9 * dt;
        pos.setXYZ(i,
          pos.getX(i) + slot.velocities[i * 3] * dt,
          Math.max(0.03, pos.getY(i) + slot.velocities[i * 3 + 1] * dt),
          pos.getZ(i) + slot.velocities[i * 3 + 2] * dt);
      }
      pos.needsUpdate = true;
      slot.points.material.opacity = Math.max(0, slot.life / 0.35);
      if (slot.life <= 0) slot.points.visible = false;
    }
    if (boomLife > 0) {
      boomLife -= dt;
      const t = 1 - Math.max(0, boomLife / 0.45);
      const radius = 0.6 + t * 5.4;
      boom.scale.set(radius, radius, radius);
      boom.material.opacity = Math.max(0, 0.75 * (1 - t));
      boomLight.intensity = Math.max(0, 160 * (1 - t));
      if (boomLife <= 0) {
        boom.visible = false;
        boomLight.intensity = 0;
      }
    }
  }

  return { tracer, burst, explosion, step, tmp };
}
