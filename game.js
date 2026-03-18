const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const powerFillEl = document.getElementById('powerFill');
const lifeFillEl = document.getElementById('lifeFill');
const msgEl = document.getElementById('msg');

let lastTime = 0;
let gameOver = false;
let paused = false;
let score = 0;

const groundY = canvas.height - 100;
let worldSpeed = 320;
let parallaxOffset = 0;

// =============================
// assets
// =============================
const imgPlayer = new Image();
imgPlayer.src = 'assets/player.png';

const imgObstacle = new Image();
imgObstacle.src = 'assets/obstacle.png';

const imgOrb = new Image();
imgOrb.src = 'assets/orb.png';

// =============================
// sounds
// =============================
const sfx = {
  hit: new Audio('assets/hit.wav'),
  orb: new Audio('assets/orb.wav'),
  attack: new Audio('assets/attack.wav'),
  special: new Audio('assets/special.wav'),
  gameover: new Audio('assets/gameover.wav'),
};

function playSound(sound) {
  if (!sound) return;
  sound.currentTime = 0;
  sound.play().catch(() => {});
}

// =============================
// utils
// =============================
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function randRange(a, b) {
  return a + Math.random() * (b - a);
}

function aabb(a, b) {
  return a.x < b.x + b.w &&
         a.x + a.w > b.x &&
         a.y < b.y + b.h &&
         a.y + a.h > b.y;
}

const down = new Set();
const pressedState = new Map();

function pressed(key) {
  key = key.toLowerCase();
  const isDown = down.has(key);
  const wasDown = pressedState.get(key) || false;
  pressedState.set(key, isDown);
  return isDown && !wasDown;
}

window.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Spacebar') e.preventDefault();

  const k = e.key.toLowerCase();
  down.add(k);

  if (k === 'p' && !gameOver) {
    paused = !paused;
    if (paused) {
      showMessage("<strong>Pausado</strong><small>P: Continuar · R: Reiniciar</small>");
    } else {
      hideMessage();
    }
  }

  if (k === 'r') restart();
});

window.addEventListener('keyup', (e) => {
  down.delete(e.key.toLowerCase());
});

// =============================
// parallax
// =============================
const parallax = [
  { speed: 20,  color: 'rgba(17, 24, 39, 0.10)', h: 60, y: 60 },
  { speed: 60,  color: 'rgba(15, 23, 42, 0.18)', h: 70, y: 120 },
  { speed: 120, color: 'rgba(2, 6, 23, 0.28)',   h: 80, y: 180 },
];

// =============================
// player
// =============================
class Player {
  constructor() {
    this.x = 160;
    this.y = groundY - 64;
    this.baseY = this.y;
    this.w = 64;
    this.h = 64;
    this.vy = 0;
    this.gravity = 2000;
    this.jumpVel = -760;
    this.jumpsLeft = 2;
    this.attackTimer = 0;
    this.hurtTimer = 0;
    this.runTime = 0;
    this.life = 100;
  }

  get bbox() {
    return { x: this.x + 6, y: this.y + 4, w: this.w - 12, h: this.h - 8 };
  }

  get attackBox() {
    return {
      x: this.x + this.w - 6,
      y: this.y + 22,
      w: 28,
      h: 12
    };
  }

  get onGround() {
    return this.y + this.h >= groundY - 0.5;
  }

  update(dt) {
    this.vy += this.gravity * dt;
    this.y += this.vy * dt;

    if (this.y + this.h >= groundY) {
      this.y = groundY - this.h;
      this.vy = 0;
      this.jumpsLeft = 2;
    }

    if (pressed(' ')) this.jump();

    if (pressed('a')) {
      this.attackTimer = 0.15;
      playSound(sfx.attack);
    }

    if (this.attackTimer > 0) this.attackTimer -= dt;
    if (this.hurtTimer > 0) this.hurtTimer -= dt;

    if (this.onGround && !gameOver && !paused) {
      this.runTime += dt * (worldSpeed * 0.02);
    }
  }

  jump() {
    if (this.jumpsLeft > 0) {
      this.vy = this.jumpVel;
      this.jumpsLeft--;
    }
  }

