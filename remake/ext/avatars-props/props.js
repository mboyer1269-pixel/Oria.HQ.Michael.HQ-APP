/* Oria — propositions de style d'avatar (exemple). Trois directions rendues en SVG, recolorables par --agent / --brand.
   Aucune animation sans état actif : seuls écoute / réflexion / exécution bougent ; repos, bloqué, terminé, erreur sont statiques
   (un « pop » unique à l'entrée d'état). Mouvement réduit : tout est figé. Hors écran : pause. */
(()=>{
const AG=window.PROPS_AG, SEM={error:'#ff5a4e',waiting:'#ffb340',done:'#3ddc84'};
const STL={idle:'au repos',listening:'écoute',thinking:'réfléchit',executing:'exécute',waiting:'bloqué, attend votre décision',done:'a terminé',error:'en erreur'};
const DIRN={const:'Constellation vivante',pix:'Pixel 16 × 16',pap:'Papier riso'};
const C='var(--c)';
/* ---------- 1. Constellation vivante : la forme découle de l'état ---------- */
function constel(v,st,sz,k,n){const g=AG[v].g,small=sz<40,R=32;
 const circ=g.map((_,i)=>[Math.cos(i*Math.PI/4-Math.PI/2)*R,Math.sin(i*Math.PI/4-Math.PI/2)*R]);
 const gl=g.map(([x,y])=>[x*30,y*30]);
 let pts=circ,links='',extra='',core=`<circle r="${small?14:10}" style="fill:${C}"/>`,eyes=small?'':'<ellipse cx="-3.4" cy="-1" rx="1.5" ry="2.4" fill="#0b0d0e"/><ellipse cx="3.4" cy="-1" rx="1.5" ry="2.4" fill="#0b0d0e"/>';
 if(st==='executing'||st==='done')pts=gl;
 if(st==='error')pts=circ.map(([x,y],i)=>[x*1.08+((i*37)%11-5),y*1.08+((i*53)%9-4)]);
 const dotc=st==='error'?SEM.error:(st==='waiting'?SEM.waiting:C);
 if(small){const ring=circ.map(([x,y])=>`<circle cx="${x*1.2}" cy="${y*1.2}" r="5" style="fill:${dotc}" opacity="${st==='idle'?.55:1}"/>`).join('');
  let mk='';if(st in SEM)mk=`<circle cx="30" cy="-30" r="15" fill="${SEM[st]}" stroke="#07090a" stroke-width="4"/>`;
  if(st==='executing')mk=`<circle r="44" fill="none" stroke="${'#ffffff33'}" stroke-width="7"/><circle r="44" fill="none" style="stroke:${C}" stroke-width="7" pathLength="100" stroke-dasharray="${k/n*100} 100" transform="rotate(-90)"/>`;
  return `<g class="k-${st}">${ring}${core}${mk}</g>`}
 const path=pts.map(p=>p.join(',')).join(' ');
 if(st==='idle'||st==='listening'||st==='thinking'||st==='waiting')links=`<polygon points="${circ.map(p=>p.join(',')).join(' ')}" fill="none" style="stroke:${C}" stroke-width=".8" opacity=".3"/>`;
 if(st==='executing'){links=`<polyline points="${path}" fill="none" style="stroke:${C}" stroke-width="2" opacity=".25"/><polyline class="k-prog" points="${path}" fill="none" style="stroke:${C}" stroke-width="2.4" stroke-linecap="round" pathLength="100" stroke-dasharray="${k/n*100} 100"/>`;
  extra=`<circle r="46" fill="none" stroke="#ffffff22" stroke-width="2"/><circle r="46" fill="none" style="stroke:${C}" stroke-width="2.4" pathLength="100" stroke-dasharray="${k/n*100} 100" transform="rotate(-90)"/>`}
 if(st==='done'){links=`<polyline points="${path}" fill="none" style="stroke:${C}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;extra=`<g transform="translate(34 -34)"><circle r="9" fill="${SEM.done}" stroke="#07090a" stroke-width="2"/><path d="M-4 0l3 3 5-6" fill="none" stroke="#06110a" stroke-width="2.4" stroke-linecap="round"/></g>`}
 if(st==='error'){links=`<polyline points="${path}" fill="none" stroke="${SEM.error}" stroke-width="1.6" stroke-dasharray="4 5"/>`;core=`<circle r="10" fill="${SEM.error}"/>`;eyes='<path d="M-5-3l3 3M-2-3l-3 3M2-3l3 3M5-3l-3 3" stroke="#1a0606" stroke-width="1.3"/><path d="M-3 5q3-2 6 0" fill="none" stroke="#1a0606" stroke-width="1.3"/>'}
 if(st==='waiting'){core=`<circle r="10" style="fill:${C}" opacity=".55"/>`;extra=`<g transform="translate(34 -34)"><circle r="9" fill="#1a1204" stroke="${SEM.waiting}" stroke-width="1.6"/><path d="M-3.5-5h7M-3.5 5h7M-3-5c0 3 6 3 6 5s-6 2-6 5M3-5c0 3-6 3-6 5s6 2 6 5" fill="none" stroke="${SEM.waiting}" stroke-width="1.3"/></g>`}
 if(st==='listening')extra=[0,1,2].map(i=>`<circle class="k-rip" style="animation-delay:${i*.6}s;stroke:${C}" r="14" fill="none" stroke-width="1.2"/>`).join('');
 const dots=pts.map(([x,y],i)=>{const [gx,gy]=gl[i];return `<circle class="k-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${st==='executing'&&i<k?4.2:3.4}" style="fill:${dotc};--dx:${(gx-x).toFixed(1)}px;--dy:${(gy-y).toFixed(1)}px;animation-delay:${i*.06}s" opacity="${st==='waiting'?.5:1}"/>`}).join('');
 return `<g class="k-${st}">${extra}${links}${dots}${core}${eyes}</g>`}
/* ---------- 2. Pixel 16×16 ---------- */
const ACC={ori:[[5,0],[8,0],[11,0],[5,1],[6,1],[7,1],[8,1],[9,1],[10,1],[11,1]],nova:[[13,0],[12,1],[13,1],[14,1],[13,2]],
 aegis:[[11,11],[12,11],[13,11],[14,11],[11,12],[14,12],[11,13],[14,13],[12,14],[13,14]]};
function pix(v,st,sz,k,n){const P={};const set=(x,y,c)=>{if(x>=0&&x<16&&y>=0&&y<16)P[x+','+y]=c};
 for(let y=0;y<16;y++)for(let x=0;x<16;x++){const d=Math.hypot(x+.5-8,y+.5-8);if(d<4.9)set(x,y,'F');else if(d<6.4)set(x,y,'H')}
 for(let x=5;x<11;x++)set(x,15,'K');set(4,15,'K');set(11,15,'K');
 const happy=st==='done',err=st==='error';
 if(err){[[5,6],[7,8],[7,6],[5,8],[6,7],[9,6],[11,8],[11,6],[9,8],[10,7]].forEach(([x,y])=>set(x,y,'E'))}
 else{set(6,7,'E');set(10,7,'E');if(!happy){set(6,8,'E');set(10,8,'E')}else{set(5,8,'E');set(7,8,'E');set(9,8,'E');set(11,8,'E');set(6,7,'F');set(10,7,'F');set(6,7,'E');set(10,7,'E')}}
 if(err){set(7,11,'E');set(8,10,'E');set(9,11,'E')}else if(st==='waiting'){set(7,10,'E');set(8,10,'E');set(9,10,'E')}else{set(6,10,'E');set(7,11,'E');set(8,11,'E');set(9,10,'E')}
 if(v==='nexus'){for(let x=4;x<13;x++){if(x!==8){set(x,5,'K');set(x,9,'K')}}[[4,6],[4,7],[4,8],[8,6],[12,6],[12,7],[12,8],[7,6],[9,6]].forEach(([x,y])=>set(x,y,'K'))}
 if(v==='scout'){for(let x=4;x<13;x++)set(x,3,'K');set(6,3,'A');set(10,3,'A');set(7,3,'A');set(9,3,'A')}
 if(v==='pulse'){for(let y=6;y<11;y++){set(1,y,'K');set(14,y,'K')}set(2,7,'A');set(2,8,'A');set(13,7,'A');set(13,8,'A');for(let x=3;x<13;x++)if(!P[x+',1'])set(x,1,'K')}
 (ACC[v]||[]).forEach(([x,y])=>set(x,y,'A'));if(v==='aegis'){set(12,12,'H');set(13,12,'H');set(12,13,'H');set(13,13,'H')}
 let anim='';
 if(st==='executing'){for(let x=1;x<15;x++)set(x,15,x-1<Math.round(k/n*14)?'H':'D');anim=`<rect class="p-blink" x="${Math.round(k/n*14)}" y="15" width="1" height="1" style="fill:${C}"/>`}
 if(st==='listening')anim=[0,1,2].map(i=>`<rect class="p-bar" style="animation-delay:${i*.18}s;fill:${C}" x="${13+i}" y="10" width="1" height="5"/>`).join('');
 if(st==='thinking')anim=[6,8,10].map((x,i)=>`<rect class="p-dot" style="animation-delay:${i*.3}s;fill:${C}" x="${x}" y="0" width="1" height="1"/>`).join('');
 const badge={waiting:['.WWW.','..W..','.W.W.','WWWWW'],done:['....G','...G.','G.G..','.G...'],error:['R...R','.R.R.','..R..','.R.R.','R...R']}[st];
 if(badge)badge.forEach((r,y)=>[...r].forEach((c,x)=>{if(c!=='.')set(11+x,y,c)}));
 const col={F:'#f4efe9',H:C,E:'#15110f',K:'#2a3134',A:'color-mix(in srgb,var(--c) 60%,#fff)',D:'#ffffff26',W:SEM.waiting,G:SEM.done,R:SEM.error};
 return Object.entries(P).map(([p,c])=>{const [x,y]=p.split(',');return `<rect x="${x}" y="${y}" width="1.02" height="1.02" style="fill:${col[c]}"/>`}).join('')+anim}
/* ---------- 3. Papier riso : deux encres décalées, grain, attaches papier ---------- */
const ICON={ori:'M3 14 L5 6 L8 10 L10 4 L12 10 L15 6 L17 14Z',nexus:'M7 5 L3 10 L7 15 M13 5 L17 10 L13 15',nova:'M10 2 L12 8 L18 10 L12 12 L10 18 L8 12 L2 10 L8 8Z',
 scout:'M9 3a6 6 0 1 1 0 12a6 6 0 1 1 0-12M13 13l5 5',pulse:'M2 12 L6 12 L8 6 L11 16 L13 10 L18 10',aegis:'M10 2 L17 5 L16 11 Q14 16 10 18 Q6 16 4 11 L3 5Z'};
function pap(v,st,sz,k,n){const small=sz<48,ink='#1d2340';
 const tilt=st==='error'?-7:(st==='done'?3:0);
 let s=`<g class="pp-${st}" transform="rotate(${tilt} 50 50)">`;
 s+=`<path d="M50 10 C74 9 91 26 90 50 C89 75 72 91 49 90 C25 89 9 73 10 49 C11 26 27 11 50 10Z" style="fill:${C}" opacity=".95" transform="translate(4 3)" class="pp-ink"/>`;
 s+=`<circle cx="50" cy="48" r="33" fill="#000" opacity=".28" transform="translate(1.6 2.2)"/><circle cx="50" cy="48" r="33" fill="#f6efe3"/>`;
 s+=`<circle cx="50" cy="48" r="33" fill="none" style="stroke:${C}" stroke-width="5" opacity=".9"/><circle cx="51.5" cy="49" r="33" fill="none" stroke="${ink}" stroke-width="1.2" opacity=".55" class="pp-ink"/>`;
 const ey=st==='done'?'<path d="M36 46q5-6 10 0M54 46q5-6 10 0" fill="none" stroke="'+ink+'" stroke-width="3.4" stroke-linecap="round"/>':(st==='error'?'<path d="M37 41l8 8M45 41l-8 8M55 41l8 8M63 41l-8 8" stroke="'+ink+'" stroke-width="3.2" stroke-linecap="round"/>':`<ellipse cx="41" cy="45" rx="3.6" ry="${st==='waiting'?3:5.4}" fill="${ink}"/><ellipse cx="59" cy="45" rx="3.6" ry="${st==='waiting'?3:5.4}" fill="${ink}"/>`);
 s+=ey+(st==='error'||st==='waiting'?`<path d="M43 62h14" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`:`<path d="M42 59q8 7 16 0" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`);
 if(!small)s+=`<circle cx="33" cy="55" r="4" style="fill:${C}" opacity=".35"/><circle cx="67" cy="55" r="4" style="fill:${C}" opacity=".35"/>`;
 s+=`<g transform="translate(66 66) rotate(-8)"><rect x="-2" y="-2" width="26" height="26" rx="4" fill="#f6efe3" stroke="${ink}" stroke-width="1"/><path d="${ICON[v]}" transform="translate(2 2)" fill="${v==='nexus'||v==='pulse'||v==='scout'?'none':'var(--c)'}" style="stroke:${v==='nexus'||v==='pulse'||v==='scout'?'var(--c)':ink}" stroke-width="${v==='nexus'||v==='pulse'||v==='scout'?2.6:1}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
 if(st==='listening')s+=[0,1].map(i=>`<path class="pp-arc" style="animation-delay:${i*.3}s;stroke:${C}" d="M${12-i*6} ${36-i*4}q-6 12 0 24" fill="none" stroke-width="4" stroke-linecap="round"/>`).join('');
 if(st==='thinking')s+=[[78,24,4],[86,14,5.5],[94,3,7]].map(([x,y,r],i)=>`<circle class="pp-bob" style="animation-delay:${i*.25}s" cx="${x}" cy="${y}" r="${r}" fill="#f6efe3" stroke="${ink}" stroke-width="1"/>`).join('');
 if(st==='executing')s+=Array.from({length:n},(_,i)=>`<rect class="${i===k-1?'pp-new':''}" x="${14+i*8}" y="88" width="6" height="10" rx="1" ${i<k?`style="fill:${C}"`:'fill="#f6efe3"'} stroke="${ink}" stroke-width=".8" transform="rotate(${(i%2?3:-3)} ${17+i*8} 93)"/>`).join('');
 if(st==='waiting')s+=`<g transform="translate(70 4) rotate(10)"><rect width="24" height="24" rx="3" fill="${SEM.waiting}" stroke="${ink}" stroke-width="1"/><path d="M7 5h10M7 19h10M8 5c0 4 8 4 8 7s-8 3-8 7M16 5c0 4-8 4-8 7s8 3 8 7" fill="none" stroke="${ink}" stroke-width="1.6"/></g>`;
 if(st==='done')s+=`<g transform="translate(80 18) rotate(-14)"><circle r="15" fill="none" stroke="${SEM.done}" stroke-width="3"/><circle r="11" fill="${SEM.done}" opacity=".85"/><path d="M-6 0l4 4 8-9" fill="none" stroke="#06110a" stroke-width="3" stroke-linecap="round"/></g>`;
 if(st==='error')s+=`<g transform="translate(78 18)"><rect x="-16" y="-4" width="32" height="8" fill="${SEM.error}" transform="rotate(40)" opacity=".92"/><rect x="-16" y="-4" width="32" height="8" fill="${SEM.error}" transform="rotate(-40)" opacity=".92"/></g>`;
 s+='</g>';if(!small)s+='<rect width="100" height="100" filter="url(#pgrain)" opacity=".22" style="mix-blend-mode:multiply" pointer-events="none"/>';return s}
const R={const:[constel,'-50 -50 100 100'],pix:[pix,'0 0 16 16'],pap:[pap,'0 0 100 100']};
function draw(el){const d=el.dataset,v=d.v,st=d.st||'idle',sz=+d.sz||64,k=+(d.k||3),n=5,nm=(window.PROPS_NAMES&&PROPS_NAMES[v])||AG[v].n;
 el.style.setProperty('--agent',d.c||AG[v].c);el.style.width=el.style.height=sz+'px';
 const [f,vb]=R[d.dir];el.innerHTML=`<svg viewBox="${vb}" width="${sz}" height="${sz}" aria-hidden="true" focusable="false" ${d.dir==='pix'?'shape-rendering="crispEdges"':''} style="overflow:visible">${f(v,st,sz,k,n)}</svg>`;
 el.setAttribute('role','img');el.setAttribute('aria-label',`${nm} — ${DIRN[d.dir]} — état : ${STL[st]}${st==='executing'?`, étape ${k} sur ${n}`:''}${d.ex!=null?' (exemple)':''}`);
 el.classList.remove('pop');void el.offsetWidth;if(d.prev&&d.prev!==st)el.classList.add('pop');d.prev=st}
const io=new IntersectionObserver(es=>es.forEach(e=>e.target.classList.toggle('off',!e.isIntersecting)),{rootMargin:'60px'});
function all(){document.querySelectorAll('.av').forEach(el=>{draw(el);io.observe(el)})}
window.PROPS={draw,all};all();
})();
