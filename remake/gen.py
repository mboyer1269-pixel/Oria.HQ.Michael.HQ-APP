#!/usr/bin/env python3
"""Génère les maquettes statiques Oria v3 « Pont ». Données : « exemple » sauf atelier (mission.json réel)."""
import json, html, datetime, pathlib
H = html.escape
OUT = pathlib.Path(__file__).parent / "mockups"
M = json.load(open(OUT / "mission.reelle.json"))

def hae(iso):
    t = datetime.datetime.fromisoformat(iso.replace("Z", "+00:00")) - datetime.timedelta(hours=4)
    return t.strftime("%H h %M:%S HAE")
def dur(a, b):
    d = (datetime.datetime.fromisoformat(b.replace("Z","+00:00")) - datetime.datetime.fromisoformat(a.replace("Z","+00:00"))).total_seconds()
    return f"{d:.1f} s" if d < 60 else f"{int(d//60)} min {int(d%60)} s"

EX = '<span class="prov ex" title="Donnée fictive de maquette">◆ exemple</span>'
RE = '<span class="prov re" title="Lu depuis mission.json, branche atelier/e1-d">● réelle</span>'
NC = '<span class="prov nc">? non confirmé</span>'
PE = '<span class="prov pe">⟳ périmée</span>'

NAV = [("pont","Pont","P","◎"),("attention","Attention","A","⚑"),("conversations","Conversations","C","❝"),
       ("missions","Missions","M","▤"),("equipe","Équipe","E","☺"),("atelier","Atelier","T","⚒"),("connexions","Connexions","X","⇄")]
GROUP = {"conversation":"conversations","mission":"missions","employe":"equipe","atelier-session":"atelier","connexion":"connexions","fiche":"fiche","palette":"pont","etats":"pont"}

