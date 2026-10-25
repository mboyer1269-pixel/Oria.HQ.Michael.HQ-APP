#!/usr/bin/env python3
"""Propositions avatars (exemple) : A) 4 améliorations Figurine avant/après, B) 3 directions de style, comparatif."""
import sys,pathlib,json,re,contextlib,io
D=pathlib.Path(__file__).resolve().parent;AV=D.parent/"avatars-v2"
sys.path[:0]=[str(AV),str(D.parent),str(D.parent/"familles")]
with contextlib.redirect_stdout(io.StringIO()): import gen_v2 as G
import figurine as F
V=G.V;ST=G.ST;STN=G.STN;HV=G.H.V
AG={v:{"n":HV[v][0],"c":HV[v][2],"g":F.GLYPH[v],"r":HV[v][1] if len(HV[v])>1 else ""} for v in V}
ROLE={v:HV[v][1] for v in V}
_orig=F.lids
def lids_v2(a,state):  # paupières agrandies : couvrent le contour anti-aliasé de l'œil
    e=F.EYES.get(a)
    if not e or not e["cligne"] or state=="done": return ""
    out=""
    for y in e["yeux"]:
        if y["ferme"]: continue
        rx,ry=y["rx"]*1.9,y["ry"]*1.6
        out+=f'<span class="fg-lid" style="left:{(y["cx"]-rx)*100:.2f}%;top:{(y["cy"]-ry)*100:.2f}%;width:{rx*200:.2f}%;height:{ry*200:.2f}%;--lc:{y["couleurPaupiere"]}"><i></i><b></b></span>'
    return f'<span class="fg-lids" aria-hidden="true">{out}</span>' if out else ""
def fig(v,st,size,pose="corps",v2=False):
    F.lids=lids_v2 if v2 else _orig
    try: return F.render(v,st,size,(3,5) if st=="executing" else None,pose)
    finally: F.lids=_orig
