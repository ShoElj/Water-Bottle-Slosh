const bottle = document.getElementById("bottle");
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

const strengthEl = document.getElementById("strength");
const fillEl = document.getElementById("fill");
const sensEl = document.getElementById("sens");
const colorEl = document.getElementById("color");

const enableTiltBtn = document.getElementById("enableTilt");
const tiltModeBtn = document.getElementById("tiltMode");
const enableSoundBtn = document.getElementById("enableSound");
const modeLabel = document.getElementById("modeLabel");

function resize() {
    const r = bottle.getBoundingClientRect();
    canvas.width = Math.floor(r.width * devicePixelRatio);
    canvas.height = Math.floor(r.height * devicePixelRatio);
    canvas.style.width = r.width + "px";
    canvas.style.height = r.height + "px";
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
addEventListener("resize", resize);
resize();


let controlMode = "pointer";

function setMode(m) {
    controlMode = m;
    modeLabel.textContent =
        m === "pointer" ? "Mode: Pointer" :
            m === "device" ? "Mode: Device Tilt" :
                "Mode: Keyboard Tilt";
}

let inputX = 0, inputY = 0;
let lastPointerTime = performance.now();

function setFromPointer(clientX, clientY) {
    const r = bottle.getBoundingClientRect();
    const x = (clientX - r.left) / r.width;
    const y = (clientY - r.top) / r.height;
    inputX = (x * 2 - 1);
    inputY = (y * 2 - 1);
}

bottle.addEventListener("pointerdown", (e) => {
    setMode("pointer");
    bottle.setPointerCapture(e.pointerId);
    setFromPointer(e.clientX, e.clientY);
    lastPointerTime = performance.now();
});

bottle.addEventListener("pointermove", (e) => {
    if (controlMode !== "pointer") return;
    setFromPointer(e.clientX, e.clientY);
    lastPointerTime = performance.now();
});

// return to center slowly if not interacting
function idleCenter() {
    if (controlMode !== "pointer") return;
    if (performance.now() - lastPointerTime > 180) {
        inputX *= 0.94;
        inputY *= 0.94;
    }
}

// ---------- Device tilt (phone + some laptops/2-in-1) ----------
let deviceTiltEnabled = false;
async function enableDeviceTilt() {
    try {
        if (typeof DeviceOrientationEvent !== "undefined" &&
            typeof DeviceOrientationEvent.requestPermission === "function") {
            const res = await DeviceOrientationEvent.requestPermission();
            if (res !== "granted") return;
        }
        deviceTiltEnabled = true;
        setMode("device");
    } catch (_) { }
}
enableTiltBtn.addEventListener("click", enableDeviceTilt);

addEventListener("deviceorientation", (e) => {
    if (!deviceTiltEnabled || controlMode !== "device") return;
    const g = (e.gamma ?? 0) / 35;  // tighter mapping
    const b = (e.beta ?? 0) / 45;
    inputX = Math.max(-1, Math.min(1, g));
    inputY = Math.max(-1, Math.min(1, b));
});

// ---------- Keyboard tilt fallback ----------
let kx = 0, ky = 0;
const keys = new Set();

function updateKeyboardTarget() {
    const left = keys.has("ArrowLeft") || keys.has("a") || keys.has("A");
    const right = keys.has("ArrowRight") || keys.has("d") || keys.has("D");
    const up = keys.has("ArrowUp") || keys.has("w") || keys.has("W");
    const down = keys.has("ArrowDown") || keys.has("s") || keys.has("S");

    const tx = (right ? 1 : 0) - (left ? 1 : 0);
    const ty = (down ? 1 : 0) - (up ? 1 : 0);

    // smooth
    kx += (tx - kx) * 0.18;
    ky += (ty - ky) * 0.18;

    if (controlMode === "keyboard") {
        inputX = kx;
        inputY = ky;
    }
}

addEventListener("keydown", (e) => {
    keys.add(e.key);
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) e.preventDefault();
}, { passive: false });

addEventListener("keyup", (e) => keys.delete(e.key));

tiltModeBtn.addEventListener("click", () => {
    setMode(controlMode === "keyboard" ? "pointer" : "keyboard");
});