CSS = r"""
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&family=Fraunces:opsz,wght@9..144,500;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
:root{--bg:#07090a;--panel:#0e1213;--panel2:#151b1c;--line:#26332e;--ink:#e8f3ec;--soft:#9fb4a8;--accent:#4dff9a;--on-accent:#03140a;--warn:#ffb340;--bad:#ff6b5e;--info:#7cc4ff;--ui:'Space Grotesk',system-ui,sans-serif;--mono:'JetBrains Mono',ui-monospace,monospace;--display:'Space Grotesk',sans-serif}
[data-mode=carte]{--bg:#fbf7ef;--panel:#fffdf8;--panel2:#f3ecdf;--line:#d9cdb8;--ink:#1f1a14;--soft:#5a4f42;--accent:#b4441f;--on-accent:#fff;--warn:#8a5a00;--bad:#a3261b;--info:#1f4f8a;--ok:#2f6b3a;--ui:'IBM Plex Sans',sans-serif;--display:'Fraunces',serif}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 var(--ui)}
a{color:inherit}:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.skip{position:absolute;left:-999px;top:8px;background:var(--accent);color:var(--on-accent);padding:8px 12px;z-index:99}.skip:focus{left:8px}
.app{display:grid;grid-template-columns:88px 1fr;grid-template-rows:48px 1fr;min-height:100vh}
.bar{grid-column:1/3;display:flex;align-items:center;gap:16px;padding:0 16px;border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--panel) 82%,transparent);backdrop-filter:blur(12px);position:sticky;top:0;z-index:5}
.ctx{display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:6px;padding:4px 10px;background:var(--panel2);font-weight:600;text-decoration:none}
.dot{width:10px;height:10px;border-radius:50%;background:#c58cff;display:inline-block}
.bar h1{font-size:15px;margin:0;font-weight:600}.bar .sp{flex:1}
.k{font:12px var(--mono);border:1px solid var(--line);border-radius:4px;padding:1px 6px;color:var(--soft)}
.cmd{display:flex;gap:8px;align-items:center;border:1px solid var(--line);border-radius:6px;padding:4px 10px;color:var(--soft);text-decoration:none;min-width:220px}
.att{display:flex;gap:6px;align-items:center;text-decoration:none;font-weight:600;padding:4px 10px;border-radius:6px}
.att.on{background:var(--warn);color:#1a1000}[data-mode=carte] .att.on{color:#fff}.clock{font:13px var(--mono);color:var(--soft)}
.run{display:flex;gap:6px;align-items:center;font:12px var(--mono);color:var(--soft)}
.pulse{width:8px;height:8px;border-radius:50%;background:var(--accent);animation:p 1.6s infinite}@keyframes p{50%{opacity:.4}}
.rail{border-right:1px solid var(--line);display:flex;flex-direction:column;gap:2px;padding:8px 6px;background:var(--bg)}
.rail a{display:flex;flex-direction:column;align-items:center;gap:2px;text-decoration:none;color:var(--soft);font-size:12px;padding:8px 2px;border-radius:8px;min-height:48px}
.rail a .i{font-size:18px;line-height:1}.rail a[aria-current=page]{color:var(--ink);background:var(--panel2);box-shadow:inset 2px 0 0 var(--accent)}
.rail .sep{flex:1}
main{display:grid;grid-template-columns:1fr 400px;min-width:0}main.full{grid-template-columns:1fr}
.content{padding:24px 32px;max-width:980px;width:100%;min-width:0}.drawer{border-left:1px solid var(--line);background:var(--panel);padding:20px;min-width:0}
h2{font:600 26px/1.15 var(--display);margin:0 0 4px}h3{font-size:15px;margin:0 0 6px}.lede{color:var(--soft);margin:0 0 20px}
.eyebrow{font:12px var(--mono);color:var(--soft);text-transform:uppercase;letter-spacing:.08em;margin:24px 0 8px;display:flex;gap:8px;align-items:center}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px;margin-bottom:12px}
.card.warn{border-left:4px solid var(--warn)}.card.bad{border-left:4px solid var(--bad)}.card.info{border-left:4px solid var(--info)}.card.go{border-left:4px solid var(--accent)}
.row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.between{justify-content:space-between}
.meta{font:12px var(--mono);color:var(--soft)}.mono{font-family:var(--mono)}
.tag{font:600 12px var(--mono);padding:2px 8px;border-radius:999px;border:1px solid currentColor}
.t-warn{color:var(--warn)}.t-bad{color:var(--bad)}.t-info{color:var(--info)}.t-go{color:var(--accent)}.t-soft{color:var(--soft)}
.prov{font:600 12px var(--ui);padding:2px 8px;border-radius:999px;white-space:nowrap}
.prov.ex{background:#ffe9a8;color:#3a2a00}.prov.re{background:#d9f5e3;color:#0b3a1d}.prov.nc{background:#e6e6e6;color:#2b2b2b}.prov.pe{background:#f1dccf;color:#4a1d06}
.btn{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:6px 14px;border-radius:6px;border:1px solid var(--line);background:transparent;color:var(--ink);font:600 14px var(--ui);text-decoration:none;cursor:default}
.btn.p{background:var(--accent);color:var(--on-accent);border-color:var(--accent)}.btn.p .k{color:var(--on-accent);border-color:var(--on-accent)}.btn.d{border-color:var(--bad);color:var(--bad)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.hero{display:grid;grid-template-columns:1.4fr 1fr;gap:12px}
.big{font:600 40px/1 var(--mono)}
dl.kv{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;margin:0}dl.kv dt{color:var(--soft);font-size:13px}dl.kv dd{margin:0;font-size:14px;min-width:0;overflow-wrap:anywhere}
.list{list-style:none;margin:0;padding:0}.list li{border-bottom:1px solid var(--line);padding:12px 0}
.list a{text-decoration:none}.list a:hover h3{text-decoration:underline}
.av{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font:600 13px var(--mono);background:var(--panel2);border:1px solid var(--line);flex:none}
.tl{list-style:none;margin:0;padding:0;position:relative}.tl li{display:grid;grid-template-columns:20px 1fr;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)}
.tl .n{width:14px;height:14px;border-radius:50%;border:2px solid var(--soft);margin-top:4px}.tl .ok .n{background:var(--accent);border-color:var(--accent)}.tl .int .n{border-color:var(--warn);background:var(--bg)}
.msg{max-width:640px;padding:10px 14px;border-radius:10px;background:var(--panel);border:1px solid var(--line);margin:8px 0}.msg.me{margin-left:auto;background:var(--panel2)}
.composer{border:1px solid var(--line);border-radius:10px;padding:12px;background:var(--panel);display:flex;gap:8px;align-items:center;margin-top:16px}
.composer label{flex:1;color:var(--soft)}
.meter{height:8px;border-radius:4px;background:var(--panel2);border:1px solid var(--line);overflow:hidden}.meter i{display:block;height:100%;background:var(--soft)}.meter.hi i{background:var(--warn)}
.preview{border:1px solid var(--line);border-radius:10px;background:#fff;color:#111;padding:20px;font-family:system-ui}
.preview label{display:block;font-size:13px;margin-top:8px}.preview .f{border:1px solid #666;border-radius:4px;padding:6px 8px;margin-top:2px}
.diff{font:12px/1.6 var(--mono);background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:12px;overflow:auto;white-space:pre}
.add{color:var(--accent)}.del{color:var(--bad)}
.skel{height:14px;border-radius:4px;background:var(--panel2);margin:8px 0}
.pal-back{position:fixed;inset:0;background:rgba(0,0,0,.55);display:grid;place-items:start center;padding-top:96px;z-index:20}
.pal{width:min(640px,94vw);background:color-mix(in srgb,var(--panel) 92%,transparent);backdrop-filter:blur(16px);border:1px solid var(--line);border-radius:12px;box-shadow:0 24px 80px rgba(0,0,0,.6)}
.pal .q{padding:14px 16px;border-bottom:1px solid var(--line);font-size:17px}.pal .g{font:12px var(--mono);color:var(--soft);padding:10px 16px 4px;margin:0;font-weight:400}
.pal ul{list-style:none;margin:0;padding:0 8px 8px}.pal li{display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-radius:6px;gap:8px}.pal li.sel{background:var(--panel2);box-shadow:inset 2px 0 0 var(--accent)}
.pal li.dis{color:var(--soft)}
.tabbar{display:none}
.mobile-back{display:none}
table{width:100%;border-collapse:collapse;font-size:14px}th{text-align:left;color:var(--soft);font-weight:500;font-size:13px;border-bottom:1px solid var(--line);padding:8px 6px}td{border-bottom:1px solid var(--line);padding:10px 6px;vertical-align:top}
@media (max-width:760px){
 .app{grid-template-columns:1fr;grid-template-rows:56px 1fr 64px}.bar{grid-column:1;gap:8px;padding:0 12px}.cmd,.clock,.run,.bar h1{display:none}
 .rail{display:none}.tabbar{display:flex;position:fixed;bottom:0;left:0;right:0;height:64px;border-top:1px solid var(--line);background:color-mix(in srgb,var(--panel) 90%,transparent);backdrop-filter:blur(12px);z-index:5}
 .tabbar a{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:12px;text-decoration:none;color:var(--soft);min-height:44px}.tabbar a[aria-current=page]{color:var(--ink);box-shadow:inset 0 2px 0 var(--accent)}
 main{grid-template-columns:1fr;padding-bottom:72px}.content{padding:16px}.drawer{border-left:0;border-top:1px solid var(--line)}
 .grid2,.grid3,.hero{grid-template-columns:1fr}.big{font-size:32px}.mobile-back{display:inline-flex}
 h2{font-size:22px}table{font-size:13px}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
"""

