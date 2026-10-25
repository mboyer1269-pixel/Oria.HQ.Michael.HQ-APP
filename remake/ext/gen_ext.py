#!/usr/bin/env python3
"""Maquettes des 4 ajouts (Pont v3-ext). Données « exemple » sauf atelier/mission.json (« réelle »)."""
import sys, pathlib, importlib.util, html
sys.path.insert(0,str(pathlib.Path(__file__).parent));import astre as A
H=html.escape
BASE=pathlib.Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location("g",BASE/"gen.py");g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
OUT=pathlib.Path(__file__).parent/"mockups"; M=g.M; steps=g.steps; EX,RE,NC,PE=g.EX,g.RE,g.NC,g.PE
B="../../mockups/"
CSS=g.CSS+A.CSS+r"""
.avs{--s:36px;--c:var(--soft);position:relative;display:inline-grid;place-items:center;flex:none;width:var(--s);height:var(--s)}.avs>*{grid-area:1/1}.avs svg.face{display:block;border-radius:50%;width:var(--s);height:var(--s)}
.avs .st{position:absolute;right:-2px;bottom:-2px;width:12px;height:12px;border-radius:50%;border:2px solid var(--bg);background:var(--soft);font:700 8px/8px var(--mono);color:#06121f;text-align:center}
.avs .halo,.avs .orb,.avs .ring,.avs .sheen,.avs .rip{pointer-events:none;width:calc(var(--s) + 10px);height:calc(var(--s) + 10px);border-radius:50%}
.avs .halo{background:radial-gradient(closest-side,color-mix(in srgb,var(--c) 55%,transparent),transparent);opacity:0;will-change:opacity,transform}
.avs .ring,.avs .sheen{overflow:visible}.avs .ring circle,.avs .sheen circle{fill:none;stroke-width:2.5;stroke-linecap:round}.avs .ring .tr{stroke:color-mix(in srgb,var(--c) 25%,transparent)}.avs .ring .pg{stroke:var(--c);transform:rotate(-90deg);transform-origin:50% 50%}
.avs .sheen{opacity:0}.avs .sheen circle{stroke:#fff;stroke-dasharray:10 90;opacity:.85}
.avs .orb{opacity:0;will-change:transform}.avs .orb i{position:absolute;left:50%;top:-2px;width:5px;height:5px;margin-left:-2.5px;border-radius:50%;background:var(--c);box-shadow:0 0 6px var(--c)}.avs .orb i+i{top:auto;bottom:-2px;width:4px;height:4px;opacity:.7}
.avs .rip{border:2px solid var(--c);opacity:0;will-change:transform,opacity}
.avs[data-state=idle] .ring{display:none}
.avs[data-state=listening]{--c:var(--info)}.avs[data-state=thinking]{--c:#b9a2ff}.avs[data-state=executing]{--c:var(--accent)}.avs[data-state=waiting]{--c:var(--warn)}.avs[data-state=done]{--c:var(--accent)}.avs[data-state=error]{--c:#ff6b5e}
.avs:not([data-state=idle]) .st{background:var(--c)}
.avs[data-state=thinking] .orb,.avs[data-state=thinking] .halo{opacity:1}.avs[data-state=thinking] .ring .pg{display:none}
.avs[data-state=executing] .sheen,.avs[data-state=executing] .halo{opacity:1}
.avs[data-state=listening] .rip{opacity:.6}.avs[data-state=listening] .ring .pg{display:none}
.avs[data-state=error] .ring .tr{stroke:var(--c)}.avs[data-state=waiting] .ring .tr{stroke:var(--c);stroke-dasharray:4 4}
@media (prefers-reduced-motion:no-preference){
.avs[data-state=thinking] .halo{animation:av-breathe 3.2s ease-in-out infinite}.avs[data-state=thinking] .orb{animation:av-spin 4s linear infinite}
.avs[data-state=executing] .sheen{animation:av-spin 1.8s linear infinite}.avs[data-state=executing] .halo{animation:av-breathe 2.6s ease-in-out infinite}
.avs[data-state=listening] .rip{animation:av-ripple 1.6s ease-out infinite}.avs[data-state=listening] .rip+.rip{animation-delay:.8s}
.avs[data-state=done] svg.face{animation:av-settle .6s cubic-bezier(.2,.8,.2,1.2) 1 both}.avs[data-state=done] .halo{animation:av-fade 1.2s ease-out 1 both}
.avs[data-state=waiting] .halo{opacity:1;animation:av-breathe 4s ease-in-out infinite}
.avs[data-state=error] svg.face{animation:av-nudge .5s ease-in-out 1}
.avs .ring .pg{transition:stroke-dasharray .6s ease}}
@keyframes av-spin{to{transform:rotate(360deg)}}@keyframes av-breathe{0%,100%{opacity:.35;transform:scale(.94)}50%{opacity:1;transform:scale(1.06)}}
@keyframes av-ripple{0%{transform:scale(.9);opacity:.6}100%{transform:scale(1.35);opacity:0}}@keyframes av-settle{0%{transform:scale(1.1)}100%{transform:scale(1)}}
@keyframes av-fade{0%{opacity:1}100%{opacity:0}}@keyframes av-nudge{25%{transform:translateX(-2px)}75%{transform:translateX(2px)}}
.avst{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--soft)}.avst b{color:var(--ink);font-weight:600}
.split{display:grid;grid-template-columns:280px 1fr;gap:0;min-height:calc(100vh - 48px)}.threads{border-right:1px solid var(--line);padding:16px;background:var(--bg)}
.threads a{display:flex;gap:10px;align-items:center;padding:8px;border-radius:8px;text-decoration:none}.threads a[aria-current=true]{background:var(--panel2)}
.search{border:1px solid var(--line);border-radius:6px;padding:6px 10px;color:var(--soft);margin-bottom:12px;display:block;text-decoration:none}
.thread{padding:20px 28px;display:flex;flex-direction:column;min-width:0}
.mic{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;border:1px solid var(--line);text-decoration:none;font-size:18px}
.mic.on{background:var(--info);color:#06121f;border-color:var(--info)}
.wave{font:12px var(--mono);color:var(--info)}
.exec{border:1px solid var(--line);border-radius:10px;padding:12px;background:var(--panel);max-width:680px;margin:8px 0}
.exec ol{margin:8px 0 0;padding-left:20px}.exec li{margin:4px 0}
.opts{display:flex;gap:12px;flex-wrap:wrap;margin:8px 0}.opt{border:1px solid var(--line);border-radius:10px;padding:8px;text-align:center;text-decoration:none;font-size:13px}.opt[aria-current=true]{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.board{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.col{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px;min-width:0}.col h3{font-size:13px;color:var(--soft)}
.tk{background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:8px;margin-top:8px;font-size:13px;display:block;text-decoration:none}
.panes{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:auto auto;gap:10px}.pane{border:1px solid var(--line);border-radius:10px;background:var(--panel);min-width:0;overflow:hidden}
.pane>h3{font:12px var(--mono);color:var(--soft);padding:8px 12px;border-bottom:1px solid var(--line);margin:0;display:flex;justify-content:space-between}
.term{font:12px/1.6 var(--mono);padding:10px 12px;white-space:pre-wrap;margin:0;overflow-wrap:anywhere}
.space{position:relative;height:520px;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:radial-gradient(ellipse at 50% 40%,#12201b 0,#07090a 70%)}
.space .ring{position:absolute;border:1px dashed #2c3d36;border-radius:50%;left:50%;top:50%;transform:translate(-50%,-50%)}
.node{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px;text-decoration:none;font-size:13px;text-align:center}
.node .lbl{background:color-mix(in srgb,var(--panel) 88%,transparent);border:1px solid var(--line);border-radius:6px;padding:2px 8px}
.node.far{opacity:.85;transform:translate(-50%,-50%) scale(.85)}
.spark{display:flex;align-items:flex-end;gap:3px;height:60px}.spark i{display:block;width:10px;background:var(--accent);border-radius:2px 2px 0 0}.spark i.w{background:var(--warn)}
@media (max-width:760px){.split{grid-template-columns:1fr}.threads{display:none}.thread{padding:12px}.board{grid-template-columns:1fr}.panes{grid-template-columns:1fr}.space{height:420px}}
"""
# avatars SVG (formes simples, aucune personne réelle)
PAL={"lea":("#7cc4ff","#0b2a44","◐"),"hugo":("#ffb340","#3a2200","▲"),"nova":("#4dff9a","#03140a","✦"),"kit":("#c58cff","#24103a","☾"),"rex":("#ff8f80","#3a0c06","■")}
STL={"idle":"au repos","executing":"exécute","waiting":"bloqué — attend votre décision","thinking":"réfléchit","listening":"écoute","done":"a terminé","error":"en erreur"}
BADGE={"done":"✓","error":"!","waiting":"‖"}
AG={"lea":("agent-lea","analyste-clients","Léa",None),"hugo":("agent-hugo","marketing","Hugo",None),"nova":("agent-nova","dev-code","Nova",None),"rex":("agent-rex","qa-tests","Rex",None),"kito":("agent-kit","redaction","Kit",None),"kit":("agent-lea","analyste-clients","Léa (emblème chaton astronaute)","chaton")}
def av(k,size=36,state="idle",label=None,prog=None):
    aid,role,nm,emb=AG[k]; return A.astre(aid,role,max(size,28),state,prog,emb,label=label,name=nm)
