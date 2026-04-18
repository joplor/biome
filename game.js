// BIOLUME DRIFT: ECOSYSTEM PRIME
// Production-quality bioluminescent ecosystem game

// ============================================================
// VECTOR MATH
// ============================================================
class Vec2 {
    constructor(x = 0, y = 0) { this.x = x; this.y = y; }
    add(v) { return new Vec2(this.x + v.x, this.y + v.y); }
    sub(v) { return new Vec2(this.x - v.x, this.y - v.y); }
    scale(s) { return new Vec2(this.x * s, this.y * s); }
    mag() { return Math.sqrt(this.x * this.x + this.y * this.y); }
    norm() { const m = this.mag(); return m > 0 ? this.scale(1 / m) : new Vec2(); }
    dot(v) { return this.x * v.x + this.y * v.y; }
    dist(v) { return this.sub(v).mag(); }
    clone() { return new Vec2(this.x, this.y); }
    limit(max) { const m = this.mag(); return m > max ? this.scale(max / m) : this.clone(); }
    addSelf(v) { this.x += v.x; this.y += v.y; return this; }
    scaleSelf(s) { this.x *= s; this.y *= s; return this; }
    set(x, y) { this.x = x; this.y = y; return this; }
    static fromAngle(a, m = 1) { return new Vec2(Math.cos(a) * m, Math.sin(a) * m); }
    static random() { return Vec2.fromAngle(Math.random() * Math.PI * 2); }
}

// ============================================================
// PERLIN NOISE
// ============================================================
class Noise {
    constructor() {
        this.perm = new Uint8Array(512);
        for (let i = 0; i < 256; i++) this.perm[i] = i;
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.perm[i], this.perm[j]] = [this.perm[j], this.perm[i]];
        }
        for (let i = 0; i < 256; i++) this.perm[i + 256] = this.perm[i];
    }
    _fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    _lerp(a, b, t) { return a + t * (b - a); }
    _grad(hash, x, y) {
        const h = hash & 3;
        return ((h & 1) ? -x : x) + ((h & 2) ? -y : y);
    }
    get(x, y) {
        const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
        x -= Math.floor(x); y -= Math.floor(y);
        const u = this._fade(x), v = this._fade(y);
        const p = this.perm;
        const a = p[X] + Y, b = p[X + 1] + Y;
        return this._lerp(
            this._lerp(this._grad(p[a], x, y), this._grad(p[b], x - 1, y), u),
            this._lerp(this._grad(p[a + 1], x, y - 1), this._grad(p[b + 1], x - 1, y - 1), u),
            v
        );
    }
}

// ============================================================
// CONFIG
// ============================================================
const CONFIG = {
    WORLD_W: 3200,
    WORLD_H: 3200,
    PLAYER_SPEED: 260,
    PLAYER_MASS: 1.0,
    DRAG: 0.86,
    FOOD_COUNT: 140,
    NEUTRAL_COUNT: 35,
    PREDATOR_COUNT: 7,
    EVOLUTION_THRESHOLDS: [120, 300, 600, 1200],
    FLOW_COLS: 48,
    FLOW_ROWS: 48,
    PARTICLE_POOL: 600,
};

// ============================================================
// FLOW FIELD
// ============================================================
class FlowField {
    constructor(noise) {
        this.noise = noise;
        this.cols = CONFIG.FLOW_COLS;
        this.rows = CONFIG.FLOW_ROWS;
        this.cellW = CONFIG.WORLD_W / this.cols;
        this.cellH = CONFIG.WORLD_H / this.rows;
        this.field = Array.from({ length: this.cols * this.rows }, () => new Vec2());
        this.time = 0;
        this._rebuild();
    }
    _rebuild() {
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const n = this.noise.get(col * 0.14 + this.time, row * 0.14 + this.time * 0.65);
                const angle = n * Math.PI * 4;
                const idx = row * this.cols + col;
                this.field[idx].x = Math.cos(angle);
                this.field[idx].y = Math.sin(angle);
            }
        }
    }
    update(dt) {
        this.time += dt * 0.09;
        this._rebuild();
    }
    sample(x, y) {
        const col = Math.max(0, Math.min(this.cols - 1, Math.floor(x / this.cellW)));
        const row = Math.max(0, Math.min(this.rows - 1, Math.floor(y / this.cellH)));
        return this.field[row * this.cols + col];
    }
}

// ============================================================
// PARTICLE SYSTEM
// ============================================================
class Particle {
    constructor() {
        this.active = false;
        this.x = this.y = this.vx = this.vy = 0;
        this.life = this.maxLife = 1;
        this.r = 2;
        this.color = [0, 255, 200];
    }
}

