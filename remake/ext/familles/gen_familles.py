#!/usr/bin/env python3
"""Maquettes des familles d'avatars Oria + sélecteur d'attribution. Toutes données = « exemple »."""
import sys,pathlib,json,html
D=pathlib.Path(__file__).resolve().parent; sys.path[:0]=[str(D),str(D.parent)]
import billy,glyphe,astre
OUT=D.parent/"mockups"
ST7=["idle","listening","thinking","executing","waiting","done","error"]
STN={"idle":"Repos","listening":"Écoute","thinking":"Réflexion","executing":"Exécution (étape 3/5)","waiting":"Bloqué (attend décision)","done":"Terminé","error":"Erreur"}
EV={"idle":"aucun flux / completed + délai","listening":"MediaRecorder start→stop (à construire)","thinking":"/api/joris/chat envoyé → 1er chunk ; mission queued","executing":"mission running ; ledger.append (theatre SSE) — 1 segment par étape terminée","waiting":"needs_approval ; intent.upsert","done":"running → completed (une seule fois)","error":"failed ; runner_died ; SSE error"}
AST={"ori":"orchestration","nexus":"dev-code","nova":"creation","scout":"recherche","pulse":"ventes-ops","aegis":"securite"}
GLV={"ori":"ambre","nexus":"azur","nova":"lilas","scout":"ambre","pulse":"corail","aegis":"signal"}
def R(fam,var,size,state,prog=None,name=None):
    if fam=="billy": return billy.render("agent-"+var,var,size,state,prog,var,name=name or billy.V[var][0])
    if fam=="glyphe": return glyphe.render("agent-"+var,var,size,state,prog,GLV.get(var,var),name=name or var.upper())
    return astre.astre("agent-"+var,AST.get(var,var),size,state,prog,name=name or var.upper())
FAM={"billy":("Billy Boutons","Mascottes chibi 3D-look : tête ronde blanche dans un anneau néon, grands yeux, streetwear noir, logo O, sneakers. Une couleur et un accessoire par rôle. Expressif, chaleureux : idéal pour l'onboarding, le chat et l'Orbite."),
 "astrolabe":("Astrolabe","Astre génératif déterministe (sha256 id|rôle) : noyau lumineux dans des courbes de niveau, couronne de facettes. Abstrait, signature de marque, identique partout pour un même agent."),
 "glyphe":("Glyphe","Monogramme typographique sur tuile arrondie. Lisible dès 24 px, très peu de mouvement, coût de rendu minimal : listes denses, tableaux, mobile, équipes qui préfèrent un rendu non figuratif.")}
VARS=list(billy.V)
CSS=billy.CSS+glyphe.CSS+astre.CSS+r"""
:root{--bg:#07090a;--panel:#0e1213;--line:#2c3a34;--ink:#e8f3ec;--soft:#a9bdb1;--accent:#4dff9a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,'Space Grotesk',sans-serif}a{color:#9fd8ff}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px}.skip{position:absolute;left:-999px}.skip:focus{left:8px;top:8px;background:var(--accent);color:#03140a;padding:8px}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:12px 20px;border-bottom:1px solid var(--line)}header nav a{margin-right:14px}
main{max-width:1280px;margin:0 auto;padding:20px}.ex{display:inline-block;border:1px solid #ffb340;color:#ffd08a;border-radius:99px;padding:1px 10px;font-size:13px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px;margin:16px 0}.meta{color:var(--soft);font-size:14px}
table{border-collapse:collapse;width:100%}th,td{padding:8px;border-bottom:1px solid var(--line);text-align:center;vertical-align:middle}th[scope=row]{text-align:left}
.wrap{overflow-x:auto}.cell{display:flex;flex-direction:column;align-items:center;gap:4px}.cell small{color:var(--soft)}
.grid6{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}.agent{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
label{display:block;font-size:13px;color:var(--soft);margin-top:6px}select,button{font:inherit;background:#151b1c;color:var(--ink);border:1px solid #4a5d55;border-radius:8px;padding:6px 8px}button{cursor:pointer}
.chat{display:flex;gap:12px;align-items:center;border-bottom:1px solid var(--line);padding-bottom:10px}.orb{position:relative;height:300px;border:1px solid var(--line);border-radius:14px;background:radial-gradient(#12201b,#07090a 70%)}.orb .n{position:absolute;transform:translate(-50%,-50%);text-align:center;font-size:13px}
pre{background:#050707;border:1px solid var(--line);border-radius:8px;padding:10px;overflow:auto;font-size:13px}
"""
def page(title,body,cur):
    nav=" ".join(f'<a href="{h}.html"{" aria-current=page" if h==cur else ""}>{t}</a>' for h,t in [("famille-billy","Billy Boutons"),("famille-astrolabe","Astrolabe"),("famille-glyphe","Glyphe"),("avatars-attribution","Attribuer")])
    return f'<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title} — Oria</title><style>{CSS}</style></head><body><a class="skip" href="#m">Aller au contenu</a><header><strong>Oria · Familles d\'avatars</strong><nav aria-label="Familles">{nav}</nav></header><main id="m">{body}</main></body></html>'