  takeDamage(amount) {
    if (this.hurtTimer > 0) return;

    this.life = clamp(this.life - amount, 0, 100);
    this.hurtTimer = 0.9;
    playSound(sfx.hit);

    if (this.life <= 0) {
      this.life = 0;
      gameOver = true;
      playSound(sfx.gameover);
      showMessage("<strong>Game Over</strong><small>R: Reiniciar</small>");
    }
  }

  draw(g) {
    g.save();

    const runningBob = this.onGround ? Math.sin(this.runTime * 8) * 2.5 : 0;
    const stretchY = this.onGround ? 1 + Math.abs(Math.sin(this.runTime * 8)) * 0.03 : 1;
    const stretchX = this.onGround ? 1 - Math.abs(Math.sin(this.runTime * 8)) * 0.02 : 1;

    if (this.hurtTimer > 0 && Math.floor(this.hurtTimer * 20) % 2 === 0) {
      g.globalAlpha = 0.45;
    }

    g.translate(this.x + this.w / 2, this.y + this.h / 2 + runningBob);
    g.scale(stretchX, stretchY);
    g.drawImage(imgPlayer, -this.w / 2, -this.h / 2, this.w, this.h);

    g.restore();

    if (this.attackTimer > 0) {
      const atk = this.attackBox;
      g.save();
      g.globalAlpha = 0.9;
      g.fillStyle = '#fbbf24';
      g.fillRect(atk.x, atk.y, atk.w, atk.h);
      g.restore();
    }
  }
}

const player = new Player();

// =============================
// obstacles / orbs
// =============================
class Obstacle {
  constructor(x) {
    const h = randRange(44, 84);
    this.x = x;
    this.y = groundY - h;
    this.w = randRange(36, 56);
    this.h = h;
    this.dead = false;
    this.damage = 25;
  }

  get bbox() {
    return this;
  }

  update(dt) {
    this.x -= worldSpeed * dt;
    if (this.x + this.w < -50) this.dead = true;
  }

  draw(g) {
    g.drawImage(imgObstacle, this.x, this.y, this.w, this.h);
  }
}

class Orb {
  constructor(x) {
    this.x = x;
    this.baseY = groundY - 140 - randRange(0, 60);
    this.y = this.baseY;
    this.w = 20;
    this.h = 20;
    this.dead = false;
    this.floatOffset = Math.random() * Math.PI * 2;
  }

  get bbox() {
    return this;
  }

  update(dt) {
    this.x -= worldSpeed * dt;
    this.floatOffset += dt * 4;
    this.y = this.baseY + Math.sin(this.floatOffset) * 6;
    if (this.x + this.w < -50) this.dead = true;
  }

  draw(g) {
    g.drawImage(imgOrb, this.x, this.y, this.w, this.h);
  }
}

const obstacles = [];
const orbs = [];
let spawnObsTimer = 0.8;
let spawnOrbTimer = 1.5;

// =============================
// special
// =============================
let power = 0;
let lightningTimer = 0;

function gainPower(v) {
  power = clamp(power + v, 0, 100);
}

function useSpecial() {
  if (power >= 100 && lightningTimer <= 0) {
    lightningTimer = 1.25;
    power = 0;
    playSound(sfx.special);
  }
}

// =============================
// core update
// =============================
function update(dt) {
  if (paused || gameOver) return;

  // dificuldade progressiva
  worldSpeed = clamp(320 + score * 0.12, 320, 620);

  parallaxOffset += worldSpeed * dt;

  player.update(dt);

  if (pressed('s')) useSpecial();

  spawnObsTimer -= dt;
  spawnOrbTimer -= dt;

  if (spawnObsTimer <= 0) {
    obstacles.push(new Obstacle(canvas.width + randRange(0, 80)));
    const minSpawn = clamp(0.95 - score * 0.0005, 0.45, 0.95);
    const maxSpawn = clamp(1.55 - score * 0.0005, 0.75, 1.55);
    spawnObsTimer = randRange(minSpawn, maxSpawn);
  }

  if (spawnOrbTimer <= 0) {
    orbs.push(new Orb(canvas.width + randRange(0, 60)));
    spawnOrbTimer = randRange(1.4, 2.3);
  }

  obstacles.forEach(o => o.update(dt));
  orbs.forEach(o => o.update(dt));

  // coleta de orb
  orbs.forEach(o => {
    if (!o.dead && aabb(player.bbox, o.bbox)) {
      o.dead = true;
      gainPower(20);
      score += 25;
      playSound(sfx.orb);
    }
  });

  // ataque
  if (player.attackTimer > 0) {
    const atk = player.attackBox;
    obstacles.forEach(o => {
      if (!o.dead && aabb(atk, o.bbox)) {
        o.dead = true;
        score += 50;
      }
    });
  }

  // especial
  if (lightningTimer > 0) {
    lightningTimer -= dt;
    obstacles.forEach(o => {
      if (!o.dead && o.x < player.x + 520) {
        o.dead = true;
        score += 30;
      }
    });
  }

  // colisão
  const hit = obstacles.find(o => !o.dead && aabb(player.bbox, o.bbox));
  if (hit && lightningTimer <= 0) {
    hit.dead = true;
    player.takeDamage(hit.damage);
  }

  compact(obstacles);
  compact(orbs);

  score += 60 * dt;

  scoreEl.textContent = Math.floor(score);
  powerFillEl.style.width = `${power}%`;
  lifeFillEl.style.width = `${player.life}%`;
}

