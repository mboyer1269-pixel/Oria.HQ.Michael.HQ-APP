"""Famille « Billy Boutons » — mascottes chibi vectorielles originales (inspirées des références de Michael, aucun pixel copié).
render(aid, role, size, state, prog, variante, label, name) -> HTML. Animations transform/opacity seulement, cycles >= 1,6 s."""
_n=[0]
V={ # variante: (nom, rôle, couleur néon, couleur sombre)
 "ori":("ORI","orchestration","#ffd27a","#3a2a08"),"nexus":("NEXUS","développement","#5aa8ff","#0b2140"),
 "nova":("NOVA","création","#c08cff","#24103a"),"scout":("SCOUT","recherche","#ffa14a","#3a1e05"),
 "pulse":("PULSE","opérations","#ff6b6b","#3a0b0b"),"aegis":("AEGIS","sécurité","#4fe3a0","#06301c")}
STL={"idle":"au repos","executing":"exécute","waiting":"bloqué — attend votre décision","thinking":"réfléchit","listening":"écoute","done":"a terminé","error":"en erreur"}
HOOD='<path d="M14 46 Q12 0 50 0 Q88 0 86 46 L82 66 Q50 76 18 66Z" fill="#141a26" stroke="{c}" stroke-width="1.6"/>'
def acc(v,c):
    return {
 "ori":f'<path d="M28 74 L36 70 L40 104 L26 106Z M72 74 L64 70 L60 104 L74 106Z" fill="#efe6d2"/><path d="M36 70 L50 80 L64 70" fill="none" stroke="{c}" stroke-width="1.5"/>',
 "nexus":f'<g fill="none" stroke="#10141c" stroke-width="2.2"><rect x="33" y="35" width="13" height="10" rx="4"/><rect x="54" y="35" width="13" height="10" rx="4"/><path d="M46 39h8"/></g><rect class="arm-r" x="62" y="84" width="22" height="14" rx="2" fill="#2a3242" stroke="{c}" stroke-width="1"/>',
 "nova":f'<g class="arm-r"><path d="M74 66 L80 52" stroke="#e9e4f7" stroke-width="2.5" stroke-linecap="round"/><path d="M80 52 l1.5-4" stroke="{c}" stroke-width="2.5" stroke-linecap="round"/></g><rect x="14" y="82" width="18" height="22" rx="2" fill="#1d1630" stroke="{c}" stroke-width="1"/>',
 "scout":f'<g fill="#3a2a1a" stroke="{c}" stroke-width="1.4"><circle cx="40" cy="12" r="5.5"/><circle cx="60" cy="12" r="5.5"/></g><path d="M45.5 12h9" stroke="#3a2a1a" stroke-width="2"/><rect x="38" y="96" width="24" height="6" rx="2" fill="#4a3a2a"/>',
 "pulse":f'<path d="M20 38 Q20 6 50 6 Q80 6 80 38" fill="none" stroke="#151515" stroke-width="4"/><rect x="13" y="30" width="10" height="16" rx="4" fill="#151515" stroke="{c}" stroke-width="1.5"/><rect x="77" y="30" width="10" height="16" rx="4" fill="#151515" stroke="{c}" stroke-width="1.5"/>',
 "aegis":f'<path d="M22 70 Q10 100 18 112 L82 112 Q90 100 78 70Z" fill="#0f1d17" opacity=".9"/><g class="arm-r"><circle cx="78" cy="90" r="13" fill="#18241f" stroke="{c}" stroke-width="2"/><circle cx="78" cy="90" r="5" fill="none" stroke="{c}" stroke-width="2"/></g>'}[v]
