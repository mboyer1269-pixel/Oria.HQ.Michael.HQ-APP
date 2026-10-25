"""Famille « Billy Figurine » (recommandée) — v2 « scène ».
Pixels = images de Michael (planche « concept 01 » + affiche « Billy Bouton »), détourés localement (rembg) ; rien n'est redessiné.
Couches (transform/opacity uniquement) : socle + ombre de contact, halo-anneau calé sur le casque réel, regard (parallaxe
--gx/--gy posée par figurine.js), squash & stretch d'entrée d'état, cadran à facettes qui « cliquent », ondes réactives au
micro (--lvl), particules qui forment le glyphe du rôle, sablier sur le casque, affaissement + badge, célébration par rôle,
reflet de néon rare au repos. Recoloration de l'IMAGE : calque var(--a) en mix-blend-mode:color masqué par les pixels
saturés (masks.css, data URI => marche aussi en file://).
render(v, state, size, prog=(fait,total), pose, name, tint)."""
import json, pathlib, math
from hybride import V, SEM
D=pathlib.Path(__file__).resolve().parent/"figurine"
META=json.loads((D/"meta.json").read_text())
HEAD=json.loads((D.parent/"figurine-src"/"heads.json").read_text())
BASE="../avatars-v2/figurine/"
STL={"idle":"au repos","listening":"écoute","thinking":"réfléchit","executing":"exécute","waiting":"bloqué — attend votre décision","done":"a terminé","error":"en erreur"}
POSE={"corps":"corps entier","buste":"buste","tete":"tête"}
EXPN={"ori-joie":"ORI — joie (affiche)","ori-clin":"ORI — casquette, clin d'œil (affiche)","nexus-focus":"NEXUS — concentré (affiche)",
 "nova-pouce":"NOVA — pouce levé (affiche)","scout-idee":"SCOUT — idée, ordinateur (affiche)","scout-jumelles":"SCOUT — jumelles (affiche)",
 "pulse-ecoute":"PULSE — casque audio (affiche)","pulse-pouce":"PULSE — pouce levé (affiche)","aegis-garde":"AEGIS — en garde (affiche)","aegis-fier":"AEGIS — fier (affiche)"}
# Expressions de l'affiche associées à un état SEULEMENT quand le geste le dit déjà (option « expressions d'état »).
EXPMAP={"done":{"ori":"exp-ori-joie","nova":"exp-nova-pouce","pulse":"exp-pulse-pouce","aegis":"exp-aegis-fier"},
        "thinking":{"scout":"exp-scout-jumelles","nexus":"exp-nexus-focus"},"listening":{"pulse":"exp-pulse-ecoute"},
        "waiting":{"aegis":"exp-aegis-garde"},"executing":{"scout":"exp-scout-idee"}}
GLYPH={"ori":[(-1,.5),(-.62,-.35),(-.3,.15),(0,-.75),(.3,.15),(.62,-.35),(1,.5),(0,.5)],
 "nexus":[(-.95,0),(-.5,-.5),(-.5,.5),(.18,-.7),(-.18,.7),(.95,0),(.5,-.5),(.5,.5)],
 "nova":[(0,-1),(0,1),(-1,0),(1,0),(0,-.42),(0,.42),(-.42,0),(.42,0)],
 "scout":[(-.2+.5*math.cos(a),-.2+.5*math.sin(a)) for a in [i*math.pi/3 for i in range(6)]]+[(.45,.45),(.8,.8)],
 "pulse":[(-1,.7),(-.6,.3),(-.2,.5),(.2,-.1),(.6,.1),(1,-.6),(.72,-.68),(1,-.3)],
 "aegis":[(0,-.9),(.7,-.6),(.75,.1),(.4,.65),(0,.95),(-.4,.65),(-.75,.1),(-.7,-.6)]}
