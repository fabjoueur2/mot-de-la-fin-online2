/** Rendu canvas des animaux — style flat cartoon, contours épais */
const ANIMAL_DEFS = {
  bird: { color: '#fff', accent: '#f39c12', w: 52, h: 36 },
  hedgehog: { color: '#8d6e63', accent: '#d7ccc8', w: 48, h: 32 },
  fox: { color: '#e67e22', accent: '#fff3e0', w: 58, h: 34 },
  penguin: { color: '#263238', accent: '#fff', w: 40, h: 50 },
  frog: { color: '#66bb6a', accent: '#1b5e20', w: 54, h: 38 },
  pig: { color: '#f48fb1', accent: '#fce4ec', w: 50, h: 44 },
  rabbit: { color: '#eee', accent: '#ff8a80', w: 44, h: 52 },
  cat: { color: '#ff9800', accent: '#fff8e1', w: 48, h: 40 },
  sheep: { color: '#fafafa', accent: '#424242', w: 56, h: 46 },
  owl: { color: '#8d6e63', accent: '#ffecb3', w: 46, h: 48 },
  turtle: { color: '#43a047', accent: '#1b5e20', w: 58, h: 36 },
  koala: { color: '#9e9e9e', accent: '#f5f5f5', w: 50, h: 46 }
};

function stroke(ctx) {
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}

function drawAnimal(ctx, type, x, y, angle, alpha = 1) {
  const def = ANIMAL_DEFS[type] || ANIMAL_DEFS.bird;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);

  const draw = ANIMAL_DRAW[type] || ANIMAL_DRAW.bird;
  draw(ctx, def);
  ctx.restore();
}

