import json, html, datetime, math
M = json.load(open('/tmp/mission.json'))
def loc(t):
    if not t: return "—"
    d = datetime.datetime.fromisoformat(t.replace('Z','+00:00')) - datetime.timedelta(hours=4)
    return d.strftime('%H:%M:%S')
def dur(s):
    if not s['endedAt']: return "en cours"
    a=datetime.datetime.fromisoformat(s['startedAt'].replace('Z','+00:00')); b=datetime.datetime.fromisoformat(s['endedAt'].replace('Z','+00:00'))
    return f"{(b-a).total_seconds():.1f} s"
KIND={'spec':'Spécification','code':'Code','test':'Tests','preview':'Aperçu','revision':'Correction'}
SST={'running':'En cours','succeeded':'Réussie','failed':'Échec','interrupted':'Interrompue','blocked':'Bloquée'}
MST={'created':'Créée','running':'En cours','interrupted':'Interrompue — reprise possible','awaiting_review':'À relire','failed':'Échec','blocked':'Bloquée (abonnement/quota)'}
EXE={'codex_cli':'Agent · Codex CLI','runner':'Oria · runner (preuve)'}
REASON={'runner_died':'runner arrêté','signal_SIGKILL':'signal SIGKILL','subscription_quota':'quota abonnement','codex_nonzero_exit':'sortie non nulle Codex'}
e=html.escape
EX='<span class="ex" title="Données d’exemple, non réelles">exemple</span>'
TEAM=[("Ronnie","Directeur général","coordination","active"),("Léa","Responsable produit","produit","idle"),("Malik","Ingénieur","atelier","active"),("Inès","Analyste ventes","ventes","waiting"),("Sam","Rédacteur","contenu","idle")]
MISSIONS=[("Calculatrice de pourboire","Malik","awaiting_review",True),("Grille tarifaire T1","Inès","running",False),("Page d'accueil v2","Léa","created",False),("Relance clients dormants","Inès","blocked",False)]
DIRS={
 'cartographe':dict(name="Cartographe",fonts="family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500"),
 'signal':dict(name="Signal",fonts="family=Space+Grotesk:wght@400;500;700&family=JetBrains+Mono:wght@400;500;700"),
 'verriere':dict(name="Verrière",fonts="family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=Instrument+Serif:ital@0;1&family=Geist+Mono:wght@400;500"),
}
CSS={}
CSS['cartographe']="""
:root{--bg:#f3ecdf;--paper:#fbf7ef;--ink:#1f1a14;--soft:#5a4f42;--line:#d8ccb7;--accent:#b4441f;--accent-fg:#fff;--ok:#2f6b3a;--warn:#8a5a00;--bad:#a3261b;--chip:#efe5d3;--fd:'Fraunces',serif;--fb:'IBM Plex Sans',sans-serif;--fm:'IBM Plex Mono',monospace;--r:4px}
body{background:var(--bg) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cg fill='none' stroke='%23d9ccb4' stroke-width='1'%3E%3Cpath d='M0 60 Q60 30 120 60 T240 60'/%3E%3Cpath d='M0 120 Q60 90 120 120 T240 120'/%3E%3Cpath d='M0 180 Q60 150 120 180 T240 180'/%3E%3C/g%3E%3C/svg%3E")}
h1,h2,.brand{font-family:var(--fd);letter-spacing:-.01em} h1{font-size:44px;font-weight:800} h2{font-size:22px;font-weight:600}
.card{background:var(--paper);border:1px solid var(--line);box-shadow:2px 2px 0 var(--line)}
.nav a[aria-current]{background:var(--ink);color:var(--paper)} .side{border-right:2px solid var(--ink)}
"""
CSS['signal']="""
:root{--bg:#07090a;--paper:#0e1213;--ink:#e8f3ec;--soft:#9fb4a8;--line:#24302b;--accent:#4dff9a;--accent-fg:#03140a;--ok:#4dff9a;--warn:#ffb340;--bad:#ff6b5e;--chip:#141b19;--fd:'Space Grotesk',sans-serif;--fb:'Space Grotesk',sans-serif;--fm:'JetBrains Mono',monospace;--r:2px}
body{background:var(--bg);background-image:linear-gradient(rgba(77,255,154,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(77,255,154,.035) 1px,transparent 1px);background-size:24px 24px}
h1,h2{font-family:var(--fm);text-transform:uppercase;letter-spacing:.06em} h1{font-size:30px} h2{font-size:14px;color:var(--accent)}
.card{background:var(--paper);border:1px solid var(--line)} .card:before{content:'';display:block;height:2px;background:linear-gradient(90deg,var(--accent),transparent 40%);margin:-16px -16px 14px}
.nav a{font-family:var(--fm);text-transform:uppercase;font-size:12px;letter-spacing:.08em} .nav a[aria-current]{color:var(--accent);box-shadow:inset 3px 0 0 var(--accent)}
.side{border-right:1px solid var(--line)}
"""
CSS['verriere']="""
:root{--bg:#0b0d1f;--paper:rgba(255,255,255,.07);--ink:#f4f2ff;--soft:#c3c0e0;--line:rgba(255,255,255,.16);--accent:#9cf2e0;--accent-fg:#06201b;--ok:#8ff0b5;--warn:#ffd27a;--bad:#ff9ba8;--chip:rgba(255,255,255,.1);--fd:'Instrument Serif',serif;--fb:'Bricolage Grotesque',sans-serif;--fm:'Geist Mono',monospace;--r:20px}
body{background:radial-gradient(900px 600px at 10% -10%,#3b2a8f 0,transparent 60%),radial-gradient(800px 600px at 100% 100%,#0f5c63 0,transparent 55%),var(--bg)}
h1,h2{font-family:var(--fd);font-weight:400} h1{font-size:56px;font-style:italic;line-height:1} h2{font-size:26px}
.card{background:var(--paper);border:1px solid var(--line);backdrop-filter:blur(18px);box-shadow:0 20px 60px rgba(0,0,0,.35)}
.nav a[aria-current]{background:rgba(156,242,224,.16);color:var(--ink);border:1px solid rgba(156,242,224,.4)}
.side{background:rgba(255,255,255,.04);border-right:1px solid var(--line)}
"""
BASE="""
*{box-sizing:border-box}body{margin:0;color:var(--ink);font:15px/1.5 var(--fb)}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
a{color:inherit}.mono{font-family:var(--fm)}.soft{color:var(--soft)}
.app{display:grid;grid-template-columns:240px 1fr;min-height:100vh}
.side{padding:20px 14px;display:flex;flex-direction:column;gap:4px}
.brand{font-size:24px;font-weight:800;margin:0 8px 14px}
.ctx{border:1px solid var(--line);border-radius:var(--r);padding:10px;margin-bottom:14px;background:var(--chip)}
.ctx b{display:block}.nav a{display:block;padding:9px 12px;border-radius:var(--r);text-decoration:none;color:var(--soft)}
.top{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:14px 28px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.pill{display:inline-flex;gap:6px;align-items:center;border:1px solid var(--line);border-radius:999px;padding:3px 10px;font-size:13px;background:var(--chip)}
.ex{display:inline-block;font:600 12px/1 var(--fm);text-transform:uppercase;letter-spacing:.06em;padding:4px 7px;border-radius:4px;background:#ffe9a8;color:#3a2a00;border:1px solid #8a6a00;vertical-align:middle}
.real{display:inline-block;font:600 12px/1 var(--fm);padding:4px 7px;border-radius:4px;background:#d9f5e3;color:#0b3a1d;border:1px solid #1d6b3a}
main{padding:24px 28px;display:grid;gap:18px}
.card{border-radius:var(--r);padding:16px}
.g2{display:grid;grid-template-columns:1.4fr 1fr;gap:18px}.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
h1,h2{margin:0 0 8px}ul{margin:0;padding:0;list-style:none}
li.row{display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--line)}
.st{font:500 12px/1.2 var(--fm);padding:3px 8px;border-radius:999px;border:1px solid currentColor;white-space:nowrap}
.s-ok{color:var(--ok)}.s-warn{color:var(--warn)}.s-bad{color:var(--bad)}.s-run{color:var(--accent)}.s-idle{color:var(--soft)}
.btn{font:600 14px var(--fb);background:var(--accent);color:var(--accent-fg);border:0;border-radius:var(--r);padding:10px 14px;min-height:44px;cursor:pointer}
.btn2{font:600 14px var(--fb);background:transparent;color:var(--ink);border:1px solid var(--line);border-radius:var(--r);padding:10px 14px;min-height:44px}
.map svg{width:100%;height:auto;display:block}
.live{animation:live 1.6s ease-in-out infinite}@keyframes live{50%{opacity:.35}}
.flow{stroke-dasharray:6 6;animation:flow 1.2s linear infinite}@keyframes flow{to{stroke-dashoffset:-12}}
@media (prefers-reduced-motion:reduce){.live,.flow{animation:none}}
.msg{border:1px solid var(--line);border-radius:var(--r);padding:12px;margin-bottom:10px;background:var(--chip)}
.prop{border:2px solid var(--accent);border-radius:var(--r);padding:14px}
.kv{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;font-size:14px}.kv dt{color:var(--soft)}.kv dd{margin:0;font-family:var(--fm);word-break:break-all}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:7px 6px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--soft);font-weight:600}
.alert{border-left:4px solid var(--warn);padding:8px 12px;background:var(--chip)}
.tabbar{display:none}
@media (max-width:760px){.app{grid-template-columns:1fr}.side{display:none}.g2,.g3{grid-template-columns:1fr}main{padding:16px}.top{padding:12px 16px}h1{font-size:32px!important}
 .app{padding-bottom:64px}.tabbar{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:5;justify-content:space-around;background:var(--bg);border-top:1px solid var(--line);padding:6px}.tabbar a{padding:10px 8px;text-decoration:none;font-size:13px;min-height:44px}
 .tbl-wrap{overflow-x:auto}}
"""
NAV=[('cockpit','Cockpit'),('fiche','Fiche entreprise'),('equipe','Équipe'),('conversation','Conversations'),('missions','Missions'),('atelier','Atelier'),('livrables','Livrables'),('connexions','Connexions')]
def ststyle(s): return {'awaiting_review':'s-warn','running':'s-run','created':'s-idle','blocked':'s-bad','failed':'s-bad','interrupted':'s-warn','succeeded':'s-ok','active':'s-run','idle':'s-idle','waiting':'s-warn'}.get(s,'s-idle')
TST={'active':'au travail','idle':'disponible','waiting':'attend une décision'}
def mapsvg(d):
    W,H=640,300; cx,cy=320,150
    nodes=[(cx+math.cos(i*2*math.pi/5-1.57)*(120 if d!='signal' else 110)*(1.6 if d!='signal' else 1.0),cy+math.sin(i*2*math.pi/5-1.57)*110) for i in range(5)]
    out=[f'<svg viewBox="0 0 {W} {H}" role="img" aria-labelledby="mt-{d}"><title id="mt-{d}">Carte vivante : 5 membres d’exemple, 4 missions ; seules les lignes animées correspondent à une activité en cours (verrou actif).</title>']
    if d=='signal':
        for r in (40,80,120,140): out.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="#24302b"/>')
        out.append(f'<line x1="{cx}" y1="{cy-145}" x2="{cx}" y2="{cy+145}" stroke="#24302b"/><line x1="{cx-145}" y1="{cy}" x2="{cx+145}" y2="{cy}" stroke="#24302b"/>')
    if d=='verriere':
        for r in (70,120): out.append(f'<ellipse cx="{cx}" cy="{cy}" rx="{r*1.9}" ry="{r}" fill="none" stroke="rgba(255,255,255,.18)"/>')
    if d=='cartographe':
        for k in range(6): out.append(f'<path d="M0 {40+k*45} C 160 {10+k*45}, 480 {80+k*45}, 640 {35+k*45}" fill="none" stroke="#e0d3bb"/>')
    hub=(cx,cy)
    for i,(n,role,area,st) in enumerate(TEAM):
        x,y=nodes[i]; act=st=='active'
        col='var(--accent)' if act else 'var(--soft)'
        out.append(f'<line x1="{hub[0]}" y1="{hub[1]}" x2="{x:.0f}" y2="{y:.0f}" stroke="{col}" stroke-width="{2.5 if act else 1}" class="{"flow" if act else ""}"/>')
    out.append(f'<circle cx="{cx}" cy="{cy}" r="26" fill="var(--accent)"/><text x="{cx}" y="{cy+5}" text-anchor="middle" font-size="13" font-weight="700" fill="var(--accent-fg)" font-family="var(--fm)">OBJ.</text>')
    for i,(n,role,area,st) in enumerate(TEAM):
        x,y=nodes[i]; act=st=='active'
        shape = f'<rect x="{x-20:.0f}" y="{y-20:.0f}" width="40" height="40" fill="var(--paper)" stroke="var(--ink)" stroke-width="2"/>' if d=='cartographe' else (f'<circle cx="{x:.0f}" cy="{y:.0f}" r="9" fill="{"var(--accent)" if act else "var(--paper)"}" stroke="var(--accent)" stroke-width="2"/>' if d=='signal' else f'<circle cx="{x:.0f}" cy="{y:.0f}" r="22" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.5)"/>')
        out.append(shape)
        if act: out.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="28" fill="none" stroke="var(--accent)" class="live"/>')
        out.append(f'<text x="{x:.0f}" y="{y+(5 if d!="signal" else -16):.0f}" text-anchor="middle" font-size="13" font-weight="600" fill="var(--ink)" font-family="var(--fb)">{n}</text>')
        out.append(f'<text x="{x:.0f}" y="{y+38:.0f}" text-anchor="middle" font-size="12" fill="var(--soft)" font-family="var(--fm)">{TST[st]}</text>')
    out.append('</svg>')
    return ''.join(out)
