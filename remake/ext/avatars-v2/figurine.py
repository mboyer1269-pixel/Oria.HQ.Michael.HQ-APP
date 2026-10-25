"""Famille « Billy Figurine » — RECOMMANDÉE. Les pixels sont ceux des images de Michael (planche « Avatars IA — concept 01 »
et affiche « Billy Bouton »), détourés localement (rembg, modèles isnet/u2net, sans API). Rien n'est redessiné.
Couches CSS/SVG par-dessus l'image : respiration + flottement, halo néon, cadran Astrolabe à facettes (1 facette = 1 étape
terminée), ondes (écoute), orbite de particules (réflexion), badge + icône (bloqué/erreur), éclat (terminé).
Recoloration de l'IMAGE : un calque couleur var(--a) en mix-blend-mode:color, masqué par <nom>.m.webp (pixels saturés
seulement : néon du casque, accents de tenue). Les blancs (peau/visage) et les noirs ont une saturation ~0 => intacts.
render(v, state, size, prog=(fait,total), pose='corps'|'buste'|'tete'|'exp-<agent>-<nom>', name=..., tint=None)."""
import json, pathlib, math
from hybride import V, SEM
D=pathlib.Path(__file__).resolve().parent/"figurine"
META=json.loads((D/"meta.json").read_text())
BASE="../avatars-v2/figurine/"
STL={"idle":"au repos","listening":"écoute","thinking":"réfléchit","executing":"exécute","waiting":"bloqué — attend votre décision","done":"a terminé","error":"en erreur"}
POSE={"corps":"corps entier","buste":"buste","tete":"tête"}
EXPN={"ori-joie":"ORI — joie (affiche)","ori-clin":"ORI — casquette, clin d'œil (affiche)","nexus-focus":"NEXUS — concentré (affiche)",
 "nova-pouce":"NOVA — pouce levé (affiche)","scout-idee":"SCOUT — idée, ordinateur (affiche)","scout-jumelles":"SCOUT — jumelles (affiche)",
 "pulse-ecoute":"PULSE — casque audio (affiche)","pulse-pouce":"PULSE — pouce levé (affiche)","aegis-garde":"AEGIS — en garde (affiche)","aegis-fier":"AEGIS — fier (affiche)"}
def poses(v): return ["corps","buste","tete"]+["exp-"+k for k in EXPN if k.startswith(v+"-")]
def _asset(v,pose,size):
    if size<=40: return f"{v}-tete-64",(1,1)
    if pose.startswith("exp-"): w,h=META[pose]; return pose,(w/h,1)
    k={"corps":"full","buste":"buste","tete":"tete"}[pose]; w,h=META[v][k]
    return f"{v}-{'corps' if pose=='corps' else pose}",(w/h,1)
def P(cx,cy,r,a): return f"{cx+r*math.cos(a):.2f},{cy+r*math.sin(a):.2f}"
def dial(n,k):
    segs=""
    for i in range(n):
        a0=math.radians(i*360/n+4-90);a1=math.radians((i+1)*360/n-4-90)
        d=f"M{P(50,50,48,a0)} A48,48 0 0 1 {P(50,50,48,a1)} L{P(50,50,42,a1)} A42,42 0 0 0 {P(50,50,42,a0)}Z"
        segs+=f'<path d="{d}" class="{"on" if i<k else "off"}"/>'
    return f'<svg class="fg-dial" viewBox="0 0 100 100" aria-hidden="true">{segs}</svg>'