class ParticleSystem {
    constructor() {
        this.pool = Array.from({ length: CONFIG.PARTICLE_POOL }, () => new Particle());
        this._head = 0;
    }
    _acquire() {
        for (let i = 0; i < this.pool.length; i++) {
            const idx = (this._head + i) % this.pool.length;
            if (!this.pool[idx].active) {
                this._head = (idx + 1) % this.pool.length;
                return this.pool[idx];
            }
        }
        // Overwrite oldest
        const p = this.pool[this._head];
        this._head = (this._head + 1) % this.pool.length;
        return p;
    }
    emit(x, y, vx, vy, color, life = 0.7, r = 2) {
        const p = this._acquire();
        p.active = true;
        p.x = x; p.y = y;
        p.vx = vx + (Math.random() - 0.5) * 50;
        p.vy = vy + (Math.random() - 0.5) * 50;
        p.life = p.maxLife = life + Math.random() * 0.4;
        p.r = r + Math.random() * 2;
        p.color = color;
    }
    burst(x, y, color, count = 10) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 25 + Math.random() * 90;
            this.emit(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, color, 0.5 + Math.random() * 0.7, 1.5);
        }
    }
    update(dt) {
        for (const p of this.pool) {
            if (!p.active) continue;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= 0.94;
            p.vy *= 0.94;
            p.life -= dt;
            if (p.life <= 0) p.active = false;
        }
    }
    draw(ctx, camX, camY, W, H) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const p of this.pool) {
            if (!p.active) continue;
            const sx = p.x - camX, sy = p.y - camY;
            if (sx < -30 || sx > W + 30 || sy < -30 || sy > H + 30) continue;
            const alpha = p.life / p.maxLife;
            const [r, g, b] = p.color;
            const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, p.r * 3.5);
            gr.addColorStop(0, `rgba(${r},${g},${b},${alpha * 0.9})`);
            gr.addColorStop(0.5, `rgba(${r},${g},${b},${alpha * 0.3})`);
            gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
            ctx.fillStyle = gr;
            ctx.beginPath();
            ctx.arc(sx, sy, p.r * 3.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

// ============================================================
// ENTITY BASE
// ============================================================
class Entity {
    constructor(x, y) {
        this.pos = new Vec2(x, y);
        this.vel = new Vec2();
        this.acc = new Vec2();
        this.mass = 1.0;
        this.radius = 8;
        this.alive = true;
        this.age = 0;
    }
    applyForce(f) {
        this.acc.x += f.x / this.mass;
        this.acc.y += f.y / this.mass;
    }
    integrate(dt) {
        this.vel.x += this.acc.x * dt;
        this.vel.y += this.acc.y * dt;
        const drag = Math.pow(CONFIG.DRAG, dt * 60);
        this.vel.x *= drag;
        this.vel.y *= drag;
        this.pos.x += this.vel.x * dt;
        this.pos.y += this.vel.y * dt;
        this.acc.set(0, 0);
        this.age += dt;
        this.pos.x = ((this.pos.x % CONFIG.WORLD_W) + CONFIG.WORLD_W) % CONFIG.WORLD_W;
        this.pos.y = ((this.pos.y % CONFIG.WORLD_H) + CONFIG.WORLD_H) % CONFIG.WORLD_H;
    }
}

// ============================================================
// FOOD
// ============================================================
class Food extends Entity {
    constructor(x, y) {
        super(x, y);
        this.radius = 3.5 + Math.random() * 3;
        this.mass = 0.25;
        this.energy = 12 + Math.random() * 22;
        this.pulse = Math.random() * Math.PI * 2;
        this.pulseSpeed = 1.5 + Math.random() * 1.5;
        this.clusterTarget = null;
        this.color = this._pickColor();
    }
    _pickColor() {
        const palette = [[0, 255, 170], [0, 210, 255], [50, 255, 90], [130, 255, 60], [0, 255, 230]];
        return palette[Math.floor(Math.random() * palette.length)];
    }
    update(dt, flowField) {
        this.pulse += dt * this.pulseSpeed;
        const flow = flowField.sample(this.pos.x, this.pos.y);
        this.applyForce(flow.scale(6));
        if (this.clusterTarget) {
            const d = this.pos.dist(this.clusterTarget);
            if (d > 8) {
                const f = this.clusterTarget.sub(this.pos).norm().scale(10);
                this.applyForce(f);
            }
        }
        this.integrate(dt);
    }
    draw(ctx, camX, camY) {
        const sx = this.pos.x - camX, sy = this.pos.y - camY;
        const t = 0.65 + 0.35 * Math.sin(this.pulse);
        const r = this.radius * t;
        const [cr, cg, cb] = this.color;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g1 = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 5);
        g1.addColorStop(0, `rgba(${cr},${cg},${cb},${0.45 * t})`);
        g1.addColorStop(0.35, `rgba(${cr},${cg},${cb},${0.12 * t})`);
        g1.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
        ctx.fillStyle = g1;
        ctx.beginPath();
        ctx.arc(sx, sy, r * 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${0.92 * t})`;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${0.6 * t})`;
        ctx.beginPath();
        ctx.arc(sx - r * 0.25, sy - r * 0.25, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ============================================================
// NEUTRAL ORGANISM (SWARM)
// ============================================================
class Neutral extends Entity {
    constructor(x, y) {
        super(x, y);
        this.radius = 5 + Math.random() * 3;
        this.mass = 0.55;
        this.maxSpeed = 55 + Math.random() * 45;
        this.color = [0, 170, 255];
        this.tail = [];
        this.tailTimer = 0;
        this.angle = 0;
        this.wander = Math.random() * Math.PI * 2;
    }
    update(dt, entities, flowField) {
        let sepX = 0, sepY = 0, sepN = 0;
        let aliX = 0, aliY = 0, aliN = 0;
        let cohX = 0, cohY = 0, cohN = 0;

        for (const o of entities) {
            if (o === this || !(o instanceof Neutral)) continue;
            const dx = this.pos.x - o.pos.x, dy = this.pos.y - o.pos.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < 38 && d > 0) {
                sepX += dx / d / d; sepY += dy / d / d; sepN++;
            }
            if (d < 75) {
                aliX += o.vel.x; aliY += o.vel.y; aliN++;
            }
            if (d < 100) {
                cohX += o.pos.x; cohY += o.pos.y; cohN++;
            }
        }

        if (sepN > 0) this.applyForce(new Vec2(sepX / sepN, sepY / sepN).norm().scale(90));
        if (aliN > 0) this.applyForce(new Vec2(aliX / aliN, aliY / aliN).norm().scale(35));
        if (cohN > 0) {
            const cx = cohX / cohN - this.pos.x, cy = cohY / cohN - this.pos.y;
            const cm = Math.sqrt(cx * cx + cy * cy);
            if (cm > 0) this.applyForce(new Vec2(cx / cm, cy / cm).scale(28));
        }

        this.wander += (Math.random() - 0.5) * dt * 2.5;
        this.applyForce(Vec2.fromAngle(this.wander).scale(18));

        const flow = flowField.sample(this.pos.x, this.pos.y);
        this.applyForce(flow.scale(12));

        const spd = this.vel.mag();
        if (spd > this.maxSpeed) this.vel.scaleSelf(this.maxSpeed / spd);

        this.tailTimer += dt;
        if (this.tailTimer > 0.05) {
            this.tail.unshift({ x: this.pos.x, y: this.pos.y });
            if (this.tail.length > 9) this.tail.pop();
            this.tailTimer = 0;
        }
        this.angle = Math.atan2(this.vel.y, this.vel.x);
        this.integrate(dt);
    }
    draw(ctx, camX, camY) {
        const sx = this.pos.x - camX, sy = this.pos.y - camY;
        const [cr, cg, cb] = this.color;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < this.tail.length; i++) {
            const tx = this.tail[i].x - camX, ty = this.tail[i].y - camY;
            const f = 1 - i / this.tail.length;
            ctx.fillStyle = `rgba(${cr},${cg},${cb},${f * 0.28})`;
            ctx.beginPath();
            ctx.arc(tx, ty, this.radius * f * 0.9, 0, Math.PI * 2);
            ctx.fill();
        }
        const gl = ctx.createRadialGradient(sx, sy, 0, sx, sy, this.radius * 3.5);
        gl.addColorStop(0, `rgba(${cr},${cg},${cb},0.38)`);
        gl.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
        ctx.fillStyle = gl;
        ctx.beginPath();
        ctx.arc(sx, sy, this.radius * 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(this.angle);
        ctx.fillStyle = `rgba(${cr},${cg},${cb},0.82)`;
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius * 1.3, this.radius * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.restore();
    }
}

// ============================================================
// PREDATOR
// ============================================================
class Predator extends Entity {
    constructor(x, y) {
        super(x, y);
        this.radius = 13 + Math.random() * 7;
        this.mass = 2.2;
        this.maxSpeed = 105 + Math.random() * 45;
        this.detectionR = 300;
        this.state = 'patrol';
        this.color = [255, 28, 75];
        this.tail = [];
        this.tailTimer = 0;
        this.angle = 0;
        this.alertPulse = Math.random() * Math.PI * 2;
        this.patrolAngle = Math.random() * Math.PI * 2;
        this.aggressionLevel = 1.0;
        this.predX = 0; this.predY = 0;
        this.spineAngles = Array.from({ length: 6 }, (_, i) => (i / 6) * Math.PI * 2);
    }
    update(dt, player, flowField, entities) {
        this.alertPulse += dt * 2.8;
        const dx = player.pos.x - this.pos.x, dy = player.pos.y - this.pos.y;
        const distP = Math.sqrt(dx * dx + dy * dy);

        if (distP < this.detectionR) {
            this.state = 'hunt';
        } else if (this.state === 'hunt' && distP > this.detectionR * 1.6) {
            this.state = 'patrol';
        }

        if (this.state === 'hunt') {
            const look = distP / (this.maxSpeed * 1.1);
            this.predX = player.pos.x + player.vel.x * look * 1.6;
            this.predY = player.pos.y + player.vel.y * look * 1.6;
            const px = this.predX - this.pos.x, py = this.predY - this.pos.y;
            const pm = Math.sqrt(px * px + py * py);
            if (pm > 0) {
                const f = this.maxSpeed * this.aggressionLevel * 2.0 * this.mass;
                this.applyForce(new Vec2(px / pm * f, py / pm * f));
            }
        } else {
            const flow = flowField.sample(this.pos.x, this.pos.y);
            this.patrolAngle += (Math.random() - 0.5) * dt * 1.8;
            const w = Vec2.fromAngle(this.patrolAngle).scale(25);
            this.applyForce(flow.scale(22).add(w));
        }

        for (const o of entities) {
            if (o === this || !(o instanceof Predator)) continue;
            const ddx = this.pos.x - o.pos.x, ddy = this.pos.y - o.pos.y;
            const dd = Math.sqrt(ddx * ddx + ddy * ddy);
            if (dd < 90 && dd > 0) {
                this.applyForce(new Vec2(ddx / dd * 55 * this.mass / dd, ddy / dd * 55 * this.mass / dd));
            }
        }

        const spd = this.vel.mag();
        if (spd > this.maxSpeed) this.vel.scaleSelf(this.maxSpeed / spd);

        this.tailTimer += dt;
        if (this.tailTimer > 0.04) {
            this.tail.unshift({ x: this.pos.x, y: this.pos.y });
            if (this.tail.length > 14) this.tail.pop();
            this.tailTimer = 0;
        }
        this.angle = Math.atan2(this.vel.y, this.vel.x);
        this.integrate(dt);
    }
    draw(ctx, camX, camY) {
        const sx = this.pos.x - camX, sy = this.pos.y - camY;
        const [cr, cg, cb] = this.color;
        const ap = 0.7 + 0.3 * Math.sin(this.alertPulse);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < this.tail.length; i++) {
            const tx = this.tail[i].x - camX, ty = this.tail[i].y - camY;
            const f = 1 - i / this.tail.length;
            ctx.fillStyle = `rgba(${cr},${cg},${cb},${f * 0.22})`;
            ctx.beginPath();
            ctx.arc(tx, ty, this.radius * 0.55 * f, 0, Math.PI * 2);
            ctx.fill();
        }
        if (this.state === 'hunt') {
            const aura = ctx.createRadialGradient(sx, sy, this.radius, sx, sy, this.radius * 9);
            aura.addColorStop(0, `rgba(${cr},${cg},${cb},${0.08 * ap})`);
            aura.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
            ctx.fillStyle = aura;
            ctx.beginPath();
            ctx.arc(sx, sy, this.radius * 9, 0, Math.PI * 2);
            ctx.fill();
        }
        const gl = ctx.createRadialGradient(sx, sy, 0, sx, sy, this.radius * 4.5);
        gl.addColorStop(0, `rgba(${cr},${cg},${cb},${0.55 * ap})`);
        gl.addColorStop(0.4, `rgba(${cr},${cg},${cb},${0.18 * ap})`);
        gl.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
        ctx.fillStyle = gl;
        ctx.beginPath();
        ctx.arc(sx, sy, this.radius * 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(this.angle);
        const bc = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * 1.5);
        bc.addColorStop(0, `rgba(255,100,130,0.95)`);
        bc.addColorStop(0.5, `rgba(${cr},${cg},${cb},0.9)`);
        bc.addColorStop(1, `rgba(180,0,40,0.7)`);
        ctx.fillStyle = bc;
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius * 1.5, this.radius * 0.72, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,80,110,0.55)`;
        ctx.lineWidth = 1.8;
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(-this.radius * 0.4, 0);
            ctx.lineTo(
                -this.radius * 0.4 + Math.cos(a) * this.radius * 0.95,
                Math.sin(a) * this.radius * 0.95
            );
            ctx.stroke();
        }
        ctx.restore();
        ctx.restore();
    }
}

// ============================================================
// PLAYER
// ============================================================
class Player extends Entity {
    constructor(x, y) {
        super(x, y);
        this.radius = 11;
        this.mass = CONFIG.PLAYER_MASS;
        this.maxSpeed = CONFIG.PLAYER_SPEED;
        this.energy = 100;
        this.maxEnergy = 100;
        this.score = 0;
        this.evolutionLevel = 0;
        this.mutation = null;
        this.color = [0, 255, 200];

        this.tail = [];
        this.tailTimer = 0;
        this.angle = 0;
        this.breathe = 0;

        this.damageFlash = 0;
        this.invincible = 0;

        this.stealthTimer = 0;
        this.stealthCooldown = 0;
        this.invisible = false;

        this.repulseCooldown = 0;

        this.input = { x: 0, y: 0 };
        this.trailTimer = 0;
    }
    setInput(dx, dy) { this.input.x = dx; this.input.y = dy; }
    update(dt, flowField, particles, eventMod) {
        this.breathe += dt * 1.4;
        this.damageFlash = Math.max(0, this.damageFlash - dt * 4);
        this.invincible = Math.max(0, this.invincible - dt);
        this.repulseCooldown = Math.max(0, this.repulseCooldown - dt);
        this.stealthCooldown = Math.max(0, this.stealthCooldown - dt);
        if (this.stealthTimer > 0) {
            this.stealthTimer -= dt;
            this.invisible = true;
        } else {
            this.invisible = false;
        }

        const im = Math.sqrt(this.input.x ** 2 + this.input.y ** 2);
        if (im > 0) {
            const f = new Vec2(this.input.x / im, this.input.y / im).scale(this.maxSpeed * this.mass * 4.2 * eventMod);
            this.applyForce(f);
        }

        const flow = flowField.sample(this.pos.x, this.pos.y);
        this.applyForce(flow.scale(4));

        const spd = this.vel.mag();
        if (spd > this.maxSpeed * eventMod) this.vel.scaleSelf((this.maxSpeed * eventMod) / spd);

        this.tailTimer += dt;
        if (this.tailTimer > 0.038) {
            this.tail.unshift({ x: this.pos.x, y: this.pos.y });
            if (this.tail.length > 18) this.tail.pop();
            this.tailTimer = 0;
        }

        this.trailTimer += dt;
        if (this.trailTimer > 0.055 && spd > 18) {
            const [cr, cg, cb] = this.color;
            particles.emit(
                this.pos.x + (Math.random() - 0.5) * this.radius * 0.8,
                this.pos.y + (Math.random() - 0.5) * this.radius * 0.8,
                -this.vel.x * 0.08, -this.vel.y * 0.08,
                [cr, cg, cb], 0.35, 1.2
            );
            this.trailTimer = 0;
        }

        this.energy -= dt * 2.8;
        if (this.energy < 0) this.energy = 0;
        this.angle = Math.atan2(this.vel.y, this.vel.x);
        this.integrate(dt);
    }
    takeDamage(amt) {
        if (this.invincible > 0 || this.invisible) return false;
        this.energy -= amt;
        this.damageFlash = 1;
        this.invincible = 1.8;
        return true;
    }
    evolve(mutation) {
        this.mutation = mutation;
        this.evolutionLevel++;
        switch (mutation) {
            case 'agility':
                this.maxSpeed *= 1.45;
                this.mass *= 0.68;
                this.radius *= 0.82;
                this.color = [0, 240, 255];
                break;
            case 'dominance':
                this.radius *= 1.25;
                this.mass *= 1.35;
                this.color = [175, 85, 255];
                break;
            case 'stealth':
                this.color = [80, 255, 140];
                break;
            case 'replication':
                this.color = [255, 195, 0];
                this.maxEnergy = 140;
                this.energy = Math.min(this.energy + 40, 140);
                break;
        }
    }
    draw(ctx, camX, camY) {
        if (this.invisible && this.stealthTimer <= 0) return;
        const sx = this.pos.x - camX, sy = this.pos.y - camY;
        const [cr, cg, cb] = this.color;
        const br = 0.82 + 0.18 * Math.sin(this.breathe);
        const r = this.radius * br;
        const alpha = this.invisible ? Math.max(0.15, this.stealthTimer / 4) : 1.0;
        const fr = this.damageFlash > 0 ? 255 : cr;
        const fg = this.damageFlash > 0 ? Math.floor(cg * (1 - this.damageFlash * 0.7)) : cg;
        const fb = this.damageFlash > 0 ? Math.floor(cb * (1 - this.damageFlash * 0.9)) : cb;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        for (let i = 0; i < this.tail.length; i++) {
            const tx = this.tail[i].x - camX, ty = this.tail[i].y - camY;
            const f = 1 - i / this.tail.length;
            const tr = r * f * 0.85;
            const tg = ctx.createRadialGradient(tx, ty, 0, tx, ty, tr * 2.5);
            tg.addColorStop(0, `rgba(${cr},${cg},${cb},${f * 0.32 * alpha})`);
            tg.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
            ctx.fillStyle = tg;
            ctx.beginPath();
            ctx.arc(tx, ty, tr * 2.5, 0, Math.PI * 2);
            ctx.fill();
        }

        const outerGlow = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 7);
        outerGlow.addColorStop(0, `rgba(${fr},${fg},${fb},${0.22 * alpha})`);
        outerGlow.addColorStop(0.45, `rgba(${fr},${fg},${fb},${0.07 * alpha})`);
        outerGlow.addColorStop(1, `rgba(${fr},${fg},${fb},0)`);
        ctx.fillStyle = outerGlow;
        ctx.beginPath();
        ctx.arc(sx, sy, r * 7, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(this.angle);

        const bodyGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.3);
        bodyGrad.addColorStop(0, `rgba(255,255,255,${0.85 * alpha})`);
        bodyGrad.addColorStop(0.35, `rgba(${fr},${fg},${fb},${0.92 * alpha})`);
        bodyGrad.addColorStop(1, `rgba(${fr},${fg},${fb},${0.25 * alpha})`);
        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.25, r * 0.72, 0, 0, Math.PI * 2);
        ctx.fill();

        if (this.mutation === 'agility') {
            ctx.strokeStyle = `rgba(${cr},${cg},${cb},${0.55 * alpha})`;
            ctx.lineWidth = 1.8;
            for (let i = 0; i < 3; i++) {
                const a = ((i / 3) * Math.PI * 2) + Math.PI;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(a) * r * 2.2, Math.sin(a) * r * 0.85);
                ctx.stroke();
            }
        }
        if (this.mutation === 'dominance') {
            ctx.strokeStyle = `rgba(200,120,255,${0.65 * alpha})`;
            ctx.lineWidth = 2.2;
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(r * 0.7, 0);
                ctx.lineTo(Math.cos(a) * r * 2.4, Math.sin(a) * r * 2.4);
                ctx.stroke();
            }
        }
        if (this.mutation === 'replication') {
            ctx.strokeStyle = `rgba(255,210,0,${0.4 * alpha})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(0, 0, r * 2, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
        ctx.restore();
    }
}

// ============================================================
// SPAWN MANAGER
// ============================================================
class SpawnManager {
    constructor(entities) {
        this.entities = entities;
        this.foodTimer = 0;
        this.neutralTimer = 0;
        this.predTimer = 0;
        this.clusterCenters = Array.from({ length: 10 }, () => new Vec2(
            Math.random() * CONFIG.WORLD_W,
            Math.random() * CONFIG.WORLD_H
        ));
    }
    update(dt, ecosystem) {
        this.foodTimer += dt;
        this.neutralTimer += dt;
        this.predTimer += dt;

        const food = this.entities.filter(e => e instanceof Food && e.alive).length;
        if (food < CONFIG.FOOD_COUNT && this.foodTimer > 0.4 * ecosystem.foodRate) {
            const n = Math.min(4, CONFIG.FOOD_COUNT - food);
            for (let i = 0; i < n; i++) {
                const center = this.clusterCenters[Math.floor(Math.random() * this.clusterCenters.length)];
                const f = new Food(
                    center.x + (Math.random() - 0.5) * 500,
                    center.y + (Math.random() - 0.5) * 500
                );
                f.clusterTarget = center;
                this.entities.push(f);
            }
            this.foodTimer = 0;
        }

        const neutrals = this.entities.filter(e => e instanceof Neutral && e.alive).length;
        if (neutrals < CONFIG.NEUTRAL_COUNT && this.neutralTimer > 1.8) {
            this.entities.push(new Neutral(Math.random() * CONFIG.WORLD_W, Math.random() * CONFIG.WORLD_H));
            this.neutralTimer = 0;
        }

        const preds = this.entities.filter(e => e instanceof Predator && e.alive).length;
        if (preds < CONFIG.PREDATOR_COUNT && this.predTimer > 5.5 * ecosystem.predRate) {
            this.entities.push(new Predator(Math.random() * CONFIG.WORLD_W, Math.random() * CONFIG.WORLD_H));
            this.predTimer = 0;
        }

        for (let i = this.entities.length - 1; i >= 0; i--) {
            if (!this.entities[i].alive) this.entities.splice(i, 1);
        }
    }
}

// ============================================================
// ECOSYSTEM MANAGER
// ============================================================
class EcosystemManager {
    constructor() {
        this.foodRate = 1.0;
        this.predRate = 1.0;
        this.balance = 0;
        this.balTimer = 0;
        this.activeEvent = null;
        this.eventLife = 0;
        this.eventCooldown = 55 + Math.random() * 40;
    }
    update(dt, player, entities) {
        this.balTimer += dt;
        if (this.balTimer > 4) {
            if (player.score > 150 && player.energy > 60) this.balance = Math.min(2, this.balance + 0.12);
            else if (player.energy < 35) this.balance = Math.max(-2, this.balance - 0.12);

            if (this.balance > 0.8) {
                this.foodRate = 1.25;
                this.predRate = 0.72;
                for (const e of entities) if (e instanceof Predator) e.aggressionLevel = 1.2 + this.balance * 0.25;
            } else if (this.balance < -0.8) {
                this.foodRate = 0.75;
                this.predRate = 1.45;
                for (const e of entities) if (e instanceof Predator) e.aggressionLevel = 0.72;
            } else {
                this.foodRate = 1.0;
                this.predRate = 1.0;
            }
            this.balTimer = 0;
        }

        if (this.activeEvent) {
            this.eventLife -= dt;
            if (this.eventLife <= 0) this.activeEvent = null;
        } else {
            this.eventCooldown -= dt;
            if (this.eventCooldown <= 0) {
                const evts = ['speed_surge', 'gravity_pull', 'food_bloom'];
                this.activeEvent = evts[Math.floor(Math.random() * evts.length)];
                this.eventLife = 7 + Math.random() * 6;
                this.eventCooldown = 50 + Math.random() * 50;
            }
        }
    }
}

// ============================================================
// BACKGROUND RENDERER
// ============================================================
class BackgroundRenderer {
    constructor() {
        this.layers = [];
        this.time = 0;
        const depths = [0.15, 0.3, 0.5, 0.72, 0.9];
        for (let d = 0; d < 5; d++) {
            const pts = [];
            const cnt = 35 + d * 25;
            for (let i = 0; i < cnt; i++) {
                pts.push({
                    x: Math.random() * CONFIG.WORLD_W,
                    y: Math.random() * CONFIG.WORLD_H,
                    r: 0.4 + Math.random() * 1.4 * (d / 4),
                    b: 0.08 + Math.random() * 0.25,
                    ph: Math.random() * Math.PI * 2,
                    spd: 0.3 + Math.random() * 0.5,
                    col: Math.random() < 0.5 ? [0, 160, 255] : [0, 230, 170],
                });
            }
            this.layers.push({ pts, depth: depths[d] });
        }

        // Nebula blobs
        this.nebulae = Array.from({ length: 6 }, () => ({
            x: Math.random() * CONFIG.WORLD_W,
            y: Math.random() * CONFIG.WORLD_H,
            rx: 200 + Math.random() * 400,
            ry: 150 + Math.random() * 300,
            angle: Math.random() * Math.PI * 2,
            col: [
                [0, 40, 80],
                [0, 60, 50],
                [20, 0, 60],
            ][Math.floor(Math.random() * 3)],
            alpha: 0.04 + Math.random() * 0.06,
        }));
    }
    update(dt) { this.time += dt; }
    draw(ctx, camX, camY, W, H) {
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#000308');
        bg.addColorStop(0.5, '#000614');
        bg.addColorStop(1, '#000d20');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        // Nebula
        ctx.save();
        ctx.globalAlpha = 1;
        for (const nb of this.nebulae) {
            const nx = ((nb.x - camX * 0.1) % W + W) % W;
            const ny = ((nb.y - camY * 0.1) % H + H) % H;
            const [r, g, b] = nb.col;
            ctx.save();
            ctx.translate(nx, ny);
            ctx.rotate(nb.angle);
            const nbg = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(nb.rx, nb.ry));
            nbg.addColorStop(0, `rgba(${r},${g},${b},${nb.alpha})`);
            nbg.addColorStop(1, `rgba(${r},${g},${b},0)`);
            ctx.scale(nb.rx / Math.max(nb.rx, nb.ry), nb.ry / Math.max(nb.rx, nb.ry));
            ctx.fillStyle = nbg;
            ctx.beginPath();
            ctx.arc(0, 0, Math.max(nb.rx, nb.ry), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        ctx.restore();

        // Parallax dust
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const { pts, depth } of this.layers) {
            const ox = camX * depth, oy = camY * depth;
            for (const p of pts) {
                const sx = ((p.x - ox) % W + W) % W;
                const sy = ((p.y - oy) % H + H) % H;
                const pls = p.b * (0.5 + 0.5 * Math.sin(this.time * p.spd + p.ph));
                const [r, g, b] = p.col;
                ctx.fillStyle = `rgba(${r},${g},${b},${pls})`;
                ctx.beginPath();
                ctx.arc(sx, sy, p.r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }
}

// ============================================================
// UI SYSTEM
// ============================================================
class UISystem {
    constructor() {
        this.evoMenu = null;
        this.evoCallback = null;
        this.msgs = [];
    }
    showEvo(choices, cb) { this.evoMenu = choices; this.evoCallback = cb; }
    hideEvo() { this.evoMenu = null; this.evoCallback = null; }
    msg(text, color = [0, 255, 200]) {
        this.msgs.unshift({ text, color, life: 3.2, max: 3.2 });
        if (this.msgs.length > 5) this.msgs.pop();
    }
    update(dt) {
        for (const m of this.msgs) m.life -= dt;
        for (let i = this.msgs.length - 1; i >= 0; i--) {
            if (this.msgs[i].life <= 0) this.msgs.splice(i, 1);
        }
    }
    tryClickEvo(mx, my, W, H) {
        if (!this.evoMenu) return false;
        const choices = this.evoMenu;
        const btnW = 165, btnH = 65, gap = 18;
        const total = choices.length * btnW + (choices.length - 1) * gap;
        const startX = W / 2 - total / 2;
        const btnY = H / 2 - 45;
        for (let i = 0; i < choices.length; i++) {
            const bx = startX + i * (btnW + gap);
            if (mx >= bx && mx <= bx + btnW && my >= btnY && my <= btnY + btnH) {
                if (this.evoCallback) this.evoCallback(choices[i]);
                this.hideEvo();
                return true;
            }
        }
        return false;
    }
    tryKeyEvo(key) {
        if (!this.evoMenu) return false;
        const idx = parseInt(key) - 1;
        if (idx >= 0 && idx < this.evoMenu.length) {
            if (this.evoCallback) this.evoCallback(this.evoMenu[idx]);
            this.hideEvo();
            return true;
        }
        return false;
    }
    draw(ctx, W, H, player, ecosystem) {
        ctx.save();

        // Energy bar panel
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        this._roundRect(ctx, 12, 12, 210, 90);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,255,200,0.18)';
        ctx.lineWidth = 1;
        this._roundRect(ctx, 12, 12, 210, 90);
        ctx.stroke();

        const er = player.energy / player.maxEnergy;
        const ec = er > 0.5 ? [0, 255, 200] : er > 0.25 ? [255, 195, 0] : [255, 40, 70];
        ctx.fillStyle = `rgba(${ec[0]},${ec[1]},${ec[2]},0.15)`;
        ctx.fillRect(22, 22, 190, 14);
        const barGrad = ctx.createLinearGradient(22, 0, 22 + 190 * er, 0);
        barGrad.addColorStop(0, `rgba(${ec[0]},${ec[1]},${ec[2]},0.9)`);
        barGrad.addColorStop(1, `rgba(${ec[0]},${ec[1]},${ec[2]},0.6)`);
        ctx.fillStyle = barGrad;
        ctx.fillRect(22, 22, 190 * er, 14);
        ctx.fillStyle = `rgba(${ec[0]},${ec[1]},${ec[2]},0.5)`;
        ctx.font = '9px monospace';
        ctx.fillText('ENERGY', 24, 33);

        ctx.fillStyle = 'rgba(0,255,200,0.88)';
        ctx.font = 'bold 15px monospace';
        ctx.fillText(`SCORE: ${Math.floor(player.score)}`, 22, 57);

        ctx.fillStyle = 'rgba(0,195,255,0.65)';
        ctx.font = '10px monospace';
        const mutStr = player.mutation ? ` · ${player.mutation.toUpperCase()}` : '';
        ctx.fillText(`EVO ${player.evolutionLevel}${mutStr}`, 22, 73);

        if (player.mutation === 'stealth') {
            ctx.fillStyle = player.stealthCooldown > 0 ? 'rgba(100,255,150,0.4)' : 'rgba(100,255,150,0.8)';
            ctx.fillText(`[SPACE] Stealth ${player.stealthCooldown > 0 ? Math.ceil(player.stealthCooldown) + 's' : 'READY'}`, 22, 87);
        }
        if (player.mutation === 'dominance') {
            ctx.fillStyle = player.repulseCooldown > 0 ? 'rgba(175,85,255,0.4)' : 'rgba(175,85,255,0.9)';
            ctx.fillText(`[SPACE] Pulse ${player.repulseCooldown > 0 ? Math.ceil(player.repulseCooldown) + 's' : 'READY'}`, 22, 87);
        }

        // Ecosystem balance bar
        const balW = 120, balX = W / 2 - balW / 2;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(balX - 4, 8, balW + 8, 20);
        const bRatio = (ecosystem.balance + 2) / 4;
        const bGrad = ctx.createLinearGradient(balX, 0, balX + balW, 0);
        bGrad.addColorStop(0, 'rgba(255,40,70,0.8)');
        bGrad.addColorStop(0.5, 'rgba(0,255,200,0.6)');
        bGrad.addColorStop(1, 'rgba(0,180,255,0.8)');
        ctx.fillStyle = bGrad;
        ctx.fillRect(balX, 12, balW * bRatio, 12);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(balX + balW / 2 - 1, 10, 2, 16);
        ctx.fillStyle = 'rgba(150,220,255,0.45)';
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('ECOSYSTEM', W / 2, 10);
        ctx.textAlign = 'left';

        // Event banner
        if (ecosystem.activeEvent) {
            const evNames = { speed_surge: '⚡  SPEED SURGE', gravity_pull: '🌀  GRAVITY ANOMALY', food_bloom: '✦  FOOD BLOOM' };
            const evColors = { speed_surge: [255, 200, 0], gravity_pull: [160, 100, 255], food_bloom: [0, 255, 150] };
            const [er2, eg, eb] = evColors[ecosystem.activeEvent] || [255, 255, 255];
            const t = (Date.now() / 800) % 1;
            const pulse = 0.6 + 0.4 * Math.sin(t * Math.PI * 2);
            ctx.fillStyle = `rgba(0,0,0,0.55)`;
            ctx.fillRect(W / 2 - 110, H - 55, 220, 30);
            ctx.fillStyle = `rgba(${er2},${eg},${eb},${pulse})`;
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(evNames[ecosystem.activeEvent] || ecosystem.activeEvent, W / 2, H - 35);
            ctx.textAlign = 'left';
        }

        // Floating messages
        for (let i = 0; i < this.msgs.length; i++) {
            const m = this.msgs[i];
            const a = Math.min(1, m.life / 0.9);
            const [mr, mg, mb] = m.color;
            ctx.fillStyle = `rgba(${mr},${mg},${mb},${a * 0.9})`;
            ctx.font = `bold 13px monospace`;
            ctx.textAlign = 'right';
            ctx.fillText(m.text, W - 18, H - 65 - i * 22);
        }
        ctx.textAlign = 'left';

        // Evolution menu
        if (this.evoMenu) this._drawEvoMenu(ctx, W, H);

        ctx.restore();
    }
    _roundRect(ctx, x, y, w, h, r = 6) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }
    _drawEvoMenu(ctx, W, H) {
        ctx.fillStyle = 'rgba(0,2,12,0.88)';
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,255,200,0.9)';
        ctx.font = 'bold 26px monospace';
        ctx.fillText('— EVOLUTION THRESHOLD —', W / 2, H / 2 - 120);
        ctx.fillStyle = 'rgba(0,190,255,0.55)';
        ctx.font = '13px monospace';
        ctx.fillText('Select your mutation path', W / 2, H / 2 - 90);

        const choices = this.evoMenu;
        const btnW = 165, btnH = 65, gap = 18;
        const total = choices.length * btnW + (choices.length - 1) * gap;
        const startX = W / 2 - total / 2;
        const btnY = H / 2 - 45;

        const META = {
            agility:     { col: [0, 240, 255],  lines: ['AGILITY',     'Speed +45%  Mass -32%', 'Nimble apex predator'] },
            dominance:   { col: [175, 85, 255],  lines: ['DOMINANCE',   'Repulsion Pulse', 'Shockwave on SPACE'] },
            stealth:     { col: [80, 255, 140],  lines: ['STEALTH',     'Temporary Cloak', 'Invisible on SPACE'] },
            replication: { col: [255, 195, 0],   lines: ['REPLICATION', 'Max energy +40', 'Clone resilience'] },
        };

        for (let i = 0; i < choices.length; i++) {
            const bx = startX + i * (btnW + gap);
            const ch = choices[i];
            const meta = META[ch] || { col: [100, 200, 255], lines: [ch, '', ''] };
            const [cr, cg, cb] = meta.col;

            const bgG = ctx.createLinearGradient(bx, btnY, bx, btnY + btnH);
            bgG.addColorStop(0, `rgba(${cr},${cg},${cb},0.14)`);
            bgG.addColorStop(1, `rgba(${cr},${cg},${cb},0.04)`);
            ctx.fillStyle = bgG;
            this._roundRect(ctx, bx, btnY, btnW, btnH, 8);
            ctx.fill();
            ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.65)`;
            ctx.lineWidth = 1.5;
            this._roundRect(ctx, bx, btnY, btnW, btnH, 8);
            ctx.stroke();

            ctx.fillStyle = `rgba(${cr},${cg},${cb},0.95)`;
            ctx.font = 'bold 14px monospace';
            ctx.fillText(meta.lines[0], bx + btnW / 2, btnY + 20);
            ctx.fillStyle = `rgba(${cr},${cg},${cb},0.6)`;
            ctx.font = '10px monospace';
            ctx.fillText(meta.lines[1], bx + btnW / 2, btnY + 37);
            ctx.fillText(meta.lines[2], bx + btnW / 2, btnY + 51);
            ctx.fillStyle = `rgba(${cr},${cg},${cb},0.35)`;
            ctx.font = '9px monospace';
            ctx.fillText(`[ ${i + 1} ]`, bx + btnW / 2, btnY + btnH - 6);
        }
        ctx.textAlign = 'left';
    }
}

// ============================================================
// CLONE ORGANISM (replication mutation)
// ============================================================
class Clone extends Entity {
    constructor(x, y, player) {
        super(x, y);
        this.player = player;
        this.radius = player.radius * 0.75;
        this.mass = player.mass * 0.8;
        this.maxSpeed = player.maxSpeed * 0.85;
        this.tail = [];
        this.tailTimer = 0;
        this.angle = 0;
        this.life = 18;
    }
    update(dt, flowField) {
        this.life -= dt;
        if (this.life <= 0) { this.alive = false; return; }
        const target = this.player.pos.add(Vec2.fromAngle(Math.sin(this.age) * Math.PI, 80));
        const d = this.pos.dist(target);
        if (d > 20) {
            const f = target.sub(this.pos).norm().scale(this.maxSpeed * this.mass * 3.5);
            this.applyForce(f);
        }
        const flow = flowField.sample(this.pos.x, this.pos.y);
        this.applyForce(flow.scale(3));
        const spd = this.vel.mag();
        if (spd > this.maxSpeed) this.vel.scaleSelf(this.maxSpeed / spd);
        this.tailTimer += dt;
        if (this.tailTimer > 0.05) {
            this.tail.unshift({ x: this.pos.x, y: this.pos.y });
            if (this.tail.length > 12) this.tail.pop();
            this.tailTimer = 0;
        }
        this.angle = Math.atan2(this.vel.y, this.vel.x);
        this.integrate(dt);
    }
    draw(ctx, camX, camY) {
        const sx = this.pos.x - camX, sy = this.pos.y - camY;
        const alpha = Math.min(1, this.life / 3);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < this.tail.length; i++) {
            const tx = this.tail[i].x - camX, ty = this.tail[i].y - camY;
            const f = 1 - i / this.tail.length;
            ctx.fillStyle = `rgba(255,195,0,${f * 0.22 * alpha})`;
            ctx.beginPath();
            ctx.arc(tx, ty, this.radius * f * 0.7, 0, Math.PI * 2);
            ctx.fill();
        }
        const gl = ctx.createRadialGradient(sx, sy, 0, sx, sy, this.radius * 4.5);
        gl.addColorStop(0, `rgba(255,195,0,${0.35 * alpha})`);
        gl.addColorStop(1, `rgba(255,195,0,0)`);
        ctx.fillStyle = gl;
        ctx.beginPath();
        ctx.arc(sx, sy, this.radius * 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(this.angle);
        ctx.fillStyle = `rgba(255,210,50,${0.75 * alpha})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius * 1.1, this.radius * 0.65, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.restore();
    }
}

// ============================================================
// MAIN GAME
// ============================================================
class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.W = 0; this.H = 0;
        this._resize();

        this.noise = new Noise();
        this.flow = new FlowField(this.noise);
        this.particles = new ParticleSystem();
        this.bg = new BackgroundRenderer();
        this.ui = new UISystem();
        this.ecosystem = new EcosystemManager();

        this.entities = [];
        this.player = new Player(CONFIG.WORLD_W / 2, CONFIG.WORLD_H / 2);
        this.spawner = new SpawnManager(this.entities);

        this.camX = this.player.pos.x - this.W / 2;
        this.camY = this.player.pos.y - this.H / 2;
        this.camVX = 0; this.camVY = 0;

        this.keys = {};
        this.mouse = { x: 0, y: 0, active: false };

        this.paused = false;
        this.gameOver = false;
        this.lastTime = 0;
        this.lastEvoThreshold = 0;

        this._spawnWorld();
        this._bindEvents();
        window.addEventListener('resize', () => this._resize());
    }

    _resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.W = this.canvas.width;
        this.H = this.canvas.height;
    }

    _spawnWorld() {
        for (let i = 0; i < CONFIG.FOOD_COUNT; i++) {
            const c = this.spawner.clusterCenters[Math.floor(Math.random() * this.spawner.clusterCenters.length)];
            const f = new Food(
                c.x + (Math.random() - 0.5) * 600,
                c.y + (Math.random() - 0.5) * 600
            );
            f.clusterTarget = c;
            this.entities.push(f);
        }
        for (let i = 0; i < CONFIG.NEUTRAL_COUNT; i++) {
            this.entities.push(new Neutral(Math.random() * CONFIG.WORLD_W, Math.random() * CONFIG.WORLD_H));
        }
        for (let i = 0; i < CONFIG.PREDATOR_COUNT; i++) {
            const angle = (i / CONFIG.PREDATOR_COUNT) * Math.PI * 2;
            const dist = 800 + Math.random() * 400;
            this.entities.push(new Predator(
                CONFIG.WORLD_W / 2 + Math.cos(angle) * dist,
                CONFIG.WORLD_H / 2 + Math.sin(angle) * dist
            ));
        }
    }

    _bindEvents() {
        document.addEventListener('keydown', e => {
            this.keys[e.code] = true;
            if (this.gameOver) { if (e.code === 'KeyR') location.reload(); return; }
            if (this.ui.tryKeyEvo(e.key)) { this.paused = false; return; }
            if (e.code === 'Space') {
                e.preventDefault();
                this._useAbility();
            }
        });
        document.addEventListener('keyup', e => { this.keys[e.code] = false; });
        this.canvas.addEventListener('mousemove', e => {
            const r = this.canvas.getBoundingClientRect();
            this.mouse.x = (e.clientX - r.left) * (this.W / r.width);
            this.mouse.y = (e.clientY - r.top) * (this.H / r.height);
            this.mouse.active = true;
        });
        this.canvas.addEventListener('mouseleave', () => { this.mouse.active = false; });
        this.canvas.addEventListener('click', e => {
            if (this.gameOver) return;
            const r = this.canvas.getBoundingClientRect();
            const mx = (e.clientX - r.left) * (this.W / r.width);
            const my = (e.clientY - r.top) * (this.H / r.height);
            if (this.ui.tryClickEvo(mx, my, this.W, this.H)) { this.paused = false; }
        });
        // Touch support
        this.canvas.addEventListener('touchstart', e => {
            e.preventDefault();
            const t = e.touches[0];
            const r = this.canvas.getBoundingClientRect();
            this.mouse.x = (t.clientX - r.left) * (this.W / r.width);
            this.mouse.y = (t.clientY - r.top) * (this.H / r.height);
            this.mouse.active = true;
        }, { passive: false });
        this.canvas.addEventListener('touchmove', e => {
            e.preventDefault();
            const t = e.touches[0];
            const r = this.canvas.getBoundingClientRect();
            this.mouse.x = (t.clientX - r.left) * (this.W / r.width);
            this.mouse.y = (t.clientY - r.top) * (this.H / r.height);
        }, { passive: false });
        this.canvas.addEventListener('touchend', e => {
            if (e.touches.length === 0) this.mouse.active = false;
        });
    }

    _useAbility() {
        const p = this.player;
        if (p.mutation === 'dominance' && p.repulseCooldown <= 0) {
            const PULSE_R = 220;
            for (const e of this.entities) {
                const d = p.pos.dist(e.pos);
                if (d < PULSE_R && d > 0) {
                    const str = (1 - d / PULSE_R) * 700;
                    e.applyForce(e.pos.sub(p.pos).norm().scale(str));
                }
            }
            this.particles.burst(p.pos.x, p.pos.y, [200, 120, 255], 22);
            this.ui.msg('DOMINANCE PULSE!', [200, 120, 255]);
            p.repulseCooldown = 6;
        }
        if (p.mutation === 'stealth' && p.stealthCooldown <= 0) {
            p.stealthTimer = 4.5;
            p.invisible = true;
            p.stealthCooldown = 12;
            this.ui.msg('STEALTH ACTIVE', [80, 255, 140]);
            this.particles.burst(p.pos.x, p.pos.y, [80, 255, 140], 12);
        }
        if (p.mutation === 'replication') {
            const hasClone = this.entities.some(e => e instanceof Clone && e.alive);
            if (!hasClone) {
                const c = new Clone(p.pos.x + 30, p.pos.y, p);
                this.entities.push(c);
                this.ui.msg('CLONE DEPLOYED', [255, 195, 0]);
                this.particles.burst(p.pos.x, p.pos.y, [255, 195, 0], 10);
            }
        }
    }

    start() {
        requestAnimationFrame(t => this._loop(t));
    }

    _loop(ts) {
        const dt = Math.min((ts - this.lastTime) / 1000, 0.05);
        this.lastTime = ts;
        if (this.gameOver) {
            this._renderGameOver();
        } else {
            if (!this.paused) this._update(dt);
            this._render();
        }
        requestAnimationFrame(t => this._loop(t));
    }

    _update(dt) {
        // Build input vector
        let dx = 0, dy = 0;
        if (this.keys['ArrowLeft']  || this.keys['KeyA']) dx -= 1;
        if (this.keys['ArrowRight'] || this.keys['KeyD']) dx += 1;
        if (this.keys['ArrowUp']    || this.keys['KeyW']) dy -= 1;
        if (this.keys['ArrowDown']  || this.keys['KeyS']) dy += 1;

        if (this.mouse.active && dx === 0 && dy === 0) {
            const cx = this.W / 2, cy = this.H / 2;
            const dmx = this.mouse.x - cx, dmy = this.mouse.y - cy;
            const md = Math.sqrt(dmx * dmx + dmy * dmy);
            if (md > 45) { dx = dmx / md * Math.min(1, md / 180); dy = dmy / md * Math.min(1, md / 180); }
        }
        this.player.setInput(dx, dy);

        // Event modifiers
        let eMod = 1.0;
        if (this.ecosystem.activeEvent === 'speed_surge') eMod = 1.55;
        if (this.ecosystem.activeEvent === 'gravity_pull') {
            const cx = CONFIG.WORLD_W / 2, cy = CONFIG.WORLD_H / 2;
            const ddx = cx - this.player.pos.x, ddy = cy - this.player.pos.y;
            const dd = Math.sqrt(ddx * ddx + ddy * ddy);
            if (dd > 150) this.player.applyForce(new Vec2(ddx / dd * 55, ddy / dd * 55));
        }
        if (this.ecosystem.activeEvent === 'food_bloom') {
            // Extra food spawn handled in spawner
            this.ecosystem.foodRate = 0.3;
        } else if (this.ecosystem.activeEvent !== 'food_bloom') {
            // Reset when not active (only if we set it)
        }

        // Update systems
        this.flow.update(dt);
        this.bg.update(dt);
        this.ui.update(dt);
        this.ecosystem.update(dt, this.player, this.entities);
        this.spawner.update(dt, this.ecosystem);

        this.player.update(dt, this.flow, this.particles, eMod);

        const all = [...this.entities, this.player];
        for (const e of this.entities) {
            if (!e.alive) continue;
            if (e instanceof Food)    e.update(dt, this.flow);
            else if (e instanceof Neutral) e.update(dt, all, this.flow);
            else if (e instanceof Predator) e.update(dt, this.player, this.flow, this.entities);
            else if (e instanceof Clone) e.update(dt, this.flow);
        }
        this.particles.update(dt);

        // Player eats food
        for (const e of this.entities) {
            if (!e.alive || !(e instanceof Food)) continue;
            const d = this.player.pos.dist(e.pos);
            if (d < this.player.radius + e.radius + 2) {
                this.player.energy = Math.min(this.player.maxEnergy, this.player.energy + e.energy);
                this.player.score += e.energy;
                this.particles.burst(e.pos.x, e.pos.y, e.color, 7);
                e.alive = false;
            }
        }

        // Predator hits player
        for (const e of this.entities) {
            if (!e.alive || !(e instanceof Predator)) continue;
            const d = this.player.pos.dist(e.pos);
            if (d < this.player.radius + e.radius) {
                if (this.player.takeDamage(22)) {
                    this.particles.burst(this.player.pos.x, this.player.pos.y, [255, 40, 70], 14);
                    this.ui.msg('PREDATOR STRIKE  -22', [255, 40, 70]);
                    // Knockback
                    const kb = this.player.pos.sub(e.pos).norm().scale(320);
                    this.player.applyForce(kb);
                }
            }
        }

        // Evolution check
        for (const thr of CONFIG.EVOLUTION_THRESHOLDS) {
            if (this.player.score >= thr && this.lastEvoThreshold < thr) {
                this.lastEvoThreshold = thr;
                this._openEvoMenu();
                return;
            }
        }

        if (this.player.energy <= 0) { this.gameOver = true; return; }

        // Smooth camera
        const tx = this.player.pos.x - this.W / 2;
        const ty = this.player.pos.y - this.H / 2;
        this.camVX = (this.camVX + (tx - this.camX) * 0.12) * 0.78;
        this.camVY = (this.camVY + (ty - this.camY) * 0.12) * 0.78;
        this.camX += this.camVX;
        this.camY += this.camVY;
    }

    _openEvoMenu() {
        this.paused = true;
        const all = ['agility', 'dominance', 'stealth', 'replication'];
        const available = all.filter(m => m !== this.player.mutation).sort(() => Math.random() - 0.5).slice(0, 3);
        this.ui.showEvo(available, choice => {
            this.player.evolve(choice);
            this.ui.msg(`EVOLVED  →  ${choice.toUpperCase()}`, [255, 220, 0]);
            this.particles.burst(this.player.pos.x, this.player.pos.y, this.player.color, 28);
        });
    }

    _render() {
        const ctx = this.ctx;
        const { W, H, camX, camY } = this;

        this.bg.draw(ctx, camX, camY, W, H);

        // Motion blur overlay
        ctx.fillStyle = 'rgba(0,4,18,0.22)';
        ctx.fillRect(0, 0, W, H);

        // Food
        for (const e of this.entities) {
            if (!e.alive || !(e instanceof Food)) continue;
            const sx = e.pos.x - camX, sy = e.pos.y - camY;
            if (sx > -50 && sx < W + 50 && sy > -50 && sy < H + 50) e.draw(ctx, camX, camY);
        }

        // Neutrals
        for (const e of this.entities) {
            if (!e.alive || !(e instanceof Neutral)) continue;
            const sx = e.pos.x - camX, sy = e.pos.y - camY;
            if (sx > -60 && sx < W + 60 && sy > -60 && sy < H + 60) e.draw(ctx, camX, camY);
        }

        // Clone
        for (const e of this.entities) {
            if (!e.alive || !(e instanceof Clone)) continue;
            e.draw(ctx, camX, camY);
        }

        // Particles
        this.particles.draw(ctx, camX, camY, W, H);

        // Player
        this.player.draw(ctx, camX, camY);

        // Predators (above player for drama)
        for (const e of this.entities) {
            if (!e.alive || !(e instanceof Predator)) continue;
            const sx = e.pos.x - camX, sy = e.pos.y - camY;
            if (sx > -120 && sx < W + 120 && sy > -120 && sy < H + 120) e.draw(ctx, camX, camY);
        }

        // UI
        this.ui.draw(ctx, W, H, this.player, this.ecosystem);

        // Controls hint (first few seconds)
        if (this.player.age < 7) {
            const a = Math.max(0, 1 - this.player.age / 7) * 0.7;
            ctx.save();
            ctx.fillStyle = `rgba(0,200,255,${a})`;
            ctx.font = '12px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('WASD / Arrow Keys  or  Mouse to move  ·  Eat glowing orbs to survive  ·  Avoid red predators', W / 2, H - 14);
            ctx.restore();
        }
    }

    _renderGameOver() {
        const ctx = this.ctx;
        const { W, H } = this;

        // Fade background
        ctx.fillStyle = 'rgba(0,1,8,0.96)';
        ctx.fillRect(0, 0, W, H);

        // Faint grid
        ctx.strokeStyle = 'rgba(0,255,200,0.03)';
        ctx.lineWidth = 1;
        for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

        ctx.save();
        ctx.textAlign = 'center';

        ctx.fillStyle = 'rgba(255,40,70,0.92)';
        ctx.font = 'bold 46px monospace';
        ctx.fillText('ORGANISM EXPIRED', W / 2, H / 2 - 70);

        ctx.fillStyle = 'rgba(0,255,200,0.12)';
        ctx.fillRect(W / 2 - 200, H / 2 - 30, 400, 100);
        ctx.strokeStyle = 'rgba(0,255,200,0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(W / 2 - 200, H / 2 - 30, 400, 100);

        ctx.fillStyle = 'rgba(0,255,200,0.88)';
        ctx.font = 'bold 22px monospace';
        ctx.fillText(`FINAL SCORE  ${Math.floor(this.player.score)}`, W / 2, H / 2 + 5);
        ctx.fillStyle = 'rgba(0,190,255,0.65)';
        ctx.font = '14px monospace';
        ctx.fillText(`Evolution Level ${this.player.evolutionLevel}  ·  ${this.player.mutation ? this.player.mutation.toUpperCase() + ' Form' : 'Primal Form'}`, W / 2, H / 2 + 30);
        ctx.fillText(`Survived ${Math.floor(this.player.age)}s`, W / 2, H / 2 + 52);

        const t = (Date.now() / 900) % 1;
        const blinkA = 0.4 + 0.4 * Math.sin(t * Math.PI * 2);
        ctx.fillStyle = `rgba(0,200,255,${blinkA})`;
        ctx.font = '13px monospace';
        ctx.fillText('[ R ]  Restart', W / 2, H / 2 + 110);

        ctx.restore();
    }
}

// ============================================================
// BOOT
// ============================================================
window.addEventListener('load', () => {
    const canvas = document.getElementById('gameCanvas');
    const game = new Game(canvas);
    game.start();
});