for fam,(fn,desc) in FAM.items():
    rows="".join(f'<tr><th scope="row">{billy.V[v][0]}<br><small class="meta">{billy.V[v][1]}</small></th>'+"".join(f'<td><div class="cell">{R(fam,v,64,s,(3,5) if s=="executing" else None)}</div></td>' for s in ST7)+'</tr>' for v in VARS)
    body=f'''<h1>{fn}</h1><p><span class="ex">exemple</span> Chaque état ci-dessous est une démonstration statique : en production, l'avatar ne change d'état que sur un événement réel (INTEGRATION.md §9).</p><p class="meta">{desc}</p>
<section class="card" aria-labelledby="t"><h2 id="t">6 rôles × 7 états</h2><div class="wrap" tabindex="0" role="region" aria-label="Tableau défilant : rôles et états"><table><thead><tr><th scope="col">Rôle</th>{"".join(f'<th scope="col">{STN[s]}</th>' for s in ST7)}</tr></thead><tbody>{rows}</tbody></table></div></section>
<section class="card" aria-labelledby="e"><h2 id="e">Événement réel → état</h2><table><thead><tr><th scope="col">État</th><th scope="col">Événement source</th></tr></thead><tbody>{"".join(f'<tr><th scope="row">{STN[s]}</th><td style="text-align:left">{EV[s]}</td></tr>' for s in ST7)}</tbody></table>
<p class="meta">Cycles ≥ 1,6 s (moins d'un flash par seconde) ; « terminé » et « erreur » jouent une seule fois ; <code>prefers-reduced-motion: reduce</code> coupe tout mouvement, la pose, l'anneau et le badge restent. L'état est toujours dans l'<code>aria-label</code> et en texte.</p></section>'''
    (OUT/f"famille-{fam}.html").write_text(page(f"Famille {fn}",body,f"famille-{fam}"))