def render(v,state,size,prog=None,pose="corps",name=None,tint=None):
    nm=name or V[v][0]; c=V[v][2]; a,(r,_)=_asset(v,pose,size); small=size<=40
    w=round(size*r); pr=prog or (3,5)
    pl="tête" if small else (EXPN[pose[4:]] if pose.startswith("exp-") else POSE[pose])
    alt=f"{nm}, figurine Billy ({pl}) — état : {STL[state]}"+(f", étape {pr[0]} sur {pr[1]}" if state=="executing" else "")
    lay=""
    if state=="executing": lay+=dial(pr[1],pr[0])
    if state=="listening": lay+='<svg class="fg-waves" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="30"/><circle cx="50" cy="50" r="30"/><circle cx="50" cy="50" r="30"/></svg>'
    if state=="thinking": lay+='<span class="fg-orb" aria-hidden="true"><i></i><i></i><i></i></span>'
    if state=="done": lay+='<svg class="fg-burst" viewBox="0 0 100 100" aria-hidden="true">'+"".join(f'<line x1="{P(50,50,30,math.radians(i*45))}".split(",")[0] />' for i in range(0))+"".join(f'<path d="M{P(50,50,34,math.radians(i*30))} L{P(50,50,46,math.radians(i*30))}"/>' for i in range(12))+'</svg>'
    badge=""
    if state in("waiting","error","done"):
        ic={"waiting":'<rect x="7" y="6" width="3" height="10" rx="1"/><rect x="12" y="6" width="3" height="10" rx="1"/>',
            "error":'<rect x="9.6" y="5" width="2.8" height="8" rx="1.2"/><circle cx="11" cy="16.2" r="1.6"/>',
            "done":'<path d="M6 11.5l3.4 3.4L16 8" fill="none" stroke="#06110a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'}[state]
        badge=f'<svg class="fg-badge" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="10" fill="{SEM[state]}" stroke="#07090a" stroke-width="1.5"/><g fill="#1a0e00">{ic}</g></svg>'
    tv="" if tint is None else f";--tint:{1 if tint else 0}"
    return (f'<span class="ov2 fg fg-{state}{" fg-sm" if small else ""}" style="--agent-accent:{c};--sem:{SEM.get(state,"var(--a)")};width:{max(w,size) if state!="executing" else max(w,size)}px;height:{size}px{tv}" data-fam="figurine">'
      f'<span class="fg-halo" aria-hidden="true"></span>{lay if state in("executing","listening") else ""}'
      f'<span class="fg-body" style="width:{w}px;height:{size}px"><img src="{BASE}{a}.webp" width="{w}" height="{size}" alt="{alt}" decoding="async">'
      f'<span class="fg-tint" aria-hidden="true" style="-webkit-mask-image:url({BASE}{a}.m.webp);mask-image:url({BASE}{a}.m.webp)"></span></span>'
      f'{lay if state in("thinking","done") else ""}{badge}</span>')
