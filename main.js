const video = document.getElementById('cam');
const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const hud = document.getElementById('hud');
const modeEl = document.getElementById('mode');

const fileEl = document.getElementById('file');
const toggleBtn = document.getElementById('toggle');
const resetBtn = document.getElementById('reset');

const thetaEl = document.getElementById('theta');
const phiEl   = document.getElementById('phi');
const polEl   = document.getElementById('pol');
const thetav  = document.getElementById('thetav');
const phiv    = document.getElementById('phiv');
const polv    = document.getElementById('polv');

let usePlanet = false;
let planetImg = null;    // HTMLImageElement
let prevU=null, prevV=null, uTotal=0, slice=0;

// helpers
const clamp = (x,a,b)=>Math.max(a,Math.min(b,x));

async function startLive() {
  const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' }});
  video.srcObject = stream;
  await video.play();
}

function setMode(planet) {
  usePlanet = planet;
  modeEl.textContent = planet ? 'PLANET' : 'LIVE';
  toggleBtn.textContent = planet ? 'Use Camera' : 'Use Planet Image';
}

toggleBtn.onclick = async () => {
  setMode(!usePlanet);
  if (!usePlanet && !video.srcObject) await startLive();
};
resetBtn.onclick = () => { prevU=null; prevV=null; uTotal=0; slice=0; };

fileEl.onchange = async (e) => {
  const f = e.target.files?.[0]; if (!f) return;
  const url = URL.createObjectURL(f);
  planetImg = new Image(); planetImg.onload = ()=> URL.revokeObjectURL(url);
  planetImg.src = url;
  setMode(true);
};

thetaEl.oninput = ()=> thetav.textContent = `${thetaEl.value}°`;
phiEl.oninput   = ()=> phiv.textContent   = `${phiEl.value}°`;
polEl.oninput   = ()=> polv.textContent   = `${polEl.value}°`;

function drawSourceToCanvas() {
  const w = canvas.width = window.innerWidth;
  const h = canvas.height = window.innerHeight;
  ctx.clearRect(0,0,w,h);

  if (!usePlanet) {
    // camera
    if (video.readyState < 2) return false;
    // letterbox
    const vw = video.videoWidth, vh = video.videoHeight;
    const r = Math.min(w/vw, h/vh);
    const dw = Math.floor(vw*r), dh = Math.floor(vh*r);
    const dx = (w-dw)>>1, dy = (h-dh)>>1;
    ctx.drawImage(video, dx, dy, dw, dh);
    return true;
  } else if (planetImg) {
    // simulate θ/ϕ sweep by rotating+tilting the image
    const θ = (+thetaEl.value) * Math.PI/180;
    const ϕ = (+phiEl.value)   * Math.PI/180;
    // draw to offscreen, then transform
    const iw = planetImg.naturalWidth, ih = planetImg.naturalHeight;
    const r = Math.min(w/iw, h/ih); const dw = iw*r, dh = ih*r;
    ctx.save();
    ctx.translate(w/2, h/2);
    ctx.rotate(θ);
    // perspective-ish tilt (cheap): scale Y by cos(ϕ)
    ctx.scale(1, Math.cos(ϕ));
    ctx.drawImage(planetImg, -dw/2, -dh/2, dw, dh);
    ctx.restore();
    return true;
  }
  return false;
}

// Polarizer simulation: rotate luminance basis by angle (very rough but helpful for separation)
function applyPolarizer(imgData, angleDeg){
  if (!angleDeg) return; // 0° => no-op
  const a = angleDeg*Math.PI/180;
  const {data} = imgData;
  const cx = Math.cos(a), sx = Math.sin(a);
  for (let i=0; i<data.length; i+=4){
    const r=data[i], g=data[i+1], b=data[i+2];
    // project onto rotated axis in RGB (proxy)
    const p1 = cx*r + sx*g;
    const p2 = -sx*r + cx*g;
    const y = clamp(0.7*p1 + 0.3*b, 0, 255);
    data[i]=data[i+1]=data[i+2]=y;
  }
  // leave alpha
}

function estimateUV(imageData) {
  const {data,width,height} = imageData;
  // coarse sampling for speed
  let gx=0, gy=0, mean=0, n=0;
  for (let y=2; y<height-2; y+=2){
    for (let x=2; x<width-2; x+=2){
      const i=(y*width+x)*4;
      const g = (data[i]+data[i+1]+data[i+2])/3;
      mean += g; n++;
      const i1 = i+4, i2=i-4, j1=i+4*width, j2=i-4*width;
      const gxpx = ((data[i1]+data[i1+1]+data[i1+2]) - (data[i2]+data[i2+1]+data[i2+2]))/3;
      const gypx = ((data[j1]+data[j1+1]+data[j1+2]) - (data[j2]+data[j2+1]+data[j2+2]))/3;
      gx += gxpx; gy += gypx;
    }
  }
  const ang = Math.atan2(gy, gx);                 // −π..π
  const u = (ang + Math.PI) % (2*Math.PI);        // 0..2π (phase cursor)
  const m = mean / Math.max(1,n);
  const v = (m - 128) >= 0 ? +1 : -1;            // parity proxy ~ hinge (>0.5)
  return {u, v};
}

function drawHUD(u, v, slice, fpsApprox){
  const w=canvas.width, h=canvas.height;
  // u-gauge
  ctx.beginPath(); ctx.strokeStyle="#0ff"; ctx.lineWidth=6;
  ctx.arc(60,h-60,40,-Math.PI/2, -Math.PI/2 + (u/(2*Math.PI))*2*Math.PI);
  ctx.stroke();
  // v-badge
  ctx.fillStyle = (v>0) ? "#0f0" : "#fa0";
  ctx.beginPath(); ctx.arc(120,h-60,18,0,2*Math.PI); ctx.fill();
  // text
  hud.textContent = `mode: ${usePlanet?'PLANET':'LIVE'} · u:${Math.round(u*180/Math.PI)}° v:${v>0?'+':'-'} slice:${slice}`;
}

let lastTime = performance.now();
function loop(){
  const ok = drawSourceToCanvas();
  if (ok){
    const w=canvas.width, h=canvas.height;
    let img = ctx.getImageData(0,0,w,h);
    applyPolarizer(img, +polEl.value);
    // (optional) write back so HUD is applied on polarized image preview
    ctx.putImageData(img,0,0);

    const {u, v} = estimateUV(img);

    if (prevU==null){ prevU=u; prevV=v; }
    let du = u - prevU;
    if (du < -Math.PI) du += 2*Math.PI;
    if (du >  Math.PI) du -= 2*Math.PI;
    uTotal += du;

    const now = performance.now();
    const fps = 1000/Math.max(1, now-lastTime); lastTime = now;

    const wrapped = Math.abs(uTotal) >= 2*Math.PI;
    const flipped = (prevV!==null && v!==prevV);
    if (wrapped && flipped){ slice++; uTotal=0; }

    prevU=u; prevV=v;
    drawHUD(u, v, slice, fps);
  }
  requestAnimationFrame(loop);
}

// boot
(async ()=>{
  try { await startLive(); } catch(_){}
  loop();
})();
