const video = document.getElementById('cam');
const canvas = document.getElementById('view');
const hud = document.getElementById('hud');
const ctx = canvas.getContext('2d');

async function start() {
  const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' }});
  video.srcObject = stream;
  await video.play();
  tick();
}
let prevU=null, prevV=null, uTotal=0, slice=0;

function estimateUV(imageData) {
  // Tiny, fast proxy using gradients (Sobel) and hinge parity around 0.5
  const {data,width,height} = imageData;
  // grayscale avg & simple gradients
  let gx=0, gy=0, mean=0, n=0;
  for (let y=2; y<height-2; y+=2){
    for (let x=2; x<width-2; x+=2){
      const i=(y*width+x)*4;
      const g = (data[i]+data[i+1]+data[i+2])/3;
      mean += g; n++;
      // super-cheap Sobel-ish
      const i1 = i+4, i2=i-4, j1=i+4*width, j2=i-4*width;
      const gxpx = ((data[i1]+data[i1+1]+data[i1+2]) - (data[i2]+data[i2+1]+data[i2+2]))/3;
      const gypx = ((data[j1]+data[j1+1]+data[j1+2]) - (data[j2]+data[j2+1]+data[j2+2]))/3;
      gx += gxpx; gy += gypx;
    }
  }
  const ang = Math.atan2(gy, gx);              // −π..π
  const u = (ang + Math.PI) % (2*Math.PI);     // 0..2π
  const m = mean / Math.max(1,n);
  const v = (m - 128) >= 0 ? +1 : -1;          // hinge parity proxy around 0.5
  return {u, v};
}

function tick(){
  if (video.readyState >= 2){
    // letterbox to full-screen canvas
    const w = canvas.width = window.innerWidth;
    const h = canvas.height = window.innerHeight;
    const vw = video.videoWidth, vh = video.videoHeight;
    const r = Math.min(w/vw, h/vh);
    const dw = Math.floor(vw*r), dh = Math.floor(vh*r);
    const dx = (w-dw)>>1, dy = (h-dh)>>1;

    ctx.drawImage(video, dx, dy, dw, dh);
    const img = ctx.getImageData(dx, dy, dw, dh);
    const {u, v} = estimateUV(img);

    if (prevU==null){ prevU=u; prevV=v; }
    let du = u - prevU;
    if (du < -Math.PI) du += 2*Math.PI;
    if (du >  Math.PI) du -= 2*Math.PI;
    uTotal += du;

    const wrapped = Math.abs(uTotal) >= 2*Math.PI;
    const flipped = (prevV!==null && v!==prevV);
    if (wrapped && flipped){ slice++; uTotal=0; }

    prevU = u; prevV = v;

    hud.textContent = `u:${Math.round(u*180/Math.PI)}°  v:${v>0?'+':'-'}  slice:${slice}`;
    // draw simple u-gauge
    ctx.beginPath(); ctx.strokeStyle="#0ff"; ctx.lineWidth=6;
    ctx.arc(60,h-60,40,-Math.PI/2, -Math.PI/2 + (u/(2*Math.PI))*2*Math.PI);
    ctx.stroke();
    ctx.fillStyle = (v>0)?"#0f0":"#fa0"; ctx.beginPath();
    ctx.arc(120,h-60,18,0,2*Math.PI); ctx.fill();
  }
  requestAnimationFrame(tick);
}
start().catch(e=>alert(e));
