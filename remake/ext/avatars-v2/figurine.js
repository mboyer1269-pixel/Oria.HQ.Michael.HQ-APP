/* Billy Figurine — moteur d'animation léger (transform/opacity uniquement).
   - IntersectionObserver : aucun travail (regard, micro-idles, animations CSS en pause) hors écran.
   - Regard : parallaxe subtile vers le curseur ou l'élément focalisé (coupée en mouvement réduit).
   - Micro-idles rares (reflet de néon, coup d'œil) UNIQUEMENT au repos : pas de fausse productivité.
   - Micro réel (facultatif) : le néon et les ondes suivent le niveau sonore pendant « écoute ».
   - Comète de relais : FG.relay(orbite, de, vers, couleur) — à brancher sur l'événement réel de délégation.
   - Son discret facultatif, désactivé par défaut. */
(function(){
const mq=matchMedia('(prefers-reduced-motion: reduce)');
const still=()=>mq.matches||document.documentElement.classList.contains('rm');
const vis=new Set();
const io=new IntersectionObserver(es=>es.forEach(e=>{e.target.classList.toggle('fg-off',!e.isIntersecting);e.isIntersecting?vis.add(e.target):vis.delete(e.target)}),{rootMargin:'40px'});
const seen=new WeakSet();
function scan(root){(root||document).querySelectorAll('.fg').forEach(el=>{if(!seen.has(el)){seen.add(el);io.observe(el);if(seen.ready)nextB.set(el,performance.now()+90)}})}
new MutationObserver(ms=>{let add=false;for(const m of ms)for(const n of m.addedNodes)if(n.nodeType==1){add=true;break}if(add)scan();for(const el of [...vis])if(!el.isConnected)vis.delete(el)}).observe(document.documentElement,{childList:true,subtree:true});
/* regard */
let tx=null,ty=null,raf=0;
function gaze(){raf=0;if(still()||tx==null)return;for(const el of vis){const r=el.getBoundingClientRect();const cx=r.left+r.width/2,cy=r.top+r.height*.35;
  let dx=(tx-cx)/Math.max(innerWidth*.5,300),dy=(ty-cy)/Math.max(innerHeight*.5,300);dx=Math.max(-1,Math.min(1,dx));dy=Math.max(-1,Math.min(1,dy));
  el.style.setProperty('--gx',dx.toFixed(3));el.style.setProperty('--gy',dy.toFixed(3))}}
const ask=()=>{if(!raf)raf=requestAnimationFrame(gaze)};
addEventListener('pointermove',e=>{tx=e.clientX;ty=e.clientY;ask()},{passive:true});
addEventListener('focusin',e=>{const r=e.target.getBoundingClientRect?.();if(r){tx=r.left+r.width/2;ty=r.top+r.height/2;ask()}});
addEventListener('scroll',ask,{passive:true});
/* micro-idles rares, au repos seulement */
function idle(){setTimeout(idle,6000+Math.random()*8000);if(still()||document.hidden)return;
  const c=[...vis].filter(el=>el.dataset.fstate=='idle');if(!c.length)return;const el=c[Math.floor(Math.random()*c.length)];
  const k=Math.random()<.6?'glint':'glance';el.classList.add(k);setTimeout(()=>el.classList.remove(k),1700)}
setTimeout(idle,3500);
/* micro réel */
let mic=null;
async function micOn(){const s=await navigator.mediaDevices.getUserMedia({audio:true});const ac=new AudioContext(),an=ac.createAnalyser();an.fftSize=512;ac.createMediaStreamSource(s).connect(an);
  const buf=new Uint8Array(an.fftSize);let lv=0;mic={s,ac,run:true};
  (function loop(){if(!mic||!mic.run)return;an.getByteTimeDomainData(buf);let sum=0;for(const b of buf){const x=(b-128)/128;sum+=x*x}
   const rms=Math.min(1,Math.sqrt(sum/buf.length)*4);lv=lv*.7+rms*.3;
   for(const el of vis)if(el.dataset.fstate=='listening'){el.classList.add('mic');el.style.setProperty('--lvl',lv.toFixed(3))}
   requestAnimationFrame(loop)})()}
function micOff(){if(mic){mic.run=false;mic.s.getTracks().forEach(t=>t.stop());mic.ac.close();mic=null}document.querySelectorAll('.fg.mic').forEach(e=>{e.classList.remove('mic');e.style.removeProperty('--lvl')})}
/* son discret */
let actx=null;
function chime(kind){if(!FG.sound)return;actx=actx||new AudioContext();const t=actx.currentTime;
  const notes={done:[660,880],error:[300,220],relay:[520,780],waiting:[440,440]}[kind]||[600];
  notes.forEach((f,i)=>{const o=actx.createOscillator(),g=actx.createGain();o.type='sine';o.frequency.value=f;g.gain.setValueAtTime(0,t+i*.09);g.gain.linearRampToValueAtTime(.06,t+i*.09+.02);g.gain.exponentialRampToValueAtTime(.0001,t+i*.09+.35);o.connect(g).connect(actx.destination);o.start(t+i*.09);o.stop(t+i*.09+.4)})}
/* comète de relais */
function relay(orbit,from,to,color,n){n=n||6;const a0=from*360/n,a1raw=to*360/n;let d=((a1raw-a0)%360+540)%360-180;if(d===0)d=360;const a1=a0+d;
  const arm=orbit.querySelector('.comet-arm');arm.style.setProperty('--cc',color);
  if(still()){arm.style.transform=`rotate(${a1}deg)`;arm.classList.add('show');setTimeout(()=>arm.classList.remove('show'),1600);return Promise.resolve()}
  arm.classList.add('show');chime('relay');
  const an=arm.animate([{transform:`rotate(${a0}deg)`},{transform:`rotate(${a1}deg)`}],{duration:1700,easing:'cubic-bezier(.55,0,.25,1)',fill:'forwards'});
  return an.finished.then(()=>{arm.classList.remove('show');const t=orbit.querySelectorAll('.orb-slot')[to]?.querySelector('.fg');if(t){t.classList.remove('fg-enter');void t.offsetWidth;t.classList.add('fg-enter')}})}
/* export PNG 512 px (photo de profil Slack/Teams) : image recolorée + nom */
async function exportPNG(fgEl,name,color,bg){const img=fgEl.querySelector('img'),tintEl=fgEl.querySelector('.fg-tint');
  const S=512,cv=document.createElement('canvas');cv.width=cv.height=S;const x=cv.getContext('2d');
  const g=x.createRadialGradient(S/2,S*.38,10,S/2,S*.45,S*.7);g.addColorStop(0,color+'55');g.addColorStop(.45,bg||'#121718');g.addColorStop(1,'#050607');x.fillStyle=g;x.fillRect(0,0,S,S);
  const im=new Image();im.src=img.currentSrc||img.src;await im.decode();const h=S*.78,w=h*im.width/im.height,ox=(S-w)/2,oy=S*.06;
  const L=document.createElement('canvas');L.width=S;L.height=S;const l=L.getContext('2d');l.drawImage(im,ox,oy,w,h);
  const tint=getComputedStyle(fgEl).getPropertyValue('--tint').trim()=='1';
  if(tint){const m=getComputedStyle(tintEl).maskImage.match(/url\("?(.*?)"?\)/);if(m){const mi=new Image();mi.src=m[1];await mi.decode();
    const C=document.createElement('canvas');C.width=S;C.height=S;const c=C.getContext('2d');c.fillStyle=color;c.fillRect(0,0,S,S);c.globalCompositeOperation='destination-in';c.drawImage(mi,ox,oy,w,h);
    l.globalCompositeOperation='color';l.drawImage(C,0,0);l.globalCompositeOperation='soft-light';l.globalAlpha=.55;l.drawImage(C,0,0);l.globalAlpha=1;l.globalCompositeOperation='destination-in';l.drawImage(im,ox,oy,w,h)}}
  x.drawImage(L,0,0);x.font='700 34px system-ui, sans-serif';x.textAlign='center';x.fillStyle='#fff';x.fillText(name,S/2,S-30);
  return new Promise((res,rej)=>{try{cv.toBlob(b=>b?res(b):rej(new Error('blob')),'image/png')}catch(e){rej(e)}})}
/* clignement : signe de vie au repos, jamais un indicateur d'activité.
   2,5–6 s aléatoire par avatar (désynchronisé), double 1 fois sur 5, les deux yeux ensemble ;
   un clignement au début de chaque transition d'état ; lent et rare en réflexion ;
   jamais pendant la célébration (terminé), ni hors écran, ni en mouvement réduit. */
const nextB=new WeakMap();
const rnd=(a,b)=>a+Math.random()*(b-a);
function blink(el,dbl){if(still()||document.hidden||el.classList.contains('fg-off')||el.classList.contains('fg-done'))return;
 const ls=el.querySelectorAll('.fg-lid i,.fg-lid b');if(!ls.length)return;const th=el.classList.contains('fg-thinking');
 ls.forEach(i=>{const lo=parseFloat(getComputedStyle(i).getPropertyValue('--lo'))||0;
  i.animate([{transform:`scaleY(${lo})`},{transform:'scaleY(1)',offset:.42},{transform:'scaleY(1)',offset:.55},{transform:`scaleY(${lo})`}],
   {duration:th?240:rnd(120,160),easing:'cubic-bezier(.45,0,.35,1)'}).finished.then(()=>{if(dbl)setTimeout(()=>blink(el,false),110)}).catch(()=>{})});}
setInterval(()=>{const t=performance.now();for(const el of vis){let n=nextB.get(el);
 if(n==null){nextB.set(el,t+rnd(400,5000));continue}
 if(t>=n){const th=el.classList.contains('fg-thinking');blink(el,!th&&Math.random()<.2);nextB.set(el,t+(th?rnd(6000,10000):rnd(2500,6000)))}}},100);
new MutationObserver(ms=>{for(const m of ms){const el=m.target;if(el.classList&&el.classList.contains('fg'))nextB.set(el,performance.now()+60)}}).observe(document.documentElement,{attributes:true,attributeFilter:['data-fstate'],subtree:true});
window.FG={blink,scan,micOn,micOff,chime,relay,exportPNG,sound:false,still};
scan();seen.ready=1;
})();
