// A synthetic book, clearly marked as MOCK. Captured through the real JPEG/storage path.
export class MockSource {
  constructor(canvas) { this.canvas = canvas; this.frame = null; this.running = false; }
  start() { this.stop(); this.running = true; this.draw(); }
  stop() { this.running = false; cancelAnimationFrame(this.frame); }
  draw() {
    const ctx = this.canvas.getContext('2d'), w = this.canvas.width, h = this.canvas.height;
    const now = new Date();
    ctx.fillStyle = '#172335'; ctx.fillRect(0,0,w,h);
    const glow = ctx.createRadialGradient(600,300,0,600,300,900); glow.addColorStop(0,'#32475d'); glow.addColorStop(1,'#111d2b'); ctx.fillStyle = glow; ctx.fillRect(0,0,w,h);
    ctx.save(); ctx.translate(w/2,h/2); ctx.rotate(-.055);
    ctx.shadowColor = '#0008'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 25;
    ctx.fillStyle = '#c1baa8'; ctx.fillRect(-430,-320,860,660); ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#e9e4d5'; ctx.fillRect(-422,-326,422,650); ctx.fillStyle = '#f6f2e7'; ctx.fillRect(0,-326,422,650);
    const fold = ctx.createLinearGradient(-35,0,40,0); fold.addColorStop(0,'#9d977900'); fold.addColorStop(.45,'#8e826b55'); fold.addColorStop(.51,'#5048325c'); fold.addColorStop(1,'#fff9e800'); ctx.fillStyle = fold; ctx.fillRect(-35,-326,75,650);
    ctx.fillStyle = '#6c726f'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('J A K U   /   V I S U A L   S T U D I E S',-375,-270);
    ctx.fillStyle = '#16385b'; ctx.font = '54px Georgia, serif'; ctx.fillText('The art',-375,-174); ctx.fillText('of seeing.',-375,-110);
    ctx.fillStyle = '#73756e'; for(let i=0;i<14;i++)ctx.fillRect(-375,15+i*15,250-((i%4)*19),2);
    ctx.fillStyle = '#1b4165'; ctx.fillRect(45,-255,325,390);
    const light=ctx.createLinearGradient(45,-255,370,135);light.addColorStop(0,'#8cb5cc');light.addColorStop(.45,'#326282');light.addColorStop(1,'#142e4d');ctx.fillStyle=light;ctx.fillRect(45,-255,325,390);
    ctx.strokeStyle='#dceafa88';ctx.lineWidth=1;for(let i=0;i<7;i++){ctx.beginPath();ctx.arc(265,-45,25+i*27,.3,Math.PI*1.9);ctx.stroke();}
    ctx.fillStyle='#69747b';ctx.font='11px sans-serif';ctx.fillText('LIGHT, FORM & THE EVERYDAY',45,177);
    for(let i=0;i<5;i++)ctx.fillRect(45,205+i*14,290-(i%3)*32,2);
    ctx.font='12px Georgia';ctx.fillText('24',-375,290);ctx.fillText('25',355,290);ctx.restore();
    ctx.fillStyle='#e3edff';ctx.font='14px monospace';ctx.textAlign='center';ctx.fillText(`MOCK · ${now.toLocaleTimeString('ja-JP',{hour12:false})}`,w/2,h-45);
    if(this.running)this.frame=requestAnimationFrame(()=>this.draw());
  }
}
