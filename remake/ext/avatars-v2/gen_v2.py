#!/usr/bin/env python3
"""Avatars Oria v2 : galerie + atelier de personnalisation (famille, look, couleur, mode marque). Données = « exemple »."""
import sys,pathlib,json,html
D=pathlib.Path(__file__).resolve().parent; sys.path[:0]=[str(D),str(D.parent),str(D.parent/"familles")]
import hybride as H, astre, glyphe, figurine as F
OUT=D.parent/"mockups"
ST=["idle","listening","thinking","executing","waiting","done","error"]
STN={"idle":"Repos","listening":"Écoute","thinking":"Réflexion","executing":"Exécution","waiting":"Bloqué","done":"Terminé","error":"Erreur"}
STD={"idle":"aucun flux actif","listening":"micro ouvert (MediaRecorder) — à construire","thinking":"requête chat envoyée → 1er chunk ; mission queued","executing":"mission running ; 1 facette = 1 étape terminée (ledger.append)","waiting":"needs_approval / intent.upsert","done":"running → completed, joué une fois","error":"failed / runner_died / SSE error, joué une fois"}
FAM={"figurine":("Billy Figurine — recommandée","Les images de Michael, détourées sans retouche (rien n'est redessiné). Les états sont des couches CSS/SVG par-dessus, et la couleur recolore l'image elle-même : néon du casque et accents de tenue, blancs et noirs préservés."),
     "hybride":("Hybride Billy × Astrolabe","La figurine Billy, dont l'anneau du casque devient un cadran Astrolabe à facettes : le visage exprime l'humeur, l'anneau porte la vérité (étapes réelles)."),
     "billy":("Billy Boutons","Figurine chibi fidèle aux références : volume, brillance, néon continu du casque, expressions signature (clin d'œil de NOVA)."),
     "astrolabe":("Astrolabe","Astre génératif abstrait (existant), recoloré par la même variable."),
     "glyphe":("Glyphe","Monogramme sur tuile, pour listes denses et mobile.")}
ROLE={"ori":"orchestration","nexus":"dev-code","nova":"creation","scout":"recherche","pulse":"ventes-ops","aegis":"securite"}
def recolor(s,c,state):
    s=s.replace(f'--c:{c}',f'--c:var(--a);--agent-accent:{c}') if state not in("error","waiting") else s.replace('style="--s',f'style="--agent-accent:{c};--s')
    if state in("error","waiting"): return s
    return s.replace(f'stop-color="{c}"','style="stop-color:var(--a)"').replace(f'fill="{c}"','style="fill:var(--a)"').replace(f'stroke="{c}"','style="stroke:var(--a)"')
def R(f,v,st,size,name=None,pose="corps",tint=None):
    pr=(3,5) if st=="executing" else None; nm=name or H.V[v][0]
    if f=="figurine": return F.render(v,st,size,pr,pose,name=nm,tint=tint)
    if f in("hybride","billy"): return H.render(v,st,size,pr,f,name=nm)
    if f=="astrolabe":
        p=astre.params("agent-"+v,ROLE[v]); c=p["hue"][0]
        return recolor(astre.astre("agent-"+v,ROLE[v],size,st,pr,name=nm),c,st)
    s=glyphe.render("agent-"+v,ROLE[v],size,st,pr,"signal",name=nm); return recolor(s,"#4dff9a",st)