LASH="data:image/svg+xml,"+"%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 30' preserveAspectRatio='none'%3E%3Cpath d='M2 7 Q50 36 98 7 Q50 21 2 7Z' fill='%231b1513'/%3E%3C/svg%3E"
CSS=G.CSS+r"""
.av{display:inline-block;vertical-align:middle;--c:var(--brand,var(--agent));position:relative;flex:none}.av svg{display:block;max-width:100%;height:auto}
.ba{display:grid;grid-template-columns:1fr 1fr;gap:14px}.pane{background:var(--panel2);border:1px solid var(--line);border-radius:16px;padding:14px}.pane h3{margin:0 0 8px;font-size:15px;letter-spacing:.06em}
.pane.after{border-color:#3d5f50}.pane.after h3{color:#9ff0c4}.row{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;justify-content:center}
.row figure{margin:0;text-align:center}.row figcaption{font-size:12.5px;color:var(--soft)}
.grid7{display:grid;grid-template-columns:90px repeat(7,1fr);gap:6px;align-items:center}.grid7 .h{font-size:12px;color:var(--soft);text-align:center}.grid7 .a{font-weight:700;font-size:13px;letter-spacing:.08em}.grid7 .cell{display:grid;place-items:center;padding:4px 0}
.ramp{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end}.ramp figure{margin:0;text-align:center;max-width:100%}.ramp figcaption{font-size:12px;color:var(--soft)}
.live{display:flex;flex-wrap:wrap;gap:18px;justify-content:center;padding:18px;border-radius:18px;background:radial-gradient(600px 220px at 50% 0,#18221f,transparent),#0a0d0e;border:1px solid var(--line)}
.tools{display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;position:sticky;top:58px;z-index:15;background:#0c1011f2;border:1px solid var(--line);border-radius:14px;padding:10px 14px}
.tools label{display:flex;gap:6px;align-items:center;font-size:14px}.tools select,.tools input[type=text]{background:#0a0d0e;color:var(--ink);border:1px solid var(--line2);border-radius:8px;padding:6px 8px;font:inherit}
button.b{background:#18201f;color:var(--ink);border:1px solid var(--line2);border-radius:10px;padding:8px 12px;font:600 14px inherit;cursor:pointer}button.b:hover{border-color:#6c8a7e}
table.cmp{width:100%;border-collapse:collapse;font-size:14px}table.cmp th,table.cmp td{border-bottom:1px solid var(--line);padding:8px 6px;text-align:left;vertical-align:top}table.cmp th{color:var(--soft);font-weight:600}
.reco{border:1px solid #3d5f50;background:#0f1a16;border-radius:16px;padding:16px 18px}.reco strong{color:#9ff0c4}
.cmpvis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.cmpvis>div{background:var(--panel2);border:1px solid var(--line);border-radius:14px;padding:10px;text-align:center}.cmpvis h3{font-size:14px;margin:0 0 6px;position:relative;z-index:3}.cmpvis>div{overflow:hidden}
@media (max-width:760px){.ba{grid-template-columns:1fr}.grid7{grid-template-columns:repeat(4,1fr)}.grid7 .h{display:none}.grid7 .a{grid-column:1/-1}.cmpvis{grid-template-columns:1fr 1fr}.tools{position:static}}
/* A1 yeux fermés vectoriels */
.v2eyes .fg-lid{-webkit-mask:radial-gradient(closest-side,#000 90%,transparent 100%);mask:radial-gradient(closest-side,#000 90%,transparent 100%)}
.v2eyes .fg-lid i{background:radial-gradient(120% 90% at 50% 0,color-mix(in srgb,var(--lc) 92%,#fff),var(--lc) 70%)}
.v2eyes .fg-lid i::after{border:0;left:16%;right:16%;bottom:2%;height:30%;background:url("LASH") center/100% 100% no-repeat;border-radius:0;opacity:calc(var(--lo,0)*2.2 - 1.2)}
/* A3 ombre de contact + rim light */
.v2light .fg-body::after{content:"";position:absolute;left:16%;right:16%;bottom:-2.5%;height:6%;border-radius:50%;background:radial-gradient(closest-side,#000d,#0000);z-index:-1}
.v2light .fg-body img{filter:drop-shadow(-1.6px -1.2px 0 color-mix(in srgb,var(--a) 70%,#fff)) drop-shadow(0 0 9px color-mix(in srgb,var(--a) 40%,transparent))}
.v2light .fg-socle{opacity:.55}
@media (prefers-reduced-motion:no-preference){
:root:not(.rm) .k-rip{transform-origin:0 0;transform-box:view-box;animation:krip 1.8s ease-out infinite}
:root:not(.rm) .k-thinking .k-dot{animation:kmorph 2.4s ease-in-out infinite alternate}
:root:not(.rm) .p-bar{transform-box:fill-box;transform-origin:50% 100%;animation:pbar .54s steps(3) infinite alternate}
:root:not(.rm) .p-dot,:root:not(.rm) .p-blink{animation:pdot 1.2s steps(1) infinite}
:root:not(.rm) .pp-arc{animation:parc 1s ease-in-out infinite alternate}
:root:not(.rm) .pp-bob{animation:pbob 1.6s ease-in-out infinite alternate}
:root:not(.rm) .av.pop svg{animation:apop .45s cubic-bezier(.3,1.6,.5,1)}
:root:not(.rm) .react .fg{animation:rhop .55s var(--d,0s) cubic-bezier(.3,1.6,.5,1) 2}
}
.av.off *,.av.off svg{animation-play-state:paused!important}
@keyframes krip{from{transform:scale(1);opacity:.9}to{transform:scale(3.3);opacity:0}}@keyframes kmorph{to{transform:translate(var(--dx),var(--dy))}}
@keyframes pbar{from{transform:scaleY(.25)}to{transform:scaleY(1)}}@keyframes pdot{50%{opacity:.15}}@keyframes parc{to{transform:translateX(-3px)}}@keyframes pbob{to{transform:translateY(-3px)}}
@keyframes apop{from{transform:scale(.86)}}@keyframes rhop{40%{transform:translateY(-7px)}}
.fg-lid i::after{transition:opacity .08s}
""".replace("LASH",LASH)
EX='<span class="ex">exemple</span>'
def av(d,v,st,sz,**kw): return f'<span class="av" data-dir="{d}" data-v="{v}" data-st="{st}" data-sz="{sz}"'+"".join(f' data-{k}="{x}"' for k,x in kw.items())+'></span>'
def ba(a,b,ta="Avant",tb="Après"): return f'<div class="ba"><div class="pane"><h3>{ta}</h3>{a}</div><div class="pane after"><h3>{tb}</h3>{b}</div></div>'
def figs(items): return '<div class="row">'+"".join(f'<figure>{x}<figcaption>{c}</figcaption></figure>' for x,c in items)+'</div>'
# ---------- A ----------
a1=ba(figs([(f'<span style="--lo:1;display:inline-block">{fig(v,"idle",150,"tete")}</span>',HV[v][0]+" · fermés") for v in ("ori","pulse","aegis")]),
      f'<div class="v2eyes">'+figs([(f'<span style="--lo:1;display:inline-block">{fig(v,"idle",150,"tete",True)}</span>',HV[v][0]+" · fermés") for v in ("ori","pulse","aegis")])+'</div>',
      "Avant : trait générique, contour résiduel (« = » sur ORI, anneau sur PULSE)","Après : paupière agrandie et ombrée, cil en croissant vectoriel effilé")
