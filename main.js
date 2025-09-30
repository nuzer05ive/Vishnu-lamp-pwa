// Vishnu Lamp PWA — Live/Planet + HUD + White-outline Character Reconstruction (Glyph Mode)
const video = document.getElementById('cam');
const base  = document.getElementById('view');
const ov    = document.getElementById('overlay');
const bctx  = base.getContext('2d', { willReadFrequently:true });
const octx  = ov.getContext('2d');

const hud      = document.getElementById('hud');
const modeEl   = document.getElementById('mode');
const fileEl   = document.getElementById('file');
const toggleBtn= document.getElementById('toggle');
const resetBtn = document.getElementById('reset');

const thetaEl  = document.getElementById('theta');
const phiEl    = document.getElementById('phi');
const polEl    = document.getElementById('pol');
const thetav   = document.getElementById('thetav');
const phiv     = document.getElementById('phiv');
const polv     = document.getElementById('polv');

const recBtn   = document.getElementById('rec');
const dumpBtn  = document.getElementById('dump');
const capBtn   = document.getElementById('cap');
const reconBtn = document.getElementById('recon');
const glyphBtn = document.getElementById('glyphMode');
const savePNGBtn = document.getElementById('savePNG');
const saveSVGBtn = document.getElementById('saveSVG');

let usePlanet=false, planetImg=null;
let prevU=null, prevV=null, uTotal=0, slice=0, lastHUDTime=performance.now();
let recording=false, chrono=[];
let glyphMode=false;

// ——— camera
async function startLive(){
  const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' }});
  video.srcObject=stream; await video.play();
}
// ——— mode
function setMode(planet){ usePlanet=planet; modeEl.textContent=planet?'PLANET':'LIVE'; toggleBtn.textContent=planet?'Use Camera':'Use Planet Image'; }
// ——— ui events
toggleBtn.onclick=async()=>{ setMode(!usePlanet); if(!usePlanet && !video.srcObject) await startLive(); };
resetBtn.onclick =()=>{ prevU=null; prevV=null; uTotal=0; slice=0; };
fileEl.onchange = e => {
  const f=e.target.files?.[0]; if(!f) return;
  const url=URL.createObjectURL(f); planetImg=new Image();
  planetImg.onload=()=>URL.revokeObjectURL(url); planetImg.src=url; setMode(true);
};
thetaEl.oninput=()=> thetav.textContent=`${thetaEl.value}°`;
phiEl.oninput  =()=> phiv.textContent  =`${phiEl.value}°`;
polEl.oninput  =()=> polv.textContent  =`${polEl.value}°`;
recBtn.onclick =()=>{ recording=!recording; recBtn.classList.toggle('ok',recording); };
dumpBtn.onclick=()=> downloadJSON('chronology.json', chrono);
glyphBtn.onclick=()=>{ glyphMode=!glyphMode; glyphBtn.textContent=`Glyph Mode: ${glyphMode?'ON':'OFF'}`; glyphBtn.classList.toggle('ok', glyphMode); };

// ——— drawing source
function drawSource(){
  const w=base.width=ov.width=innerWidth, h=base.height=ov.height=innerHeight;
  octx.clearRect(0,0,w,h);
  if(!usePlanet){
    if(video.readyState<2) return false;
    const vw=video.videoWidth, vh=video.videoHeight;
    const r=Math.min(w/vw,h/vh), dw=Math.floor(vw*r), dh=Math.floor(vh*r);
    const dx=(w-dw)>>1, dy=(h-dh)>>1;
    bctx.drawImage(video,dx,dy,dw,dh);
    return {dx,dy,dw,dh};
  }else if(planetImg){
    const θ=rad(+thetaEl.value), ϕ=rad(+phiEl.value);
    const iw=planetImg.naturalWidth, ih=planetImg.naturalHeight;
    const r=Math.min(w/iw,h/ih), dw=iw*r, dh=ih*r, cx=w/2, cy=h/2;
    bctx.save(); bctx.translate(cx,cy); bctx.rotate(θ); bctx.scale(1,Math.cos(ϕ));
    bctx.drawImage(planetImg,-dw/2,-dh/2,dw,dh); bctx.restore();
    return {dx:(w-dw)/2,dy:(h-dh)/2,dw,dh};
  }
  return false;
}

function rad(d){return d*Math.PI/180}
function clamp(x,a,b){return Math.max(a,Math.min(b,x));}