CSS=H.CSS+astre.CSS+glyphe.CSS+F.CSS+r"""
.ov2.fg svg{height:auto}.ov2.fg{height:auto}
.astre,.glyphe{--a:var(--brand-accent,var(--agent-accent))}
:root{--bg:#07090a;--panel:#0f1314;--panel2:#161c1d;--line:#2e3b36;--ink:#eef5f0;--soft:#aebfb5;--focus:#ffffff}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 'Space Grotesk',system-ui,sans-serif}
a{color:#a8dcff}:focus-visible{outline:3px solid var(--focus);outline-offset:3px;border-radius:6px}
.skip{position:absolute;left:-999px}.skip:focus{left:8px;top:8px;background:#fff;color:#000;padding:8px;z-index:9}
header{display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between;padding:14px 24px;border-bottom:1px solid var(--line);background:linear-gradient(#0c1011,#07090a)}
.brand{font:700 20px/1 'Space Grotesk',sans-serif;letter-spacing:.18em}.brand span{color:#ffcf70}header nav a{margin-left:16px}
main{max-width:1320px;margin:0 auto;padding:24px}.ex{display:inline-block;border:1px solid #ffb340;color:#ffd08a;border-radius:99px;padding:1px 10px;font-size:13px;font-weight:600}
h1{font-size:clamp(28px,4vw,46px);line-height:1.05;margin:.2em 0}.lede{color:var(--soft);max-width:72ch}
.card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:18px;margin:18px 0}.meta{color:var(--soft);font-size:14px}
.hero{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;padding:28px 12px 12px;border-radius:24px;background:radial-gradient(ellipse at 50% 0,#1b2422,#07090a 70%);border:1px solid var(--line)}
.hero figure{margin:0;text-align:center}.hero figcaption b{display:block;letter-spacing:.12em;font-size:17px}.hero figcaption i{display:block;font-size:13px;color:var(--soft)}.hero figcaption q{display:block;font-size:13px;margin-top:4px;font-style:italic}
.nm{color:var(--txt,var(--ink))}
table{border-collapse:collapse;width:100%}th,td{padding:6px;border-bottom:1px solid var(--line);text-align:center}th[scope=row]{text-align:left;white-space:nowrap}
.wrap{overflow-x:auto}.sm{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.studio{display:grid;grid-template-columns:320px 1fr;gap:18px;align-items:start}.panel{position:sticky;top:12px}
fieldset{border:1px solid var(--line);border-radius:12px;margin:0 0 12px;padding:10px 12px}legend{font-weight:700;padding:0 6px}
label{display:block;font-size:13px;color:var(--soft);margin:8px 0 3px}select,input[type=text]{width:100%;font:inherit;background:var(--panel2);color:var(--ink);border:1px solid #586b63;border-radius:10px;padding:7px 9px}
input[type=color]{width:44px;height:36px;border:1px solid #586b63;border-radius:10px;background:var(--panel2);padding:2px;vertical-align:middle}.row{display:flex;gap:8px;align-items:center}
.sw{display:flex;align-items:center;gap:10px;margin:8px 0;font-size:14px}.sw input{width:20px;height:20px;accent-color:#4dff9a}
.agents{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.agent{background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--line);border-radius:18px;padding:14px;transition:transform .2s,border-color .2s}
.agent:hover,.agent:focus-within{border-color:#7e948a}@media (prefers-reduced-motion:no-preference){:root:not(.rm) .agent:hover{transform:translateY(-3px)}}
.agent .stage{display:grid;place-items:center;min-height:170px;background:radial-gradient(circle at 50% 40%,color-mix(in srgb,var(--a2,#fff) 14%,transparent),transparent 65%)}
.agent h3{margin:6px 0 0;letter-spacing:.12em;text-align:center}.agent .role{text-align:center;color:var(--soft);font-size:13px;margin:0}
.cst{font-size:13px;margin:6px 0 0;min-height:2.6em}.cst.ok{color:#9be8bd}.cst.adj{color:#ffd08a}
.status{display:inline-block;margin-top:4px;font-size:13px;border:1px solid var(--line);border-radius:99px;padding:1px 8px}
.list{display:flex;flex-direction:column;gap:6px}.list .it{display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:10px;background:var(--panel2)}
pre{background:#050707;border:1px solid var(--line);border-radius:10px;padding:10px;overflow:auto;font-size:12.5px;max-height:320px}
@media (max-width:900px){.studio{grid-template-columns:1fr}.panel{position:static}.agents{grid-template-columns:1fr 1fr}.hero{grid-template-columns:repeat(3,1fr)}}
@media (max-width:520px){.agents{grid-template-columns:1fr}.hero{grid-template-columns:repeat(2,1fr)}main{padding:14px}}
"""
def page(t,body,cur,js=""):
    nav="".join(f'<a href="{h}.html"{" aria-current=page" if h==cur else ""}>{x}</a>' for h,x in [("avatars-v2-galerie","Galerie"),("avatars-v2","Atelier")])
    return f'<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{t} — Oria</title><style>{CSS}</style></head><body><a class="skip" href="#m">Aller au contenu</a><header><div class="brand">ORIA <span>HQ</span> · Avatars v2</div><nav aria-label="Avatars v2">{nav}</nav></header><main id="m">{body}</main>{js}</body></html>'