a1+=f'<p class="meta">Même détection des yeux ; la paupière couvre 1,9 × 1,6 fois l\'œil (au lieu de 1,6 × 1,4), avec un ombrage du haut vers le bas et un cil en croissant, épais au centre et effilé aux bouts, comme le trait des sourcils de l\'affiche. <button class="b" id="a1b" type="button">Faire cligner (aperçu)</button></p>'
a2=ba(f'<div class="row" id="a2a" data-lock>{fig("ori","idle",170,"buste")}{fig("nexus","idle",170,"buste")}</div>',
      f'<div class="row" id="a2b" data-lock>{fig("ori","idle",170,"buste")}{fig("nexus","idle",170,"buste")}</div>',
      "Avant : chacun regarde le curseur","Après : sur une délégation, l'émetteur regarde le receveur, qui lui rend son regard")
a2+=f'<p class="meta">Déclenché par l\'événement réel <code>delegation.created</code> (via <code>window.oriaRelay(from,to)</code>), 2,5 s, puis retour au curseur. <button class="b" id="a2g" type="button">Simuler ORI → NEXUS {EX}</button></p>'
a3=ba(figs([(fig(v,"idle",190),HV[v][0]) for v in ("nova","scout","aegis")]),'<div class="v2light">'+figs([(fig(v,"idle",190),HV[v][0]) for v in ("nova","scout","aegis")])+'</div>',
      "Avant : socle lumineux, silhouette plate","Après : ombre de contact sous les pieds + liseré de lumière (rim light) à la couleur de l'agent")
a3+='<p class="meta">Deux <code>drop-shadow</code> sur l\'image (liseré décalé haut-gauche + halo doux) et une ellipse d\'ombre ; suit la couleur de l\'agent et le mode marque. Coût : un filtre par avatar visible, à réserver aux tailles ≥ 96 px.</p>'
row=lambda:"".join(f'<figure data-v="{v}">{fig(v,"idle",104,"tete")}<figcaption>{HV[v][0]}</figcaption></figure>' for v in V)
a4=ba(f'<div class="row" id="a4a" data-lock>{row()}</div>',f'<div class="row" id="a4b" data-lock>{row()}</div>',
      "Avant : NOVA termine, les autres ne réagissent pas","Après : les voisins tournent la tête vers NOVA et sautillent, en cascade selon la distance")