def avst(nm,state,detail=""):
    return f'<span class="avst" role="status" aria-live="polite"><b>{nm}</b> {STL[state]}{" — "+detail if detail else ""}</span>'

NAV=[(B+"pont.html","Pont","◎","pont"),(B+"attention.html","Attention","⚑","attention"),("chat.html","Parler","❝","chat"),(B+"missions.html","Missions","▤","missions"),
     ("code.html","Code","⌘","code"),("orbite.html","Orbite","◍","orbite"),("skills.html","Skills","✚","skills"),(B+"connexions.html","Connexions","⇄","cx")]
def shell(cur,title,body,full=True,mode=None):
    rail="".join(f'<a href="{h}" {"aria-current=page" if c==cur else ""}><span class="i" aria-hidden="true">{i}</span>{l}</a>' for h,l,i,c in NAV)
    tabs="".join(f'<a href="{h}" {"aria-current=page" if c==cur else ""}><span aria-hidden="true">{i}</span>{l}</a>' for h,l,i,c in [NAV[0],NAV[2],NAV[4],NAV[5]])+'<a href="index.html"><span aria-hidden="true">⋯</span>Plus</a>'
    return f"""<!doctype html><html lang="fr"{' data-mode="'+mode+'"' if mode else ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{H(title)} — Oria</title><style>{CSS}</style></head>
<body><a class="skip" href="#main">Aller au contenu</a><div class="app"><header class="bar"><a class="ctx" href="{B}palette.html" aria-label="Contexte actif : Dadz Co. (exemple). Changer de contexte"><span class="dot" aria-hidden="true"></span>Dadz Co. <span class="t-soft" aria-hidden="true">▾</span></a><h1>{H(title)}</h1><span class="sp"></span>
<a class="cmd" href="{B}palette.html"><span aria-hidden="true">⌕</span>Rechercher ou agir… <span class="k">Ctrl K</span></a><a class="att on" href="{B}attention.html"><span aria-hidden="true">⚑</span>4 à traiter</a><span class="clock">dim. 13 h 20 HAE</span></header>
<nav class="rail" aria-label="Navigation principale">{rail}</nav><main id="main" class="full">{body}</main></div><nav class="tabbar" aria-label="Navigation mobile">{tabs}</nav></body></html>"""

