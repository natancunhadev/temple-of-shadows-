// =============================
// 1: setup básico do Canvas e loop
// =============================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const powerFillEl = document.getElementById('powerFill');
const msgEl = document.getElementById('msg');

let lastTime = 0;
let gameOver = false;
let paused = false;
let score = 0;

// mundo rola para a esquerda (runner automático...) a > frente
let worldSpeed = 320; // px/s

// =============================
// 2: utilidades simples
// =============================
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
function randRange(a, b) { return a + Math.random() * (b - a); }
function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// =============================
// 3: inputs de (teclado)
// =============================
const KEYS = { SPACE: ' ', A: 'a', S: 's' };
const down = new Set();
window.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Spacebar') e.preventDefault();
  down.add(e.key.toLowerCase());
  // reiniciar ao perder
  if (gameOver && e.key.toLowerCase() === 'r') restart();
  // pausar
  if (e.key.toLowerCase() === 'p') paused = !paused;
});
window.addEventListener('keyup', (e) => down.delete(e.key.toLowerCase()));

// =============================
// 4: chão, camadas de fundo (parallax simples) dar um tcham...
// =============================
const groundY = canvas.height - 100;
const parallax = [
  { speed: 20,  color: '#0b1227' }, // distante
  { speed: 60,  color: '#0e1530' }, // médio
  { speed: 120, color: '#111938' }  // próximo
];
let parallaxOffset = 0;

// =============================
// 5: player (Natan) - pouco de física e pulo duplo, 
// =============================
class Player {
  constructor() {
    this.x = 160;          // posição fixa no X (o mundo que anda)
    this.y = groundY - 64; // alinhado ao chão
    this.w = 48;
    this.h = 64;
    this.vy = 0;
    this.gravity = 2000;
    this.jumpVel = -760;
    this.jumpsLeft = 2;
    this.attackTimer = 0;
    this.hurtTimer = 0;
  }
  get bbox() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  update(dt) {
    // gravidade
    this.vy += this.gravity * dt;
    this.y += this.vy * dt;

    // aterrissagem
    if (this.y + this.h >= groundY) {
      this.y = groundY - this.h;
      this.vy = 0;
      this.jumpsLeft = 2; // reseta duplo pulo ao tocar o chão
    }

    // entrada: pular (duplo pulo)
    if (pressed(' ')) this.jump();

    // ataque básico (curto alcance)
    if (pressed('a')) this.attackTimer = 0.15;

    // timers
    if (this.attackTimer > 0) this.attackTimer -= dt;
    if (this.hurtTimer > 0) this.hurtTimer -= dt;
  }
  jump() {
    if (this.jumpsLeft > 0) {
      this.vy = this.jumpVel;
      this.jumpsLeft--;
    }
  }
  draw(g) {
    // corpo
    g.fillStyle = this.hurtTimer > 0 ? '#ef4444' : '#60a5fa';
    g.fillRect(this.x, this.y, this.w, this.h);

    // “guitarra” como retângulo frontal quando atacando...
    if (this.attackTimer > 0) {
      g.fillStyle = '#fbbf24';
      g.fillRect(this.x + this.w, this.y + 20, 24, 12);
    }
  }
}
const player = new Player();

// Helper para “edge trigger” (detectar pressionado no frame)
const pressedState = new Map();
function pressed(key) {
  key = key.toLowerCase();
  const isDown = down.has(key);
  const wasDown = pressedState.get(key) || false;
  pressedState.set(key, isDown);
  return isDown && !wasDown;
}

// =============================
// 6: obstáculos (amplificadores) e os orbes
// =============================
class Obstacle {
  constructor(x) {
    const h = randRange(40, 90); // altura variável
    this.x = x;
    this.y = groundY - h;
    this.w = randRange(28, 48);
    this.h = h;
    this.dead = false;
  }
  get bbox() { return this; }
  update(dt) {
    this.x -= worldSpeed * dt;
    if (this.x + this.w < -50) this.dead = true;
  }
  draw(g) {
    g.fillStyle = '#9333ea';
    g.fillRect(this.x, this.y, this.w, this.h);
  }
}

class Orb {
  constructor(x) {
    this.x = x;
    this.y = groundY - 140 - randRange(0, 60);
    this.w = 18; this.h = 18;
    this.dead = false;
  }
  get bbox() { return this; }
  update(dt) {
    this.x -= worldSpeed * dt;
    if (this.x + this.w < -50) this.dead = true;
  }
  draw(g) {
    g.fillStyle = '#22d3ee';
    g.beginPath();
    g.arc(this.x + this.w/2, this.y + this.h/2, this.w/2, 0, Math.PI*2);
    g.fill();
  }
}

const obstacles = [];
const orbs = [];
let spawnObsTimer = 0;
let spawnOrbTimer = 1.5;

// =============================
// 7: superpoder (relâmpagos) + barra de poder
// =============================
let power = 0;               // 0 a 100
let lightningTimer = 0;      // duração ativa do especial
function gainPower(v) { power = clamp(power + v, 0, 100); }
function useSpecial() {
  if (power >= 100 && lightningTimer <= 0) {
    lightningTimer = 1.25; // segundos
    power = 0;
  }
}