def shell(slug, title, body, drawer="", mode=None, palette=False, attn=4, running=False):
    cur = GROUP.get(slug, slug)
    rail = "".join(f'<a href="{s}.html" {"aria-current=page" if cur==s else ""}><span class="i" aria-hidden="true">{ic}</span>{l}</a>' for s,l,k,ic in NAV)
    rail += f'<span class="sep"></span><a href="fiche.html" {"aria-current=page" if cur=="fiche" else ""}><span class="i" aria-hidden="true">❖</span>Fiche</a><a href="etats.html" {"aria-current=page" if slug=="etats" else ""}><span class="i" aria-hidden="true">◌</span>États</a>'
    tabs = "".join(f'<a href="{s}.html" {"aria-current=page" if cur==s else ""}><span aria-hidden="true">{ic}</span>{l}</a>' for s,l,k,ic in NAV[:4]) + f'<a href="index.html"><span aria-hidden="true">⋯</span>Plus</a>'
    run = '<span class="run"><span class="pulse" aria-hidden="true"></span>Atelier : 1 en cours</span>' if running else '<span class="run">Atelier : rien en cours</span>'
    pal = PALETTE if palette else ""
    return f"""<!doctype html><html lang="fr"{' data-mode="'+mode+'"' if mode else ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{H(title)} — Oria</title><style>{CSS}</style></head>
<body><a class="skip" href="#main">Aller au contenu</a><div class="app">
<header class="bar"><a class="ctx" href="palette.html" aria-label="Contexte actif : Dadz Co. (exemple). Changer de contexte"><span class="dot" aria-hidden="true"></span>Dadz Co. <span class="t-soft" aria-hidden="true">▾</span></a>
<h1>{H(title)}</h1><span class="sp"></span><a class="cmd" href="palette.html"><span aria-hidden="true">⌕</span>Rechercher ou agir… <span class="k">Ctrl K</span></a>{run}
<a class="att {'on' if attn else ''}" href="attention.html"><span aria-hidden="true">⚑</span>{attn} à traiter</a><span class="clock">dim. 09 h 07 HAE</span></header>
<nav class="rail" aria-label="Navigation principale">{rail}</nav>
<main id="main" class="{'' if drawer else 'full'}"><div class="content">{body}</div>{('<aside class="drawer" aria-label="Détail">'+drawer+'</aside>') if drawer else ''}</main>
</div><nav class="tabbar" aria-label="Navigation mobile">{tabs}</nav>{pal}</body></html>"""

PALETTE = f"""<div class="pal-back"><div class="pal" role="dialog" aria-modal="true" aria-labelledby="palq">
<div class="q" id="palq">« repr<span aria-hidden="true">|</span> » <span class="meta">— recherche floue, synonymes</span></div>
<p class="g">Suggéré ici</p><ul><li class="sel"><span>↻ Reprendre « Calculatrice de pourboire » — étape code (reprise)</span><span class="k">R</span></li>
<li><span>⚑ Ouvrir le centre d'attention</span><span class="k">G A</span></li></ul>
<p class="g">Contextes</p><ul><li><span><span class="dot" aria-hidden="true"></span> Dadz Co. {EX}</span><span class="k">Ctrl 1</span></li><li><span>● Personnel {EX}</span><span class="k">Ctrl 2</span></li><li><span>● Projet Oria {EX}</span><span class="k">Ctrl 3</span></li></ul>
<p class="g">Actions</p><ul><li><span>＋ Nouvelle mission</span><span class="k">N</span></li><li><span>☺ Ajouter un employé <span class="meta">(embaucher)</span></span><span class="k">G E</span></li>
<li class="dis" aria-disabled="true"><span>✉ Envoyer le rapport par courriel — <em>refusé : accès Gmail non accordé</em></span><span class="k">—</span></li></ul></div></div>"""