// ——— polarizer (proxy)
function applyPolarizer(img,deg){
  if(!deg) return img;
  const a=rad(deg), cx=Math.cos(a), sx=Math.sin(a), d=img.data;
  for(let i=0;i<d.length;i+=4){
    const r=d[i], g=d[i+1], b=d[i+2];
    const p1=cx*r + sx*g;
    const y=clamp(0.7*p1 + 0.3*b, 0, 255);
    d[i]=d[i+1]=d[i+2]=y;
  }
  return img;
}

// ——— phase proxy (u,v)
function estimateUV(img){
  const {data,width,height}=img;
  let gx=0, gy=0, mean=0, n=0;
  for(let y=2;y<height-2;y+=2){
    for(let x=2;x<width-2;x+=2){
      const i=(y*width+x)*4;
      const g=(data[i]+data[i+1]+data[i+2])/3; mean+=g; n++;
      const i1=i+4, i2=i-4, j1=i+4*width, j2=i-4*width;
      const gxpx=((data[i1]+data[i1+1]+data[i1+2])-(data[i2]+data[i2+1]+data[i2+2]))/3;
      const gypx=((data[j1]+data[j1+1]+data[j1+2])-(data[j2]+data[j2+1]+data[j2+2]))/3;
      gx+=gxpx; gy+=gypx;
    }
  }
  const ang=Math.atan2(gy,gx);
  const u=(ang+Math.PI)%(2*Math.PI);
  const v=((mean/Math.max(1,n))-128)>=0 ? +1 : -1;
  return {u,v};
}

// ——— HUD / logging
function drawHUD(u,v,slice,fps){
  const w=ov.width, h=ov.height;
  // white theme
  octx.strokeStyle="#ffffff"; octx.lineWidth=5; octx.beginPath();
  octx.arc(60,h-60,40,-Math.PI/2,-Math.PI/2+(u/(2*Math.PI))*2*Math.PI); octx.stroke();
  octx.fillStyle="#ffffff"; octx.beginPath(); octx.arc(120,h-60,18,0,2*Math.PI); octx.fill();
  hud.textContent=`mode:${usePlanet?'PLANET':'LIVE'} · u:${Math.round(u*180/Math.PI)}° v:${v>0?'+':'-'} slice:${slice}`;
}
function logHUD(u,v){
  if(!recording) return;
  chrono.push({t:Date.now(), mode:usePlanet?'PLANET':'LIVE', u_deg:Math.round(u*180/Math.PI), v, slice,
               theta:+thetaEl.value, phi:+phiEl.value, pol:+polEl.value});
}
function downloadJSON(name, obj){
  const blob=new Blob([JSON.stringify(obj,null,2)],{type:"application/json"});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click();
  URL.revokeObjectURL(a.href);
}

// ——— edge → points
function extractEdgePoints(img, step=3, thresh=22){
  const {data,width,height}=img; const pts=[];
  for(let y=1;y<height-1;y+=step){
    for(let x=1;x<width-1;x+=step){
      const i=(y*width+x)*4;
      const i1=i+4, i2=i-4, j1=i+4*width, j2=i-4*width;
      const gx=((data[i1]+data[i1+1]+data[i1+2])-(data[i2]+data[i2+1]+data[i2+2]))/3;
      const gy=((data[j1]+data[j1+1]+data[j1+2])-(data[j2]+data[j2+1]+data[j2+2]))/3;
      const mag=Math.sqrt(gx*gx+gy*gy);
      if(mag>thresh) pts.push([x,y]);
    }
  }
  return pts;
}

// ——— DBSCAN (simple)
function dbscan(points, eps=10, minPts=45){
  const N=points.length, labels=new Array(N).fill(-1); let cid=0;
  const eps2=eps*eps; const dist2=(a,b)=>{const dx=a[0]-b[0],dy=a[1]-b[1];return dx*dx+dy*dy;};
  for(let i=0;i<N;i++){
    if(labels[i]!==-1) continue;
    const neighbors=[]; for(let j=0;j<N;j++) if(dist2(points[i],points[j])<=eps2) neighbors.push(j);
    if(neighbors.length<minPts){ labels[i]=-2; continue; }
    labels[i]=cid; const seed=[...neighbors];
    for(let s=0;s<seed.length;s++){
      const q=seed[s]; if(labels[q]===-2) labels[q]=cid; if(labels[q]!==-1) continue;
      labels[q]=cid; const n2=[]; const pq=points[q];
      for(let k=0;k<N;k++) if(dist2(pq,points[k])<=eps2) n2.push(k);
      if(n2.length>=minPts) seed.push(...n2);
    } cid++;
  }
  const groups=[]; for(let c=0;c<cid;c++) groups.push([]);
  for(let i=0;i<N;i++) if(labels[i]>=0) groups[labels[i]].push(points[i]);
  return groups;
}

