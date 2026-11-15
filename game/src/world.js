// The map: YARD 7, a dusk scrapyard. Two lanes (A west, B east) and a mid connector lead
// from the VANGUARD spawn in the south to the EMBER spawn in the north; site A (Crane)
// sits north-west, site B (Furnace) north-east. Every solid is a collider for players and
// bots and a surface a bullet stops on. Plain geometry plus runtime canvas textures only.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const MAT = {};
function mat(name, color, rough = 0.92, metal = 0.05) {
  const key = `${name}|${color}|${rough}|${metal}`;
  if (!MAT[key]) {
    MAT[key] = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: rough, metalness: metal });
  }
  return MAT[key];
}

function canvasTexture(draw, w = 256, h = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

function signTexture(letter, color) {
  return canvasTexture((ctx, w, h) => {
    ctx.fillStyle = '#14161c';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.floor(h * 0.62)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, w / 2, h / 2 + 6);
  });
}

function hazardTexture() {
  return canvasTexture((ctx, w, h) => {
    ctx.fillStyle = '#c9971f';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#191b20';
    for (let x = -h; x < w + h; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + 32, 0);
      ctx.lineTo(x + 64, 0);
      ctx.lineTo(x + 32, h);
      ctx.closePath();
      ctx.fill();
    }
  }, 256, 64);
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  function cylinder(r, h, x, y, z, material, segments = 14) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segments), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  function flat(w, d, x, z, material, y = 0.02) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  const groundMat = mat('ground', '#333845', 0.96, 0.02);
  const wallMat = mat('wall', PALETTE.surface, 0.95, 0.04);
  const wallDark = mat('wallDark', '#22262f', 0.95, 0.04);
  const steelMat = mat('steel', PALETTE.hairline, 0.6, 0.45);
  const rustMat = mat('rust', PALETTE.rust, 0.85, 0.25);
  const tealMat = mat('teal', PALETTE.teal, 0.85, 0.2);
  const crateMat = mat('crate', '#6b5a41', 0.9, 0.08);
  const yellowMat = mat('yellow', '#c9971f', 0.7, 0.3);
  const darkMat = mat('dark', '#17191f', 0.9, 0.1);

  // Ground and perimeter: 44 x 36 m, walls 4.2 m high.
  box(46, 0.4, 38, 0, -0.2, 0, groundMat);
  box(0.6, 4.2, 38, -22.3, 2.1, 0, wallMat);
  box(0.6, 4.2, 38, 22.3, 2.1, 0, wallMat);
  box(46, 4.2, 0.6, 0, 2.1, -18.3, wallMat);
  box(46, 4.2, 0.6, 0, 2.1, 18.3, wallMat);

  // Central block splits mid into two passages.
  box(8, 3.4, 6, 0, 1.7, -4, wallDark);
  box(8.4, 0.3, 6.4, 0, 3.55, -4, steelMat);

  // Lane walls: west wall guards A lane, east wall guards B lane. They stop short of
  // the north corridor so defenders can cross between mid and the lanes up there.
  box(0.6, 3.2, 10, -10, 1.6, -7, wallMat);
  box(0.6, 3.2, 10, 10, 1.6, -7, wallMat);
  // North mid wall: mid cannot run straight into the defender spawn.
  box(16, 3.2, 0.6, 0, 1.6, -12.5, wallMat);

  // Site A (Crane, north-west) enclosure: entries from the south lane and from mid.
  box(0.6, 3.2, 8, -19, 1.6, -11, wallMat);
  box(8, 3.2, 0.6, -15, 1.6, -15, wallMat);
  box(6, 3.2, 0.6, -16, 1.6, -7, wallMat);
  box(0.6, 3.2, 3, -11, 1.6, -13.5, wallMat);
  // Site B (Furnace, north-east) enclosure, mirrored.
  box(0.6, 3.2, 8, 19, 1.6, -11, wallMat);
  box(8, 3.2, 0.6, 15, 1.6, -15, wallMat);
  box(6, 3.2, 0.6, 16, 1.6, -7, wallMat);
  box(0.6, 3.2, 3, 11, 1.6, -13.5, wallMat);

  // Shipping containers as cover: A lane, B lane, mid. Lane containers hug the outer
  // walls so the lane itself stays walkable for bots and players.
  box(4, 2.6, 2.6, -19.5, 1.3, 2, rustMat);
  box(4, 2.6, 2.6, -19.5, 1.3, 8.5, tealMat);
  box(2.6, 2.6, 6, -19, 1.3, -3.5, tealMat);
  box(4, 2.6, 2.6, 19.5, 1.3, 2, tealMat);
  box(4, 2.6, 2.6, 19.5, 1.3, 8.5, rustMat);
  box(2.6, 2.6, 6, 19, 1.3, -3.5, rustMat);
  box(5, 2.6, 2.6, -6.5, 1.3, 6.5, rustMat);
  box(5, 2.6, 2.6, 6.5, 1.3, 6.5, tealMat);
  box(4.4, 2.6, 2.6, -17.6, 1.3, -12.6, rustMat);
  box(4.4, 2.6, 2.6, 17.8, 1.3, -13, tealMat);

  // Crates: low cover to crouch behind, stacked near both sites and mid.
  const crates = [
    [-18, 0.6, -8.5, 1.2], [-6.5, 0.6, -11.5, 1.2], [-3, 0.6, 2.8, 1.2],
    [3, 0.6, 2.8, 1.2], [6.5, 0.6, -11.5, 1.2], [18, 0.6, -8.5, 1.2],
    [-12, 0.6, 14.5, 1.2], [12, 0.6, 14.5, 1.2], [-6.5, 1.8, -11.5, 1.2],
    [6.5, 1.8, -11.5, 1.2], [-17, 0.6, -8.2, 1.2], [18, 0.6, -13.5, 1.2],
  ];
  for (const [x, y, z, s] of crates) box(s, s, s, x, y, z, crateMat);

  // Barrels in clusters.
  const barrels = [
    [-9, 13], [-8.1, 12.6], [-8.5, 13.8], [9, 13], [8.1, 12.6],
    [-19.5, 4], [-19.5, 5.2], [19.5, 4], [-6.5, 15.8], [6.5, 15.8],
  ];
  for (const [x, z] of barrels) cylinder(0.45, 1.1, x, 0.55, z, rustMat);

  // The crane over site A: two legs, a jib, a hanging hook block.
  box(0.9, 9, 0.9, -19.2, 4.5, -14.6, yellowMat);
  box(0.9, 9, 0.9, -10.8, 4.5, -14.6, yellowMat);
  box(9.6, 1.1, 1.3, -15, 9.2, -14.6, yellowMat);
  box(0.7, 0.7, 0.7, -13, 7.6, -14.6, darkMat);

  // The furnace at site B: dark mass with a glowing mouth and a chimney.
  box(5, 4.4, 2.6, 16.5, 2.2, -16.6, darkMat);
  const mouth = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 1.1),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff7a1a') }),
  );
  mouth.position.set(16.5, 1.1, -15.25);
  group.add(mouth);
  cylinder(0.7, 7.5, 18.4, 3.75, -16.8, steelMat);

  // Pipes along the south and west walls.
  for (const z of [-16.9, 16.9]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 40, 10), steelMat);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, 3.6, z);
    pipe.castShadow = true;
    group.add(pipe);
  }

  // Ground paint: site zones, lane lines, spawn marks. Paint never collides.
  const zoneA = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.siteA), transparent: true, opacity: 0.16, depthWrite: false });
  const zoneB = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.siteB), transparent: true, opacity: 0.16, depthWrite: false });
  flat(8, 8, -15, -11, zoneA);
  flat(8, 8, 15, -11, zoneB);
  const lineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#c8c2b2'), transparent: true, opacity: 0.35, depthWrite: false });
  flat(0.25, 26, -16, 2, lineMat);
  flat(0.25, 26, 16, 2, lineMat);
  flat(0.25, 12, 0, 8, lineMat);
  const hazardMat = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.9 });
  flat(8, 0.8, -15, -6.8, hazardMat);
  flat(8, 0.8, 15, -6.8, hazardMat);

  // Floating site signs, lit from within.
  for (const [letter, color, x] of [['A', PALETTE.siteA, -15], ['B', PALETTE.siteB, 15]]) {
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.2),
      new THREE.MeshBasicMaterial({ map: signTexture(letter, color), transparent: true, side: THREE.DoubleSide }),
    );
    sign.position.set(x, 4.6, -14.9);
    group.add(sign);
  }

  // Lamp posts with warm heads.
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0') });
  for (const [x, z] of [[-8, 8], [8, 8], [-8, -4], [8, -4]]) {
    cylinder(0.09, 4.4, x, 2.2, z, darkMat, 8);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), lampHeadMat);
    head.position.set(x, 4.5, z);
    group.add(head);
  }

  // Distant skyline silhouettes outside the walls, and a low sun disc.
  const skylineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#161a21') });
  const skyline = [
    [-30, 6, -26, 8, 12, 4], [-18, 9, -28, 10, 18, 4], [-4, 5, -28, 7, 10, 4],
    [10, 8, -28, 9, 16, 4], [26, 6, -26, 8, 12, 4], [-32, 7, 10, 4, 14, 8], [32, 9, 6, 4, 18, 8],
  ];
  for (const [x, h, z, w, hh, d] of skyline) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), skylineMat);
    m.position.set(x, h, z);
    group.add(m);
  }
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb84d'), fog: false }),
  );
  sun.position.set(-34, 13, -30);
  sun.lookAt(0, 2, 0);
  group.add(sun);

  // Light: low warm sun from the west, cool sky fill, a warm wash over mid.
  const sky = new THREE.HemisphereLight(new THREE.Color('#8b9bb5'), new THREE.Color('#3a2f22'), 1.5);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffc27a'), 3.2);
  key.position.set(-26, 16, 6);
  key.target.position.set(4, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -30;
  key.shadow.camera.right = 30;
  key.shadow.camera.top = 30;
  key.shadow.camera.bottom = -30;
  key.shadow.camera.far = 80;
  key.shadow.bias = -0.0005;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#5f7ea8'), 0.8);
  fill.position.set(18, 12, 14);
  scene.add(fill);
  const midLamp = new THREE.PointLight(new THREE.Color('#ffc27a'), 26, 26, 1.8);
  midLamp.position.set(0, 4.4, 4);
  scene.add(midLamp);
  const siteLamp = new THREE.PointLight(new THREE.Color('#ff8c3a'), 18, 18, 1.8);
  siteLamp.position.set(16.5, 3.4, -13);
  scene.add(siteLamp);
  const craneLamp = new THREE.PointLight(new THREE.Color('#ffc27a'), 14, 16, 1.8);
  craneLamp.position.set(-15, 4, -11);
  scene.add(craneLamp);

  return {
    colliders,
    shootables,
    group,
    sites: {
      A: { center: new THREE.Vector3(-15, 0, -11), radius: 4 },
      B: { center: new THREE.Vector3(15, 0, -11), radius: 4 },
    },
    spawns: {
      attack: [
        new THREE.Vector3(-4, 0, 15), new THREE.Vector3(0, 0, 15.5),
        new THREE.Vector3(4, 0, 15), new THREE.Vector3(-1.5, 0, 16.5),
      ],
      defend: [
        new THREE.Vector3(-6, 0, -16), new THREE.Vector3(0, 0, -16.5),
        new THREE.Vector3(6, 0, -16), new THREE.Vector3(-2, 0, -15),
      ],
    },
  };
}