steps = M["steps"]
def step_li(s, i):
    cls = "ok" if s["status"]=="succeeded" else "int"
    ex = "Codex CLI" if s["executor"]=="codex_cli" else "Runner Oria (preuve)"
    st = {"succeeded":'<span class="tag t-go">✓ Réussie</span>',"interrupted":'<span class="tag t-warn">⏸ Interrompue — reprise possible</span>'}.get(s["status"], s["status"])
    rep = ' <span class="tag t-info">↻ reprise</span>' if s.get("resumedFrom") else ""
    why = f'<div class="meta t-warn">Cause : {H(s["reason"])}</div>' if s.get("reason") else ""
    mdl = f'<div class="meta">Modèle demandé {H(s["requestedModelId"])} · observé {H(s["observedModelId"] or "—")}</div>' if s.get("requestedModelId") else ""
    return f'<li class="{cls}"><span class="n" aria-hidden="true"></span><div><div class="row between"><strong>{i}. {s["kind"]}</strong>{st}{rep}</div><div class="meta">{ex} · {hae(s["startedAt"])} · {dur(s["startedAt"],s["endedAt"])}</div>{mdl}{why}</div></li>'
TL = '<ol class="tl" aria-label="Frise des étapes">' + "".join(step_li(s,i+1) for i,s in enumerate(steps)) + "</ol>"
req = {s["requestedModelId"] for s in steps if s.get("requestedModelId")}
obs = {s["observedModelId"] for s in steps if s.get("observedModelId")}
verdict = "concordant" if req==obs and obs else "non confirmé"
head = steps[-1]["commitSha"][:8]
arts = M["artifacts"]
def artrows(n=None):
    return "".join(f'<tr><td>{H(a["kind"])}</td><td class="mono">{H(a["path"])}</td><td class="mono">{a["sha256"][:12]}…</td><td class="mono">{a.get("bytes","—")}</td></tr>' for a in arts[:n])

pages = {}
# ---------- PONT
pages["pont"] = ("Pont", f"""
<p class="eyebrow">Dimanche 25 octobre · 09 h 07 HAE {EX}</p><h2>Bonjour Michael. Une chose à reprendre, quatre à décider.</h2>
<p class="lede">Le reste est calme : rien d'autre ne demande votre attention.</p>
<div class="hero"><section class="card go" aria-labelledby="rep"><div class="row between"><h3 id="rep">↻ Reprendre là où vous étiez</h3>{RE}</div>
<p><strong>{H(M["title"])}</strong> — à relire. L'étape <em>correction</em> a été interrompue (<span class="mono">runner_died</span>) puis une étape <em>code</em> a repris la même session ; aperçu prêt à {hae(steps[-1]["endedAt"])}.</p>
<p class="meta">Branche {H(M["repo"].get("branch","atelier/329674b0") if isinstance(M.get("repo"),dict) else "atelier/329674b0")} · commit {head} · modèle observé {H(", ".join(obs))}</p>
<div class="row"><a class="btn p" href="atelier-session.html">Reprendre ici <span class="k">R</span></a><a class="btn" href="attention.html">Voir les nouveautés (2)</a></div></section>
<section class="card" aria-labelledby="st"><h3 id="st">État des opérations {EX}</h3><div class="grid2"><div><div class="big t-warn">4</div><div class="meta">décisions en attente</div></div><div><div class="big">0</div><div class="meta">exécutions en cours</div></div><div><div class="big">7</div><div class="meta">missions ouvertes</div></div><div><div class="big t-bad">1</div><div class="meta">accès expiré</div></div></div></section></div>
<p class="eyebrow">Attention — priorité {EX}</p>
<div class="grid2"><a class="card warn" href="attention.html" style="text-decoration:none"><span class="tag t-warn">◆ Décision</span><h3 style="margin-top:8px">Valider le budget pub de novembre</h3><p class="meta">Dadz Co. · bloque la mission « Campagne Q4 » · depuis 18 h</p></a>
<a class="card bad" href="connexion.html" style="text-decoration:none"><span class="tag t-bad">✕ Accès expiré</span><h3 style="margin-top:8px">Gmail — jeton expiré</h3><p class="meta">Léa ne peut plus lire les courriels clients · depuis 2 h</p></a></div>
<p class="eyebrow">Contextes</p><div class="grid3">
<div class="card"><div class="row"><span class="dot" aria-hidden="true"></span><h3>Dadz Co.</h3>{EX}</div><p class="meta">3 décisions · 5 missions · 4 employés</p></div>
<div class="card"><div class="row"><span class="dot" style="background:#7cc4ff" aria-hidden="true"></span><h3>Projet Oria</h3>{EX}</div><p class="meta">1 à relire · 2 missions</p></div>
<div class="card"><div class="row"><span class="dot" style="background:#ffb340" aria-hidden="true"></span><h3>Personnel</h3>{EX}</div><p class="meta">calme</p></div></div>""",
 f"""<h3>Activité réelle</h3><p class="meta">Seule une exécution observée s'anime ici. En ce moment : aucune.</p>
<ol class="list">{"".join(f'<li><div class="row between"><span>{s["kind"]} — {"✓" if s["status"]=="succeeded" else "⏸"}</span><span class="meta">{hae(s["endedAt"])}</span></div></li>' for s in steps[-4:][::-1])}</ol><p>{RE}</p>""")