// ——— hull + geometry
function convexHull(pts){
  if(pts.length<3) return pts.slice();
  const p=pts.map(([x,y])=>({x,y})); p.sort((a,b)=>a.y===b.y? a.x-b.x : a.y-b.y);
  const cross=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const lower=[]; for(const pt of p){ while(lower.length>=2 && cross(lower.at(-2),lower.at(-1),pt)<=0) lower.pop(); lower.push(pt); }
  const upper=[]; for(let i=p.length-1;i>=0;i--){ const pt=p[i]; while(upper.length>=2 && cross(upper.at(-2),upper.at(-1),pt)<=0) upper.pop(); upper.push(pt); }
  upper.pop(); lower.pop(); return lower.concat(upper).map(q=>[q.x,q.y]);
}
function areaPoly(poly){ let a=0; for(let i=0;i<poly.length;i++){const [x1,y1]=poly[i],[x2,y2]=poly[(i+1)%poly.length]; a+=x1*y2 - x2*y1;} return Math.abs(a/2); }
function centroid(poly){
  let A=0,cx=0,cy=0; for(let i=0;i<poly.length;i++){const [x1,y1]=poly[i],[x2,y2]=poly[(i+1)%poly.length]; const f=x1*y2 - x2*y1; A+=f; cx+=(x1+x2)*f; cy+=(y1+y2)*f;}
  A*=0.5; const k=1/(6*A+1e-9); return [cx*k, cy*k];
}
function bbox(poly){
  let minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
  for(const [x,y] of poly){ if(x<minx)minx=x; if(y<miny)miny=y; if(x>maxx)maxx=x; if(y>maxy)maxy=y; }
  return {minx,miny,maxx,maxy, w:maxx-minx, h:maxy-miny};
}

// ——— capture buffer
let capBuf=[];
function wait(ms){ return new Promise(r=>setTimeout(r,ms)); }
document.getElementById('cap').onclick = async ()=>{
  capBuf=[]; capBtn.disabled=true; capBtn.textContent="Capturing…";
  const start=performance.now();
  while(performance.now()-start<2000){
    const roi=drawSource(); if(!roi){ await wait(16); continue; }
    const img=bctx.getImageData(0,0,base.width,base.height);
    applyPolarizer(img,+polEl.value);
    capBuf.push({img});
    await wait(33);
  }
  capBtn.disabled=false; capBtn.textContent="Capture 2s";
};