THREADS=[("lea","Léa","Rapport des ventes","13 h 18",True),("hugo","Hugo","Ton de l'infolettre","hier",False),("nova","Nova (code)","Calculatrice de pourboire","05 h 07",False)]
def threads(cur):
    return '<aside class="threads" aria-label="Fils de conversation"><a class="search" href="chat-recherche.html">⌕ Chercher dans l\'historique</a><a class="btn p" href="chat.html" style="width:100%;justify-content:center;margin-bottom:12px">＋ Nouveau fil</a>'+"".join(f'<a href="{"chat-avatar.html" if k=="kit" else "chat.html"}" {"aria-current=true" if k==cur else ""}>{av(k,32)}<span style="flex:1;min-width:0"><strong>{n}</strong><br><span class="meta">{t} · {w}</span></span></a>' for k,n,t,w,_ in THREADS)+f'<p class="meta" style="margin-top:12px">Fils {EX}</p></aside>'
COMPOSER=f'''<div class="composer"><a class="mic" href="chat-voix.html" aria-label="Parler (dictée vocale)">🎙</a><a class="btn" href="chat.html" aria-label="Joindre un fichier">📎</a><label for="m">Écrire ou parler à Léa…</label><input id="m" aria-label="Message" style="flex:3;background:transparent;border:0;color:var(--ink)"><a class="btn p" href="chat.html">Envoyer</a></div>'''
def head(k,nm,role,state,prog=None,detail=""):
    return f'<div class="row between">{av(k,44,state,prog=prog)}<div style="flex:1"><h2 style="font-size:20px">{nm}</h2>{avst(nm,state,detail)}<div class="meta">{role} · runtime Codex CLI · modèle demandé gpt-5.6-luna, observé — {NC}</div></div>{EX}</div>'
P={}
P["chat"]=("Parler — Léa",shell("chat","Parler — Léa",f'''<div class="split">{threads("lea")}<section class="thread" aria-label="Fil avec Léa">{head("lea","Léa","Analyste clients","executing",(3,4),"étape 3 sur 4 : rédaction du PDF (événement reçu 13 h 17)")}
<div role="log" aria-label="Messages" style="margin-top:12px">
<div class="msg me"><span class="meta">🎙 dicté · 13 h 12 HAE</span><br>Léa, sors-moi les ventes d'octobre par produit et prépare le rapport pour lundi. Ajoute les 3 produits en hausse.</div>
<div class="msg">{av("lea",24)} <strong>Léa</strong> · 13 h 12<br>Compris. Je lis Shopify (lecture seule), puis j'écris le PDF dans Drive. Aucun envoi externe. Je lance ?</div>
<section class="exec go card" aria-labelledby="t1"><div class="row between"><h3 id="t1">▶ Tâche envoyée : Rapport ventes octobre</h3><span class="tag t-go">En cours</span></div>
<p class="meta">Dispatch 13 h 13 HAE · responsable Léa · budget ≤ 2 $ · mission liée <a href="{B}mission.html">#rapport-hebdo</a></p>
<ol aria-label="Étapes (événements reçus)"><li>✓ Lecture Shopify — 1 248 commandes <span class="meta">13 h 13</span></li><li>✓ Agrégation par produit <span class="meta">13 h 15</span></li><li aria-current="step"><strong>● Rédaction du PDF</strong> <span class="meta">événement reçu 13 h 17 — pas de % inventé</span></li><li class="t-soft">○ Dépôt dans Drive</li></ol>
<div class="row" style="margin-top:8px"><a class="btn" href="code-live.html">Voir le détail live</a><a class="btn d" href="{B}etats.html">Arrêter</a></div></section>
<section class="exec card" aria-labelledby="t0"><div class="row between"><h3 id="t0">✓ Résultat : Avis clients — semaine 43</h3><span class="tag t-info">À relire</span></div>
<p>3 thèmes : délais de livraison, tailles, qualité des coutures.</p><ul class="list"><li>📄 avis-s43.pdf · 2 pages</li><li>📊 avis-s43.csv · 214 lignes</li></ul>
<div class="row"><a class="btn p" href="{B}attention.html">Approuver</a><a class="btn" href="chat.html">Demander une correction</a><a class="btn" href="{B}mission.html">Ouvrir la mission</a></div></section></div>
{COMPOSER}<p class="meta">Mémoire utilisée : fiche Dadz Co., 2 notes · <a href="chat-recherche.html">voir le contexte</a> {EX}</p></section></div>'''))