ATT = [("warn","◆ Décision","Valider le budget pub de novembre","Dadz Co.","Mission « Campagne Q4 » en attente de votre accord : 1 200 $ demandés.","18 h","Approuver|Refuser|Reporter"),
       ("bad","✕ Accès expiré","Gmail — jeton expiré","Dadz Co.","Léa ne peut plus lire les courriels clients. Cause : jeton OAuth expiré.","2 h","Renouveler|Retirer l'accès"),
       ("info","? Précision","Quel ton pour l'infolettre ?","Dadz Co.","Hugo hésite entre « chaleureux » et « direct ».","5 h","Répondre"),
       ("warn","$ Budget","Quota Codex à 82 %","Projet Oria","3 missions planifiées pourraient échouer (subscription_quota).","1 h","Voir les quotas|Reporter"),
       ("go","✓ À relire","Calculatrice de pourboire","Projet Oria","Aperçu prêt, tests réussis.","4 h","Ouvrir l'atelier")]
def attcard(a, real=False):
    k,t,ti,c,d,since,acts = a
    btns = "".join(f'<a class="btn {"p" if i==0 else ""}" href="{"atelier-session.html" if "atelier" in x else "mission.html" if x=="Approuver" else "connexion.html" if x=="Renouveler" else "attention.html"}">{x}</a>' for i,x in enumerate(acts.split("|")))
    return f'<li class="card {k}"><div class="row between"><span class="tag t-{k}">{t}</span><span class="meta">{c} · depuis {since}</span></div><h3 style="margin-top:8px">{ti}</h3><p>{d}</p><div class="row">{btns}{RE if real else EX}</div></li>'
pages["attention"] = ("Centre d'attention", f"""<h2>Centre d'attention</h2><p class="lede">Tout ce qui attend une décision de votre part, au même endroit. <span class="k">J</span>/<span class="k">K</span> naviguer · <span class="k">Entrée</span> ouvrir · <span class="k">H</span> reporter.</p>
<div class="row" role="group" aria-label="Filtres"><a class="btn p" href="attention.html" aria-current="true">Priorité (5)</a><a class="btn" href="attention.html">Tout</a><a class="btn" href="attention.html">Reportés (1)</a></div>
<ul class="list" style="margin-top:16px">{"".join(attcard(a, a[2]==M["title"]) for a in ATT)}</ul>""",
 f"""<h3>Décision : budget pub de novembre {EX}</h3><dl class="kv"><dt>Contexte</dt><dd>Dadz Co.</dd><dt>Demandé par</dt><dd>Hugo (marketing)</dd><dt>Montant</dt><dd class="mono">1 200,00 $</dd><dt>Bloque</dt><dd>Mission « Campagne Q4 »</dd><dt>Raison</dt><dd>Coût par clic d'octobre en baisse ; Hugo propose d'augmenter de 20 %.</dd></dl>
<div class="row" style="margin-top:16px"><a class="btn p" href="mission.html">Approuver</a><a class="btn">Refuser</a><a class="btn">Reporter à demain 9 h</a></div>""")

pages["fiche"] = ("Fiche vivante — Dadz Co.", f"""<p class="eyebrow">Fiche d'entreprise · mode Carte {EX}</p><h2>Dadz Co.</h2><p class="lede">Vêtements pour pères. Boutique en ligne, Québec.</p>
<section class="card" aria-labelledby="obj"><h3 id="obj">Objectif du trimestre</h3><p style="font-size:18px;font-family:var(--display)">Atteindre 300 commandes par mois d'ici le 31 décembre.</p><div class="meter" role="img" aria-label="Progression 62 %"><i style="width:62%"></i></div><p class="meta">186 / 300 en octobre · mis à jour 09 h 00 HAE</p></section>
<div class="grid2"><section class="card" aria-labelledby="dec"><h3 id="dec">Décisions en attente (3)</h3><ul class="list"><li>Budget pub de novembre</li><li>Ton de l'infolettre</li><li>Renouveler l'accès Gmail</li></ul><a class="btn" href="attention.html">Ouvrir l'attention</a></section>
<section class="card" aria-labelledby="eqp"><h3 id="eqp">Équipe (facultative)</h3><ul class="list"><li class="row"><span class="av">LA</span>Léa — analyste clients</li><li class="row"><span class="av">HU</span>Hugo — marketing</li></ul><a class="btn" href="equipe.html">Voir l'équipe</a></section></div>
<section class="card" aria-labelledby="res"><h3 id="res">Résultats récents</h3><table><thead><tr><th>Date</th><th>Résultat</th><th>Par</th></tr></thead><tbody><tr><td class="mono">24 oct.</td><td>Rapport hebdo des ventes livré</td><td>Léa</td></tr><tr><td class="mono">22 oct.</td><td>12 visuels Instagram</td><td>Hugo</td></tr></tbody></table></section>
<section class="card" aria-labelledby="ch"><h3 id="ch">Ce que ce contexte change</h3><p class="meta">Conversations, documents, accès et missions affichés sont filtrés sur Dadz Co. Changer de contexte : <span class="k">Ctrl 1…9</span>.</p></section>""", mode_flag:=None)
pages["fiche"] = pages["fiche"][:3]

CONVS=[("LA","Léa","analyste clients","Résumé des avis clients prêt","09 h 01"),("HU","Hugo","marketing","Deux propositions de ton","hier"),("◆","Groupe lancement","Léa, Hugo, vous","Plan de lancement Q4","jeu.")]
pages["conversations"] = ("Conversations", f"""<h2>Conversations</h2><p class="lede">Dadz Co. · 1:1 et groupes. Filtrées par le contexte actif.</p>
<ul class="list">{"".join(f'<li><a class="row" href="conversation.html"><span class="av" aria-hidden="true">{a}</span><div style="flex:1"><h3>{n} <span class="meta">— {r}</span></h3><div class="meta">{d}</div></div><span class="meta">{t}</span>{EX}</a></li>' for a,n,r,d,t in CONVS)}</ul>""")