def render(aid,role,size=48,state="idle",prog=None,variante="ori",label=None,name=None):
    nm,rl,c,dk=V[variante]; _n[0]+=1; u=f"b{_n[0]}"
    if state=="error": c="#ff5a4e"
    if state=="waiting": c="#ffb340"
    stl=STL[state]+(f", étape {prog[0]} sur {prog[1]}" if prog and state=="executing" else "")
    seg=""
    if state=="executing" and prog:
        import math
        t=prog[1]
        for i in range(t):
            a0=math.radians(i*360/t-88);a1=math.radians((i+1)*360/t-92);R=36
            P=lambda a:f"{50+R*math.cos(a):.1f},{38+R*math.sin(a):.1f}"
            seg+=f'<path class="sg{" on" if i<prog[0] else ""}{" cur" if i==prog[0] else ""}" d="M{P(a0)} A{R},{R} 0 0 1 {P(a1)}"/>'
    eyes='<g class="eyes"><path d="M36 33l7 7M43 33l-7 7M57 33l7 7M64 33l-7 7" stroke="#111" stroke-width="2.4" stroke-linecap="round"/></g>' if state=="error" else '<g class="eyes"><ellipse cx="40" cy="37" rx="3.6" ry="5.2" fill="#111"/><ellipse cx="60" cy="37" rx="3.6" ry="5.2" fill="#111"/><circle cx="41.2" cy="35" r="1.2" fill="#fff"/><circle cx="61.2" cy="35" r="1.2" fill="#fff"/></g>'
    mouth={'error':'<path d="M44 51 Q50 47 56 51" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round"/>','thinking':'<path d="M46 50 h8" stroke="#111" stroke-width="2" stroke-linecap="round"/>','listening':'<ellipse cx="50" cy="50" rx="3" ry="2.4" fill="#111"/>'}.get(state,'<path d="M43 48 Q50 54 57 48" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round"/>')
    a=acc(variante,c); back=a if variante=="aegis" else ""; front="" if variante=="aegis" else a
    if variante=="aegis": back=a.split('<g class="arm-r">')[0]; front='<g class="arm-r">'+a.split('<g class="arm-r">')[1]
    badge={"done":"✓","error":"!","waiting":"‖"}.get(state,"")
    return (f'<span class="billy" data-state="{state}" style="--s:{size}px;--c:{c}" role="img" aria-label="Avatar de {label or name or nm} ({stl})">'
     f'<svg viewBox="0 0 100 120" aria-hidden="true"><defs><radialGradient id="{u}f" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="#fff"/><stop offset=".7" stop-color="#eceff2"/><stop offset="1" stop-color="#c9ced6"/></radialGradient>'
     f'<radialGradient id="{u}h"><stop offset="0" stop-color="{c}" stop-opacity=".55"/><stop offset="1" stop-color="{c}" stop-opacity="0"/></radialGradient></defs>'
     f'<ellipse class="halo" cx="50" cy="40" rx="48" ry="44" fill="url(#{u}h)"/><ellipse cx="50" cy="116" rx="26" ry="3.5" fill="#000" opacity=".45"/>'
     f'<g class="bod">{back}<g class="legs"><rect x="38" y="96" width="9" height="14" rx="3" fill="#161616"/><rect x="53" y="96" width="9" height="14" rx="3" fill="#161616"/>'
     f'<path d="M33 110 h15 v5 h-17 q0-5 2-5Z M52 110 h15 q2 0 2 5 h-17Z" fill="#f2f2f2"/><path d="M33 113.5h15M52 113.5h17" stroke="{c}" stroke-width="1.2"/></g>'
     f'<path d="M30 70 Q30 64 40 64 L60 64 Q70 64 70 70 L70 98 L30 98Z" fill="#1a1a1c"/><path d="M30 70 L70 70" stroke="{c}" stroke-width=".8" opacity=".6"/><circle cx="50" cy="82" r="5" fill="none" stroke="{c}" stroke-width="2"/>'
     f'<g class="arm-l"><rect x="22" y="68" width="9" height="22" rx="4.5" fill="#1a1a1c"/><circle cx="26.5" cy="91" r="4" fill="#202022"/></g><g class="arm-r0"><rect x="69" y="68" width="9" height="22" rx="4.5" fill="#1a1a1c"/><circle cx="73.5" cy="91" r="4" fill="#202022"/></g>'
     f'<g class="head">{HOOD.format(c=c) if variante=="nexus" else ""}<circle cx="50" cy="38" r="31" fill="#0c0d10"/><circle class="ring" cx="50" cy="38" r="31" fill="none" stroke="{c}" stroke-width="3.2"{" stroke-dasharray=\"5 4\"" if state=="waiting" else ""}/>'
     f'<circle cx="50" cy="39" r="26" fill="url(#{u}f)"/><ellipse cx="40" cy="24" rx="8" ry="4" fill="#fff" opacity=".8"/>{eyes}{mouth}{front}</g>'
     f'<g class="seg">{seg}</g>'
     f'<g class="wv"><circle cx="50" cy="38" r="34"/><circle cx="50" cy="38" r="34" style="animation-delay:-.8s"/></g>'
     f'<g class="dots"><circle cx="50" cy="2" r="2.4"/><circle cx="50" cy="74" r="1.8"/></g></g>'
     +(f'<g class="bdg"><circle cx="84" cy="14" r="10" fill="{c}" stroke="#0b0b0d" stroke-width="2"/><text x="84" y="18.5" text-anchor="middle" font-size="13" font-weight="700" fill="#0b0b0d">{badge}</text></g>' if badge else "")+
     '</svg></span>')