V=list(H.V)
hero="".join(f'<figure>{R("figurine",v,"idle",170)}<figcaption><b class="nm">{H.V[v][0]}</b><i>{H.V[v][1]}</i><q>{H.V[v][3][2:-2]}</q></figcaption></figure>' for v in V)
tabs=""
for f,(fn,fd) in FAM.items():
    rows="".join(f'<tr><th scope="row">{H.V[v][0]}</th>'+"".join(f'<td>{R(f,v,s,96 if f=="figurine" else (84 if f in ("hybride","billy") else 64))}</td>' for s in ST)+'</tr>' for v in V)
    tabs+=f'<section class="card" aria-labelledby="t-{f}"><h2 id="t-{f}">{fn}</h2><p class="meta">{fd}</p><div class="wrap" tabindex="0" role="region" aria-label="{fn} : 6 agents × 7 états, défilant"><table><thead><tr><th scope="col">Agent</th>{"".join(f"<th scope=col>{STN[s]}</th>" for s in ST)}</tr></thead><tbody>{rows}</tbody></table></div></section>'
small="".join(f'<div class="sm" style="margin:6px 0"><span class="meta" style="width:110px">{s}px figurine</span>'+"".join(R("figurine",v,"executing" if v=="nexus" else ("done" if v=="aegis" else ("error" if v=="pulse" else "idle")),s) for v in V)+'</div>' for s in (24,32,40))+"".join(f'<div class="sm" style="margin:6px 0"><span class="meta" style="width:110px">{s}px hybride</span>'+"".join(R("hybride",v,"executing" if v=="nexus" else ("done" if v=="aegis" else "idle"),s) for v in V)+'</div>' for s in (24,32,40))
BR=[("#ffcf70","or Oria"),("#19d3c5","turquoise"),("#ff4fa3","rose")]
def figrow(v): return "".join(f'<figure style="margin:0;text-align:center">{R("figurine",v,"idle",130,tint=0)}<figcaption class="meta">originale</figcaption></figure>')+"".join(f'<figure style="margin:0;text-align:center"><span style="--brand-accent:{c};display:contents">{R("figurine",v,"idle",130,tint=1)}</span><figcaption class="meta">{n} <code>{c}</code></figcaption></figure>' for c,n in BR)
recol="".join(f'<div class="sm" style="margin:10px 0;gap:18px"><span class="meta" style="width:70px"><b class="nm">{H.V[v][0]}</b></span>{figrow(v)}</div>' for v in V)
posz="".join(f'<div class="sm" style="margin:10px 0;gap:18px;align-items:flex-end"><span class="meta" style="width:70px"><b class="nm">{H.V[v][0]}</b></span>'+"".join(f'<figure style="margin:0;text-align:center">{R("figurine",v,"idle",120,pose=p)}<figcaption class="meta">{F.POSE.get(p) or F.EXPN[p[4:]].split(" — ")[1]}</figcaption></figure>' for p in F.poses(v))+'</div>' for v in V)
figx=f'''<section class="card" aria-labelledby="rc"><h2 id="rc">Recoloration de l'image : 3 couleurs de marque</h2><p class="meta">Un calque <code>var(--brand-accent, var(--agent-accent))</code> en mode de fusion « couleur », masqué par les pixels saturés de l'image : le néon du casque et les accents de tenue changent, le visage blanc et les noirs ne bougent pas. Le halo suit la même couleur.</p>{recol}</section>
<section class="card" aria-labelledby="ps"><h2 id="ps">Variantes : corps, buste, tête et expressions de l'affiche</h2><p class="meta">Corps, buste et tête sont tirés de la planche « concept 01 » ; les expressions viennent de la rangée du bas de l'affiche « Billy Bouton » (image source plus petite : à utiliser jusqu'à ~120 px).</p><div class="wrap" tabindex="0" role="region" aria-label="Variantes par agent, défilant">{posz}</div></section>'''
gal=f'''<p><span class="ex">exemple</span> Toutes les poses et états sont une démonstration. En production, un avatar ne bouge que sur un événement réel de son agent (INTEGRATION.md §9).</p>
<h1>Six agents. Une même vision.</h1><p class="lede"><strong>Billy Figurine (recommandée)</strong> : les mascottes de Michael, pixel pour pixel, détourées. Les états vivent dans des couches légères (halo, cadran Astrolabe à facettes, ondes, orbite, badge, éclat), et la couleur de l'agent ou de la marque recolore le néon de l'image.</p>
<div class="hero" role="list" aria-label="Les six agents (Billy Figurine, au repos)">{hero.replace("<figure>","<figure role=listitem>")}</div>
<section class="card" aria-labelledby="pt"><h2 id="pt">Lisible en petit : la tête seule à 40 px et moins</h2><p class="meta">À 40 px et moins, on affiche la tête détourée (fichier 64 px dédié) ; restent le halo, le cadran et le badge. NEXUS en exécution (3/5), AEGIS terminé, PULSE en erreur.</p>{small}</section>
<section class="card" aria-labelledby="ev"><h2 id="ev">7 états, uniquement sur événement réel</h2><table><thead><tr><th scope="col">État</th><th scope="col">Événement source</th></tr></thead><tbody>{"".join(f"<tr><th scope=row>{STN[s]}</th><td style='text-align:left'>{STD[s]}</td></tr>" for s in ST)}</tbody></table></section>
{figx}
{tabs}'''
(OUT/"avatars-v2-galerie.html").write_text(page("Galerie avatars v2",gal,"avatars-v2-galerie"))
LIB={f"{f}|{v}|{s}|{k}":R(f,v,s,(150 if f in("hybride","billy") else 110) if k=="L" else 32,name="§") for f in FAM if f!="figurine" for v in V for s in ST for k in "LS"}
for v in V:
    for s_ in ST:
        LIB[f"figurine|{v}|{s_}|S"]=R("figurine",v,s_,32,name="§")
        for p in F.poses(v): LIB[f"figurine|{v}|{s_}|L|{p}"]=R("figurine",v,s_,160,name="§",pose=p)