P["chat-voix"]=("Parler — dictée vocale",shell("chat","Parler — voix",f'''<div class="split">{threads("lea")}<section class="thread" aria-label="Dictée vocale">{head("lea","Léa","Analyste clients","listening",detail="micro actif")}
<div class="card info" style="margin-top:16px" aria-live="polite"><div class="row"><a class="mic on" href="chat.html" aria-label="Arrêter la dictée">■</a><div><strong>Vous parlez…</strong><div class="wave" aria-hidden="true">▁▃▅▇▅▃▁▂▄▆▄▂</div></div></div>
<p style="margin-top:12px">« Léa, change ton avatar en un chaton astronaute »</p><p class="meta">Transcription en direct, modifiable avant envoi. L'onde suit le micro réel ; statique si mouvement réduit.</p>
<div class="row"><a class="btn p" href="chat-avatar.html">Envoyer</a><a class="btn" href="chat.html">Annuler</a></div></div>
<p class="meta">Micro : autorisation du navigateur requise · transcription : {NC} (fournisseur à brancher) {EX}</p></section></div>'''))

P["chat-avatar"]=("Parler — changer d'avatar",shell("chat","Parler — avatar",f'''<div class="split">{threads("kit")}<section class="thread" aria-label="Changement d'avatar">{head("kit","Léa","Analyste clients","idle")}
<div role="log" aria-label="Messages" style="margin-top:12px"><div class="msg me">{av("lea",24,label="Léa (ancien)")} <span class="meta">🎙 13 h 20</span><br>Change ton avatar en un chaton astronaute.</div>
<div class="msg">{av("lea",24,"thinking")} <strong>Léa</strong><br>Voici 3 propositions générées depuis la description « chaton astronaute, casque translucide, fond bleu ». Choisissez :</div>
<div class="opts" role="group" aria-label="Propositions d'avatar"><a class="opt" href="chat-avatar.html" aria-current="true">{av("kit",72)}<br>Option 1</a><a class="opt" href="chat-avatar.html">{av("nova",72,label="Option 2")}<br>Option 2</a><a class="opt" href="chat-avatar.html">{av("rex",72,label="Option 3")}<br>Option 3</a></div>
<div class="row"><a class="btn p" href="orbite.html">Utiliser l'option 1</a><a class="btn" href="chat-avatar.html">Autres propositions</a><a class="btn" href="chat.html">Garder l'actuel</a></div>
<div class="msg">{av("kit",24)} <strong>Léa</strong> · 13 h 21<br>C'est fait. Mon nouvel avatar apparaît partout : fils, équipe, orbite, cartes de tâche. Ancienne version conservée (v1) pour revenir en arrière.</div></div>
{COMPOSER}<p class="meta">Avatars : formes SVG {EX} · génération d'image : <strong>à construire</strong> (aucun fournisseur d'image dans le routeur)</p></section></div>'''))

P["chat-recherche"]=("Parler — historique",shell("chat","Historique et mémoire",f'''<div class="content"><h2>Historique et mémoire</h2><p class="lede">Chercher dans tous les fils du contexte actif. La mémoire utilisée par un agent est visible et révocable.</p>
<div class="card"><label for="q" class="meta">Recherche</label><input id="q" value="budget pub" style="width:100%;background:var(--panel2);border:1px solid var(--line);color:var(--ink);padding:8px;border-radius:6px"></div>
<ul class="list">{"".join(f'<li><a class="row" href="chat.html">{av(k,28)}<span style="flex:1"><strong>{n}</strong> — « …{t}… »</span><span class="meta">{d}</span></a></li>' for k,n,t,d in [("hugo","Hugo","augmenter le <mark>budget pub</mark> de 20 %","24 oct."),("lea","Léa","coût par clic, <mark>budget pub</mark> d'octobre","22 oct.")])}</ul>
<h3 style="margin-top:20px">Mémoire de Léa</h3><ul class="list"><li class="row between"><span>Fiche Dadz Co. — objectif 300 commandes</span><a class="btn" href="{B}fiche.html">Ouvrir</a></li><li class="row between"><span>Note : rapport le lundi 8 h</span><a class="btn d" href="chat-recherche.html">Oublier</a></li></ul><p>{EX}</p></div>'''))

