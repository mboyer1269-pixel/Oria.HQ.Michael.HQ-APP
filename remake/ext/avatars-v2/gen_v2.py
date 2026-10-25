#!/usr/bin/env python3
"""Avatars Oria v2/v3 : galerie « scène » + atelier (famille, look, pose, couleur, NOM, mode marque, orbite de relais). Données = « exemple »."""
import sys,pathlib,json,html
D=pathlib.Path(__file__).resolve().parent; sys.path[:0]=[str(D),str(D.parent),str(D.parent/"familles")]
import hybride as H, astre, glyphe, figurine as F
OUT=D.parent/"mockups"
ST=["idle","listening","thinking","executing","waiting","done","error"]
STN={"idle":"Repos","listening":"Écoute","thinking":"Réflexion","executing":"Exécution","waiting":"Bloqué","done":"Terminé","error":"Erreur"}
STD={"idle":"aucun flux actif — micro-idles rares (reflet, coup d'œil), jamais de fausse activité","listening":"micro ouvert (MediaRecorder) — le néon suit le niveau sonore réel si le micro est autorisé","thinking":"requête chat envoyée → 1er chunk ; mission queued — les particules forment le glyphe du rôle","executing":"mission running ; 1 facette = 1 étape terminée (ledger.append), elle « clique » en place","waiting":"needs_approval / intent.upsert — sablier sur le casque","done":"running → completed — célébration propre au rôle, jouée une fois","error":"failed / runner_died / SSE error — affaissement puis badge, joué une fois"}
FAM={"figurine":("Billy Figurine — recommandée","Les images de Michael, détourées sans retouche. Les états sont des couches légères ; la couleur recolore le néon de l'image elle-même (blancs et noirs préservés)."),
     "hybride":("Hybride Billy × Astrolabe","Figurine vectorielle dont l'anneau du casque devient un cadran Astrolabe à facettes."),
     "billy":("Billy Boutons (vectoriel)","Interprétation vectorielle des références."),
     "astrolabe":("Astrolabe","Astre génératif abstrait, recoloré par la même variable."),
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
.astre,.glyphe{--a:var(--brand-accent,var(--agent-accent))}
:root{--bg:#060809;--panel:#0e1213;--panel2:#151b1c;--line:#26312d;--line2:#3a4a44;--ink:#f1f6f2;--soft:#b3c3ba;--focus:#ffffff;--gold:#ffcf70}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 'Space Grotesk','Inter',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
body{background:radial-gradient(1200px 600px at 50% -200px,#16201d 0,transparent 70%),var(--bg)}
a{color:#a8dcff}:focus-visible{outline:3px solid var(--focus);outline-offset:3px;border-radius:6px}
.skip{position:absolute;left:-999px}.skip:focus{left:8px;top:8px;background:#fff;color:#000;padding:8px;z-index:9}
header{position:sticky;top:0;z-index:20;display:flex;flex-wrap:wrap;gap:12px 16px;align-items:center;justify-content:space-between;padding:12px 24px;border-bottom:1px solid var(--line);background:#060809e6;backdrop-filter:blur(10px)}
.brand{font:700 18px/1 'Space Grotesk',sans-serif;letter-spacing:.22em}.brand span{color:var(--gold)}header nav a{margin-left:18px;text-decoration:none;color:var(--soft);font-weight:600}header nav a[aria-current]{color:var(--ink);border-bottom:2px solid var(--gold)}
main{max-width:1320px;margin:0 auto;padding:28px 24px 80px}.ex{display:inline-block;border:1px solid #ffb340;color:#ffd08a;border-radius:99px;padding:0 10px;font-size:12.5px;font-weight:700;letter-spacing:.04em}
.kick{font-size:12.5px;letter-spacing:.24em;text-transform:uppercase;color:var(--gold);font-weight:700;margin:22px 0 4px}
h1{font-size:clamp(32px,5vw,60px);line-height:1;letter-spacing:-.02em;margin:.1em 0 .25em}h2{letter-spacing:-.01em;font-size:clamp(20px,2.4vw,26px);margin:.2em 0 .3em}
.lede{color:var(--soft);max-width:68ch;font-size:16.5px}
.card{background:linear-gradient(180deg,#111617,#0c1011);border:1px solid var(--line);border-radius:22px;padding:22px;margin:22px 0;box-shadow:0 30px 60px -40px #000}.meta{color:var(--soft);font-size:14px}
.scene{position:relative;border-radius:28px;border:1px solid var(--line);overflow:hidden;padding:44px 16px 26px;
 background:radial-gradient(60% 50% at 50% 0,#ffffff12,transparent 70%),linear-gradient(180deg,#0d1213 0,#0a0e0f 62%,#070909 62.2%,#0b0f10 100%)}
.scene::before{content:"";position:absolute;inset:0;background:repeating-conic-gradient(from 0deg at 50% -20%,#ffffff05 0 4deg,transparent 4deg 12deg);pointer-events:none}
.scene::after{content:"";position:absolute;left:0;right:0;top:62%;height:1px;background:linear-gradient(90deg,transparent,#ffffff22,transparent)}
.hero{position:relative;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;z-index:1}
.hero figure{margin:0;text-align:center;min-width:0}.hero .ov2.fg{margin:0 auto}@media (max-width:1100px){.hero .ov2.fg{zoom:.78}}.hero figcaption b{display:block;letter-spacing:.16em;font-size:17px;margin-top:10px}.hero figcaption i{display:block;font-size:13px;color:var(--soft);font-style:normal}.hero figcaption q{display:block;font-size:13px;margin-top:4px;font-style:italic;color:#d9e4dd}
.nm{color:var(--txt,var(--ink))}
table{border-collapse:collapse;width:100%}th,td{padding:8px 6px;border-bottom:1px solid var(--line);text-align:center}th[scope=row]{text-align:left;white-space:nowrap}thead th{font-size:13px;color:var(--soft);letter-spacing:.06em}
.wrap{overflow-x:auto}.sm{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.grid3{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}.tile{background:var(--panel2);border:1px solid var(--line);border-radius:16px;padding:14px 8px 10px;text-align:center}
.tile{min-width:0}.tile .ov2.fg{max-width:100%;height:auto!important;aspect-ratio:1}main{overflow-x:clip}.tile figcaption{font-size:13px;color:var(--soft);margin-top:6px}
.studio{display:grid;grid-template-columns:320px 1fr;gap:20px;align-items:start}.panel{position:sticky;top:70px}
fieldset{border:1px solid var(--line);border-radius:14px;margin:0 0 12px;padding:10px 12px}legend{font-weight:700;padding:0 6px}
label{display:block;font-size:13px;color:var(--soft);margin:8px 0 3px}select,input[type=text]{width:100%;font:inherit;background:var(--panel2);color:var(--ink);border:1px solid #586b63;border-radius:10px;padding:7px 9px}
select:disabled{opacity:.55}
input[type=color]{width:44px;height:36px;border:1px solid #586b63;border-radius:10px;background:var(--panel2);padding:2px;vertical-align:middle}.row{display:flex;gap:8px;align-items:center}
.sw{display:flex;align-items:center;gap:10px;margin:8px 0;font-size:14px}.sw input{width:20px;height:20px;accent-color:#4dff9a;flex:none}
.btn{font:inherit;font-weight:600;background:var(--panel2);color:var(--ink);border:1px solid #586b63;border-radius:10px;padding:7px 12px;cursor:pointer}.btn:hover{border-color:#9fb3aa}
.agents{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.agent{position:relative;background:linear-gradient(180deg,var(--panel2),var(--panel));border:1px solid var(--line);border-radius:22px;padding:14px;transition:border-color .2s}
.agent:hover,.agent:focus-within{border-color:#6f857b}
.agent .stage{position:relative;display:grid;place-items:end center;min-height:196px;padding-bottom:8px;border-radius:16px;overflow:hidden;
 background:radial-gradient(70% 60% at 50% 0,color-mix(in srgb,var(--a2,#fff) 16%,transparent),transparent 70%),linear-gradient(180deg,#0f1415 0,#0b0f10 78%,#080a0b 78.5%)}
.nmw{display:flex;justify-content:center;align-items:center;gap:6px;margin:10px 0 0;letter-spacing:.14em}
.nmw [data-name]{cursor:text;border-radius:6px;padding:0 4px}.nmw .pen{opacity:0;font-size:13px;color:var(--soft);transition:opacity .2s}
.agent:hover .pen,.nmw:focus-within .pen{opacity:1}
.nmw input{width:auto;max-width:80%;text-align:center;letter-spacing:.08em;font-weight:700;padding:2px 6px}
.agent .role{text-align:center;color:var(--soft);font-size:13px;margin:0}
.cst{font-size:13px;margin:6px 0 0;min-height:1.3em}.cst.ok{color:#9be8bd}.cst.adj{color:#ffd08a}.cst.err{color:#ffaaa2}
.status{display:inline-block;margin-top:4px;font-size:13px;border:1px solid var(--line2);border-radius:99px;padding:1px 10px}
.list{display:flex;flex-direction:column;gap:6px}.list .it{display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:10px;background:var(--panel2)}
.list .msg{color:var(--soft);font-size:13.5px}
pre{background:#050707;border:1px solid var(--line);border-radius:10px;padding:10px;overflow:auto;font-size:12.5px;max-height:320px}
.orbit{position:relative;width:min(420px,86vw);aspect-ratio:1;margin:8px auto 4px}
.orbit .ring{position:absolute;inset:12%;border-radius:50%;border:1px dashed #3d4d47}
.orbit .core{position:absolute;inset:38%;border-radius:50%;display:grid;place-items:center;text-align:center;font-size:12px;color:var(--soft);background:radial-gradient(circle,#18201e,#0b0f10);border:1px solid var(--line)}
.orb-slot{position:absolute;left:50%;top:50%;width:0;height:0}
.orb-slot>div{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:2px;width:110px}
.orb-slot small{font-weight:700;letter-spacing:.1em;font-size:12px}
.comet-arm{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .25s}.comet-arm.show{opacity:1}
.comet-arm i{position:absolute;left:50%;top:12%;width:16px;height:16px;margin:-8px;border-radius:50%;background:radial-gradient(circle,#fff,var(--cc) 60%);box-shadow:0 0 14px 4px var(--cc)}
.comet-arm i::after{content:"";position:absolute;right:12px;top:5px;width:70px;height:6px;border-radius:6px;background:linear-gradient(90deg,transparent,var(--cc));transform-origin:right center}
.relay{display:flex;flex-wrap:wrap;gap:8px;align-items:end;justify-content:center}.relay label{margin:0 0 3px}.relay select{width:auto}
@media (max-width:900px){.studio{grid-template-columns:1fr}.panel{position:static}.agents{grid-template-columns:1fr 1fr}.hero{grid-template-columns:repeat(3,1fr);row-gap:20px}}
@media (max-width:560px){.agents{grid-template-columns:1fr}.hero{grid-template-columns:repeat(2,1fr)}main{padding:16px 14px 60px}.card{padding:16px}header{padding:10px 14px}.orb-slot>div{width:84px}}
"""
JS=(D/"figurine.js").read_text()
def page(t,body,cur,js=""):
    nav="".join(f'<a href="{h}.html"{" aria-current=page" if h==cur else ""}>{x}</a>' for h,x in [("avatars-v2-galerie","Galerie"),("avatars-v2","Atelier"),("avatars-propositions","Propositions")])
    return f'<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{t} — Oria</title><link rel="stylesheet" href="../avatars-v2/figurine/masks.css"><style>{CSS}</style></head><body><a class="skip" href="#m">Aller au contenu</a><header><div class="brand">ORIA <span>HQ</span> · Avatars</div><nav aria-label="Avatars">{nav}</nav></header><main id="m">{body}</main><script>{JS}</script>{js}</body></html>'
V=list(H.V)
NAMEJS="""<script>(function(){try{const S=JSON.parse(localStorage.getItem('oria-avatars-v3')||'null');if(!S)return;
for(const [id,a] of Object.entries(S.agents||{})){const n=a.displayName;if(!n)continue;
 document.querySelectorAll('[data-nm="'+id+'"]').forEach(e=>e.textContent=n);
 document.querySelectorAll('.fg[data-v="'+id+'"] img').forEach(i=>{i.alt=i.alt.replace(/^[^,]+,/,n+',')})}}catch(e){}})();</script>"""
# ---------- GALERIE ----------
hero="".join(f'<figure role="listitem">{R("figurine",v,"idle",190)}<figcaption><b class="nm" data-nm="{v}">{H.V[v][0]}</b><i>{H.V[v][1]}</i><q>{H.V[v][3][2:-2]}</q></figcaption></figure>' for v in V)
tabs=""
for f,(fn,fd) in FAM.items():
    rows="".join(f'<tr><th scope="row"><span data-nm="{v}">{H.V[v][0]}</span></th>'+"".join(f'<td>{R(f,v,s,100 if f=="figurine" else (84 if f in ("hybride","billy") else 64))}</td>' for s in ST)+'</tr>' for v in V)
    tabs+=f'<section class="card" aria-labelledby="t-{f}"><h2 id="t-{f}">{fn}</h2><p class="meta">{fd}</p><div class="wrap" tabindex="0" role="region" aria-label="{fn} : 6 agents × 7 états, défilant"><table><thead><tr><th scope="col">Agent</th>{"".join(f"<th scope=col>{STN[s]}</th>" for s in ST)}</tr></thead><tbody>{rows}</tbody></table></div></section>'
def smallrow(fam,s): return f'<div class="sm" style="margin:6px 0"><span class="meta" style="width:120px">{s} px · {"figurine" if fam=="figurine" else "hybride"}</span>'+"".join(R(fam,v,"executing" if v=="nexus" else ("done" if v=="aegis" else ("error" if v=="pulse" else ("waiting" if v=="scout" else "idle"))),s) for v in V)+'</div>'
small="".join(smallrow("figurine",s) for s in (24,32,40))+"".join(smallrow("hybride",s) for s in (24,32,40))
BR=[("#ffcf70","or Oria"),("#19d3c5","turquoise"),("#ff4fa3","rose")]
def figrow(v): return f'<figure class="tile">{R("figurine",v,"idle",140,tint=0)}<figcaption>originale</figcaption></figure>'+"".join(f'<figure class="tile"><span style="--brand-accent:{c};display:contents">{R("figurine",v,"idle",140,tint=1)}</span><figcaption>{n} <code>{c}</code></figcaption></figure>' for c,n in BR)
recol="".join(f'<h3 class="meta" style="margin:14px 0 6px;letter-spacing:.14em" data-nm="{v}">{H.V[v][0]}</h3><div class="grid3">{figrow(v)}</div>' for v in V)
def plab(p): return F.POSE.get(p) or F.EXPN[p[4:]].split(" — ")[1]
posz="".join(f'<h3 class="meta" style="margin:14px 0 6px;letter-spacing:.14em" data-nm="{v}">{H.V[v][0]}</h3><div class="grid3">'+"".join(f'<figure class="tile">{R("figurine",v,"idle",130 if not p.startswith("exp-") else 120,pose=p)}<figcaption>{plab(p)}</figcaption></figure>' for p in F.poses(v))+'</div>' for v in V)
expst="".join(f'<figure class="tile">{R("figurine",v,s,120,pose=p)}<figcaption><span data-nm="{v}">{H.V[v][0]}</span> · {STN[s]}<br><small>{plab(p)}</small></figcaption></figure>' for s,m in F.EXPMAP.items() for v,p in m.items())
gal=f'''<p><span class="ex">exemple</span> Poses et états de démonstration. En production, un avatar ne bouge que sur un événement réel de son agent (INTEGRATION.md §9).</p>
<p class="kick">Billy Figurine · recommandée</p><h1>Six agents. Une même vision.</h1><p class="lede">Les mascottes de Michael, pixel pour pixel, mises en scène : socle et lumière, halo calé sur le néon du casque, regard qui vous suit, et des états qui racontent le vrai travail de chaque agent.</p>
<div class="scene"><div class="hero" role="list" aria-label="Les six agents, au repos">{hero}</div></div>
<section class="card" aria-labelledby="ev"><h2 id="ev">7 états, uniquement sur événement réel</h2><div class="wrap" tabindex="0" role="region" aria-label="Table des états, défilant"><table><thead><tr><th scope="col">État</th><th scope="col">Événement source → mise en scène</th></tr></thead><tbody>{"".join(f"<tr><th scope=row>{STN[s]}</th><td style='text-align:left'>{STD[s]}</td></tr>" for s in ST)}</tbody></table></div></section>
{tabs.split("</section>")[0]}</section>
<section class="card" aria-labelledby="xs"><h2 id="xs">Expressions de l'affiche liées à un état — quand le geste le dit déjà</h2><p class="meta">Option de l'atelier « expressions d'état ». Associations retenues uniquement si l'expression d'origine correspond au sens de l'état (pouce levé → terminé, jumelles → réflexion, casque audio → écoute…). Les autres agents gardent leur pose.</p><div class="grid3">{expst}</div></section>
<section class="card" aria-labelledby="pt"><h2 id="pt">Lisible en petit : 24, 32 et 40 px</h2><p class="meta">À 40 px et moins, la tête détourée (fichier 64 px dédié) ; halo, cadran, sablier et badges restent lisibles. NEXUS exécute (3/5), SCOUT est bloqué, AEGIS a terminé, PULSE est en erreur.</p>{small}</section>
<section class="card" aria-labelledby="rc"><h2 id="rc">Recoloration de l'image : 3 couleurs de marque</h2><p class="meta">Un calque <code>var(--brand-accent, var(--agent-accent))</code> en fusion « couleur », masqué par les pixels saturés de l'image : néon du casque et accents de tenue changent, visage blanc et noirs restent intacts. Masques en data URI : marche aussi hors serveur (file://).</p>{recol}</section>
<section class="card" aria-labelledby="ps"><h2 id="ps">Variantes : corps, buste, tête, expressions</h2><p class="meta">Corps, buste et tête viennent de la planche « concept 01 » ; les expressions viennent de l'affiche « Billy Bouton » (source plus petite : nettes jusqu'à ~120 px).</p>{posz}</section>
{"</section>".join(tabs.split("</section>")[1:])}'''
(OUT/"avatars-v2-galerie.html").write_text(page("Galerie avatars",gal,"avatars-v2-galerie",NAMEJS))
# ---------- ATELIER ----------
LIB={f"{f}|{v}|{s}|{k}":R(f,v,s,(150 if f in("hybride","billy") else 110) if k=="L" else 32,name="§") for f in FAM if f!="figurine" for v in V for s in ST for k in "LS"}
for v in V:
    for s_ in ST:
        LIB[f"figurine|{v}|{s_}|S"]=R("figurine",v,s_,32,name="§")
        LIB[f"figurine|{v}|{s_}|M"]=R("figurine",v,s_,60,name="§",pose="tete")
        for p in F.poses(v): LIB[f"figurine|{v}|{s_}|L|{p}"]=R("figurine",v,s_,170,name="§",pose=p)
POSES={v:[[p,plab(p)] for p in F.poses(v)] for v in V}
ORIG={v:f"{H.V[v][0]} — {H.V[v][1]}" for v in V}
DEF={v:{"agentId":v,"displayName":H.V[v][0],"famille":"figurine","variante":v,"pose":"corps","couleur":H.V[v][2]} for v in V}
cards="".join(f'''<article class="agent hov" data-agent="{v}" aria-labelledby="n-{v}"><div class="stage"></div>
<h3 class="nmw" id="n-{v}"><span class="nm" data-name tabindex="0" role="button" aria-describedby="hint">{H.V[v][0]}</span><span class="pen" aria-hidden="true">✎</span></h3>
<p class="role">{ORIG[v]}</p><p class="role"><span class="status" data-st></span></p>
<label for="nm-{v}">Nom affiché (1 à 32 caractères)</label><input type="text" id="nm-{v}" data-nmi maxlength="40" value="{H.V[v][0]}" autocomplete="off">
<p class="cst" data-nmsg role="status" aria-live="polite"></p>
<label for="f-{v}">Famille</label><select id="f-{v}" data-k="famille">{"".join(f'<option value="{k}">{FAM[k][0]}</option>' for k in FAM)}</select>
<label for="v-{v}">Look</label><select id="v-{v}" data-k="variante">{"".join(f'<option value="{k}">{H.V[k][0]} — {H.V[k][1]}</option>' for k in V)}</select>
<label for="p-{v}">Pose (Billy Figurine)</label><select id="p-{v}" data-k="pose"></select>
<label for="c-{v}">Couleur de l'agent</label><div class="row"><input type="color" id="c-{v}" data-k="couleur" value="{H.V[v][2]}"><input type="text" id="h-{v}" data-hex aria-label="Couleur hexadécimale de l'agent {v}" value="{H.V[v][2]}" maxlength="7"></div>
<p class="cst" data-cst role="status" aria-live="polite"></p>
<button type="button" class="btn" data-png style="margin-top:6px;width:100%">Photo de profil PNG (512 px)</button></article>''' for v in V)
studio=f'''<p><span class="ex">exemple</span> Agents, affectations et états de démonstration. Les choix restent dans ce navigateur (localStorage). Modèle de production : FIGURINE.md.</p>
<p class="kick">Atelier</p><h1>Votre équipe, vos noms, vos couleurs.</h1><p class="lede">Renommez chaque agent (cliquez sur son nom, Entrée pour valider, Échap pour annuler), choisissez famille, look, pose et couleur, ou passez toute l'équipe à la couleur de marque. Contraste AA vérifié et corrigé à chaque choix.</p>
<p id="hint" class="meta" hidden>Entrée ou clic pour renommer ; Entrée valide, Échap annule.</p>
<div class="studio"><aside class="panel card" aria-labelledby="pg"><h2 id="pg" style="margin-top:0">Réglages globaux</h2>
<fieldset><legend>Mode marque</legend><div class="sw"><input type="checkbox" id="brand"><label for="brand" style="margin:0;color:var(--ink)">Tous les avatars à la couleur de marque</label></div>
<label for="bc">Couleur de marque (organisation)</label><div class="row"><input type="color" id="bc" value="#ffcf70"><input type="text" id="bch" aria-label="Couleur de marque hexadécimale" value="#ffcf70" maxlength="7"></div><p class="cst" id="bcst" role="status" aria-live="polite"></p>
<p class="meta">Les couleurs d'état (erreur, bloqué, terminé) ne sont jamais remplacées par la marque.</p></fieldset>
<fieldset><legend>Aperçu d'état <span class="ex">exemple</span></legend><label for="st">État affiché</label><select id="st">{"".join(f'<option value="{s}">{STN[s]}</option>' for s in ST)}</select>
<div class="row" style="margin-top:8px"><button type="button" class="btn" id="step">Étape suivante (exemple)</button><span class="meta" id="stepv" aria-live="polite"></span></div>
<div class="sw"><input type="checkbox" id="expst"><label for="expst" style="margin:0;color:var(--ink)">Expressions de l'affiche liées à l'état</label></div>
<p class="meta">Dans l'app, l'état vient uniquement de <code>useAgentState(agentId)</code>.</p></fieldset>
<fieldset><legend>Écoute réelle</legend><button type="button" class="btn" id="mic" aria-pressed="false">Activer la démo micro</button><p class="meta" id="micst" role="status" aria-live="polite">Désactivée : les ondes de l'état « écoute » sont un exemple.</p></fieldset>
<fieldset><legend>Mouvement et son</legend><div class="sw"><input type="checkbox" id="rm"><label for="rm" style="margin:0;color:var(--ink)">Réduire les animations</label></div><div class="sw"><input type="checkbox" id="snd"><label for="snd" style="margin:0;color:var(--ink)">Son discret (désactivé par défaut)</label></div><p class="meta">Respecte aussi <code>prefers-reduced-motion</code>.</p></fieldset>
<button id="reset" type="button" class="btn">Réinitialiser</button></aside>
<div><section aria-labelledby="eq"><h2 id="eq" style="margin-top:0">Équipe</h2><div class="agents">{cards}</div></section>
<section class="card" aria-labelledby="ob"><h2 id="ob">Orbite de l'équipe — passage de relais</h2><p class="meta">Lors d'une délégation réelle (<code>delegation.created</code>), une comète de la couleur de l'agent émetteur voyage jusqu'au receveur. Ici, démonstration <span class="ex">exemple</span>.</p>
<div class="orbit" id="orbit"><div class="ring"></div><div class="comet-arm"><i></i></div><div class="core">Oria HQ<br>orchestration</div></div>
<div class="relay"><div><label for="rf">De</label><select id="rf"></select></div><div><label for="rt">Vers</label><select id="rt"></select></div><button type="button" class="btn" id="go">Déléguer (exemple)</button></div>
<p class="meta" id="relayst" role="status" aria-live="polite" style="text-align:center"></p></section>
<section class="card" aria-labelledby="vu"><h2 id="vu">En petit, dans le fil de discussion</h2><div class="list" id="mini" role="list" aria-label="Fil de discussion : messages des agents"></div></section>
<section class="card" aria-labelledby="dm"><h2 id="dm">Modèle enregistré (préférences)</h2><pre id="json" tabindex="0" role="region" aria-label="Modèle JSON des préférences"></pre></section></div></div>'''
MSG={"idle":"En attente d'une mission.","listening":"Je vous écoute…","thinking":"J'analyse la demande…","executing":"Étape {k} sur 5 en cours.","waiting":"J'attends votre validation.","done":"Mission terminée.","error":"Échec : le runner s'est arrêté."}
js=f'''<script>
const POSES={json.dumps(POSES,ensure_ascii=False)},ORIG={json.dumps(ORIG,ensure_ascii=False)},EXPMAP={json.dumps(F.EXPMAP)},DFC={json.dumps({v:H.V[v][2] for v in V})},MSG={json.dumps(MSG,ensure_ascii=False)},LIB={json.dumps(LIB,ensure_ascii=False)},DEF={json.dumps(DEF,ensure_ascii=False)},STN={json.dumps(STN,ensure_ascii=False)},ROLEV={json.dumps({v:H.V[v][1] for v in V},ensure_ascii=False)};
const IDS=Object.keys(DEF),BG=[[15,19,20],[21,27,28],[5,6,8]];
const hex2=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)),lum=c=>{{const a=c.map(v=>{{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4}});return .2126*a[0]+.7152*a[1]+.0722*a[2]}};
const ratio=(a,b)=>{{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}},minR=c=>Math.min(...BG.map(b=>ratio(c,b)));
const toHex=c=>'#'+c.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
function fix(h,target){{let c=hex2(h),t=0;while(minR(c)<target&&t<1){{t+=.05;c=hex2(h).map(v=>v+(255-v)*t)}}return toHex(c)}}
function check(h){{const r=minR(hex2(h));const g=r>=3?h:fix(h,3),txt=r>=4.5?h:fix(h,4.5);return {{r,g,txt,ok:r>=4.5,msg:r>=4.5?`Contraste ${{r.toFixed(1)}}:1 — conforme AA.`:r>=3?`Contraste ${{r.toFixed(1)}}:1 — OK pour l'anneau ; nom éclairci en ${{txt}} (≥ 4,5:1).`:`Contraste ${{r.toFixed(1)}}:1 insuffisant — ajusté à ${{g}} (≥ 3:1), texte ${{txt}}.`}}}}
const esc=s=>s.replace(/[&<>"]/g,c=>({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}})[c]);
function fresh(){{return {{version:3,agents:structuredClone(DEF),marque:{{actif:false,couleur:'#ffcf70'}},options:{{expressionsEtat:false,son:false}}}}}}
let S=JSON.parse(localStorage.getItem('oria-avatars-v3')||'null');if(!S||S.version!==3)S=fresh();
let step=3,prevSt=null;const $=s=>document.querySelector(s),root=document.documentElement;
function nameCheck(id,val){{const t=val.trim().replace(/\\s+/g,' ');if(!t)return {{ok:false,msg:'Le nom ne peut pas être vide.'}};if(t.length>32)return {{ok:false,msg:`32 caractères maximum (${{t.length}}).`}};
 const d=IDS.filter(o=>o!==id&&S.agents[o].displayName.toLowerCase()===t.toLowerCase());return {{ok:true,t,warn:d.length?`Attention : « ${{t}} » est déjà le nom de l'agent ${{d.join(', ')}} — accepté, mais ambigu.`:''}}}}
function setName(id,val){{const c=nameCheck(id,val),card=document.querySelector(`[data-agent=${{id}}]`),m=card.querySelector('[data-nmsg]');
 if(!c.ok){{m.textContent=c.msg;m.className='cst err';return false}}S.agents[id].displayName=c.t;draw();const m2=document.querySelector(`[data-agent=${{id}}] [data-nmsg]`);m2.textContent=c.warn||`Renommé : « ${{c.t}} ».`;m2.className='cst '+(c.warn?'adj':'ok');return true}}
function poseFor(m,st){{if(m.famille!=='figurine')return null;if(S.options.expressionsEtat&&EXPMAP[st]&&EXPMAP[st][m.variante])return EXPMAP[st][m.variante];return m.pose}}
function html(m,st,k){{const nm=esc(m.displayName);let key=m.famille+'|'+m.variante+'|'+st+'|'+k;if(m.famille==='figurine'&&k==='L')key+='|'+poseFor(m,st);if(!LIB[key])key=m.famille+'|'+m.variante+'|'+st+'|S';return LIB[key].replaceAll('§',nm)}}
function applyStep(el,st){{if(st!=='executing')return;const ps=el.querySelectorAll('.fg-dial path,.facets .fc');el.querySelectorAll('.fg-dial path').forEach((p,i)=>p.setAttribute('class',i<step?('on'+(i===step-1?' new':'')):'off'));const im=el.querySelector('img');if(im)im.alt=im.alt.replace(/étape \\d+ sur/,`étape ${{step}} sur`)}}
function draw(){{const st=$('#st').value,b=S.marque,bk=check(b.couleur),changed=prevSt!==null&&prevSt!==st;
 $('#brand').checked=b.actif;$('#bc').value=b.couleur;$('#bch').value=b.couleur;$('#bcst').textContent=bk.msg;$('#bcst').className='cst '+(bk.ok?'ok':'adj');$('#expst').checked=S.options.expressionsEtat;$('#snd').checked=S.options.son;FG.sound=S.options.son;
 if(b.actif)root.style.setProperty('--brand-accent',bk.g);else root.style.removeProperty('--brand-accent');
 $('#step').hidden=st!=='executing';$('#stepv').textContent=st==='executing'?`Étape ${{step}} sur 5`:'';
 let mini='',orb='';IDS.forEach((a,i)=>{{const card=document.querySelector(`[data-agent=${{a}}]`),m=S.agents[a],k=check(m.couleur),tint=(b.actif||m.couleur!==DFC[m.variante])?1:0,t=b.actif?bk.txt:k.txt;
  if(!POSES[m.variante].some(p=>p[0]===m.pose))m.pose='corps';
  const ps=card.querySelector('[data-k=pose]');ps.innerHTML=POSES[m.variante].map(p=>`<option value="${{p[0]}}">${{esc(p[1])}}</option>`).join('');ps.value=m.pose;ps.disabled=m.famille!=='figurine';
  const stage=card.querySelector('.stage');stage.innerHTML=html(m,st,'L');const av=stage.firstElementChild;av.style.setProperty('--agent-accent',k.g);av.style.setProperty('--tint',tint);applyStep(av,st);
  if(changed&&!['done','error'].includes(st))av.classList.add('fg-enter');
  card.style.setProperty('--a2',b.actif?bk.g:k.g);
  const nmEl=card.querySelector('[data-name]');if(nmEl){{nmEl.textContent=m.displayName;nmEl.style.setProperty('--txt',t);nmEl.setAttribute('aria-label',`Renommer ${{m.displayName}}`)}}
  card.querySelector('[data-nmi]').value=m.displayName;
  card.querySelector('[data-st]').textContent='État : '+STN[st]+(st==='executing'?` — étape ${{step}} sur 5`:'');
  card.querySelector('[data-k=famille]').value=m.famille;card.querySelector('[data-k=variante]').value=m.variante;card.querySelector('[data-k=couleur]').value=m.couleur;card.querySelector('[data-hex]').value=m.couleur;
  const c=card.querySelector('[data-cst]');c.textContent=b.actif?'Mode marque actif : couleur de l\\'organisation appliquée.':k.msg;c.className='cst '+(b.actif||k.ok?'ok':'adj');
  card.querySelector('[data-png]').setAttribute('aria-label',`Télécharger la photo de profil PNG de ${{m.displayName}}`);
  mini+=`<div class="it" role="listitem"><span style="--agent-accent:${{k.g}};--tint:${{tint}};display:contents">${{html(m,st,'S')}}</span><strong class="nm" style="--txt:${{t}}">${{esc(m.displayName)}}</strong><span class="msg">${{MSG[st].replace('{{k}}',step)}}</span></div>`;
  const ang=i*60;orb+=`<div class="orb-slot" style="transform:rotate(${{ang}}deg) translateY(calc(min(420px,86vw)*-.38)) rotate(${{-ang}}deg)"><div><span style="--agent-accent:${{k.g}};--tint:${{tint}};display:contents">${{html(m,st,m.famille==='figurine'?'M':'S')}}</span><small class="nm" style="--txt:${{t}}">${{esc(m.displayName)}}</small></div></div>`}});
 $('#mini').innerHTML=mini;document.querySelectorAll('#mini .ov2,#mini .astre,#mini .glyphe,#orbit .ov2,#orbit .astre,#orbit .glyphe').forEach(e=>{{const p=e.parentElement;e.style.setProperty('--agent-accent',p.style.getPropertyValue('--agent-accent'));e.style.setProperty('--tint',p.style.getPropertyValue('--tint'));applyStep(e,st)}});
 const o=$('#orbit');o.querySelectorAll('.orb-slot').forEach(e=>e.remove());o.insertAdjacentHTML('beforeend',orb);
 const opts=IDS.map((a,i)=>`<option value="${{i}}">${{esc(S.agents[a].displayName)}}</option>`).join('');const rf=$('#rf').value||'0',rt=$('#rt').value||'1';$('#rf').innerHTML=opts;$('#rt').innerHTML=opts;$('#rf').value=rf;$('#rt').value=rt;
 root.classList.toggle('rm',$('#rm').checked);$('#json').textContent=JSON.stringify(S,null,1);localStorage.setItem('oria-avatars-v3',JSON.stringify(S));
 if(changed&&['done','error','waiting'].includes(st))FG.chime(st);prevSt=st}}
const valid=h=>/^#[0-9a-fA-F]{{6}}$/.test(h);
document.querySelectorAll('[data-agent]').forEach(card=>{{const a=card.dataset.agent;
 card.querySelectorAll('select,input[type=color],input[data-hex]').forEach(e=>e.addEventListener(e.type==='text'?'change':'input',()=>{{let k=e.dataset.k||'couleur',val=e.value;if(k==='couleur'&&!valid(val))return;S.agents[a][k]=k==='couleur'?val.toLowerCase():val;draw()}}));
 const ni=card.querySelector('[data-nmi]');ni.addEventListener('change',()=>{{if(!setName(a,ni.value))ni.value=S.agents[a].displayName}});ni.addEventListener('keydown',e=>{{if(e.key==='Escape'){{ni.value=S.agents[a].displayName;const m=card.querySelector('[data-nmsg]');m.textContent='Modification annulée.';m.className='cst'}}}});
 const h3=card.querySelector('.nmw');
 function edit(){{const sp=h3.querySelector('[data-name]');if(!sp)return;const old=S.agents[a].displayName;const inp=document.createElement('input');inp.type='text';inp.value=old;inp.maxLength=40;inp.setAttribute('aria-label',`Nouveau nom pour l'agent ${{a}} (Entrée valide, Échap annule)`);
  sp.replaceWith(inp);inp.focus();inp.select();let done=false;
  const end=(ok)=>{{if(done)return;done=true;if(ok&&inp.value.trim()!==old){{if(!setName(a,inp.value)){{done=false;inp.focus();return}}if(inp.isConnected)inp.replaceWith(sp);sp.textContent=S.agents[a].displayName}}else{{inp.replaceWith(sp);if(!ok){{const m=card.querySelector('[data-nmsg]');m.textContent='Modification annulée.';m.className='cst'}}}}requestAnimationFrame(()=>card.querySelector('[data-name]')?.focus())}};
  inp.addEventListener('keydown',e=>{{if(e.key==='Enter'){{e.preventDefault();end(true)}}else if(e.key==='Escape'){{e.preventDefault();end(false)}}}});inp.addEventListener('blur',()=>end(true))}}
 h3.addEventListener('click',e=>{{if(e.target.matches('[data-name],.pen'))edit()}});h3.addEventListener('keydown',e=>{{if(e.target.matches('[data-name]')&&(e.key==='Enter'||e.key===' '||e.key==='F2')){{e.preventDefault();edit()}}}});
 card.querySelector('[data-png]').addEventListener('click',async()=>{{const m=S.agents[a],el=card.querySelector('.stage .fg'),msg=card.querySelector('[data-cst]');
  if(!el){{msg.textContent='Export disponible pour la famille Billy Figurine.';return}}
  try{{const col=S.marque.actif?check(S.marque.couleur).g:check(m.couleur).g;const blob=await FG.exportPNG(el,m.displayName,col);const u=URL.createObjectURL(blob);const l=document.createElement('a');l.href=u;l.download=`oria-${{a}}-${{m.displayName.replace(/[^\\w-]+/g,'_')}}.png`;l.click();setTimeout(()=>URL.revokeObjectURL(u),2000);msg.textContent='Photo de profil téléchargée (512 × 512).';msg.className='cst ok'}}
  catch(e){{msg.textContent='Export impossible en file:// (sécurité du navigateur) : ouvrez la page via un serveur HTTP.';msg.className='cst adj'}}}});}});
$('#brand').onchange=e=>{{S.marque.actif=e.target.checked;draw()}};['#bc','#bch'].forEach(s=>$(s).addEventListener(s==='#bc'?'input':'change',e=>{{if(valid(e.target.value)){{S.marque.couleur=e.target.value.toLowerCase();draw()}}}}));
$('#st').onchange=()=>{{step=3;draw()}};$('#rm').onchange=draw;$('#expst').onchange=e=>{{S.options.expressionsEtat=e.target.checked;draw()}};$('#snd').onchange=e=>{{S.options.son=e.target.checked;draw()}};
$('#step').onclick=()=>{{step=step>=5?1:step+1;draw()}};
$('#reset').onclick=()=>{{S=fresh();step=3;draw()}};
$('#mic').onclick=async e=>{{const b=e.currentTarget;if(b.getAttribute('aria-pressed')==='true'){{FG.micOff();b.setAttribute('aria-pressed','false');b.textContent='Activer la démo micro';$('#micst').textContent='Désactivée : les ondes de l\\'état « écoute » sont un exemple.';return}}
 try{{await FG.micOn();b.setAttribute('aria-pressed','true');b.textContent='Couper le micro';$('#micst').textContent='Micro actif : en « Écoute », le néon suit votre voix (rien n\\'est enregistré).';$('#st').value='listening';draw()}}catch(err){{$('#micst').textContent='Micro refusé ou indisponible : les ondes restent un exemple.'}}}};
$('#go').onclick=()=>{{const f=+$('#rf').value,t=+$('#rt').value;if(f===t){{$('#relayst').textContent='Choisissez deux agents différents.';return}}const A=S.agents[IDS[f]],B=S.agents[IDS[t]];
 const col=S.marque.actif?check(S.marque.couleur).g:check(A.couleur).g;$('#relayst').textContent=`${{A.displayName}} délègue à ${{B.displayName}} (exemple).`;FG.relay($('#orbit'),f,t,col)}};
window.oriaRelay=(fromId,toId)=>{{const f=IDS.indexOf(fromId),t=IDS.indexOf(toId);if(f<0||t<0)return;const A=S.agents[fromId];return FG.relay($('#orbit'),f,t,check(A.couleur).g)}};
draw();
</script>'''
(OUT/"avatars-v2.html").write_text(page("Atelier d'avatars",studio,"avatars-v2",js))
print("ok",len(LIB))