a4+=f'<p class="meta">Uniquement sur un événement réel <code>mission.completed</code> d\'un agent ; réaction de 1,1 s, jamais en mouvement réduit. <button class="b" id="a4g" type="button">Simuler « NOVA termine » {EX}</button></p>'
NOVA_DONE=fig("nova","done",104,"tete");NOVA_IDLE=fig("nova","idle",104,"tete")
A=[("a1","Yeux fermés redessinés en vectoriel",a1),("a2","Regard vers l'interlocuteur",a2),("a3","Ombre de contact et rim light",a3),("a4","Réactions croisées entre agents",a4)]
# ---------- B ----------
DIRS=[("const","Constellation vivante","Avatar génératif : 8 étoiles qui, selon l'état réel, tournent en cercle (repos), émettent des ondes (écoute), migrent vers le glyphe du rôle (réflexion), le tracent étape par étape (exécution), le ferment (terminé) ou se dispersent (erreur). Sous 40 px : noyau + anneau d'état."),
      ("pix","Pixel 16 × 16","Sprite rétro dessiné en code (aucune image) : casque, yeux, accessoire du rôle (couronne, lunettes, étincelle, lunettes de pilote, casque audio, bouclier). États en pixels : barres son, points, barre de progression, sablier, coche, croix. Net de 24 à 512 px."),
      ("pap","Papier riso","Papier découpé imprimé en deux encres décalées (couleur de l'agent + encre bleu nuit), grain papier, étiquette du rôle collée en biais. États en attaches papier : arcs, bulles, bandelettes d'étapes, sablier, tampon vert, ruban rouge.")]
def dirsec(d,t,desc):
    live='<div class="live">'+"".join(av(d,v,"idle",112,live=1,ex="") for v in V)+'</div>'
    grid='<div class="grid7"><span></span>'+"".join(f'<span class="h">{STN[s]}</span>' for s in ST)+"".join(f'<span class="a">{HV[v][0]}</span>'+"".join(f'<span class="cell">{av(d,v,s,64)}</span>' for s in ST) for v in V)+'</div>'
    ramp='<div class="ramp">'+"".join(f'<figure>{av(d,"ori","executing" if z in (48,256) else ("done" if z==32 else "idle"),z)}<figcaption>{z} px</figcaption></figure>' for z in (24,32,48,64,128,256,512))+'</div>'
    rec='<div class="row">'+"".join(f'<figure>{av(d,"nexus","idle",88,c=c)}<figcaption><code>--agent:{c}</code></figcaption></figure>' for c in ("#4da3ff","#ff4fa3","#c6ff3d","#ffffff"))+'</div>'
    return f'<section class="card" aria-labelledby="{d}"><p class="kick">Direction {["const","pix","pap"].index(d)+1}</p><h2 id="{d}">{t}</h2><p class="meta">{desc}</p><h3 class="meta">En direct (état choisi dans la barre) {EX}</h3>{live}<h3 class="meta">Les 7 états × 6 agents</h3>{grid}<h3 class="meta">De 24 à 512 px</h3>{ramp}<h3 class="meta">Recoloration par variable CSS</h3>{rec}</section>'