# CODE
cols=[("Plan",[("nova","Spec : calculatrice de pourboire","✓","idle",None)]),("En cours",[("nova","Correction : arrondi au cent","● Nova · étape 2/3","executing",(2,3)),("rex","Tests e2e mobile","◌ Rex réfléchit","thinking",None)]),("À relire",[("nova","PR atelier/329674b0","‖ bloqué : votre approbation","waiting",None)]),("Fait",[("rex","Tests unitaires (runner)","✓ terminé","done",None),("hugo","Lint CSS","! échec : runner_died","error",None)])]
P["code"]=("Code — plan et tâches",shell("code","Code — Calculatrice de pourboire",f'''<div class="content" style="max-width:1200px"><div class="row between"><div><p class="eyebrow">Projet de code · de A à Z</p><h2>Calculatrice de pourboire</h2></div>{RE}</div>
<p class="lede">{H(M.get("need",""))[:180]}</p>
<div class="grid2"><section class="card" aria-labelledby="sp"><h3 id="sp">Plan / spec — approuvé</h3><ol><li>Formulaire montant + pourcentage</li><li>Partage entre N personnes</li><li>Une page HTML d'aperçu</li></ol><p class="meta">Approuvé par vous avant exécution (comme Jules/Devin). Étape spec : {g.hae(steps[0]["startedAt"])} {RE}</p><a class="btn" href="code-live.html">Voir l'exécution</a></section>
<section class="card" aria-labelledby="br"><h3 id="br">Branche et PR</h3><dl class="kv"><dt>Branche</dt><dd class="mono">atelier/329674b0</dd><dt>Base</dt><dd class="mono">main @ 5754292f</dd><dt>Tête</dt><dd class="mono">{g.head}</dd><dt>Tests</dt><dd class="t-go">✓ 2 passes runner</dd><dt>PR</dt><dd>pas encore ouverte</dd></dl>{RE}</section></div>
<p class="eyebrow">Tableau par agent {EX}</p><div class="board">{"".join(f'<section class="col" aria-label="{c}"><h3>{c}</h3>'+"".join(f'<a class="tk" href="code-live.html"><span class="row">{av(k,28,st,prog=pr)}<span style="flex:1">{t}</span></span><span class="meta">{s}</span></a>' for k,t,s,st,pr in items)+'</section>' for c,items in cols)}</div>
<div class="row" style="margin-top:16px"><a class="btn p" href="chat.html">＋ Demander une tâche (dans le fil de Nova)</a><a class="btn" href="{B}atelier-session.html">Contrat atelier (session réelle)</a></div></div>'''))

term="".join(f'$ step {s["kind"]} · {"codex" if s["executor"]=="codex_cli" else "runner"} · {g.hae(s["startedAt"])}\n  → {s["status"]}{" ("+s["reason"]+")" if s.get("reason") else ""}{" · reprise de "+s["resumedFrom"][:8] if s.get("resumedFrom") else ""}\n' for s in steps)
P["code-live"]=("Code — exécution",shell("code","Code — exécution",f'''<div class="content" style="max-width:1280px"><div class="row between"><h2>Exécution · Calculatrice de pourboire</h2><span class="tag t-info">À relire</span>{RE}</div>
<p class="lede">Rien ne tourne maintenant : la session est terminée ({g.hae(steps[-1]["endedAt"])}). Le terminal rejoue les événements réels de mission.json.</p>
<div class="panes"><section class="pane" aria-labelledby="p1"><h3 id="p1"><span>Terminal — événements</span><span>{RE}</span></h3><pre class="term" tabindex="0">{H(term)}</pre></section>
<section class="pane" aria-labelledby="p2"><h3 id="p2"><span>Aperçu navigateur</span><span>illustratif</span></h3><div class="preview" style="margin:10px;border-radius:8px"><strong>Calculatrice de pourboire</strong><label>Montant</label><div class="f">48,00</div><label>Pourboire</label><div class="f">15 %</div><p><strong>Total : 55,20</strong></p></div></section>
<section class="pane" aria-labelledby="p3"><h3 id="p3"><span>Éditeur — diff</span><span>{EX}</span></h3><pre class="term" tabindex="0"><span class="del">- const tip = bill * pct;</span>
<span class="add">+ const tip = Math.round(bill * pct * 100) / 100;</span></pre></section>
<section class="pane" aria-labelledby="p4"><h3 id="p4"><span>Approbations</span><span>{RE}</span></h3><div style="padding:12px"><dl class="kv"><dt>Modèle</dt><dd>demandé {", ".join(g.req)} · observé {", ".join(g.obs)} ✓</dd><dt>Artefacts</dt><dd>{len(g.arts)} avec sha256</dd></dl><div class="row" style="margin-top:12px"><a class="btn p" href="{B}atelier-session.html">Accepter</a><a class="btn" href="chat.html">Demander une correction</a><a class="btn d" href="{B}etats.html">Rejeter</a></div></div></section></div></div>'''))