def shell(d,screen,title,body):
    nav=''.join(f'<a href="{k}.html"{" aria-current=\"page\"" if k==screen else ""}>{v}</a>' for k,v in NAV)
    tabs=''.join(f'<a href="{k}.html"{" aria-current=\"page\"" if k==screen else ""}>{v.split()[0]}</a>' for k,v in NAV if k in('cockpit','fiche','conversation','atelier'))
    return f'''<!doctype html><html lang="fr-CA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} — Direction {DIRS[d]["name"]} · Oria</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?{DIRS[d]["fonts"]}&display=swap"><style>{BASE}{CSS[d]}</style></head><body>
<a href="#c" class="ex" style="position:absolute;left:-999px">Aller au contenu</a>
<div class="app"><aside class="side"><div class="brand">Oria</div>
<div class="ctx"><span class="soft" style="font-size:12px">Contexte actif · entreprise</span><b>Atelier Boréal {EX}</b></div>
<nav class="nav" aria-label="Navigation principale">{nav}</nav></aside>
<div><header class="top"><div style="display:flex;gap:8px;flex-wrap:wrap"><span class="pill">Modèle observé : <b class="mono">gpt-5.6-luna</b> <span class="real">prouvé · E1-D</span></span><span class="pill">Runtime : Codex CLI · abonnement</span></div>
<span class="pill mono" aria-label="Palette de commandes, raccourci Contrôle K">⌘K Rechercher ou agir</span></header>
<main id="c">{body}</main>
<nav class="tabbar" aria-label="Navigation mobile">{tabs}</nav></div></div></body></html>'''
def cockpit(d):
    ms=''.join(f'<li class="row"><span><b>{e(t)}</b> {"<span class=\"real\">réelle</span>" if real else EX}<br><span class="soft" style="font-size:13px">{o} · responsable</span></span><span class="st {ststyle(s)}">{MST[s]}</span></li>' for t,o,s,real in MISSIONS)
    return f'''<div><h1>Bonjour. Deux décisions vous attendent.</h1><p class="soft">Données du cockpit : {EX} sauf la mission marquée <span class="real">réelle</span>.</p></div>
<div class="g2"><section class="card map" aria-labelledby="h-map"><h2 id="h-map">Carte vivante — équipe &amp; missions</h2>{mapsvg(d)}<p class="soft" style="font-size:13px">Animation = verrou d’exécution actif uniquement. Mouvement réduit : statique.</p></section>
<section class="card"><h2>Décisions attendues</h2><ul>
<li class="row"><span><b>Relire « Calculatrice de pourboire »</b> <span class="real">réelle</span><br><span class="soft" style="font-size:13px">8 étapes · tests runner ✓ · 1 reprise</span></span><a class="btn" href="atelier.html">Relire</a></li>
<li class="row"><span><b>Débloquer « Relance clients dormants »</b> {EX}<br><span class="soft" style="font-size:13px">Bloquée : quota abonnement</span></span><button class="btn2">Comprendre</button></li></ul></section></div>
<section class="card"><h2>Missions</h2><ul>{ms}</ul></section>'''
def fiche(d):
    team=''.join(f'<li class="row"><span><b>{n}</b> · {r}<br><span class="soft" style="font-size:13px">Mandat : {a}</span></span><span class="st {ststyle(s)}">{TST[s]}</span></li>' for n,r,a,s in TEAM)
    return f'''<div><span class="soft">Fiche entreprise</span><h1>Atelier Boréal {EX}</h1><p>Objectif du trimestre : <b>lancer l’offre « Pourboire » auprès de 20 restaurants</b> {EX}</p></div>
<div class="g3"><section class="card"><h2>Objectif</h2><p style="font-size:34px;margin:0" class="mono">6 / 20</p><p class="soft">restaurants signés {EX}</p></section>
<section class="card"><h2>Décisions</h2><ul><li class="row"><span>Prix plancher 49 $/mois</span><span class="st s-ok">Validée</span></li><li class="row"><span>Ouvrir Montréal</span><span class="st s-warn">À trancher</span></li></ul><p class="soft" style="font-size:13px">{EX}</p></section>
<section class="card"><h2>Résultats</h2><ul><li class="row"><span>Calculatrice livrée en relecture</span><span class="real">réel</span></li><li class="row"><span>Grille tarifaire</span>{EX}</li></ul></section></div>
<div class="g2"><section class="card"><h2>Équipe <span class="soft" style="font-size:14px">— noms et intitulés choisis par vous</span> {EX}</h2><ul>{team}</ul><p class="soft" style="font-size:13px">Changer un intitulé ne change pas les permissions.</p></section>
<section class="card map"><h2>Carte vivante</h2>{mapsvg(d)}</section></div>'''
def conv(d):
    return f'''<div><span class="soft">Conversation · #lancement-pourboire</span> {EX}<h1>Du fil à la mission</h1></div>
<div class="g2"><section class="card" aria-label="Fil de conversation"><div class="msg"><b>Vous</b> <span class="soft mono" style="font-size:12px">05:02</span><p style="margin:4px 0 0">Il nous faut une petite démo pour les restaurateurs : pourboire + partage de l’addition.</p></div>
<div class="msg"><b>Ronnie</b> · Directeur général <span class="soft mono" style="font-size:12px">05:03</span><p style="margin:4px 0 0">Je propose de confier ça à Malik dans l’atelier, avec aperçu HTML et tests.</p></div>
<div class="prop"><span class="soft" style="font-size:12px">PROPOSITION DE MISSION · prête à valider</span><h2 style="margin-top:4px">Calculatrice de pourboire</h2>
<dl class="kv"><dt>Besoin</dt><dd style="font-family:var(--fb)">{e(M["need"])}</dd><dt>Responsable</dt><dd>Malik · Ingénieur {EX}</dd><dt>Modèle demandé</dt><dd>{M["runtime"]["requestedModelId"]}</dd><dt>Contexte</dt><dd>Atelier Boréal</dd></dl>
<div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap"><a class="btn" href="atelier.html">Valider en mission</a><button class="btn2">Modifier</button><button class="btn2">Refuser</button></div></div></section>
<section class="card"><h2>Ce qui se passera</h2><ol style="padding-left:20px;margin:0"><li>La mission reprend titre, besoin, responsable et contexte — sans ressaisie.</li><li>Elle apparaît dans Missions et sur la carte vivante.</li><li>L’atelier exécute spec → code → tests → aperçu ; vous relisez.</li><li>Lien retour vers ce message dans la mission.</li></ol>
<p class="alert" style="margin-top:14px">Le besoin ci-contre est celui de la mission réelle E1-D ; les personnes et le fil sont {EX}.</p></section></div>'''
def atelier(d):
    rows=''
    for s in M['steps']:
        badge=' <span class="st s-warn">reprise</span>' if s['resumedFrom'] else ''
        why=REASON.get(s['reason'],s['reason']) if s['reason'] else '—'
        mdl=(s['observedModelId'] or '—')
        rows+=f'<tr><td><b>{KIND[s["kind"]]}</b>{badge}</td><td><span class="st {ststyle(s["status"])}">{SST[s["status"]]}</span></td><td>{EXE[s["executor"]]}</td><td class="mono">{loc(s["startedAt"])} · {dur(s)}</td><td class="mono">{mdl}</td><td>{e(why)}</td><td class="mono">{(s["commitSha"] or "—")[:8]}</td></tr>'
    arts=''.join(f'<tr><td>{a["kind"]}</td><td class="mono">{e(a["path"].split("/")[-1])}</td><td class="mono">{a["sha256"][:12]}…</td><td class="mono">{a["bytes"]:,} o</td></tr>'.replace(',', ' ') for a in M['artifacts'])
    r=M['repo']; req=M['runtime']['requestedModelId']
    obs=[s['observedModelId'] for s in M['steps'] if s['observedModelId']][-1]
    return f'''<div><span class="soft">Atelier · données <span class="real">réelles</span> <span class="mono" style="font-size:12px">docs/atelier-e1-d-evidence/mission.json (PR #412)</span></span>
<h1>{e(M["title"])}</h1><div style="display:flex;gap:8px;flex-wrap:wrap"><span class="st s-warn">{MST[M["status"]]}</span><span class="pill">Verrou : aucun (rien en cours)</span><span class="pill">Mis à jour {loc(M["updatedAt"])} HAE</span></div></div>
<div class="g3"><section class="card"><h2>Preuve de modèle</h2><dl class="kv"><dt>Demandé</dt><dd>{req}</dd><dt>Observé</dt><dd>{obs}</dd><dt>Concordance</dt><dd><span class="st s-ok">identique</span></dd></dl><p class="soft" style="font-size:12px">Observé = lu dans la session CLI, pas déclaré par l’agent.</p></section>
<section class="card"><h2>Dépôt</h2><dl class="kv"><dt>Branche</dt><dd>{r["branch"]}</dd><dt>Base</dt><dd>{r["baseBranch"]} @ {r["baseSha"][:8]}</dd><dt>Tête</dt><dd>{r["headSha"][:8]}</dd><dt>Session</dt><dd>{M["sessionId"][:13]}…</dd></dl></section>
<section class="card"><h2>Relecture</h2><p>Tests runner ✓ (2/2 passages) · aperçu généré.</p><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn">Demander une correction</button><button class="btn2">Voir le diff</button></div></section></div>
<section class="card"><h2>Étapes</h2><div class="tbl-wrap"><table><thead><tr><th>Étape</th><th>Statut</th><th>Exécutant</th><th>Début · durée</th><th>Modèle observé</th><th>Raison d’échec</th><th>Commit</th></tr></thead><tbody>{rows}</tbody></table></div>
<p class="soft" style="font-size:13px">« Oria · runner » = vérification exécutée par Oria (preuve). Les messages de l’agent ne sont pas des preuves.</p></section>
<section class="card"><h2>Artefacts (sha256)</h2><div class="tbl-wrap"><table><thead><tr><th>Type</th><th>Fichier</th><th>sha256</th><th>Taille</th></tr></thead><tbody>{arts}</tbody></table></div></section>'''
import os
for d in DIRS:
    os.makedirs(d,exist_ok=True)
    for k,f,t in (('cockpit',cockpit,'Cockpit'),('fiche',fiche,'Fiche entreprise'),('conversation',conv,'Conversation → mission'),('atelier',atelier,'Atelier')):
        open(f'{d}/{k}.html','w').write(shell(d,k,t,f(d)))
print('ok')