// ——— reconstruct (white outlines) + auto-glyphs
reconBtn.onclick = ()=>{
  if(capBuf.length===0){ alert("Capture first."); return; }
  octx.clearRect(0,0,ov.width,ov.height);

  // accumulate points from frames
  let pts=[]; for(const {img} of capBuf){ pts=pts.concat(extractEdgePoints(img,3,24)); }
  const groups=dbscan(pts, 10, 50);

  // big silhouettes
  const silhouettes=[];
  for(const g of groups){
    if(g.length<150) continue;
    const hull=convexHull(g); if(areaPoly(hull) < 2500) continue;
    silhouettes.push(hull);
  }

  // draw outer silhouettes in WHITE
  octx.strokeStyle="#ffffff"; octx.fillStyle="rgba(255,255,255,0.08)"; octx.lineWidth=3;
  silhouettes.forEach(h=>{
    octx.beginPath(); h.forEach(([x,y],i)=> i?octx.lineTo(x,y):octx.moveTo(x,y)); octx.closePath(); octx.fill(); octx.stroke();
  });

  // glyph labeling (eyes / nose / mouth) from inner sub-clusters
  if(glyphMode){
    const glyphs=[];
    for(const hull of silhouettes){
      const bb=bbox(hull);
      // points inside bbox only (fast)
      const insidePts=groups.flat().filter(([x,y]) => x>=bb.minx && x<=bb.maxx && y>=bb.miny && y<=bb.maxy);
      if(insidePts.length<120) continue;
      const sub=dbscan(insidePts, 7, 25).filter(s=>s.length>=25);

      // score small roundish clusters as eyes; long horizontal as mouth; mid blob as nose
      const feats=sub.map(s=>{
        const h=convexHull(s); const A=areaPoly(h); const b=bbox(h); const ar=b.w/(b.h+1e-6);
        const c=centroid(h);
        return {h,A,ar,c};
      });

      // heuristics by y position within hull bbox
      const topThird   = bb.miny + bb.h*0.35;
      const midLine    = bb.miny + bb.h*0.55;
      const bottomBand = bb.miny + bb.h*0.75;

      // eyes: small-ish, near top third
      const eyeCands = feats.filter(f=> f.A>80 && f.A<1200 && f.c[1] < topThird && f.ar>0.6 && f.ar<1.7)
                            .sort((a,b)=>a.c[0]-b.c[0]).slice(0,2);

      // nose: midline, medium area
      const noseCand = feats.filter(f=> f.A>=200 && f.A<1800 && f.c[1]>=topThird && f.c[1]<midLine)
                            .sort((a,b)=> Math.abs((bb.minx+bb.maxx)/2 - a.c[0]) - Math.abs((bb.minx+bb.maxx)/2 - b.c[0]))[0];

      // mouth: bottom band, wide aspect
      const mouthCand= feats.filter(f=> f.c[1]>=midLine && f.c[1]<=bottomBand && f.ar>=1.4 && f.A>=250)
                            .sort((a,b)=> b.A-a.A)[0];

      if(eyeCands.length) glyphs.push({type:'eyes', parts:eyeCands});
      if(noseCand)        glyphs.push({type:'nose', parts:[noseCand]});
      if(mouthCand)       glyphs.push({type:'mouth',parts:[mouthCand]});

      // draw glyphs in WHITE outlines
      octx.strokeStyle="#ffffff"; octx.lineWidth=3; octx.fillStyle="rgba(255,255,255,0.12)";
      for(const g of glyphs){
        for(const p of g.parts){
          octx.beginPath();
          p.h.forEach(([x,y],i)=> i?octx.lineTo(x,y):octx.moveTo(x,y));
          octx.closePath(); octx.stroke();
        }
      }

      // small labels (optional)
      octx.fillStyle="#ffffff"; octx.font="12px system-ui";
      if(eyeCands.length===2){ const c1=eyeCands[0].c, c2=eyeCands[1].c; octx.fillText("eyes", c1[0], c1[1]-6); octx.fillText("eyes", c2[0], c2[1]-6); }
      if(noseCand){ const c=noseCand.c; octx.fillText("nose", c[0]+4, c[1]); }
      if(mouthCand){ const c=mouthCand.c; octx.fillText("mouth", c[0]+4, c[1]); }
    }

    // store for exports
    window.__lampSilhouettes = silhouettes;
  } else {
    window.__lampSilhouettes = silhouettes;
  }

  // also append a chronology log entry for this reconstruction
  chrono.push({ t:Date.now(), event:"reconstruct", slice,
                theta:+thetaEl.value, phi:+phiEl.value, pol:+polEl.value });
};

// ——— exports (WHITE strokes preserved)
savePNGBtn.onclick = ()=>{
  const a=document.createElement('a');
  a.href=ov.toDataURL('image/png'); a.download='lamp_overlay_white.png'; a.click();
};
saveSVGBtn.onclick = ()=>{
  const W=ov.width, H=ov.height;
  const hulls = window.__lampSilhouettes || [];
  const toPath = h => 'M'+h.map(([x,y])=>`${x},${y}`).join('L')+'Z';
  const pathD = hulls.map(toPath).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <path d="${pathD}" fill="rgba(255,255,255,0.08)" stroke="#ffffff" stroke-width="3"/>
  </svg>`;
  const a=document.createElement('a');
  a.href='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  a.download='lamp_silhouettes_white.svg'; a.click();
};

// ——— main loop
(async function boot(){ try{ await startLive(); }catch(_){} loop(); })();
function loop(){
  const roi=drawSource();
  if(roi){
    let img=bctx.getImageData(0,0,base.width,base.height);
    applyPolarizer(img,+polEl.value); bctx.putImageData(img,0,0);

    const {u,v}=estimateUV(img);
    if(prevU==null){ prevU=u; prevV=v; }
    let du=u-prevU; if(du<-Math.PI) du+=2*Math.PI; if(du>Math.PI) du-=2*Math.PI;
    uTotal+=du;

    const now=performance.now(), fps=1000/Math.max(1, now-lastHUDTime); lastHUDTime=now;
    const wrapped=Math.abs(uTotal)>=2*Math.PI, flipped=(prevV!==null && v!==prevV);
    if(wrapped && flipped){ slice++; uTotal=0; }

    prevU=u; prevV=v;
    octx.clearRect(0,0,ov.width,ov.height);
    drawHUD(u,v,slice,fps);
    logHUD(u,v);
  }
  requestAnimationFrame(loop);
}