SK=[("Rapport des ventes","v1.3.0","Oria (interne)","Léa","42 exécutions","money"),("Rédaction infolettre","v0.9.2","Communauté · vérifiée","Hugo","7","marketing"),("Revue de code","v2.0.0","Oria (interne)","Nova, Rex","19","dev-code"),("Envoi de courriel","v1.0.0","Oria (interne)","— désactivé","0","customer-ops")]
P["skills"]=("Skills",shell("skills","Skills",f'''<div class="content" style="max-width:1100px"><h2>Bibliothèque de skills</h2><p class="lede">Une skill = une capacité versionnée, avec contrat d'entrée/sortie, effets de bord et approbation. Activée par agent.</p>
<table><thead><tr><th>Skill</th><th>Version</th><th>Provenance</th><th>Agents</th><th>Usage (30 j)</th><th></th></tr></thead><tbody>{"".join(f'<tr><td><a href="skill.html">{n}</a></td><td class="mono">{v}</td><td>{p}</td><td>{a}</td><td class="mono">{u}</td><td>{EX}</td></tr>' for n,v,p,a,u,c in SK)}</tbody></table>
<div class="row" style="margin-top:16px"><a class="btn p" href="skill.html">＋ Installer une skill</a><a class="btn" href="ameliorations.html">Autres améliorations HQ</a></div></div>'''))
P["skill"]=("Skill — Rapport des ventes",shell("skills","Skill — Rapport des ventes",f'''<div class="content" style="max-width:1100px"><a class="btn mobile-back" href="skills.html">← Skills</a><div class="row between"><h2>Rapport des ventes</h2>{EX}</div>
<div class="grid2"><section class="card" aria-labelledby="k1"><h3 id="k1">Activation par agent</h3><ul class="list">{"".join(f'<li class="row">{av(k,28)}<span style="flex:1">{n}</span><span class="tag t-{t}">{s}</span></li>' for k,n,s,t in [("lea","Léa","✓ Activée","go"),("hugo","Hugo","○ Désactivée","soft"),("nova","Nova","○ Non permise","soft")])}</ul></section>
<section class="card" aria-labelledby="k2"><h3 id="k2">Contrat et gouvernance</h3><dl class="kv"><dt>Entrées</dt><dd>période, contexte</dd><dt>Sorties</dt><dd>PDF, CSV</dd><dt>Effets de bord</dt><dd>écriture Drive</dd><dt>Approbation</dt><dd>requise avant envoi externe</dd><dt>Journal</dt><dd>skill.started, skill.completed</dd></dl></section></div>
<section class="card" aria-labelledby="k3"><h3 id="k3">Versions et provenance</h3><table><thead><tr><th>Version</th><th>Date</th><th>Auteur</th><th>Empreinte</th><th>Changement</th></tr></thead><tbody><tr><td class="mono">v1.3.0</td><td>20 oct.</td><td>Oria</td><td class="mono">a91c…</td><td>Top 3 produits</td></tr><tr><td class="mono">v1.2.1</td><td>2 oct.</td><td>Oria</td><td class="mono">5d02…</td><td>Correctif devises</td></tr></tbody></table><div class="row" style="margin-top:8px"><a class="btn" href="skill.html">Revenir à v1.2.1</a></div></section></div>'''))
IMP=[("Inbox unique","Attention fusionne approbations, intentions d'exécution et brouillons de mission","partiel"),("Coût en direct","call-accounting → badge coût par fil et par tâche","à construire"),("Fiche agent persistée","table agents (aujourd'hui seed.ts)","à construire"),("Recherche plein texte","fils + mémoire via /api/memory/search","partiel"),("Reprise de session","bouton Reprendre branché sur resumedFrom","partiel"),("Export / audit","grand livre hash-chain lisible","existe")]
P["ameliorations"]=("Améliorations HQ",shell("skills","Autres améliorations HQ",f'''<div class="content"><h2>Autres améliorations HQ</h2><p class="lede">Proposées à partir de l'exploration du dépôt. Détail dans INTEGRATION.md.</p><table><thead><tr><th>Amélioration</th><th>Quoi</th><th>Existant</th></tr></thead><tbody>{"".join(f'<tr><td>{a}</td><td>{b}</td><td><span class="tag t-{"go" if c=="existe" else "warn" if c=="partiel" else "soft"}">{c}</span></td></tr>' for a,b,c in IMP)}</tbody></table><a class="btn" href="skills.html" style="margin-top:16px">← Skills</a></div>'''))