const ANIMAL_DRAW = {
  bird(ctx, d) {
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, d.w * 0.42, d.h * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    stroke(ctx);
    ctx.stroke();
    ctx.fillStyle = d.accent;
    ctx.beginPath();
    ctx.moveTo(d.w * 0.35, 0);
    ctx.lineTo(d.w * 0.55, -4);
    ctx.lineTo(d.w * 0.55, 4);
    ctx.closePath();
    ctx.fill();
    stroke(ctx);
    ctx.stroke();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(8, -4, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4d96ff';
    ctx.fillRect(-d.w * 0.35, -d.h * 0.2, 14, 10);
    stroke(ctx);
    ctx.strokeRect(-d.w * 0.35, -d.h * 0.2, 14, 10);
  },

  hedgehog(ctx, d) {
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.ellipse(0, 4, d.w * 0.4, d.h * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    stroke(ctx);
    ctx.stroke();
    ctx.fillStyle = d.accent;
    ctx.beginPath();
    ctx.arc(-8, 2, 10, 0, Math.PI * 2);
    ctx.fill();
    stroke(ctx);
    ctx.stroke();
    ctx.fillStyle = d.color;
    for (let i = 0; i < 7; i++) {
      const a = -0.8 + i * 0.25;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 12, Math.sin(a) * 8 - 8);
      ctx.lineTo(Math.cos(a) * 22, Math.sin(a) * 14 - 18);
      ctx.lineTo(Math.cos(a + 0.12) * 12, Math.sin(a + 0.12) * 8 - 8);
      ctx.fill();
      stroke(ctx);
      ctx.stroke();
    }
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(-12, 4, 2.5, 0, Math.PI * 2);
    ctx.fill();
  },

  fox(ctx, d) {
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.rect(-d.w * 0.4, -d.h * 0.25, d.w * 0.8, d.h * 0.55);
    ctx.fill();
    stroke(ctx);
    ctx.stroke();
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.moveTo(-12, -d.h * 0.25);
    ctx.lineTo(-6, -d.h * 0.65);
    ctx.lineTo(2, -d.h * 0.25);
    ctx.fill();
    stroke(ctx);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(8, -d.h * 0.25);
    ctx.lineTo(14, -d.h * 0.6);
    ctx.lineTo(18, -d.h * 0.25);
    ctx.fill();
    stroke(ctx);
    ctx.stroke();
    ctx.fillStyle = d.accent;
    ctx.beginPath();
    ctx.ellipse(14, 2, 10, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    stroke(ctx);
    ctx.stroke();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(6, -2, 2.5, 0, Math.PI * 2);
    ctx.fill();
  },

  penguin(ctx, d) {
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, d.w * 0.42, d.h * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();
    stroke(ctx);
    ctx.stroke();
    ctx.fillStyle = d.accent;
    ctx.beginPath();
    ctx.ellipse(0, 4, d.w * 0.28, d.h * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = d.accent;
    ctx.fillRect(-6, -d.h * 0.35, 12, 8);
    ctx.fillStyle = d.accent;
    ctx.beginPath();
    ctx.ellipse(-10, d.h * 0.35, 8, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(10, d.h * 0.35, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    stroke(ctx);
    ctx.stroke();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(-6, -6, 3, 0, Math.PI * 2);
    ctx.arc(6, -6, 3, 0, Math.PI * 2);
    ctx.fill();
  },

  frog(ctx, d) {
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.ellipse(0, 4, d.w * 0.44, d.h * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    stroke(ctx);
    ctx.stroke();
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.arc(-14, -10, 10, 0, Math.PI * 2);
    ctx.arc(14, -10, 10, 0, Math.PI * 2);
    ctx.fill();
    stroke(ctx);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-14, -10, 5, 0, Math.PI * 2);
    ctx.arc(14, -10, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(-14, -10, 2.5, 0, Math.PI * 2);
    ctx.arc(14, -10, 2.5, 0, Math.PI * 2);
    ctx.fill();
  },

  pig(ctx, d) {
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, d.w * 0.42, d.h * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    stroke(ctx);
    ctx.stroke();
    ctx.fillStyle = d.accent;
    ctx.beginPath();
    ctx.ellipse(16, 4, 12, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    stroke(ctx);
    ctx.stroke();
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.arc(-4, 2, 3, 0, Math.PI * 2);
    ctx.arc(4, 2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(-10, -6, 2.5, 0, Math.PI * 2);
    ctx.arc(10, -6, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.ellipse(-8, -d.h * 0.35, 6, 12, -0.3, 0, Math.PI * 2);
    ctx.ellipse(8, -d.h * 0.35, 6, 12, 0.3, 0, Math.PI * 2);
    ctx.fill();
    stroke(ctx);
    ctx.stroke();
  },

  rabbit(ctx, d) {
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.ellipse(0, 6, d.w * 0.38, d.h * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    stroke(ctx);
    ctx.stroke();
    ctx.fillStyle = d.color;
    ctx.fillRect(-10, -d.h * 0.55, 8, 22);
    ctx.fillRect(4, -d.h * 0.55, 8, 22);
    stroke(ctx);
    ctx.strokeRect(-10, -d.h * 0.55, 8, 22);
    ctx.strokeRect(4, -d.h * 0.55, 8, 22);
    ctx.fillStyle = d.accent;
    ctx.beginPath();
    ctx.arc(0, 8, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(-6, 2, 2, 0, Math.PI * 2);
    ctx.arc(6, 2, 2, 0, Math.PI * 2);
    ctx.fill();
  },

  cat(ctx, d) {
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.ellipse(0, 4, d.w * 0.4, d.h * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    stroke(ctx);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-14, -8);
    ctx.lineTo(-10, -22);
    ctx.lineTo(-4, -8);
    ctx.moveTo(14, -8);
    ctx.lineTo(10, -22);
    ctx.lineTo(4, -8);
    stroke(ctx);
    ctx.stroke();
    ctx.fillStyle = d.accent;
    ctx.beginPath();
    ctx.ellipse(0, 8, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(-8, 0, 2.5, 0, Math.PI * 2);
    ctx.arc(8, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.moveTo(-16, 6);
    ctx.lineTo(-28, 4);
    ctx.moveTo(-16, 10);
    ctx.lineTo(-28, 12);
    ctx.moveTo(16, 6);
    ctx.lineTo(28, 4);
    ctx.moveTo(16, 10);
    ctx.lineTo(28, 12);
    ctx.stroke();
  },

  sheep(ctx, d) {
    ctx.fillStyle = d.color;
    for (let i = 0; i < 6; i++) {
      const ox = (i % 3 - 1) * 14;
      const oy = Math.floor(i / 3) * 12 - 4;
      ctx.beginPath();
      ctx.arc(ox, oy, 12, 0, Math.PI * 2);
      ctx.fill();
      stroke(ctx);
      ctx.stroke();
    }
    ctx.fillStyle = d.accent;
    ctx.beginPath();
    ctx.ellipse(0, 10, 14, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    stroke(ctx);
    ctx.stroke();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(-5, 8, 2, 0, Math.PI * 2);
    ctx.arc(5, 8, 2, 0, Math.PI * 2);
    ctx.fill();
  },

  owl(ctx, d) {
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, d.w * 0.4, d.h * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    stroke(ctx);
    ctx.stroke();
    ctx.fillStyle = d.accent;
    ctx.beginPath();
    ctx.arc(-10, -2, 10, 0, Math.PI * 2);
    ctx.arc(10, -2, 10, 0, Math.PI * 2);
    ctx.fill();
    stroke(ctx);
    ctx.stroke();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(-10, -2, 4, 0, Math.PI * 2);
    ctx.arc(10, -2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = d.accent;
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.lineTo(-4, 10);
    ctx.lineTo(4, 10);
    ctx.closePath();
    ctx.fill();
    stroke(ctx);
    ctx.stroke();
  },

  turtle(ctx, d) {
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.ellipse(0, -4, d.w * 0.38, d.h * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    stroke(ctx);
    ctx.stroke();
    ctx.fillStyle = d.accent;
    ctx.beginPath();
    ctx.ellipse(0, -4, d.w * 0.22, d.h * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = d.color;
    [[-18, 12], [18, 12], [-12, 16], [12, 16]].forEach(([lx, ly]) => {
      ctx.beginPath();
      ctx.ellipse(lx, ly, 6, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      stroke(ctx);
      ctx.stroke();
    });
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(-8, -14, 2, 0, Math.PI * 2);
    ctx.fill();
  },

  koala(ctx, d) {
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.ellipse(0, 4, d.w * 0.38, d.h * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    stroke(ctx);
    ctx.stroke();
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.arc(-18, -8, 12, 0, Math.PI * 2);
    ctx.arc(18, -8, 12, 0, Math.PI * 2);
    ctx.fill();
    stroke(ctx);
    ctx.stroke();
    ctx.fillStyle = d.accent;
    ctx.beginPath();
    ctx.ellipse(0, 8, 12, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(-8, 0, 2.5, 0, Math.PI * 2);
    ctx.arc(8, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
};

window.drawAnimal = drawAnimal;
window.ANIMAL_DEFS = ANIMAL_DEFS;