pages["conversation"] = ("Conversation — Léa", f"""<a class="btn mobile-back" href="conversations.html">← Conversations</a>
<div class="row between"><div class="row"><span class="av">LA</span><div><h2>Léa</h2><div class="meta">Analyste clients · modèle observé gpt-5.6-luna {NC} · runtime Codex CLI</div></div></div>{EX}</div>
<div role="log" aria-label="Messages" style="margin-top:16px"><div class="msg me">Peux-tu préparer chaque lundi un rapport des ventes de la semaine, avec les 3 produits en hausse ?</div>
<div class="msg"><strong>Léa</strong> · 09 h 01 HAE<br>Oui. Cela ressemble à une tâche récurrente : je propose d'en faire une mission pour que le résultat, le budget et les permissions soient clairs.</div>
<section class="card go" aria-labelledby="mc" style="max-width:640px"><div class="row between"><h3 id="mc">Proposition de mission</h3><span class="tag t-soft">Brouillon</span></div>
<dl class="kv"><dt>Résultat attendu</dt><dd>Rapport PDF chaque lundi 8 h HAE</dd><dt>Responsable</dt><dd>Léa</dd><dt>Modèle</dt><dd>gpt-5.6-luna (demandé)</dd><dt>Outils</dt><dd>Shopify (lecture), Google Drive (écriture)</dd><dt>Budget</dt><dd class="mono">≤ 2 $ / semaine</dd><dt>Permissions</dt><dd>Aucun envoi externe sans votre accord</dd></dl>
<div class="row" style="margin-top:12px"><a class="btn p" href="mission.html">Transformer en mission</a><a class="btn">Modifier</a></div></section></div>
<div class="composer"><label for="cmp">Écrire à Léa…</label><input id="cmp" style="flex:3;background:transparent;border:0;color:var(--ink)" aria-label="Message à Léa"><a class="btn p">Envoyer</a></div>""",
 f"""<h3>Participants</h3><ul class="list"><li class="row"><span class="av">MB</span>Michael — propriétaire</li><li class="row"><span class="av">LA</span>Léa — analyste clients</li></ul><h3 style="margin-top:16px">Documents liés</h3><p class="meta">ventes-oct.csv {EX}</p>""")

MISS=[("Rapport hebdo des ventes","Léa","En cours","go"),("Campagne Q4","Hugo","Bloquée — décision","warn"),("Calculatrice de pourboire","Atelier","À relire","info")]
pages["missions"] = ("Missions", f"""<h2>Missions</h2><p class="lede">Chaque mission a un résultat attendu, un responsable, un budget et des permissions.</p>
<table><thead><tr><th>Mission</th><th>Responsable</th><th>Statut</th><th>Provenance</th></tr></thead><tbody>{"".join(f'<tr><td><a href="{"atelier-session.html" if n==M["title"] else "mission.html"}">{n}</a></td><td>{r}</td><td><span class="tag t-{k}">{s}</span></td><td>{RE if n==M["title"] else EX}</td></tr>' for n,r,s,k in MISS)}</tbody></table>""")

pages["mission"] = ("Mission — Rapport hebdo des ventes", f"""<a class="btn mobile-back" href="missions.html">← Missions</a>
<div class="row between"><h2>Rapport hebdo des ventes</h2>{EX}</div><p class="lede">Née de la conversation avec Léa · 25 oct. 09 h 02 HAE</p>
<div class="grid2"><section class="card" aria-labelledby="c1"><h3 id="c1">Contrat</h3><dl class="kv"><dt>Résultat attendu</dt><dd>Rapport PDF chaque lundi 8 h HAE</dd><dt>Responsable</dt><dd>Léa</dd><dt>Budget</dt><dd class="mono">≤ 2,00 $ / semaine</dd><dt>Permissions</dt><dd>Shopify lecture · Drive écriture · aucun envoi externe</dd></dl></section>
<section class="card" aria-labelledby="c2"><h3 id="c2">Preuve de modèle</h3><dl class="kv"><dt>Demandé</dt><dd class="mono">gpt-5.6-luna</dd><dt>Observé</dt><dd>— {NC}</dd><dt>Mode</dt><dd>Autonome, approbation requise avant envoi</dd></dl></section></div>
<section class="card" aria-labelledby="c3"><h3 id="c3">Prochaine exécution</h3><p>Lundi 26 oct. 08 h 00 HAE. Rien ne tourne pour l'instant.</p><div class="row"><a class="btn p">Lancer maintenant</a><a class="btn d">Arrêter la mission</a></div><p class="meta">« Lancer » demande une confirmation (2 actions).</p></section>""")