# ORBITE (direction futuriste)
nodes=[("lea",50,18,"Léa","executing","Rapport ventes · 3/4"),("hugo",82,45,"Hugo","waiting","Budget pub"),("nova",62,80,"Nova","idle","À relire"),("rex",22,70,"Rex","done","Tests terminés"),("kito",18,32,"Kit","thinking","Infolettre")]
nd="".join(f'<a class="node{" far" if s=="idle" else ""}" href="{"chat.html" if k!="nova" else "code.html"}" style="left:{x}%;top:{y}%">{av(k,56 if s!="idle" else 44,s,prog=(3,4) if k=="lea" else None)}<span class="lbl"><strong>{n}</strong> · {t}</span></a>' for k,x,y,n,s,t in nodes)
P["orbite"]=("Orbite",shell("orbite","Orbite — équipe et missions",f'''<div class="content" style="max-width:1200px"><div class="row between"><div><p class="eyebrow">Direction « Orbite » · au-delà du Pont</p><h2>Qui fait quoi, en ce moment</h2></div>{EX}</div>
<p class="lede">Proche du centre = demande votre attention ; en périphérie = au repos. Chaque astre ne s'anime que sur un événement réel de son agent. Liste équivalente ci-dessous (lecteurs d'écran, clavier).</p>
<div class="space" role="group" aria-label="Carte de l'équipe"><div class="ring" style="width:260px;height:260px" aria-hidden="true"></div><div class="ring" style="width:480px;height:480px" aria-hidden="true"></div>
<a class="node" href="{B}pont.html" style="left:50%;top:50%"><span class="av" style="width:64px;height:64px;font-size:16px">MB</span><span class="lbl">Vous · 1 décision</span></a>{nd}</div>
<ul class="list" style="margin-top:12px">{"".join(f'<li class="row">{av(k,28,s,prog=(3,4) if k=="lea" else None)}<span style="flex:1"><strong>{n}</strong> — {t}</span><span class="meta">{STL[s]}</span></li>' for k,x,y,n,s,t in nodes)}</ul>
<a class="btn" href="orbite-pouls.html">Pouls des événements réels →</a> <a class="btn" href="avatar-etats.html">États des avatars →</a> <a class="btn" href="avatar-oria.html">Astrolabe →</a></div>'''))
bars="".join(f'<i class="{"w" if s["status"]!="succeeded" else ""}" style="height:{max(8,min(60,int(__import__("math").log2(1+ (__import__("datetime").datetime.fromisoformat(s["endedAt"].replace("Z","+00:00"))-__import__("datetime").datetime.fromisoformat(s["startedAt"].replace("Z","+00:00"))).total_seconds())*9)))}px" title="{s["kind"]}"></i>' for s in steps)
P["orbite-pouls"]=("Orbite — pouls",shell("orbite","Orbite — pouls",f'''<div class="content" style="max-width:1100px"><h2>Pouls des événements réels</h2><p class="lede">Visualisation ambiante : chaque barre = une étape réellement exécutée (hauteur = durée, échelle log). Ambre = interrompue. Aucune donnée inventée.</p>
<section class="card" aria-labelledby="pp"><div class="row between"><h3 id="pp">Calculatrice de pourboire — 8 étapes</h3>{RE}</div><div class="spark" role="img" aria-label="8 étapes, 7 réussies, 1 interrompue (revision, runner_died)">{bars}</div>
<p class="meta">{g.hae(steps[0]["startedAt"])} → {g.hae(steps[-1]["endedAt"])} · source mission.json</p></section>
<section class="card" aria-labelledby="pq"><h3 id="pq">Activité de l'équipe (7 jours)</h3><div class="spark" role="img" aria-label="Barres d'exemple">{"".join(f'<i style="height:{h}px"></i>' for h in [12,30,22,44,18,50,26])}</div><p>{EX}</p></section>
<a class="btn" href="orbite.html">← Orbite</a></div>'''))

EV=[("idle","Aucune tâche ni flux actif","aucun événement depuis terminal (completed/cancelled) + délai de retour","existe (état mission)"),
("listening","Micro ouvert par l'utilisateur","client : MediaRecorder start → stop","à construire (pas de voix)"),
("thinking","Requête modèle en vol, aucun token/étape encore","/api/joris/chat : requête envoyée → 1er chunk ; mission queued","partiel (chat sans flux d'état)"),
("executing","Étape en cours ; anneau = étapes terminées / total","mission running + ledger.append (étape started/succeeded) via /api/hq/theatre/stream","existe (SSE theatre + steps)"),
("waiting","Bloqué sur approbation humaine","needs_approval ; intent.upsert (draft-control)","existe"),
("done","Settle 0,6 s une seule fois, puis idle","running → completed","existe"),
("error","Anneau rouge statique, secousse unique","failed ; step interrupted (runner_died) ; SSE error","existe")]
P["avatar-etats"]=("Avatars — états vivants",shell("orbite","Avatars — états vivants",f'''<div class="content" style="max-width:1200px"><h2>États vivants des avatars</h2><p class="lede">Chaque état est piloté uniquement par un événement réel (colonne « Événement »). Animations transform/opacity seulement, cycles ≥ 1,6 s (aucun clignotement &gt; 3/s). Mouvement réduit : anneau et badge statiques + texte d'état.</p>
<div class="grid2" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">{"".join(f'<section class="card" aria-labelledby="e{i}"><div class="row">{av(["nova","lea","kit","nova","hugo","rex","hugo"][i],72,st,prog=(2,3) if st=="executing" else None)}<div><h3 id="e{i}" style="margin:0">{st}</h3><p class="meta" style="margin:4px 0 0">{vis}</p></div></div></section>' for i,(st,vis,ev,ex) in enumerate(EV))}</div>
<h3 style="margin-top:20px">Démo : la progression suit les événements</h3><div class="row" style="gap:16px">{"".join(av("nova",56,"executing",prog=(n,4)) for n in (1,2,3,4))}</div><p class="meta">Anneau à 1/4, 2/4, 3/4, 4/4 étapes terminées — jamais de pourcentage inventé entre deux événements.</p>
<h3 style="margin-top:20px">Correspondance événement → état</h3><table><thead><tr><th>État</th><th>Événement source</th><th>Existe ?</th></tr></thead><tbody>{"".join(f'<tr><td>{st}</td><td>{ev}</td><td>{ex}</td></tr>' for st,vis,ev,ex in EV)}</tbody></table><p>{EX} · <a href="orbite.html">← Orbite</a></p></div>'''))