CSS=r"""
.billy{--s:48px;--c:#ffd27a;display:inline-block;width:var(--s);height:calc(var(--s)*1.2);flex:none}.billy svg{width:100%;height:100%;display:block;overflow:visible}
.billy *{transform-box:fill-box;transform-origin:center}.billy .bod{transform-origin:50% 100%}
.billy .halo{opacity:0}.billy .wv circle{fill:none;stroke:var(--c);stroke-width:1.5;opacity:0}.billy .dots{opacity:0}.billy .dots circle{fill:var(--c)}
.billy .seg path{fill:none;stroke:color-mix(in srgb,var(--c) 22%,#222);stroke-width:3.5;stroke-linecap:round}.billy .seg path.on{stroke:var(--c)}.billy .seg path.cur{stroke:color-mix(in srgb,var(--c) 60%,#222)}
.billy[data-state=idle] .ring{opacity:.7}.billy[data-state=thinking] .halo,.billy[data-state=executing] .halo{opacity:.6}.billy[data-state=thinking] .dots{opacity:1}
.billy[data-state=thinking] .eyes{transform:translate(1.5px,-2px)}.billy[data-state=listening] .wv circle{opacity:.5}.billy[data-state=listening] .head{transform:rotate(-6deg)}
.billy[data-state=waiting]{opacity:.85}.billy[data-state=error] .head{transform:rotate(4deg)}
@media (prefers-reduced-motion:no-preference){
.billy[data-state=idle] .bod{animation:bb-breathe 4s ease-in-out infinite}
.billy[data-state=listening] .wv circle{animation:bb-wave 1.8s ease-out infinite}.billy[data-state=listening] .head{animation:bb-tilt 3.2s ease-in-out infinite}
.billy[data-state=thinking] .halo{animation:bb-pulse 3.2s ease-in-out infinite}.billy[data-state=thinking] .dots{transform-box:view-box;transform-origin:50px 38px;animation:bb-spin 4s linear infinite}.billy[data-state=thinking] .eyes{animation:bb-look 3.2s ease-in-out infinite}
.billy[data-state=executing] .arm-r,.billy[data-state=executing] .arm-r0{animation:bb-work 1.8s ease-in-out infinite}.billy[data-state=executing] .bod{animation:bb-bob 1.8s ease-in-out infinite}.billy[data-state=executing] .seg .cur{animation:bb-glow 2s ease-in-out infinite}
.billy[data-state=waiting] .ring{animation:bb-dim 4s ease-in-out infinite}
.billy[data-state=done] .bod{animation:bb-hop .7s cubic-bezier(.2,.8,.3,1.2) 1 both}.billy[data-state=done] .bdg{animation:bb-pop .5s .4s ease-out 1 both}
.billy[data-state=error] .head{animation:bb-shake .5s ease-out 1 both}}
@keyframes bb-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.015,.985)}}@keyframes bb-wave{0%{transform:scale(.92);opacity:.6}100%{transform:scale(1.25);opacity:0}}
@keyframes bb-tilt{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(-2deg)}}@keyframes bb-pulse{0%,100%{opacity:.3;transform:scale(.95)}50%{opacity:.75;transform:scale(1.04)}}
@keyframes bb-spin{to{transform:rotate(360deg)}}@keyframes bb-look{0%,100%{transform:translate(1.5px,-2px)}50%{transform:translate(-1.5px,-2px)}}
@keyframes bb-work{0%,100%{transform:rotate(0)}50%{transform:rotate(-10deg)}}@keyframes bb-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}
@keyframes bb-glow{0%,100%{opacity:.5}50%{opacity:1}}@keyframes bb-dim{0%,100%{opacity:.45}50%{opacity:.9}}
@keyframes bb-hop{0%{transform:translateY(0)}40%{transform:translateY(-8px) scale(1.03,.97)}100%{transform:translateY(0)}}@keyframes bb-pop{0%{opacity:0;transform:scale(.3)}100%{opacity:1;transform:scale(1)}}
@keyframes bb-shake{0%{transform:rotate(0)}25%{transform:rotate(-7deg)}55%{transform:rotate(6deg)}100%{transform:rotate(4deg)}}
"""