// ---------- Helpers ----------
const clamp = (val, a, b) => Math.max(a, Math.min(b, val));
function hexToRgb(hex) {
    const h = hex.replace("#", "");
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// ---------- Water surface simulation ----------
const N = 64;
const y = new Array(N).fill(0);
const v = new Array(N).fill(0);

let tilt = 0, tiltV = 0;
let level = 0;

const droplets = [];
const MAX_DROPLETS = 40;

function crest(val, amount) {
    const sign = Math.sign(val);
    const a = Math.abs(val);
    const shaped = Math.pow(a, 0.85);
    return sign * (a + (shaped - a) * amount);
}

function impactRipple(t01, power) {
    const idx = Math.round(t01 * (N - 1));
    const p = clamp(power, 0.6, 4.0);
    for (let k = -2; k <= 2; k++) {
        const i = idx + k;
        if (i < 0 || i >= N) continue;
        const falloff = 1 - Math.abs(k) / 3;
        v[i] += (p * falloff) * (Math.random() < 0.5 ? -1 : 1);
    }
    playSplash(p);
}

function spawnDroplets(count, fromSide, surfaceY) {
    const w = bottle.clientWidth;
    const s = strengthEl.value / 100;
    for (let i = 0; i < count && droplets.length < MAX_DROPLETS; i++) {
        const isLeft = (fromSide === "left");
        const x = isLeft ? 10 : w - 10;
        const vx = (isLeft ? -1 : 1) * (2.4 + Math.random() * 3.2) * (0.6 + s);
        const vy = -(4.2 + Math.random() * 4.6) * (0.7 + s);
        droplets.push({ x, y: surfaceY - Math.random() * 10, vx, vy, r: 2.1 + Math.random() * 1.3, life: 1 });
    }
}

// ---------- Sound (softer splash) ----------
let audioEnabled = false, audioCtx = null;
enableSoundBtn.addEventListener("click", () => {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioEnabled = true;
    } catch (_) { }
});

function playSplash(power) {
    if (!audioEnabled || !audioCtx) return;

    const t = audioCtx.currentTime;
    const dur = 0.09;

    const bufferSize = Math.floor(audioCtx.sampleRate * dur);
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        const env = Math.pow(1 - i / bufferSize, 2.2);
        data[i] = (Math.random() * 2 - 1) * env;
    }

    const src = audioCtx.createBufferSource();
    src.buffer = buffer;

    const bp = audioCtx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 850;
    bp.Q.value = 0.7;

    const lp = audioCtx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1600;

    const gain = audioCtx.createGain();
    const vol = 0.006 * clamp(power / 3, 0.35, 1.0);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(bp); bp.connect(lp); lp.connect(gain); gain.connect(audioCtx.destination);
    src.start(t);
    src.stop(t + dur);
}

// ---------- Step ----------
let prevX = 0;

function step(dt, w, h) {
    idleCenter();
    updateKeyboardTarget();

    const s = strengthEl.value / 100;
    const sens = sensEl.value / 100; // 0.5..2.5

    const x = clamp(inputX * sens, -1, 1);
    const yIn = clamp(inputY * sens, -1, 1);

    const targetTilt = clamp(x * (0.25 + s) * 16, -20, 20);

    const k = 9.5, d = 2.9;
    tiltV += ((targetTilt - tilt) * k - tiltV * d) * dt;
    tilt += tiltV * dt;

    level += ((-yIn * 6) - level) * (1.0 * dt);

    const jerk = clamp((x - prevX) / Math.max(0.001, dt), -14, 14);
    prevX = x;

    const drive = clamp(tiltV * 0.06 + jerk * 0.012, -1.8, 1.8);
    const edgeBoost = drive * 30 * (0.25 + s);

    v[0] += edgeBoost * dt;
    v[N - 1] -= edgeBoost * dt;

    const tension = 95;
    const baseDamp = 5.1 - (s * 1.2);
    const neighbor = 20;

    for (let i = 0; i < N; i++) {
        v[i] += (-y[i] * tension) * dt;
        v[i] *= Math.exp(-baseDamp * dt);
        y[i] += v[i] * dt;
    }
    for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i < N; i++) {
            const dL = (y[i] - y[i - 1]) * neighbor * dt;
            v[i - 1] += dL; v[i] -= dL;
        }
    }

    // droplets
    const trigger = Math.abs(jerk);
    const fill = fillEl.value / 100;
    const baseY = h * (1 - fill) + level;

    if (trigger > 6.2 && Math.random() < 0.70) {
        const side = jerk > 0 ? "right" : "left";
        const count = Math.min(4, Math.floor(trigger - 5.5));
        spawnDroplets(count, side, baseY);
    }

    const gravity = 1550;
    const airDrag = Math.pow(0.985, dt * 60);

    const surfaceFn = (x01) => {
        const slope = Math.tan((tilt * Math.PI) / 180);
        const slopeY = (x01 - 0.5) * w * slope * 0.34;

        const idx = x01 * (N - 1);
        const i0 = Math.floor(idx);
        const i1 = Math.min(N - 1, i0 + 1);
        const t = idx - i0;

        let disp = (y[i0] * (1 - t) + y[i1] * t) * (0.85 + strengthEl.value / 120);
        const activity = clamp(Math.abs(tiltV) * 0.07, 0, 1);
        disp = crest(disp, activity);

        return baseY + slopeY + disp;
    };

    for (let i = droplets.length - 1; i >= 0; i--) {
        const d2 = droplets[i];

        d2.vy += gravity * dt;
        d2.vx *= airDrag;
        d2.vy *= airDrag;

        d2.x += d2.vx;
        d2.y += d2.vy;
        d2.life -= dt * 0.45;

        if (d2.life <= 0 || d2.y > h + 40 || d2.x < -40 || d2.x > w + 40) {
            droplets.splice(i, 1);
            continue;
        }

        const x01 = clamp(d2.x / w, 0, 1);
        const surfY = surfaceFn(x01);

        if (d2.y >= surfY) {
            const speed = Math.hypot(d2.vx, d2.vy);
            impactRipple(x01, clamp(speed / 700, 0.8, 3.2));
            droplets.splice(i, 1);
        }
    }
}