EMP=[("LA","Léa","Analyste clients","Lire les avis et ventes, produire des rapports","Codex CLI","gpt-5.6-luna"),("HU","Hugo","Marketing","Proposer campagnes et visuels","Claude Code","—")]
pages["equipe"] = ("Équipe", f"""<h2>Équipe</h2><p class="lede">Facultative : un employé est un rôle avec un mandat et des droits explicites.</p><div class="grid2">{"".join(f'<a class="card" href="employe.html" style="text-decoration:none"><div class="row"><span class="av">{a}</span><div><h3>{n}</h3><div class="meta">{p}</div></div></div><p>{m}</p><div class="row meta">{rt} · modèle {mo} {EX}</div></a>' for a,n,p,m,rt,mo in EMP)}</div>""")

pages["employe"] = ("Fiche employé — Léa", f"""<a class="btn mobile-back" href="equipe.html">← Équipe</a>
<div class="row"><span class="av" style="width:56px;height:56px;font-size:18px">LA</span><div><h2>Léa</h2><div class="meta">ID stable emp_7f3a… · Analyste clients</div></div>{EX}</div>
<div class="grid2" style="margin-top:16px"><section class="card" aria-labelledby="e1"><h3 id="e1">Identité</h3><dl class="kv"><dt>Poste</dt><dd>Analyste clients</dd><dt>Rôle</dt><dd>Membre</dd><dt>Mandat</dt><dd>Lire les avis et ventes, produire des rapports</dd><dt>Runtime</dt><dd>Codex CLI (abonnement)</dd><dt>Modèle</dt><dd>gpt-5.6-luna {NC}</dd></dl></section>
<section class="card" aria-labelledby="e2"><h3 id="e2">Droits (séparés)</h3><table><thead><tr><th>Accès</th><th>Niveau</th></tr></thead><tbody><tr><td>Shopify</td><td>Lecture</td></tr><tr><td>Google Drive</td><td>Écriture</td></tr><tr><td>Gmail</td><td class="t-bad">✕ Expiré</td></tr></tbody></table></section></div>
<div class="row"><a class="btn p" href="conversation.html">Écrire à Léa</a><a class="btn">Modifier les droits</a></div>""")

pages["atelier"] = ("Atelier", f"""<h2>Atelier</h2><p class="lede">Là où le code se fabrique, étape par étape, avec preuves.</p>
<ul class="list"><li><a class="row between" href="atelier-session.html"><div><h3>{H(M["title"])}</h3><div class="meta">Projet Oria · {len(steps)} étapes · {len(arts)} artefacts · commit {head}</div></div><span class="tag t-info">À relire</span>{RE}</a></li>
<li class="row between"><div><h3>Page de contact</h3><div class="meta">Dadz Co. · bloquée (subscription_quota)</div></div><span class="tag t-bad">Bloquée (abonnement/quota)</span>{EX}</li></ul>""")

pages["atelier-session"] = ("Atelier — "+M["title"], f"""<a class="btn mobile-back" href="atelier.html">← Atelier</a>
<div class="row between"><div><p class="eyebrow">Session d'atelier {RE}</p><h2>{H(M["title"])}</h2></div><span class="tag t-info">À relire</span></div>
<p class="lede">{H(M.get("need",""))[:220]}</p>
<div class="grid2"><section class="card" aria-labelledby="fr"><h3 id="fr">Frise</h3>{TL}</section>
<section aria-labelledby="ap"><h3 id="ap">Aperçu (dernière étape preview)</h3><div class="preview" role="img" aria-label="Aperçu de l'application calculatrice de pourboire"><strong>Calculatrice de pourboire</strong><label>Montant de l'addition</label><div class="f">48,00</div><label>Pourboire</label><div class="f">15 %</div><p><strong>Total : 55,20</strong></p></div>
<p class="meta">Rendu illustratif de la maquette ; l'aperçu réel est servi par le runner.</p>
<h3 style="margin-top:16px">Décision</h3><div class="row"><a class="btn p">Accepter</a><a class="btn">Demander une correction</a><a class="btn d">Rejeter</a></div></section></div>
<section class="card" aria-labelledby="ar"><h3 id="ar">Artefacts ({len(arts)}) — empreintes sha256</h3><div style="overflow:auto" tabindex="0" role="region" aria-label="Tableau des artefacts, défilable"><table><thead><tr><th>Type</th><th>Chemin</th><th>sha256</th><th>Octets</th></tr></thead><tbody>{artrows(6)}</tbody></table></div><p class="meta">6 premiers affichés sur {len(arts)}.</p></section>""",
 f"""<h3>Preuves</h3><dl class="kv"><dt>Modèle demandé</dt><dd class="mono">{H(", ".join(req))}</dd><dt>Modèle observé</dt><dd class="mono">{H(", ".join(obs))}</dd><dt>Verdict</dt><dd class="t-go">✓ {verdict}</dd><dt>Session</dt><dd class="mono">{H(str(M.get("sessionId")))}</dd><dt>Tête</dt><dd class="mono">{head}</dd><dt>Étape reprise</dt><dd>code ← session {steps[5]["resumedFrom"][:8]}…</dd></dl>
<p class="meta" style="margin-top:12px">Source : mission.json, branche atelier/e1-d. Heures converties en HAE.</p>{RE}""")