GLN={"ori":"couronne","nexus":"</>","nova":"étincelle","scout":"loupe","pulse":"courbe montante","aegis":"bouclier"}
def poses(v): return ["corps","buste","tete"]+["exp-"+k for k in EXPN if k.startswith(v+"-")]
def _asset(v,pose,size):
    if size<=40: return f"{v}-tete-64",1.0,(.5,.47,.42)
    if pose.startswith("exp-"): w,h=META[pose]; return pose,w/h,(.5,.42,.4)
    hx,hy,hs=HEAD[v]
    if pose=="tete": w,h=META[v]["tete"]; return f"{v}-tete",w/h,(.5,.47,.42)
    w,h=META[v]["full"]; cy=(hy*h+.47*hs*w)/h; r=.42*hs
    if pose=="corps": return f"{v}-corps",w/h,(hx,cy,r)
    bw,bh=META[v]["buste"]; return f"{v}-buste",bw/bh,(hx,cy/.66,r)
def P(cx,cy,r,a): return f"{cx+r*math.cos(a):.2f},{cy+r*math.sin(a):.2f}"
def dial(n,k):
    segs=""
    for i in range(n):
        a0=math.radians(i*360/n+4-90);a1=math.radians((i+1)*360/n-4-90)
        d=f"M{P(50,50,48,a0)} A48,48 0 0 1 {P(50,50,48,a1)} L{P(50,50,42,a1)} A42,42 0 0 0 {P(50,50,42,a0)}Z"
        segs+=f'<path d="{d}" class="{"on" if i<k else "off"}{" new" if i==k-1 else ""}"/>'
    return f'<svg class="fg-dial" viewBox="0 0 100 100" aria-hidden="true">{segs}</svg>'
CELEB={ # célébration courte propre au rôle (jouée une fois à l'entrée en « terminé »)
 "ori":'<path class="c1" d="M30 40 L36 24 L44 34 L50 18 L56 34 L64 24 L70 40Z"/>',
 "nexus":'<path class="c1" d="M36 22 L26 30 L36 38 M64 22 L74 30 L64 38 M54 18 L46 42" fill="none" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
 "nova":"".join(f'<circle class="c1 d{i}" cx="{50+22*math.cos(i*math.pi/3):.1f}" cy="{30+16*math.sin(i*math.pi/3):.1f}" r="{3+i%3}"/>' for i in range(6)),
 "scout":'<circle class="c1 ring" cx="50" cy="30" r="16" fill="none" stroke-width="3"/><path class="c1" d="M50 18 l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>',
 "pulse":'<rect class="c1 b1" x="34" y="26" width="7" height="14" rx="2"/><rect class="c1 b2" x="46" y="20" width="7" height="20" rx="2"/><rect class="c1 b3" x="58" y="12" width="7" height="28" rx="2"/>',
 "aegis":'<path class="c1" d="M50 12 L66 18 L64 32 Q60 42 50 46 Q40 42 36 32 L34 18Z" fill="none" stroke-width="3.5"/><path class="c1" d="M43 29 l5 5 9-10" fill="none" stroke-width="3.5" stroke-linecap="round"/>'}