# rendu pré-calculé de chaque (famille, variante, état) pour le sélecteur — aucun appel réseau
AGENTS=[("lea","Léa","analyste-clients","billy","scout"),("hugo","Hugo","marketing","billy","pulse"),("nova","Nova","dev-code","billy","nexus"),("rex","Rex","qa-tests","glyphe","aegis"),("kit","Kit","rédaction","astrolabe","nova"),("ori","Oria","orchestration","billy","ori")]
LIB={f"{f}|{v}|{s}":R(f,v,72 if f!="billy" else 64,s,(3,5) if s=="executing" else None,name="§") for f in FAM for v in VARS for s in ST7}
cards="".join(f'''<div class="agent card" style="margin:0" data-agent="{a}"><div class="av" data-name="{n}">{R(f,v,72 if f!="billy" else 64,"idle",name=n)}</div><strong>{n}</strong><span class="meta">{r}</span>
<label for="f-{a}">Famille</label><select id="f-{a}" data-k="famille">{"".join(f'<option value="{k}"{" selected" if k==f else ""}>{FAM[k][0]}</option>' for k in FAM)}</select>
<label for="v-{a}">Look (variante)</label><select id="v-{a}" data-k="variante">{"".join(f'<option value="{k}"{" selected" if k==v else ""}>{billy.V[k][0]} — {billy.V[k][1]}</option>' for k in VARS)}</select></div>''' for a,n,r,f,v in AGENTS)
model={a:{"famille":f,"variante":v} for a,n,r,f,v in AGENTS}
body=f'''<h1>Attribuer une famille et un look à chaque agent</h1><p><span class="ex">exemple</span> Agents et affectations fictifs. Choix enregistrés uniquement dans ce navigateur (localStorage) ; en production : table <code>agent_avatar</code> (voir FAMILLES.md).</p>
<section class="card" aria-labelledby="ap"><h2 id="ap">Aperçu d'état (exemple)</h2><label for="st">Prévisualiser l'état</label><select id="st">{"".join(f'<option value="{s}">{STN[s]}</option>' for s in ST7)}</select>
<p class="meta">Prévisualisation manuelle pour l'équipe ; dans l'app, l'état vient de <code>useAgentState(agentId)</code> uniquement.</p><p id="live" role="status" aria-live="polite" class="meta"></p></section>
<section aria-labelledby="eq"><h2 id="eq">Équipe</h2><div class="grid6">{cards}</div></section>
<section class="card" aria-labelledby="vu"><h2 id="vu">Dans les vues</h2><h3>En-tête de fil (Parler)</h3><div class="chat" id="chatHead"></div><h3>Orbite</h3><div class="orb" id="orb" role="list" aria-label="Agents en orbite"></div></section>
<section class="card" aria-labelledby="dm"><h2 id="dm">Modèle de données</h2><pre id="json">{html.escape(json.dumps(model,ensure_ascii=False,indent=1))}</pre><button id="reset" type="button">Réinitialiser</button></section>
<script>
const LIB={json.dumps(LIB,ensure_ascii=False)};const DEF={json.dumps(model)};const STN={json.dumps(STN,ensure_ascii=False)};
let M=Object.assign({{}},DEF,JSON.parse(localStorage.getItem('oria-avatars')||'{{}}'));const st=document.getElementById('st');
const NAMES={{}};document.querySelectorAll('[data-agent]').forEach(c=>NAMES[c.dataset.agent]=c.querySelector('.av').dataset.name);
const html=(a,s)=>LIB[M[a].famille+'|'+M[a].variante+'|'+s].replaceAll('§',NAMES[a]).replaceAll('¤',NAMES[a][0]);
function draw(){{const s=st.value;document.querySelectorAll('[data-agent]').forEach(c=>{{const a=c.dataset.agent;c.querySelector('.av').innerHTML=html(a,s);c.querySelector('[data-k=famille]').value=M[a].famille;c.querySelector('[data-k=variante]').value=M[a].variante}});
document.getElementById('chatHead').innerHTML=html('nova',s)+'<div><strong>Nova</strong> <span class="meta">'+STN[s]+'</span></div>';
const o=document.getElementById('orb'),ks=Object.keys(M);o.innerHTML=ks.map((a,i)=>{{const t=i/ks.length*6.283;return '<div class="n" role="listitem" style="left:'+(50+38*Math.cos(t))+'%;top:'+(50+36*Math.sin(t))+'%">'+html(a,s)+'<br>'+NAMES[a]+'</div>'}}).join('');
document.getElementById('json').textContent=JSON.stringify(M,null,1);localStorage.setItem('oria-avatars',JSON.stringify(M))}}
document.querySelectorAll('[data-agent] select').forEach(e=>e.addEventListener('change',()=>{{const a=e.closest('[data-agent]').dataset.agent;M[a]=Object.assign({{}},M[a],{{[e.dataset.k]:e.value}});draw();document.getElementById('live').textContent=NAMES[a]+' : '+M[a].famille+' / '+M[a].variante}}));
st.addEventListener('change',()=>{{draw();document.getElementById('live').textContent='Aperçu : '+STN[st.value]}});document.getElementById('reset').onclick=()=>{{M=Object.assign({{}},DEF);draw()}};draw();
</script>'''
(OUT/"avatars-attribution.html").write_text(page("Attribuer les avatars",body,"avatars-attribution"))
print("ok")