ST7=["idle","listening","thinking","executing","waiting","done","error"]
AGS=[("lea","Léa · analyste-clients"),("hugo","Hugo · marketing"),("nova","Nova · dev-code"),("rex","Rex · qa-tests")]
grid="".join(f'<tr><th scope="row">{n}</th>'+"".join(f'<td>{av(k,64,s,prog=(3,5) if s=="executing" else None)}</td>' for s in ST7)+'</tr>' for k,n in AGS)
det="".join(f'<figure class="card" style="margin:0;text-align:center">{A.astre(i,r,72,"idle",name=i)}<figcaption class="meta">id <span class="mono">{i}</span><br>rôle <span class="mono">{r}</span><br>empreinte <span class="mono">{A.params(i,r)["hash"]}</span> · {A.params(i,r)["contours"]} courbes · {A.params(i,r)["facets"]} facettes</figcaption></figure>' for i,r in [("agent-lea","analyste-clients"),("agent-lea","analyste-clients"),("agent-lea","marketing"),("agent-nova","dev-code"),("agent-zed","finance")])
P["avatar-oria"]=("Astrolabe — avatars Oria",shell("orbite","Astrolabe — avatars Oria",f"""<div class="content" style="max-width:1240px"><div class="row between"><div><p class="eyebrow">Signature Oria</p><h2>Astrolabe : un astre vivant par agent</h2></div>{EX}</div>
<p class="lede">Un noyau lumineux (Signal) dans une coque de courbes de niveau (Cartographe), couronné de facettes. La forme est calculée à partir de l'identifiant et du rôle de l'agent : même agent, même astre, partout. Chaque état transforme la forme elle-même, et uniquement sur événement réel.</p>
<section class="card" aria-labelledby="h7"><h3 id="h7">4 agents × 7 états</h3><div style="overflow-x:auto" tabindex="0" role="region" aria-label="Tableau défilant : agents et états"><table><thead><tr><th scope="col">Agent</th>{"".join(f'<th scope="col">{s}</th>' for s in ST7)}</tr></thead><tbody>{grid}</tbody></table></div>
<p class="meta">listening : la coque ondule comme une onde · thinking : courants internes dans le noyau · executing : une facette s'allume par étape terminée (ici 3/5), la facette en cours luit · waiting : pulsation sourde, contours pointillés · done : cristallisation unique · error : fracture du noyau, contours rouges. Mouvement réduit : formes identiques, immobiles, et texte d'état.</p></section>
<section class="card" aria-labelledby="hd"><h3 id="hd">Génération déterministe</h3><p class="meta">sha256(id | rôle) → palette (jetons Signal), nombre de courbes, harmoniques, orientation, facettes au repos. Les deux premiers sont identiques : même entrée, même astre.</p><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px">{det}</div></section>
<section class="card" aria-labelledby="hc"><h3 id="hc">Personnaliser depuis la conversation</h3><div class="msg me">« Léa, change ton avatar en un chaton astronaute »</div>
<div class="row" style="gap:20px;align-items:center;margin:10px 0"><figure style="margin:0;text-align:center">{av("lea",88)}<figcaption class="meta">Avant (v1)</figcaption></figure><span aria-hidden="true" style="font-size:24px">→</span><figure style="margin:0;text-align:center">{av("kit",88,"thinking")}<figcaption class="meta">Léa compose l'emblème</figcaption></figure><span aria-hidden="true" style="font-size:24px">→</span><figure style="margin:0;text-align:center">{av("kit",88,"done")}<figcaption class="meta">Emblème posé (v2)</figcaption></figure></div>
<p class="meta">Le prompt devient un <strong>emblème</strong> dans le noyau ; la coque, la couronne et les états restent ceux d'Oria. La marque reste cohérente. Génération d'emblème : à construire (aucun fournisseur d'image branché).</p>
<div class="row"><a class="btn p" href="chat-avatar.html">Voir le flux dans le fil</a><a class="btn" href="avatar-etats.html">Correspondance événement → état</a><a class="btn" href="orbite.html">Voir dans Orbite</a></div></section></div>"""))

for k,(t,html_) in P.items(): (OUT/f"{k}.html").write_text(html_)
order=list(P)
(OUT/"index.html").write_text(f"""<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prototype Oria v3-ext</title><style>{CSS}</style></head><body><main id="main" class="full"><div class="content"><h1 style="font:700 32px var(--display)">Oria v3 — ajouts</h1><p class="lede">Prototype cliquable. Données {EX} sauf la session de code {RE}. <a href="{B}index.html">Écrans Pont de base</a></p><ol class="list">{"".join(f'<li><a href="{k}.html">{P[k][0]}</a></li>' for k in order)}</ol></div></main></body></html>""")
print("ok",len(order))