// ---------- Draw ----------
function draw(w, h) {
    ctx.clearRect(0, 0, w, h);

    const fill = fillEl.value / 100;
    const baseY = h * (1 - fill) + level;

    const { r, g, b } = hexToRgb(colorEl.value);
    const topCol = `rgba(${Math.min(255, r + 70)},${Math.min(255, g + 90)},${Math.min(255, b + 100)},0.84)`;
    const midCol = `rgba(${Math.min(255, r + 20)},${Math.min(255, g + 40)},${Math.min(255, b + 50)},0.92)`;
    const botCol = `rgba(${Math.max(0, r - 30)},${Math.max(0, g - 30)},${Math.max(0, b - 10)},0.96)`;

    const grad = ctx.createLinearGradient(0, baseY, 0, h);
    grad.addColorStop(0, topCol);
    grad.addColorStop(0.55, midCol);
    grad.addColorStop(1, botCol);

    const slope = Math.tan((tilt * Math.PI) / 180);
    const activity = clamp(Math.abs(tiltV) * 0.07, 0, 1);

    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, baseY);

    const surfacePts = new Array(N);

    for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        const x = t * w;
        const slopeY = (t - 0.5) * w * slope * 0.34;

        let disp = y[i] * (0.85 + strengthEl.value / 120);
        disp = crest(disp, activity);

        const rip = Math.sin(t * Math.PI * 6 + performance.now() * 0.01) * (1.4 * activity);
        const yy = baseY + slopeY + disp + rip;

        surfacePts[i] = { x, y: yy };
        ctx.lineTo(x, yy);
    }

    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < N; i++) {
        const p = surfacePts[i];
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.42)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.globalAlpha = 0.16;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
        const p = surfacePts[i];
        const yy = p.y + 12;
        if (i === 0) ctx.moveTo(p.x, yy); else ctx.lineTo(p.x, yy);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.globalAlpha = 1;

    for (const d of droplets) {
        const speed = Math.hypot(d.vx, d.vy);
        const stretch = clamp(speed / 900, 0, 1);
        const len = d.r * (1.0 + 2.2 * stretch);
        const wid = d.r * (1.0 - 0.25 * stretch);
        const ang = Math.atan2(d.vy, d.vx);

        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(ang);

        ctx.beginPath();
        ctx.ellipse(0, 0, len, wid, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(210,240,255,0.92)";
        ctx.fill();

        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.ellipse(-len * 0.25, -wid * 0.25, len * 0.35, wid * 0.35, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.restore();
    }
}

// ---------- Loop ----------
let last = performance.now();
function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    const w = bottle.clientWidth;
    const h = bottle.clientHeight;

    step(dt, w, h);
    draw(w, h);

    requestAnimationFrame(loop);
}
requestAnimationFrame(loop);