CSS=r"""
.fg{--a:var(--brand-accent,var(--agent-accent));--tint:0;position:relative;display:inline-grid;place-items:end center;vertical-align:middle;isolation:isolate}
.fg-body{position:relative;display:block;isolation:isolate;transform-origin:50% 100%}.fg-body img{display:block;width:100%;height:100%;object-fit:contain}
.fg-tint{position:absolute;inset:0;background:var(--a);mix-blend-mode:color;opacity:var(--tint);-webkit-mask-size:100% 100%;mask-size:100% 100%;pointer-events:none}
.fg-tint::after{content:"";position:absolute;inset:0;background:var(--a);mix-blend-mode:soft-light;opacity:.55}
.fg-halo{position:absolute;left:50%;top:34%;width:86%;aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--a) 42%,transparent) 0,color-mix(in srgb,var(--a) 14%,transparent) 45%,transparent 70%);z-index:-1;opacity:.75}
.fg-sm .fg-halo{top:50%;width:120%}
.ov2.fg .fg-dial{position:absolute;left:50%;top:34%;width:96%;transform:translate(-50%,-50%);z-index:-1}.ov2.fg.fg-sm .fg-dial{top:50%;width:118%}
.fg-dial .on{fill:var(--a);filter:drop-shadow(0 0 3px var(--a))}.fg-dial .off{fill:none;stroke:color-mix(in srgb,var(--a) 55%,#5c6b66);stroke-width:1.2}
.ov2.fg .fg-waves{position:absolute;left:50%;top:34%;width:110%;transform:translate(-50%,-50%);z-index:-1;overflow:visible}.ov2.fg.fg-sm .fg-waves{top:50%;width:130%}
.fg-waves circle{fill:none;stroke:var(--a);stroke-width:2.2;opacity:.55}.fg-waves circle:nth-child(2){r:38px;opacity:.35}.fg-waves circle:nth-child(3){r:46px;opacity:.2}
.fg-orb{position:absolute;left:50%;top:30%;width:70%;aspect-ratio:1;transform:translate(-50%,-50%);pointer-events:none}.fg-sm .fg-orb{top:50%;width:110%}
.fg-orb i{position:absolute;width:9%;aspect-ratio:1;border-radius:50%;background:var(--a);box-shadow:0 0 6px var(--a);left:45.5%;top:-4%}
.fg-orb i:nth-child(2){left:93%;top:60%}.fg-orb i:nth-child(3){left:-2%;top:60%}
.ov2.fg .fg-burst{position:absolute;left:50%;top:34%;width:120%;transform:translate(-50%,-50%);overflow:visible;pointer-events:none}.ov2.fg.fg-sm .fg-burst{top:50%}
.fg-burst path{stroke:var(--sem);stroke-width:3;stroke-linecap:round}
.ov2.fg .fg-badge{position:absolute;right:2%;top:4%;width:max(16px,24%);aspect-ratio:1;filter:drop-shadow(0 1px 2px #000)}.ov2.fg.fg-sm .fg-badge{right:-6%;top:-6%;width:46%}
.fg-error .fg-halo{background:radial-gradient(circle,color-mix(in srgb,var(--sem) 40%,transparent),transparent 68%)}
.fg-waiting .fg-halo{background:radial-gradient(circle,color-mix(in srgb,var(--sem) 34%,transparent),transparent 68%)}
.fg-error .fg-body img,.fg-waiting .fg-body img{filter:saturate(.75)}
@media (prefers-reduced-motion:no-preference){
:root:not(.rm) .fg-idle .fg-body,:root:not(.rm) .fg-executing .fg-body,:root:not(.rm) .fg-thinking .fg-body,:root:not(.rm) .fg-listening .fg-body{animation:fgbreath 3.2s ease-in-out infinite,fgfloat 4.8s ease-in-out infinite}
:root:not(.rm) .fg-halo{animation:fghalo 2.4s ease-in-out infinite}
:root:not(.rm) .fg-waves circle{animation:fgwave 2.4s ease-out infinite}:root:not(.rm) .fg-waves circle:nth-child(2){animation-delay:.8s}:root:not(.rm) .fg-waves circle:nth-child(3){animation-delay:1.6s}
:root:not(.rm) .fg-orb{animation:fgorb 2.8s linear infinite}
:root:not(.rm) .fg-dial .on:last-of-type{animation:fghalo 1.8s ease-in-out infinite}
:root:not(.rm) .fg-burst{animation:fgburst 1.8s ease-out 1 both}
:root:not(.rm) .fg-error .fg-body{animation:fgshake 1.6s ease-in-out 1}
:root:not(.rm) .fg-waiting .fg-badge{animation:fghalo 2s ease-in-out infinite}}
@keyframes fgbreath{0%,100%{scale:1 1}50%{scale:1.008 1.018}}
@keyframes fgfloat{0%,100%{translate:0 0}50%{translate:0 -3%}}
@keyframes fghalo{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes fgwave{0%{transform:scale(.8);opacity:.7}100%{transform:scale(1.25);opacity:0}}
.fg-waves circle{transform-box:fill-box;transform-origin:center}
@keyframes fgorb{to{transform:translate(-50%,-50%) rotate(360deg)}}
@keyframes fgburst{0%{opacity:0;transform:translate(-50%,-50%) scale(.6)}35%{opacity:1}100%{opacity:0;transform:translate(-50%,-50%) scale(1.15)}}
@keyframes fgshake{0%,100%{translate:0}20%{translate:-3px}40%{translate:3px}60%{translate:-2px}80%{translate:2px}}
"""