B="".join(dirsec(*x) for x in DIRS)
# ---------- comparatif ----------
cv='<div class="cmpvis">'+f'<div><h3>Figurine + améliorations</h3><div class="v2light" style="padding-top:18px;display:flex;justify-content:center;gap:6px">{fig("ori","executing",92)}{fig("nexus","done",92)}</div><div class="row">{fig("ori","idle",24)}{fig("nexus","idle",24)}</div></div>'+"".join(f'<div><h3>{t}</h3><div class="row">{av(d,"ori","executing",96)}{av(d,"nexus","done",96)}</div><div class="row">{av(d,"ori","executing",24)}{av(d,"nexus","done",24)}</div></div>' for d,t,_ in DIRS)+'</div>'
tbl='''<table class="cmp"><thead><tr><th scope="col">Critère</th><th scope="col">Figurine + améliorations</th><th scope="col">Constellation</th><th scope="col">Pixel 16 × 16</th><th scope="col">Papier riso</th></tr></thead><tbody>
<tr><th scope="row">Lien avec les mascottes de Michael</th><td>★★★ ce sont elles</td><td>★ abstrait</td><td>★★ caricature fidèle</td><td>★★ réinterprétation</td></tr>
<tr><th scope="row">Lisibilité à 24 px</th><td>★ visage seul, flou</td><td>★★★ anneau d'état net</td><td>★★★ net</td><td>★★ détails perdus</td></tr>
<tr><th scope="row">États qui racontent l'activité réelle</th><td>★★ couches autour</td><td>★★★ la forme <em>est</em> l'état</td><td>★★ icônes</td><td>★★ attaches</td></tr>
<tr><th scope="row">Poids / perf</th><td>WebP ~1,2 Mo + masques</td><td>SVG ~2 Ko, 0 image</td><td>SVG ~3 Ko, 0 image</td><td>SVG ~3 Ko + filtre grain</td></tr>
<tr><th scope="row">Recoloration / mode marque</th><td>oui (masques)</td><td>oui, parfaite</td><td>oui, parfaite</td><td>oui</td></tr>
<tr><th scope="row">Risque « gadget »</th><td>faible</td><td>moyen (à expliquer)</td><td>moyen (rétro = ton ludique)</td><td>faible, chaleureux</td></tr></tbody></table>'''
reco='''<div class="reco"><p><strong>Ma recommandation : garder Billy Figurine comme visage d'Oria, avec les 4 améliorations, et adopter la Constellation pour les tailles sous 40 px et les vues « activité ».</strong></p>
<ul><li>Les figurines sont les personnages de Michael : c'est l'identité, on ne la remplace pas. Les améliorations (yeux fermés vectoriels, regard vers l'interlocuteur, rim light, réactions croisées) les rendent plus vivantes sans fausse activité.</li>
<li>La Figurine est faible à 24–32 px (visage flou) ; la Constellation y est la meilleure et sa forme <em>est</em> l'état réel (glyphe tracé étape par étape). Elle sert de favicon d'agent, de puce dans les listes, de statut dans le fil, et reprend la couleur de chaque agent ou de la marque.</li>
<li>Pixel 16 × 16 : excellent pour un mode « fun » ou des badges de succès, pas comme identité principale. Papier riso : bel univers pour le marketing (affiches, onboarding), trop chargé pour une interface dense.</li></ul></div>'''
CMP=f'<section class="card" id="cmpsec" aria-labelledby="cmp"><p class="kick">Comparatif</p><h2 id="cmp">Comparatif et recommandation</h2>{cv}<div class="wrap" style="margin-top:14px" tabindex="0" role="region" aria-label="Tableau comparatif">{tbl}</div><div style="margin-top:14px">{reco}</div></section>'
tools=f'''<div class="tools" role="group" aria-label="Réglages de démonstration"><span class="ex">exemple</span>
<label>État (directions) <select id="st">{"".join(f'<option value="{s}">{STN[s]}</option>' for s in ST)}</select></label>
<button class="b" id="step" type="button">Étape suivante</button>
<label><input type="checkbox" id="brand"> Mode marque</label><label>Couleur de marque <input type="text" id="bch" value="#19d3c5" size="8" aria-describedby="bchd"></label><span id="bchd" class="meta">hex, ex. #19d3c5</span>
<label><input type="checkbox" id="rm"> Réduire les animations</label></div>'''
body=f'''<p><span class="ex">exemple</span> Données, états et événements de démonstration. En production, chaque avatar ne bouge que sur un événement réel de son agent.</p>
<p class="kick">Propositions</p><h1>Ce que je ferais ensuite.</h1><p class="lede">Deux volets : A) quatre améliorations de Billy Figurine, montrées avant / après ; B) trois directions de style radicalement différentes, appliquées aux six agents, recolorables et compatibles mode marque. Comparatif et recommandation en bas de page.</p>
{tools}
<h2 style="margin-top:28px">A. Améliorer Billy Figurine</h2>
{"".join(f'<section class="card" id="sec-{i}" aria-labelledby="{i}"><p class="kick">Amélioration {n+1}</p><h2 id="{i}">{t}</h2>{c}</section>' for n,(i,t,c) in enumerate(A))}
<h2 style="margin-top:28px">B. Trois autres directions</h2>{B}{CMP}
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><filter id="pgrain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .45  0 0 0 0 .4  0 0 0 -1.4 1.2"/></filter></svg>'''
JS=f'''<script>window.PROPS_AG={json.dumps(AG)};try{{const s=JSON.parse(localStorage.getItem('oria-avatars-v3')||'null');if(s)window.PROPS_NAMES=Object.fromEntries(Object.entries(s.agents).map(([k,a])=>[k,a.displayName]))}}catch(e){{}}</script>
<script>{(D/"props.js").read_text()}</script>
<script>
(()=>{{const $=s=>document.querySelector(s),root=document.documentElement;let k=3;
const live=()=>document.querySelectorAll('.av[data-live]');
$('#st').addEventListener('change',e=>live().forEach(el=>{{el.dataset.st=e.target.value;el.dataset.k=k;PROPS.draw(el)}}));
$('#step').addEventListener('click',()=>{{k=k%5+1;$('#st').value='executing';live().forEach(el=>{{el.dataset.st='executing';el.dataset.k=k;PROPS.draw(el)}})}});
const brand=()=>{{const c=$('#bch').value.trim();const ok=/^#[0-9a-f]{{6}}$/i.test(c);if($('#brand').checked&&ok){{root.style.setProperty('--brand',c);root.style.setProperty('--brand-accent',c)}}else{{root.style.removeProperty('--brand');root.style.removeProperty('--brand-accent')}}}};
$('#brand').addEventListener('change',brand);$('#bch').addEventListener('change',brand);
$('#rm').addEventListener('change',e=>root.classList.toggle('rm',e.target.checked));
$('#a1b').addEventListener('click',()=>document.querySelectorAll('#sec-a1 .fg').forEach(el=>{{el.parentElement.style.setProperty('--lo',0);setTimeout(()=>{{FG.blink(el,true);setTimeout(()=>el.parentElement.style.setProperty('--lo',1),900)}},60)}}));
const look=(row,map,ms)=>{{row.querySelectorAll('.fg').forEach((el,i)=>{{if(map[i]!=null)el.style.setProperty('--gx',map[i]);el.style.setProperty('--gy',0)}});if(ms)setTimeout(()=>row.querySelectorAll('.fg').forEach(el=>el.style.setProperty('--gx',0)),ms)}};
const still=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||root.classList.contains('rm');
window.oriaRelay=window.oriaRelay||function(from,to){{if(!still())look($('#a2b'),[1,-1],2500)}};
$('#a2g').addEventListener('click',()=>{{look($('#a2a'),[.6,.6]);window.oriaRelay('ori','nexus')}});
const ND={json.dumps(NOVA_DONE)},NI={json.dumps(NOVA_IDLE)};
const done=(row,react)=>{{const f=row.querySelector('figure[data-v=nova]');const old=f.querySelector('.fg');old.outerHTML=ND;FG.scan();const figs=[...row.querySelectorAll('figure')],ni=figs.indexOf(f);
 if(react&&!still()){{figs.forEach((g,i)=>{{if(i===ni)return;const fe=g.querySelector('.fg');fe.style.setProperty('--gx',i<ni?1:-1);g.style.setProperty('--d',(Math.abs(i-ni)*.12)+'s');g.classList.add('react')}});
  setTimeout(()=>figs.forEach(g=>{{g.classList.remove('react');g.querySelector('.fg').style.setProperty('--gx',0)}}),2200)}}
 setTimeout(()=>{{f.querySelector('.fg').outerHTML=NI;FG.scan()}},4000)}};
$('#a4g').addEventListener('click',()=>{{done($('#a4a'),false);done($('#a4b'),true)}});
}})();
</script>'''
html=G.page("Propositions d'avatars",body,"avatars-propositions",JS).replace("<style>",f"<style>",1)
html=html.replace(G.CSS,CSS,1)
(D.parent/"mockups"/"avatars-propositions.html").write_text(html);print("ok",len(html))