CX=[("Gmail","Abonnement Google","Lire, brouillons","—","il y a 3 j",PE,"Léa","Expiré","bad"),("Codex CLI","Abonnement ChatGPT","Code, tests","82 %","il y a 1 h","","Atelier","Actif","go"),("Shopify","API","Commandes (lecture)","12 %","il y a 20 min","","Léa, Hugo","Actif","go")]
pages["connexions"] = ("Connexions", f"""<h2>Connexions</h2><p class="lede">Chaque compte : mode, capacités, quota, dernier test, employés autorisés, expiration.</p>
<table><thead><tr><th>Compte</th><th>Mode</th><th>Capacités</th><th>Quota</th><th>Dernier test</th><th>Autorisés</th><th>État</th></tr></thead><tbody>{"".join(f'<tr><td><a href="connexion.html">{n}</a> {EX}</td><td>{m}</td><td>{c}</td><td class="mono">{q}</td><td>{t} {p}</td><td>{e}</td><td><span class="tag t-{k}">{s}</span></td></tr>' for n,m,c,q,t,p,e,s,k in CX)}</tbody></table>""")

pages["connexion"] = ("Connexion — Gmail", f"""<a class="btn mobile-back" href="connexions.html">← Connexions</a><div class="row between"><h2>Gmail</h2>{EX}</div>
<section class="card bad" aria-labelledby="b"><h3 id="b">✕ Action impossible : lire les courriels clients</h3><p><strong>Cause :</strong> jeton OAuth expiré le 24 oct. à 22 h 10 HAE. <strong>Choix :</strong></p><div class="row"><a class="btn p">Renouveler l'accès</a><a class="btn">Retirer l'accès de Léa</a></div></section>
<div class="grid2"><section class="card" aria-labelledby="d1"><h3 id="d1">Détails</h3><dl class="kv"><dt>Compte</dt><dd>boutique@dadzco.example</dd><dt>Mode</dt><dd>Abonnement (OAuth)</dd><dt>Capacités</dt><dd>Lire, créer des brouillons — jamais envoyer seul</dd><dt>Dernier test</dt><dd>22 oct. 14 h 00 HAE {PE}</dd></dl></section>
<section class="card" aria-labelledby="d2"><h3 id="d2">Quota</h3><div class="meter" role="img" aria-label="Quota 0 % utilisé"><i style="width:2%"></i></div><p class="meta">— (inaccessible tant que expiré)</p><h3 style="margin-top:12px">Employés autorisés</h3><p>Léa</p></section></div>""")

pages["palette"] = ("Palette de commandes", pages["pont"][1], pages["pont"][2])
pages["etats"] = ("États des écrans", f"""<h2>Les quatre états</h2><p class="lede">Chaque liste d'Oria a exactement ces états, au même endroit.</p>
<div class="grid2"><section class="card" aria-labelledby="s1"><h3 id="s1">Vide</h3><p>Aucune décision en attente. Le pont est calme.</p><a class="btn">Créer une mission</a></section>
<section class="card" aria-labelledby="s2" aria-busy="true"><h3 id="s2">Chargement</h3><div class="skel" style="width:80%"></div><div class="skel" style="width:60%"></div><p class="meta" aria-live="polite">Chargement des missions…</p></section>
<section class="card bad" aria-labelledby="s3"><h3 id="s3">Erreur</h3><p><strong>Impossible de lire les missions.</strong> Cause : la base ne répond pas (délai 10 s). Que faire : réessayer, ou voir le journal.</p><div class="row"><a class="btn p">Réessayer</a><a class="btn">Voir le journal</a></div></section>
<section class="card warn" aria-labelledby="s4"><h3 id="s4">Refusé</h3><p><strong>Léa ne peut pas envoyer ce courriel.</strong> Cause : envoi externe non permis par la mission. Choix :</p><div class="row"><a class="btn p">Autoriser une fois</a><a class="btn">Garder en brouillon</a></div></section></div>
<p class="eyebrow">Provenance</p><div class="row">{RE}{EX}{NC}{PE}</div>
<p class="eyebrow">Modèle divergent (alerte)</p><section class="card bad"><strong>✕ Modèle divergent :</strong> demandé gpt-5.6-luna, observé autre-modèle. Résultats non validés. {EX}</section>""")

INDEX_ORDER = ["pont","attention","fiche","conversations","conversation","missions","mission","equipe","employe","atelier","atelier-session","connexions","connexion","palette","etats"]
for slug,(title,body,*dr) in pages.items():
    drawer = dr[0] if dr else ""
    mode = "carte" if slug=="fiche" else None
    (OUT/f"{slug}.html").write_text(shell(slug,title,body,drawer,mode=mode,palette=(slug=="palette")))
idx = "".join(f'<li><a href="{s}.html">{pages[s][0]}</a> <span class="meta">{s}.html</span></li>' for s in INDEX_ORDER)
(OUT/"index.html").write_text(f"""<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prototype Oria v3 « Pont »</title><style>{CSS}</style></head><body><main id="main" class="full"><div class="content">
<h1 style="font:700 36px var(--display);margin:24px 0 4px">Oria v3 — « Pont »</h1><p class="lede">Prototype statique cliquable. Données {EX} sauf l'atelier « {H(M["title"])} » {RE}. Ouvrez une page puis naviguez avec le rail.</p>
<ol class="list">{idx}</ol><p class="meta">Mode Carte (clair) : fiche.html. Mobile : réduire la fenêtre à 390 px.</p></div></main></body></html>""")
print("ok", len(pages)+1)