def render(v,state,size,prog=None,pose="corps",name=None,tint=None):
    nm=name or V[v][0]; c=V[v][2]; a,r,(hx,hy,hr)=_asset(v,pose,size); small=size<=40
    w=round(size*r); W=max(w,size); pr=prog or (3,5)
    # positions du casque dans la boîte W×size (l'image est centrée)
    ox=(W-w)/2; HX=(ox+hx*w)/W; HY=hy; HR=hr*w/W
    pl="tête" if small else (EXPN[pose[4:]] if pose.startswith("exp-") else POSE[pose])
    alt=f"{nm}, figurine Billy ({pl}) — état : {STL[state]}"+(f", étape {pr[0]} sur {pr[1]}" if state=="executing" else "")
    back=front=""
    if not small and pose=="corps": back+='<span class="fg-socle" aria-hidden="true"></span>'
    back+='<span class="fg-halo" aria-hidden="true"></span>'
    if state=="executing": back+=dial(pr[1],pr[0])
    if state=="listening": back+='<svg class="fg-waves" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="30"/><circle cx="50" cy="50" r="38"/><circle cx="50" cy="50" r="46"/></svg>'
    if state=="thinking":
        dots="".join(f'<i style="--ox:{math.cos(i*math.pi/4-math.pi/2)*46:.1f}%;--oy:{math.sin(i*math.pi/4-math.pi/2)*46:.1f}%;--tx:{gx*30:.1f}%;--ty:{gy*30:.1f}%;--d:{i*.04:.2f}s"></i>' for i,(gx,gy) in enumerate(GLYPH[v]))
        front+=f'<span class="fg-orb" aria-hidden="true"><span class="fg-orr">{dots}</span></span>'
    if state=="done" and not small: front+=f'<svg class="fg-celeb fg-c-{v}" viewBox="0 0 100 60" aria-hidden="true">{CELEB[v]}</svg>'
    if state=="waiting": front+='<svg class="fg-hg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11.5" fill="#1a1204" stroke="'+SEM["waiting"]+'" stroke-width="1.5"/><g class="hgr"><path d="M7 5h10M7 19h10M8 5c0 4 8 4 8 7s-8 3-8 7M16 5c0 4-8 4-8 7s8 3 8 7" fill="none" stroke="'+SEM["waiting"]+'" stroke-width="1.6" stroke-linecap="round"/><path d="M10 17.5h4l-2-2z" fill="'+SEM["waiting"]+'"/></g></svg>'
    if state in("error","done"):
        ic={"error":'<rect x="9.6" y="5" width="2.8" height="8" rx="1.2"/><circle cx="11" cy="16.2" r="1.6"/>',
            "done":'<path d="M6 11.5l3.4 3.4L16 8" fill="none" stroke="#06110a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'}[state]
        front+=f'<svg class="fg-badge" viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="10" fill="{SEM[state]}" stroke="#07090a" stroke-width="1.5"/><g fill="#1a0e00">{ic}</g></svg>'
    tv="" if tint is None else f";--tint:{1 if tint else 0}"
    return (f'<span class="ov2 fg fg-{state}{" fg-sm" if small else ""}" data-fstate="{state}" data-v="{v}" style="--agent-accent:{c};--sem:{SEM.get(state,"var(--a)")};--hx:{HX:.3f};--hy:{HY:.3f};--hr:{HR:.3f};width:{W}px;height:{size}px{tv}">'
      f'{back}<span class="fg-gaze"><span class="fg-sq"><span class="fg-body" style="width:{w}px;height:{size}px"><img src="{BASE}{a}.webp" width="{w}" height="{size}" alt="{alt}" decoding="async">'
      f'<span class="fg-tint fm-{a}" aria-hidden="true"></span><span class="fg-glw fm-{a}" aria-hidden="true"><i></i></span></span></span></span>{front}</span>')