POSES={v:[[p,F.POSE.get(p) or F.EXPN[p[4:]].split(" — ")[1]] for p in F.poses(v)] for v in V}
DEF={v:{"famille":"figurine","variante":v,"pose":"corps","couleur":H.V[v][2]} for v in V}
cards="".join(f'''<article class="agent hov" data-agent="{v}" aria-labelledby="n-{v}"><div class="stage"></div><h3 id="n-{v}" class="nm">{H.V[v][0]}</h3><p class="role">{H.V[v][1]}</p><p class="role"><span class="status" data-st></span></p>
<label for="f-{v}">Famille</label><select id="f-{v}" data-k="famille">{"".join(f'<option value="{k}">{FAM[k][0]}</option>' for k in FAM)}</select>
<label for="v-{v}">Look</label><select id="v-{v}" data-k="variante">{"".join(f'<option value="{k}">{H.V[k][0]} — {H.V[k][1]}</option>' for k in V)}</select>
<label for="p-{v}">Pose (Billy Figurine)</label><select id="p-{v}" data-k="pose"></select>
<label for="c-{v}">Couleur de l'agent</label><div class="row"><input type="color" id="c-{v}" data-k="couleur" value="{H.V[v][2]}"><input type="text" id="h-{v}" data-hex aria-label="Couleur hexadécimale de {H.V[v][0]}" value="{H.V[v][2]}" maxlength="7"></div>
<p class="cst" data-cst role="status" aria-live="polite"></p></article>''' for v in V)
studio=f'''<p><span class="ex">exemple</span> Agents, affectations et états de démonstration. Les choix restent dans ce navigateur (localStorage). En production : voir le modèle dans RECHERCHE-AVATARS.md.</p>
<h1>Atelier d'avatars</h1><p class="lede">Choisissez la famille (Billy Figurine recommandée), le look, la pose et la couleur de chaque agent, ou passez toute l'équipe à la couleur de marque. Le contraste AA est vérifié à chaque choix et corrigé automatiquement si besoin.</p>
<div class="studio"><aside class="panel card" aria-labelledby="pg"><h2 id="pg" style="margin-top:0">Réglages globaux</h2>
<fieldset><legend>Mode marque</legend><div class="sw"><input type="checkbox" id="brand"><label for="brand" style="margin:0;color:var(--ink)">Tous les avatars à la couleur de marque</label></div>
<label for="bc">Couleur de marque (organisation)</label><div class="row"><input type="color" id="bc" value="#ffcf70"><input type="text" id="bch" aria-label="Couleur de marque hexadécimale" value="#ffcf70" maxlength="7"></div><p class="cst" id="bcst" role="status" aria-live="polite"></p>
<p class="meta">Les couleurs d'état (erreur, bloqué, terminé) ne sont jamais remplacées par la marque.</p></fieldset>
<fieldset><legend>Aperçu d'état <span class="ex">exemple</span></legend><label for="st">État affiché</label><select id="st">{"".join(f'<option value="{s}">{STN[s]}</option>' for s in ST)}</select><p class="meta">Dans l'app, l'état vient uniquement de <code>useAgentState(agentId)</code>.</p></fieldset>
<fieldset><legend>Mouvement</legend><div class="sw"><input type="checkbox" id="rm"><label for="rm" style="margin:0;color:var(--ink)">Réduire les animations</label></div><p class="meta">Respecte aussi le réglage système <code>prefers-reduced-motion</code>.</p></fieldset>
<button id="reset" type="button" style="font:inherit;background:var(--panel2);color:var(--ink);border:1px solid #586b63;border-radius:10px;padding:8px 12px;cursor:pointer">Réinitialiser</button></aside>
<div><section aria-labelledby="eq"><h2 id="eq" style="margin-top:0">Équipe</h2><div class="agents">{cards}</div></section>
<section class="card" aria-labelledby="vu"><h2 id="vu">En petit, dans les vues</h2><div class="list" id="mini" role="list" aria-label="Fil de discussion : en-têtes des agents"></div></section>
<section class="card" aria-labelledby="dm"><h2 id="dm">Modèle enregistré (préférences)</h2><pre id="json" tabindex="0" role="region" aria-label="Modèle JSON des préférences"></pre></section></div></div>'''
js=f'''<script>
const POSES={json.dumps(POSES,ensure_ascii=False)},DFC={json.dumps({v:H.V[v][2] for v in V})},LIB={json.dumps(LIB,ensure_ascii=False)},DEF={json.dumps(DEF)},STN={json.dumps(STN,ensure_ascii=False)},NAMES={json.dumps({v:H.V[v][0] for v in V})};
const BG=[[15,19,20],[22,28,29],[5,6,8]]; // fond des cartes et coque du casque
const hex2=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)),lum=c=>{{const a=c.map(v=>{{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4}});return .2126*a[0]+.7152*a[1]+.0722*a[2]}};
const ratio=(a,b)=>{{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}},minR=c=>Math.min(...BG.map(b=>ratio(c,b)));
const toHex=c=>'#'+c.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
function fix(h,target){{let c=hex2(h),t=0;while(minR(c)<target&&t<1){{t+=.05;c=hex2(h).map(v=>v+(255-v)*t)}}return toHex(c)}}
function check(h){{const r=minR(hex2(h));const g=r>=3?h:fix(h,3),txt=r>=4.5?h:fix(h,4.5);return {{r,g,txt,ok:r>=4.5,msg:r>=4.5?`Contraste ${{r.toFixed(1)}}:1 — conforme AA (texte et graphismes).`:r>=3?`Contraste ${{r.toFixed(1)}}:1 — OK pour l'anneau ; nom éclairci en ${{txt}} pour le texte (≥ 4,5:1).`:`Contraste ${{r.toFixed(1)}}:1 insuffisant — ajusté à ${{g}} (≥ 3:1), texte ${{txt}}.`}}}}
let S=JSON.parse(localStorage.getItem('oria-avatars-v3')||'null')||{{agents:structuredClone(DEF),marque:{{actif:false,couleur:'#ffcf70'}}}};
const $=s=>document.querySelector(s),root=document.documentElement;
function draw(){{const st=$('#st').value,b=S.marque,bk=check(b.couleur);$('#brand').checked=b.actif;$('#bc').value=b.couleur;$('#bch').value=b.couleur;$('#bcst').textContent=bk.msg;$('#bcst').className='cst '+(bk.ok?'ok':'adj');
 if(b.actif){{root.style.setProperty('--brand-accent',bk.g)}}else root.style.removeProperty('--brand-accent');
 let mini='';document.querySelectorAll('[data-agent]').forEach(card=>{{const a=card.dataset.agent,m=S.agents[a],k=check(m.couleur),nm=NAMES[m.variante];
  if(!POSES[m.variante].some(p=>p[0]==m.pose))m.pose='corps';const ps=card.querySelector('[data-k=pose]');ps.innerHTML=POSES[m.variante].map(p=>`<option value="${{p[0]}}">${{p[1]}}</option>`).join('');ps.value=m.pose;ps.disabled=m.famille!='figurine';const tint=(b.actif||m.couleur!=DFC[m.variante])?1:0;const h=s=>LIB[m.famille+'|'+m.variante+'|'+st+'|'+s+(m.famille=='figurine'&&s=='L'?'|'+m.pose:'')].replaceAll('§',nm);card.querySelector('.stage').innerHTML=h('L');
  const av=card.querySelector('.stage>span');av.style.setProperty('--agent-accent',k.g);av.style.setProperty('--tint',tint);card.style.setProperty('--a2',b.actif?bk.g:k.g);
  const t=b.actif?bk.txt:k.txt;card.querySelector('h3').textContent=nm;card.querySelector('h3').style.setProperty('--txt',t);card.querySelector('.role').textContent={json.dumps({v:H.V[v][1] for v in V},ensure_ascii=False)}[m.variante];
  card.querySelector('[data-st]').textContent='État : '+STN[st]+(st=='executing'?' — étape 3 sur 5':'');
  card.querySelector('[data-k=famille]').value=m.famille;card.querySelector('[data-k=variante]').value=m.variante;card.querySelector('[data-k=couleur]').value=m.couleur;card.querySelector('[data-hex]').value=m.couleur;
  const c=card.querySelector('[data-cst]');c.textContent=b.actif?'Mode marque actif : couleur de l\\'organisation appliquée.':k.msg;c.className='cst '+(b.actif||k.ok?'ok':'adj');
  mini+=`<div class="it" role="listitem"><span style="--agent-accent:${{k.g}};--tint:${{tint}};display:contents">${{h('S')}}</span><strong class="nm" style="--txt:${{t}}">${{nm}}</strong><span class="meta">${{STN[st]}}</span></div>`}});
 $('#mini').innerHTML=mini;document.querySelectorAll('#mini .ov2,#mini .astre,#mini .glyphe').forEach(e=>{{const p=e.parentElement;e.style.setProperty('--agent-accent',p.style.getPropertyValue('--agent-accent'));e.style.setProperty('--tint',p.style.getPropertyValue('--tint'))}});
 root.classList.toggle('rm',$('#rm').checked);$('#json').textContent=JSON.stringify(S,null,1);localStorage.setItem('oria-avatars-v3',JSON.stringify(S))}}
const valid=h=>/^#[0-9a-fA-F]{{6}}$/.test(h);
document.querySelectorAll('[data-agent]').forEach(card=>{{const a=card.dataset.agent;card.querySelectorAll('select,input').forEach(e=>e.addEventListener(e.type=='text'?'change':'input',()=>{{let k=e.dataset.k||'couleur',val=e.value;if(k=='couleur'&&!valid(val))return;S.agents[a][k]=val.toLowerCase();draw()}}))}});
$('#brand').onchange=e=>{{S.marque.actif=e.target.checked;draw()}};['#bc','#bch'].forEach(s=>$(s).addEventListener(s=='#bc'?'input':'change',e=>{{if(valid(e.target.value)){{S.marque.couleur=e.target.value.toLowerCase();draw()}}}}));
$('#st').onchange=draw;$('#rm').onchange=draw;$('#reset').onclick=()=>{{S={{agents:structuredClone(DEF),marque:{{actif:false,couleur:'#ffcf70'}}}};draw()}};draw();
</script>'''
(OUT/"avatars-v2.html").write_text(page("Atelier d'avatars",studio,"avatars-v2",js))
print("ok",len(LIB))
