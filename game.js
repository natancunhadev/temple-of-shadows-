      // =============================
      // setup básico
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

      const groundY = canvas.height - 100;
      let worldSpeed = 320; // px/s
      let parallaxOffset = 0;

      // =============================
      // carregar sprites (SVG)
      // =============================
      const imgPlayer = new Image();
      imgPlayer.src = 'assets/player.png';

      const imgObstacle = new Image();
      imgObstacle.src = 'assets/obstacle.png';

      const imgOrb = new Image();
      imgOrb.src = 'assets/orb.png';

      // ============================= 
      // utilidades
      // =============================
      const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
      function randRange(a, b) { return a + Math.random() * (b - a); }
      function aabb(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
      }

      // pressed (edge trigger)
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
        // evitar scroll com espaço
        if (e.key === ' ' || e.key === 'Spacebar') e.preventDefault();
        const k = e.key.toLowerCase();
        down.add(k);
        if (k === 'p') paused = !paused;
        if (gameOver && k === 'r') restart();
      });
      window.addEventListener('keyup', (e) => down.delete(e.key.toLowerCase()));

      // =============================
      // parallax simples (faixas)
      /// (cores só para dar profundidade adicional ao background.png)
      // =============================
      const parallax = [
        { speed: 20,  color: 'rgba(17, 24, 39, 0)', h: 60, y: 60 },
        { speed: 60,  color: 'rgba(15, 23, 42, 0)', h: 70, y: 120 },
        { speed: 120, color: 'rgba(2, 6, 23, 0)',   h: 80, y: 180 },
      ];

      // =============================
      // jogador (Natan) — pulo duplo, ataque
      // =============================
      class Player {
        constructor() {
          this.x = 160;
          this.y = groundY - 64;
          this.w = 64;
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

          // chão
          if (this.y + this.h >= groundY) {
            this.y = groundY - this.h;
            this.vy = 0;
            this.jumpsLeft = 2;
          }

          // pulo (duplo)
          if (pressed(' ')) this.jump();

          // atacar
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
          g.drawImage(imgPlayer, this.x, this.y, this.w, this.h);

          // “guitarra ativa” (ataque curto)
          if (this.attackTimer > 0) {
            g.save();
            g.globalAlpha = 0.9;
            g.fillStyle = '#fbbf24';
            g.fillRect(this.x + this.w - 4, this.y + 22, 26, 10);
            g.restore();
          }
        }
      }
      const player = new Player();

      // =============================
      // obstáculos (amplificadores/inimigos) e Orbes
      // =============================
      class Obstacle {
        constructor(x) {
          const h = randRange(44, 84);
          this.x = x;
          this.y = groundY - h;
          this.w = randRange(36, 56);
          this.h = h;
          this.dead = false;
        }
        get bbox() { return this; }
        update(dt) {
          this.x -= worldSpeed * dt;
          if (this.x + this.w < -50) this.dead = true;
        }
        draw(g) { g.drawImage(imgObstacle, this.x, this.y, this.w, this.h); }
      }

      class Orb {
        constructor(x) {
          this.x = x;
          this.y = groundY - 140 - randRange(0, 60);
          this.w = 20; this.h = 20;
          this.dead = false;
        }
        get bbox() { return this; }
        update(dt) {
          this.x -= worldSpeed * dt;
          if (this.x + this.w < -50) this.dead = true;
        }
        draw(g) { g.drawImage(imgOrb, this.x, this.y, this.w, this.h); }
      }

      const obstacles = [];
      const orbs = [];
      let spawnObsTimer = 0;
      let spawnOrbTimer = 1.5;

      // =============================
      // superpoder (relâmpagos)
      // =============================
      let power = 0;          // 0..100
      let lightningTimer = 0; // ativo
      function gainPower(v) { power = clamp(power + v, 0, 100); }
      function useSpecial() {
        if (power >= 100 && lightningTimer <= 0) {
          lightningTimer = 1.25; // segundos
          power = 0;
        }
      }

      // =============================
      // update principal
      // =============================
      function update(dt) {
        if (paused || gameOver) return;

        // parallax “faixas”
        parallaxOffset += worldSpeed * dt;

        // player
        player.update(dt);

        // especial
        if (pressed('s')) useSpecial();

        // spawns
        spawnObsTimer -= dt;
        spawnOrbTimer -= dt;
        if (spawnObsTimer <= 0) {
          obstacles.push(new Obstacle(canvas.width + randRange(0, 80)));
          spawnObsTimer = randRange(0.9, 1.6);
        }
        if (spawnOrbTimer <= 0) {
          orbs.push(new Orb(canvas.width + randRange(0, 60)));
          spawnOrbTimer = randRange(1.6, 2.6);
        }

        // atualizar
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

        // ataque curto
        if (player.attackTimer > 0) {
          const sword = { x: player.x + player.w - 6, y: player.y + 22, w: 28, h: 12 };
          obstacles.forEach(o => {
            if (!o.dead && aabb(sword, o.bbox)) {
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

        // colisão com obstáculo (sem ataque/especial)
        const hit = obstacles.find(o => !o.dead && aabb(player.bbox, o.bbox));
        if (hit && lightningTimer <= 0 && player.attackTimer <= 0) {
          gameOver = true;
          showMessage("<strong>Você foi atingido!</strong><small>R: Reiniciar · P: Pausar</small>");
        }

        // limpeza
        compact(obstacles);
        compact(orbs);

        // score
        score += 60 * dt;
        scoreEl.textContent = Math.floor(score);

        // HUD
        powerFillEl.style.width = `${power}%`;
      }

      function compact(arr) {
        let w = 0;
        for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[w++] = arr[i];
        arr.length = w;
      }

      // =============================
      // render....
      // =============================
      function render() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // faixas (sobre o background.svg para profundidade)
        drawParallaxStrips();

        // chão
        drawGround();

        // entidades
        orbs.forEach(o => o.draw(ctx));
        obstacles.forEach(o => o.draw(ctx));
        player.draw(ctx);

        // efeito relâmpago
        if (lightningTimer > 0) drawLightning();
      }

      function drawParallaxStrips() {
        parallax.forEach((layer, i) => {
          const tileW = 320;
          const offset = - (parallaxOffset * (layer.speed / worldSpeed)) % tileW;
          const y = layer.y;
          ctx.fillStyle = layer.color;
          for (let x = offset - tileW; x < canvas.width + tileW; x += tileW) {
            ctx.fillRect(x, y, tileW, layer.h);
          }
        });
      }

      function drawGround() {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);
        ctx.fillStyle = '#f22828';
        for (let x = 0; x < canvas.width; x += 32) {
          ctx.fillRect(x - (parallaxOffset % 32), groundY - 6, 16, 6);
        }
      }

      function drawLightning() {
        ctx.save();
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
        ctx.restore();
      }

      // =============================
      // mensagens e reinício
      // =============================
      function showMessage(html) { msgEl.innerHTML = html; msgEl.classList.remove('hidden'); }
      function hideMessage() { msgEl.classList.add('hidden'); }
      function restart() {
        obstacles.length = 0; orbs.length = 0;
        score = 0; power = 0; lightningTimer = 0;
        player.x = 160; player.y = groundY - player.h; player.vy = 0;
        player.jumpsLeft = 2; player.hurtTimer = 0; player.attackTimer = 0;
        gameOver = false; paused = false; hideMessage();
      }

      // =============================
      // ame loop
      // =============================
      function loop(ts) {
        const dt = Math.min(0.032, (ts - lastTime) / 1000);
        lastTime = ts;

        if (!paused) update(dt);
        render();
        requestAnimationFrame(loop);
      }

      showMessage("<strong>Temple Of Shadows — v1.1</strong><small>Espaço: Pular · A: Atacar · S: Superpoder · P: Pausar · R: Reiniciar</small>");
      setTimeout(hideMessage, 1400);
      requestAnimationFrame(loop);