function compact(arr) {
  let w = 0;
  for (let i = 0; i < arr.length; i++) {
    if (!arr[i].dead) arr[w++] = arr[i];
  }
  arr.length = w;
}

// =============================
// render
// =============================
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawParallaxStrips();
  drawGround();

  orbs.forEach(o => o.draw(ctx));
  obstacles.forEach(o => o.draw(ctx));
  player.draw(ctx);

  if (lightningTimer > 0) drawLightning();
}

function drawParallaxStrips() {
  parallax.forEach((layer) => {
    const tileW = 320;
    const offset = -(parallaxOffset * (layer.speed / worldSpeed)) % tileW;

    ctx.fillStyle = layer.color;
    for (let x = offset - tileW; x < canvas.width + tileW; x += tileW) {
      ctx.fillRect(x, layer.y, tileW, layer.h);
    }
  });
}

function drawGround() {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);

  ctx.fillStyle = '#f22828';
  for (let x = 0; x < canvas.width + 32; x += 32) {
    ctx.fillRect(x - (parallaxOffset % 32), groundY - 6, 16, 6);
  }
}

function drawLightning() {
  ctx.save();
  ctx.strokeStyle = 'rgba(186,230,253,0.9)';
  ctx.lineWidth = 2 + Math.random() * 2;
  ctx.beginPath();

  let x = player.x + player.w + 40;
  let y = player.y + player.h / 2;
  ctx.moveTo(x, y);

  for (let i = 0; i < 12; i++) {
    x += 40 + Math.random() * 30;
    y += randRange(-30, 30);
    ctx.lineTo(x, y);
  }

  ctx.stroke();
  ctx.restore();
}

// =============================
// ui / reset
// =============================
function showMessage(html) {
  msgEl.innerHTML = html;
  msgEl.classList.remove('hidden');
}

function hideMessage() {
  msgEl.classList.add('hidden');
}

function restart() {
  obstacles.length = 0;
  orbs.length = 0;

  score = 0;
  power = 0;
  lightningTimer = 0;
  worldSpeed = 320;
  parallaxOffset = 0;

  spawnObsTimer = 0.8;
  spawnOrbTimer = 1.5;

  player.x = 160;
  player.y = groundY - player.h;
  player.vy = 0;
  player.jumpsLeft = 2;
  player.attackTimer = 0;
  player.hurtTimer = 0;
  player.runTime = 0;
  player.life = 100;

  gameOver = false;
  paused = false;

  hideMessage();
  scoreEl.textContent = '0';
  powerFillEl.style.width = '0%';
  lifeFillEl.style.width = '100%';
}

// =============================
// loop
// =============================
function loop(ts) {
  const dt = Math.min(0.032, (ts - lastTime) / 1000 || 0);
  lastTime = ts;

  update(dt);
  render();

  requestAnimationFrame(loop);
}

lifeFillEl.style.width = '100%';
showMessage("<strong>Temple Of Shadows — v1.3</strong><small>Agora com vida, sons, progressão de dificuldade e corrida dinâmica</small>");

setTimeout(() => {
  if (!paused && !gameOver) hideMessage();
}, 1600);

requestAnimationFrame(loop);