CSS=r"""
.fg{--a:var(--brand-accent,var(--agent-accent));--tint:0;--lvl:0;position:relative;display:inline-block;vertical-align:middle;isolation:isolate}
.ov2.fg{height:auto}.ov2.fg svg{height:auto}
.fg-gaze,.fg-sq{position:absolute;inset:0;display:grid;place-items:end center;transform-origin:50% 100%}
.fg-body{position:relative;display:block;isolation:isolate;transform-origin:50% 100%}.fg-body img{display:block;width:100%;height:100%;object-fit:contain}
.fg-tint{position:absolute;inset:0;background:var(--a);mix-blend-mode:color;opacity:var(--tint);mask-size:100% 100%;pointer-events:none}
.fg-tint::after{content:"";position:absolute;inset:0;background:var(--a);mix-blend-mode:soft-light;opacity:.55}
.fg-glw{position:absolute;inset:0;mask-size:100% 100%;overflow:hidden;pointer-events:none;opacity:0}
.fg-glw i{position:absolute;inset:-10% auto -10% -60%;width:40%;background:linear-gradient(100deg,transparent,#fff9 50%,transparent);transform:translateX(0) skewX(-12deg)}
.fg-socle{position:absolute;left:50%;bottom:-3%;width:78%;height:13%;transform:translateX(-50%);border-radius:50%;
 background:radial-gradient(closest-side,#000c,#0008 55%,transparent),radial-gradient(closest-side,transparent 70%,color-mix(in srgb,var(--a) 55%,transparent) 88%,transparent);z-index:-1}
.fg-socle::after{content:"";position:absolute;inset:-30% -12%;border-radius:50%;background:radial-gradient(closest-side,color-mix(in srgb,var(--a) 22%,transparent),transparent);opacity:.8}
.fg-halo{position:absolute;left:calc(var(--hx)*100%);top:calc(var(--hy)*100%);width:calc(var(--hr)*290%);aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;z-index:-1;
 background:radial-gradient(closest-side,transparent 40%,color-mix(in srgb,var(--a) 60%,transparent) 54%,color-mix(in srgb,var(--a) 22%,transparent) 68%,transparent 100%);opacity:.7}
.ov2.fg .fg-dial{position:absolute;left:calc(var(--hx)*100%);top:calc(var(--hy)*100%);width:calc(var(--hr)*300%);min-width:110%;transform:translate(-50%,-50%);z-index:-1}
.ov2.fg.fg-sm .fg-dial{width:118%;left:50%;top:50%}
.fg-dial path{transform-box:fill-box;transform-origin:center}
.fg-dial .on{fill:var(--a);filter:drop-shadow(0 0 3px var(--a))}.fg-dial .off{fill:none;stroke:color-mix(in srgb,var(--a) 55%,#5c6b66);stroke-width:1.2}
.ov2.fg .fg-waves{position:absolute;left:calc(var(--hx)*100%);top:calc(var(--hy)*100%);width:calc(var(--hr)*330%);min-width:110%;transform:translate(-50%,-50%);z-index:-1;overflow:visible}
.fg-waves circle{fill:none;stroke:var(--a);stroke-width:2.2;opacity:.5;transform-box:fill-box;transform-origin:center}.fg-waves circle:nth-child(2){opacity:.32}.fg-waves circle:nth-child(3){opacity:.18}
.fg.mic .fg-waves circle{transform:scale(calc(.85 + var(--lvl)*.4));opacity:calc(.2 + var(--lvl)*.8)}
.fg.mic .fg-halo{opacity:calc(.35 + var(--lvl)*.65);transform:translate(-50%,-50%) scale(calc(1 + var(--lvl)*.15))}
.fg-orb{position:absolute;left:calc(var(--hx)*100%);top:calc(var(--hy)*100%);width:calc(var(--hr)*260%);min-width:70%;aspect-ratio:1;transform:translate(-50%,-50%);pointer-events:none}
.fg-orr{position:absolute;inset:0}
.fg-orb i{position:absolute;left:46%;top:46%;width:8%;aspect-ratio:1;border-radius:50%;background:var(--a);box-shadow:0 0 6px var(--a);transform:translate(calc(var(--ox)*12.5),calc(var(--oy)*12.5))}
.fg-sm .fg-orb i{width:12%}
.ov2.fg .fg-celeb{position:absolute;left:calc(var(--hx)*100%);top:calc(var(--hy)*100% - var(--hr)*170%);width:calc(var(--hr)*240%);transform:translate(-50%,-50%);overflow:visible;pointer-events:none;opacity:0}
.fg-celeb .c1{fill:var(--a);stroke:var(--a);transform-box:fill-box;transform-origin:center}
.fg-celeb.fg-c-nexus .c1,.fg-celeb.fg-c-aegis .c1,.fg-celeb .ring{fill:none}
.ov2.fg .fg-hg{position:absolute;left:calc(var(--hx)*100% + var(--hr)*62%);top:calc(var(--hy)*100% - var(--hr)*95%);width:max(16px,calc(var(--hr)*80%));filter:drop-shadow(0 1px 2px #000)}
.ov2.fg.fg-sm .fg-hg{left:auto;right:-8%;top:-8%;width:50%}
.fg-hg .hgr{transform-box:fill-box;transform-origin:center}
.ov2.fg .fg-badge{position:absolute;left:calc(var(--hx)*100% + var(--hr)*62%);top:calc(var(--hy)*100% - var(--hr)*95%);width:max(16px,calc(var(--hr)*80%));filter:drop-shadow(0 1px 2px #000)}
.ov2.fg.fg-sm .fg-badge{left:auto;right:-8%;top:-8%;width:50%}
.fg-error .fg-halo,.fg-waiting .fg-halo{background:radial-gradient(closest-side,transparent 40%,color-mix(in srgb,var(--sem) 50%,transparent) 55%,transparent 90%)}
.fg-error .fg-body img{filter:saturate(.7) brightness(.92)}.fg-waiting .fg-body img{filter:saturate(.85)}
.fg-error .fg-sq{transform:translateY(3%) rotate(-4deg) scale(1,.97)}
.fg-off,.fg-off *{animation-play-state:paused!important}
@media (prefers-reduced-motion:no-preference){
:root:not(.rm) .fg-gaze{transform:translate3d(calc(var(--gx,0)*3%),calc(var(--gy,0)*1.6%),0) rotate(calc(var(--gx,0)*2.2deg));transition:transform .6s cubic-bezier(.2,.8,.2,1)}
:root:not(.rm) :is(.fg-idle,.fg-executing,.fg-thinking,.fg-listening,.fg-waiting) .fg-body{animation:fgbreath 3.2s ease-in-out infinite,fgfloat 4.8s ease-in-out infinite}
:root:not(.rm) .fg:not(.mic) .fg-halo{animation:fghalo 2.4s ease-in-out infinite}
:root:not(.rm) .fg-enter .fg-sq{animation:fgenter .75s cubic-bezier(.3,.7,.3,1.2) 1}
:root:not(.rm) .fg:not(.mic) .fg-waves circle{animation:fgwave 2.4s ease-out infinite}:root:not(.rm) .fg-waves circle:nth-child(2){animation-delay:.8s}:root:not(.rm) .fg-waves circle:nth-child(3){animation-delay:1.6s}
:root:not(.rm) .fg-orr{animation:fgorbr 4.8s cubic-bezier(.5,0,.5,1) infinite}
:root:not(.rm) .fg-orb i{animation:fgglyph 4.8s cubic-bezier(.6,0,.3,1) infinite;animation-delay:var(--d)}
:root:not(.rm) .fg-dial .new{animation:fgclick .9s cubic-bezier(.3,1.6,.5,1) 1 both}
:root:not(.rm) .fg-dial .on:not(.new){animation:fgtick 2.4s ease-in-out infinite}
:root:not(.rm) .fg-done .fg-sq{animation:fghop 1.6s cubic-bezier(.3,.7,.3,1) 1}
:root:not(.rm) .fg-celeb{animation:fgceleb 1.8s .35s ease-out 1 both}
:root:not(.rm) .fg-c-nova .c1{animation:fgsplash 1.8s .35s ease-out 1 both}
:root:not(.rm) .fg-c-scout .ring{animation:fgping 1.8s .35s ease-out 1 both}
:root:not(.rm) .fg-c-pulse .c1{animation:fgbar 1.8s .35s cubic-bezier(.3,1.5,.5,1) 1 both}:root:not(.rm) .fg-c-pulse .b2{animation-delay:.45s}:root:not(.rm) .fg-c-pulse .b3{animation-delay:.55s}
:root:not(.rm) .fg-done .fg-badge{animation:fgpop .6s 1s cubic-bezier(.3,1.6,.5,1) 1 both}
:root:not(.rm) .fg-error .fg-sq{animation:fgslump 1.6s cubic-bezier(.4,0,.2,1) 1 both}
:root:not(.rm) .fg-error .fg-badge{animation:fgpop .6s .9s cubic-bezier(.3,1.6,.5,1) 1 both}
:root:not(.rm) .fg-hg .hgr{animation:fgsand 2.4s cubic-bezier(.7,0,.3,1) infinite}
:root:not(.rm) .fg.glint .fg-glw{opacity:1}:root:not(.rm) .fg.glint .fg-glw i{animation:fgglint 1.6s ease-in-out 1}
:root:not(.rm) .fg.glance{--gx:.7;--gy:-.3}}
@media (prefers-reduced-motion:reduce){.fg-celeb{opacity:1!important}}
:root.rm .fg-celeb{opacity:1}
@keyframes fgbreath{0%,100%{scale:1 1}50%{scale:1.008 1.018}}
@keyframes fgfloat{0%,100%{translate:0 0}50%{translate:0 -2.5%}}
@keyframes fghalo{0%,100%{opacity:.5}50%{opacity:.95}}
@keyframes fgenter{0%{transform:scale(1.05,.93)}35%{transform:scale(.95,1.07) translateY(-4%)}70%{transform:scale(1.02,.98)}100%{transform:none}}
@keyframes fgwave{0%{transform:scale(.8);opacity:.7}100%{transform:scale(1.25);opacity:0}}
@keyframes fgorbr{0%{transform:rotate(0)}45%,100%{transform:rotate(360deg)}}
@keyframes fgglyph{0%,45%{transform:translate(calc(var(--ox)*12.5),calc(var(--oy)*12.5))}58%,82%{transform:translate(calc(var(--tx)*12.5),calc(var(--ty)*12.5)) scale(1.15)}100%{transform:translate(calc(var(--ox)*12.5),calc(var(--oy)*12.5))}}
@keyframes fgclick{0%{transform:scale(1.5);opacity:0}55%{transform:scale(.92);opacity:1}100%{transform:scale(1)}}
@keyframes fgtick{0%,100%{opacity:1}50%{opacity:.78}}
@keyframes fghop{0%{transform:none}15%{transform:scale(1.06,.9)}40%{transform:translateY(-9%) scale(.95,1.07)}62%{transform:scale(1.05,.94)}80%{transform:scale(.99,1.02)}100%{transform:none}}
@keyframes fgceleb{0%{opacity:0;transform:translate(-50%,-20%) scale(.4)}25%{opacity:1;transform:translate(-50%,-55%) scale(1.08)}75%{opacity:1;transform:translate(-50%,-60%) scale(1)}100%{opacity:0;transform:translate(-50%,-75%) scale(.95)}}
@keyframes fgsplash{0%{transform:scale(0)}40%{transform:scale(1.3)}100%{transform:scale(1)}}
@keyframes fgping{0%{transform:scale(.4);opacity:1}100%{transform:scale(1.6);opacity:0}}
@keyframes fgbar{0%{transform:scaleY(0)}60%{transform:scaleY(1.1)}100%{transform:scaleY(1)}}
@keyframes fgpop{0%{transform:scale(0);opacity:0}100%{transform:scale(1);opacity:1}}
@keyframes fgslump{0%{transform:none}25%{transform:translateY(-2%) scale(1.02,.98)}100%{transform:translateY(3%) rotate(-4deg) scale(1,.97)}}
@keyframes fgsand{0%,40%{transform:rotate(0)}60%,100%{transform:rotate(180deg)}}
@keyframes fgglint{0%{transform:translateX(0) skewX(-12deg)}100%{transform:translateX(420%) skewX(-12deg)}}
"""