// =============================
// 8: loop principal: update
// =============================
function update(dt) {
  if (paused || gameOver) return;

  // Parallax
  parallaxOffset += worldSpeed * dt;

  // Player
  player.update(dt);

  // Especial (S)
  if (pressed('s')) useSpecial();

  // Spawns
  spawnObsTimer -= dt;
  spawnOrbTimer -= dt;
  if (spawnObsTimer <= 0) {
    obstacles.push(new Obstacle(canvas.width + randRange(0, 80)));
    spawnObsTimer = randRange(0.9, 1.6);
  }
  if (spawnOrbTimer <= 0) {
    orbs.push(new Orb(canvas.width + randRange(0, 40)));
    spawnOrbTimer = randRange(1.6, 2.6);
  }

  // atualiza entidades
  obstacles.forEach(o => o.update(dt));
  orbs.forEach(o => o.update(dt));

  // coleta de orbes
  orbs.forEach(o => {
    if (!o.dead && aabb(player.bbox, o.bbox)) {
      o.dead = true;
      gainPower(20);
      score += 25;
    }
  });

  // ataque básico: destrói obstáculo encostado/à frente
  if (player.attackTimer > 0) {
    obstacles.forEach(o => {
      const sword = { x: player.x + player.w, y: player.y + 20, w: 24, h: 12 };
      if (!o.dead && aabb(sword, o.bbox)) {
        o.dead = true;
        score += 50;
      }
    });
  }

  // especial ativo: limpa obstáculos próximos (em “frente”)
  if (lightningTimer > 0) {
    lightningTimer -= dt;
    obstacles.forEach(o => {
      if (!o.dead && o.x < player.x + 520) {
        o.dead = true;
        score += 30;
      }
    });
  }

  // colisão com obstáculos (sem ataque/especial)
  const hit = obstacles.find(o => !o.dead && aabb(player.bbox, o.bbox));
  if (hit && lightningTimer <= 0 && player.attackTimer <= 0) {
    // game over simples (primeiro protótipo)
    gameOver = true;
    showMessage("<strong>Você foi atingido!</strong><small>Pressione R para reiniciar · P para pausar</small>");
  }

  // limpeza
  removeDead(obstacles);
  removeDead(orbs);

  // score sobe com a corrida
  score += 60 * dt;
  scoreEl.textContent = Math.floor(score);

  // atualiza barra de poder
  powerFillEl.style.width = `${power}%`;
}

function removeDead(arr) {
  let w = 0;
  for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[w++] = arr[i];
  arr.length = w;
}

// =============================
// 9: loop principal: render
// =============================
function render() {
  // fundo em camadas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawParallax();

  // chão
  drawGround();

  // entidades
  orbs.forEach(o => o.draw(ctx));
  obstacles.forEach(o => o.draw(ctx));
  player.draw(ctx);

  // efeito de relâmpago
  if (lightningTimer > 0) drawLightning();
}

function drawParallax() {
  parallax.forEach((layer, i) => {
    const speed = layer.speed;
    const tileW = 320;
    const y = 40 + i * 40;
    ctx.fillStyle = layer.color;
    const offset = - (parallaxOffset * (speed / worldSpeed)) % tileW;
    for (let x = offset - tileW; x < canvas.width + tileW; x += tileW) {
      ctx.fillRect(x, y, tileW, 80);
    }
  });
}

function drawGround() {
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);
  // faixa de textura
  ctx.fillStyle = '#1f2937';
  for (let x = 0; x < canvas.width; x += 32) {
    ctx.fillRect(x - (parallaxOffset % 32), groundY - 6, 16, 6);
  }
}

function drawLightning() {
  // pequenos zigue-zagues à frente do player (efeito simples)
  ctx.strokeStyle = 'rgba(186,230,253,0.9)';
  ctx.lineWidth = 2 + Math.random() * 2;
  ctx.beginPath();
  let x = player.x + player.w + 40;
  let y = player.y + player.h/2;
  ctx.moveTo(x, y);
  for (let i = 0; i < 12; i++) {
    x += 40 + Math.random() * 30;
    y += randRange(-30, 30);
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// =============================
// 10 - HUD de mensagens e reinício
// =============================
function showMessage(html) {
  msgEl.innerHTML = html;
  msgEl.classList.remove('hidden');
}
function hideMessage() {
  msgEl.classList.add('hidden');
}
function restart() {
  // estado padrão
  obstacles.length = 0;
  orbs.length = 0;
  score = 0; power = 0; lightningTimer = 0;
  player.x = 160; player.y = groundY - player.h; player.vy = 0;
  player.jumpsLeft = 2; player.hurtTimer = 0; player.attackTimer = 0;
  gameOver = false; paused = false;
  hideMessage();
}

// =============================
// 11 - game loop (requestAnimationFrame)
// =============================
function loop(ts) {
  const dt = Math.min(0.032, (ts - lastTime) / 1000); // clamp para estabilidade
  lastTime = ts;

  if (!paused) update(dt);
  render();

  requestAnimationFrame(loop);
}

// Inicia
showMessage("<strong>Temple Of Shadows — Prototype v1</strong><small>Espaço: Pular · A: Atacar · S: Superpoder · P: Pausa · R: Reiniciar</small>");
setTimeout(hideMessage, 1200);
requestAnimationFrame(loop);