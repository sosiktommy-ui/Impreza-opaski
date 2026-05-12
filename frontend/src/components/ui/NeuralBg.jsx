import { useEffect, useRef } from 'react';

// Neural-network / particle-web canvas animation for Login page
export default function NeuralBg() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    const mouse = { x: -9999, y: -9999 };

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();

    const W = () => canvas.offsetWidth;
    const H = () => canvas.offsetHeight;

    const PALETTE = ['#7c6cf7', '#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#818cf8'];
    const NODE_COUNT = Math.min(90, Math.floor((W() * H()) / 9000));
    const MAX_DIST = 160;

    class Node {
      constructor() { this.init(); }
      init() {
        this.x  = Math.random() * W();
        this.y  = Math.random() * H();
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.r  = Math.random() * 2.2 + 0.8;
        this.col = PALETTE[Math.floor(Math.random() * PALETTE.length)];
        this.a  = Math.random() * 0.55 + 0.25;
        this.phi = Math.random() * Math.PI * 2;
        this.phiSpeed = 0.015 + Math.random() * 0.025;
        this.hub = Math.random() < 0.12; // 12% are bright hubs
      }
      update() {
        // gentle mouse attraction
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 180 * 180) {
          const d = Math.sqrt(d2);
          this.vx += (dx / d) * 0.02;
          this.vy += (dy / d) * 0.02;
        }
        // speed cap
        const spd = Math.hypot(this.vx, this.vy);
        if (spd > 1.4) { this.vx *= 0.92; this.vy *= 0.92; }
        this.x += this.vx;
        this.y += this.vy;
        // wrap-around edges
        if (this.x < -20) this.x = W() + 20;
        if (this.x > W() + 20) this.x = -20;
        if (this.y < -20) this.y = H() + 20;
        if (this.y > H() + 20) this.y = -20;
        this.phi += this.phiSpeed;
      }
      draw() {
        const pulse = 0.72 + Math.sin(this.phi) * 0.28;
        const r = this.hub ? this.r * 2.8 : this.r;
        // glow ring
        const grd = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, r * 5 * pulse);
        grd.addColorStop(0, this.col + '55');
        grd.addColorStop(1, this.col + '00');
        ctx.beginPath();
        ctx.arc(this.x, this.y, r * 5 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();
        // core dot
        ctx.beginPath();
        ctx.arc(this.x, this.y, r * pulse, 0, Math.PI * 2);
        ctx.fillStyle = this.col;
        ctx.globalAlpha = this.a * pulse;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    const nodes = Array.from({ length: NODE_COUNT }, () => new Node());

    const draw = () => {
      animId = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, W(), H());

      // edges
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const d  = Math.hypot(dx, dy);
          if (d < MAX_DIST) {
            const t = 1 - d / MAX_DIST;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            // gradient edge colour
            const g = ctx.createLinearGradient(nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y);
            g.addColorStop(0, nodes[i].col);
            g.addColorStop(1, nodes[j].col);
            ctx.strokeStyle = g;
            ctx.globalAlpha = t * 0.3;
            ctx.lineWidth = t * 1.6;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }
      nodes.forEach(n => { n.update(); n.draw(); });
    };

    draw();

    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = (e.clientX ?? e.touches?.[0]?.clientX ?? -9999) - rect.left;
      mouse.y = (e.clientY ?? e.touches?.[0]?.clientY ?? -9999) - rect.top;
    };
    const onLeave = () => { mouse.x = -9999; mouse.y = -9999; };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('touchmove', onMove, { passive: true });
    canvas.addEventListener('mouseleave', onLeave);

    const ro = new ResizeObserver(() => { resize(); });
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(animId);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('touchmove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ display: 'block' }}
    />
  );
}
