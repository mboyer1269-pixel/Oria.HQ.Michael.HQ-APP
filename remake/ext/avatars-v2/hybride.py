"""Avatars Oria v2 — « Billy Boutons » fidèle (figurine 3D vectorielle) et hybride Billy × Astrolabe.
Dessin vectoriel original inspiré des références de Michael (aucun pixel copié).
Couleur = variable CSS : --agent-accent (par agent), surchargée par --brand-accent (mode marque). Les couleurs d'état
(erreur, bloqué, terminé) sont sémantiques et ne sont JAMAIS surchargées par la marque.
render(variante, state, size, prog=(fait,total), mode='hybride'|'billy', name=...) -> HTML ; size < 40 => tête + anneau seuls."""
import math
_n=[0]
V={"ori":("ORI","Stratégie & orchestration","#ffcf70","« Toujours une idée d'avance. »"),
   "nexus":("NEXUS","Développement","#4da3ff","« Je build ce que tu imagines. »"),
   "nova":("NOVA","Création & design","#b47cff","« Des idées qui se démarquent. »"),
   "scout":("SCOUT","Recherche & marché","#ff9a3d","« Je trouve les opportunités. »"),
   "pulse":("PULSE","Ventes & opérations","#ff5d6c","« Des actions qui génèrent des résultats. »"),
   "aegis":("AEGIS","Sécurité & infrastructure","#3ee39b","« Je protège ton empire. »")}
STL={"idle":"au repos","listening":"écoute","thinking":"réfléchit","executing":"exécute","waiting":"bloqué — attend votre décision","done":"a terminé","error":"en erreur"}
SEM={"error":"#ff5a4e","waiting":"#ffb340","done":"#3ddc84"}
A="var(--a)"
def P(cx,cy,r,a): return f"{cx+r*math.cos(a):.2f},{cy+r*math.sin(a):.2f}"
def sector(cx,cy,i,n,r0,r1,gap=5):
    a0=math.radians(i*360/n+gap/2-90);a1=math.radians((i+1)*360/n-gap/2-90)
    return f"M{P(cx,cy,r1,a0)} A{r1},{r1} 0 0 1 {P(cx,cy,r1,a1)} L{P(cx,cy,r0,a1)} A{r0},{r0} 0 0 0 {P(cx,cy,r0,a0)}Z"
CX,CY=60,50
def face(v,st):
    """Yeux, sourcils, bouche : la personnalité (variante) modulée par l'état réel."""
    ex,ey=49,54; ex2=71
    oval=lambda x:f'<ellipse cx="{x}" cy="{ey}" rx="4.6" ry="6.4" fill="#0d0f14"/><ellipse cx="{x+1.6}" cy="{ey-2.6}" rx="1.7" ry="2.1" fill="#fff"/><circle cx="{x-1.4}" cy="{ey+2.8}" r=".8" fill="#fff" opacity=".7"/>'
    happy=lambda x:f'<path d="M{x-4.5} {ey+1} Q{x} {ey-5} {x+4.5} {ey+1}" fill="none" stroke="#0d0f14" stroke-width="2.6" stroke-linecap="round"/>'
    wink=happy
    L,R=oval(ex),oval(ex2)
    brows={"ori":(f"M43 43 Q49 40 54 42",f"M66 41 Q71 38 77 41"),"nexus":("",""),"nova":(f"M43 44 Q49 41 54 43",f"M66 42 Q72 39 77 43"),
           "scout":(f"M43 43 Q49 40 54 42",f"M66 42 Q71 40 77 43"),"pulse":(f"M43 42 L54 44",f"M66 44 L77 42"),"aegis":(f"M43 41 L54 45",f"M66 45 L77 41")}[v]
    mouth={"ori":'<path d="M52 66 Q60 72 68 65" fill="none" stroke="#0d0f14" stroke-width="2.4" stroke-linecap="round"/>',
           "nexus":'<path d="M53 66 Q61 71 68 66" fill="none" stroke="#0d0f14" stroke-width="2.4" stroke-linecap="round"/>',
           "nova":'<path d="M52 65 Q60 73 68 65 Q60 69 52 65Z" fill="#0d0f14"/><path d="M57 68.5 Q60 71 63 68.5" fill="#ff7a9a"/>',
           "scout":'<path d="M51 64 Q60 75 69 64Z" fill="#0d0f14"/><path d="M55 69 Q60 72 65 69" fill="#ff7a9a"/>',
           "pulse":'<path d="M52 66 Q59 70 68 64" fill="none" stroke="#0d0f14" stroke-width="2.4" stroke-linecap="round"/>',
           "aegis":'<path d="M54 67 Q60 69.5 66 67" fill="none" stroke="#0d0f14" stroke-width="2.4" stroke-linecap="round"/>'}[v]
    if v=="nova" and st in("idle","executing","done"): L=wink(ex)        # clin d'œil signature de NOVA
    extra=""
    if st=="listening":
        mouth='<ellipse cx="60" cy="67" rx="3.2" ry="2.8" fill="#0d0f14"/>'; brows=("M43 42 Q49 39 54 41","M66 41 Q71 39 77 42")
    elif st=="thinking":
        mouth='<path d="M54 67 Q58 66 66 68" fill="none" stroke="#0d0f14" stroke-width="2.4" stroke-linecap="round"/>'; brows=("M43 42 Q49 40 54 42","M66 40 Q71 37 77 40")
    elif st=="waiting":
        mouth='<path d="M54 67 H66" stroke="#0d0f14" stroke-width="2.4" stroke-linecap="round"/>'; brows=("M43 43 Q49 41 54 43","M66 43 Q71 41 77 43")
    elif st=="done":
        L,R=happy(ex),happy(ex2); mouth='<path d="M50 63 Q60 76 70 63Z" fill="#0d0f14"/><path d="M55 68.5 Q60 72 65 68.5" fill="#ff7a9a"/>'
    elif st=="error":
        L=f'<path d="M{ex-4} {ey-3} L{ex+4} {ey+3} M{ex+4} {ey-3} L{ex-4} {ey+3}" stroke="#0d0f14" stroke-width="2.6" stroke-linecap="round"/>'
        R=f'<path d="M{ex2-4} {ey-3} L{ex2+4} {ey+3} M{ex2+4} {ey-3} L{ex2-4} {ey+3}" stroke="#0d0f14" stroke-width="2.6" stroke-linecap="round"/>'
        mouth='<path d="M53 69 Q56 65 60 68 Q64 65 67 69" fill="none" stroke="#0d0f14" stroke-width="2.4" stroke-linecap="round"/>'; brows=("M43 44 L54 41","M66 41 L77 44")
        extra='<path class="sweat" d="M80 40 q3 5 0 7 q-3-2 0-7Z" fill="#9fd8ff"/>'
    b="".join(f'<path d="{d}" fill="none" stroke="#2b2f38" stroke-width="2.2" stroke-linecap="round"/>' for d in brows if d)
    blush='<ellipse cx="44" cy="63" rx="4" ry="2.2" fill="#ff8aa0" opacity=".35"/><ellipse cx="76" cy="63" rx="4" ry="2.2" fill="#ff8aa0" opacity=".35"/>'
    return f'<g class="brows">{b}</g><g class="eyes"><g class="eye-l">{L}</g><g class="eye-r">{R}</g></g>{blush}<g class="mouth">{mouth}</g>{extra}'
def head_acc(v,u):
    g=f'url(#{u}m)'
    return {
 "ori":f'<g class="crown"><path d="M48 9 L52 0 L56 6 L60 -2 L64 6 L68 0 L72 9Z" fill="url(#{u}gold)" stroke="#7a5410" stroke-width=".8"/><circle cx="60" cy="-1" r="1.6" fill="#fff6d8"/></g>',
 "nexus":f'<path d="M24 34 Q26 6 60 5 Q94 6 96 34 Q86 22 60 21 Q34 22 24 34Z" fill="{g}"/><path d="M60 21 Q86 22 98 30 L101 34 Q86 28 60 27Z" fill="#14161c"/><text x="60" y="17" text-anchor="middle" font-size="7" font-weight="700" font-family="monospace" style="fill:var(--a)">&lt;/&gt;</text>'
          f'<g fill="none" stroke="#0d0f14" stroke-width="2.6"><rect x="40" y="46" width="18" height="15" rx="6"/><rect x="62" y="46" width="18" height="15" rx="6"/><path d="M58 52 h4"/></g><rect x="41.5" y="47.5" width="15" height="5" rx="2.5" fill="#fff" opacity=".35"/>'
          f'<rect x="16" y="44" width="9" height="18" rx="4" fill="#1a1c22" style="stroke:var(--a)" stroke-width="1.4"/><rect x="95" y="44" width="9" height="18" rx="4" fill="#1a1c22" style="stroke:var(--a)" stroke-width="1.4"/>',
 "nova":f'<path d="M22 40 Q22 8 60 8 Q98 8 98 40" fill="none" stroke="#17181d" stroke-width="5"/><rect x="14" y="40" width="11" height="20" rx="5" fill="#17181d" style="stroke:var(--a)" stroke-width="1.6"/><rect x="95" y="40" width="11" height="20" rx="5" fill="#17181d" style="stroke:var(--a)" stroke-width="1.6"/><text x="60" y="15" text-anchor="middle" font-size="6" font-weight="700" letter-spacing=".6" style="fill:var(--a)">ORIA</text>'
          f'<g class="crown"><path d="M70 7 L72 1 L75 5 L78 0 L80 6Z" fill="url(#{u}gold)"/></g>',
 "scout":f'<path d="M24 34 Q26 6 60 5 Q94 6 96 34 Q86 22 60 21 Q34 22 24 34Z" fill="#3b2e22"/><path d="M60 21 Q34 22 22 30 L19 34 Q34 28 60 27Z" fill="#2a2018"/><circle cx="60" cy="13" r="4" fill="none" stroke="#c9a77a" stroke-width="1.2"/><path d="M56 13 h8 M60 9 v8" stroke="#c9a77a" stroke-width=".8"/>'
          f'<g class="gog"><circle cx="45" cy="22" r="7" fill="#2a2018" stroke="#8a6a42" stroke-width="2"/><circle cx="45" cy="22" r="4.5" style="fill:color-mix(in srgb,var(--a) 60%,#000)"/><circle cx="75" cy="22" r="7" fill="#2a2018" stroke="#8a6a42" stroke-width="2"/><circle cx="75" cy="22" r="4.5" style="fill:color-mix(in srgb,var(--a) 60%,#000)"/><circle cx="43.5" cy="20.5" r="1.4" fill="#fff" opacity=".8"/><circle cx="73.5" cy="20.5" r="1.4" fill="#fff" opacity=".8"/></g>',
 "pulse":f'<path d="M24 34 Q26 6 60 5 Q94 6 96 34 Q86 22 60 21 Q34 22 24 34Z" fill="{g}"/><path d="M60 21 Q86 22 98 30 L101 34 Q86 28 60 27Z" fill="#14161c"/><circle cx="60" cy="14" r="3.2" fill="none" style="stroke:var(--a)" stroke-width="1.6"/>'
          f'<rect x="14" y="42" width="11" height="20" rx="5" fill="#17181d" style="stroke:var(--a)" stroke-width="1.8"/><rect x="95" y="42" width="11" height="20" rx="5" fill="#17181d" style="stroke:var(--a)" stroke-width="1.8"/><path d="M20 60 Q24 76 44 72" fill="none" stroke="#17181d" stroke-width="2.2"/><circle cx="45" cy="72" r="2.4" style="fill:var(--a)"/>',
 "aegis":f'<path d="M18 52 Q16 4 60 3 Q104 4 102 52 L96 56 Q98 14 60 13 Q22 14 24 56Z" fill="{g}" style="stroke:color-mix(in srgb,var(--a) 50%,#000)" stroke-width="1"/><path d="M60 3 L60 13" style="stroke:var(--a)" stroke-width="1.6"/>'}[v]
def body(v,u,st):
    jac=f'url(#{u}j)'
    back={"ori":f'<path d="M30 92 Q22 120 24 140 L46 136 L44 96Z M90 92 Q98 120 96 140 L74 136 L76 96Z" fill="url(#{u}coat)"/>',
          "aegis":f'<path d="M30 88 Q8 120 12 146 L108 146 Q112 120 90 88Z" fill="#0c1612"/><path d="M30 88 Q8 120 12 146" fill="none" style="stroke:color-mix(in srgb,var(--a) 45%,#000)" stroke-width="1.4"/>'}.get(v,"")
    pants={"scout":"#b9a68a","ori":"#16171b"}.get(v,"#16171b")
    legs=(f'<rect x="45" y="118" width="12" height="20" rx="4" fill="{pants}"/><rect x="63" y="118" width="12" height="20" rx="4" fill="{pants}"/>'
          f'<g class="shoes"><path d="M38 137 h20 q3 0 3 5 v3 h-25 q-1-8 2-8Z" fill="url(#{u}shoe)"/><path d="M62 137 h20 q3 0 3 8 v0 h-25 v-3 q0-5 2-5Z" fill="url(#{u}shoe)"/>'
          f'<path d="M36 143 h25 M60 143 h25" stroke-width="2.2" style="stroke:var(--a)"/><path d="M42 139 l5 2 M68 139 l5 2" stroke="#0d0f14" stroke-width="1.2"/></g>')
    torso=(f'<path d="M36 96 Q36 86 48 86 H72 Q84 86 84 96 V122 Q60 127 36 122Z" fill="{jac}"/>'
           f'<path d="M36 100 Q36 88 48 87" fill="none" style="stroke:var(--a)" stroke-width="1.3" opacity=".8"/><path d="M84 100 Q84 88 72 87" fill="none" style="stroke:var(--a)" stroke-width="1.3" opacity=".55"/>'
           f'<path d="M60 88 V122" stroke="#0a0b0e" stroke-width="1"/><circle class="logo" cx="60" cy="104" r="6" fill="none" style="stroke:var(--a)" stroke-width="2.6" filter="url(#{u}glow)"/>'
           f'<rect x="38" y="116" width="44" height="4" rx="1" fill="#0b0c0f"/><rect x="57" y="116" width="6" height="4" rx="1" fill="#8d8f96"/>')
    if v=="ori": torso+=f'<path d="M44 86 L60 100 L52 120 L38 118 Z M76 86 L60 100 L68 120 L82 118Z" fill="url(#{u}coat)"/><circle class="logo" cx="60" cy="104" r="5.5" fill="#101114" style="stroke:var(--a)" stroke-width="2.4" filter="url(#{u}glow)"/>'
    if v=="scout": torso+=f'<path d="M40 88 L50 122 M80 88 L70 122" stroke="#6b4f2e" stroke-width="3"/><rect x="66" y="106" width="10" height="9" rx="2" fill="#4b3a26"/>'
    if v=="aegis": torso+=f'<path d="M40 92 Q60 86 80 92 L78 100 Q60 95 42 100Z" fill="#1c2a24" style="stroke:color-mix(in srgb,var(--a) 50%,#000)" stroke-width=".8"/>'
    arm=lambda x,side:f'<rect x="{x}" y="90" width="12" height="26" rx="6" fill="{jac}"/><circle cx="{x+6}" cy="117" r="6" fill="url(#{u}glove)"/>'
    armL=f'<g class="arm-l">{arm(26,0)}</g>'
    props={"nexus":f'<g class="prop"><path d="M74 112 L104 104 L106 120 L78 128Z" fill="#2a2d36" stroke="#4a4e5a" stroke-width=".8"/><path d="M78 113 L102 106.5 L103.5 118 L80 124.5Z" style="fill:color-mix(in srgb,var(--a) 35%,#0b1020)"/><circle cx="91" cy="115" r="2.6" fill="none" style="stroke:var(--a)" stroke-width="1.2" filter="url(#{u}glow)"/></g>',
           "nova":f'<g class="prop"><rect x="4" y="100" width="24" height="30" rx="3" fill="#1d1a26" style="stroke:var(--a)" stroke-width="1.2" transform="rotate(-12 16 115)"/><path d="M10 116 q5-8 10-2 q-3 6 -10 2Z" style="fill:var(--a)" opacity=".85" transform="rotate(-12 16 115)"/></g>',
           "scout":f'<g class="prop"><rect x="78" y="76" width="9" height="14" rx="3" fill="#2a2018"/><rect x="89" y="76" width="9" height="14" rx="3" fill="#2a2018"/><circle cx="82.5" cy="76" r="4" style="fill:color-mix(in srgb,var(--a) 70%,#000)"/><circle cx="93.5" cy="76" r="4" style="fill:color-mix(in srgb,var(--a) 70%,#000)"/></g>',
           "pulse":f'<g class="prop"><rect x="84" y="98" width="22" height="28" rx="3" fill="#1c1d22" transform="rotate(10 95 112)"/><path d="M89 120 l4-5 l4 3 l5-8" fill="none" style="stroke:var(--a)" stroke-width="1.8" transform="rotate(10 95 112)"/></g>',
           "aegis":f'<g class="prop"><circle cx="94" cy="112" r="18" fill="url(#{u}m)" style="stroke:var(--a)" stroke-width="2.6" filter="url(#{u}glow)"/><circle cx="94" cy="112" r="11" fill="#0f1714" style="stroke:color-mix(in srgb,var(--a) 70%,#000)" stroke-width="1.4"/><rect x="89.5" y="111" width="9" height="7" rx="1.5" style="fill:var(--a)"/><path d="M91 111 v-3 a3 3 0 0 1 6 0 v3" fill="none" style="stroke:var(--a)" stroke-width="1.6"/></g>',
           "ori":""}[v]
    if v=="nova": armR=f'<g class="arm-r"><rect x="82" y="74" width="12" height="26" rx="6" fill="{jac}" transform="rotate(20 88 98)"/><circle cx="96" cy="76" r="6" fill="url(#{u}glove)"/><path d="M97 74 L104 58" stroke="#e8e4f4" stroke-width="3" stroke-linecap="round"/><path d="M104 58 L106 53" style="stroke:var(--a)" stroke-width="3" stroke-linecap="round"/></g>'
    elif v in("ori","pulse"): armR=f'<g class="arm-r"><rect x="82" y="72" width="12" height="26" rx="6" fill="{jac}" transform="rotate(25 88 96)"/><circle cx="97" cy="74" r="6.5" fill="url(#{u}glove)"/><rect x="95.5" y="61" width="4" height="11" rx="2" fill="url(#{u}glove)"/></g>'
    elif v=="scout": armR=f'<g class="arm-r"><rect x="80" y="80" width="12" height="20" rx="6" fill="{jac}" transform="rotate(30 86 98)"/></g>'
    else: armR=f'<g class="arm-r">{arm(82,1)}</g>'
    return f'{back}<g class="legs">{legs}</g><g class="torso">{torso}</g>{armL}{armR}{props}'
def render(v,state="idle",size=96,prog=None,mode="hybride",name=None,label=None):
    nm,role,col,tag=V[v]; _n[0]+=1; u=f"h{_n[0]}"; compact=size<40
    stl=STL[state]+(f", étape {prog[0]} sur {prog[1]}" if prog and state=="executing" else "")
    sem=SEM.get(state); ring_col=f"var(--sem,{A})"
    # anneau : billy = néon continu ; hybride = facettes Astrolabe qui portent l'état réel
    if mode=="hybride":
        n=prog[1] if (prog and state=="executing") else 12
        k=prog[0] if (prog and state=="executing") else (n if state=="done" else 0)
        fac="".join(f'<path class="fc{" on" if (i<k or state in ("idle","listening","thinking","waiting","error")) else ""}{" cur" if state=="executing" and i==k else ""}" style="--i:{i}" d="{sector(CX,CY,i,n,38,43.5,4 if n>8 else 6)}"/>' for i in range(n))
        ticks="".join(f'<path d="M{P(CX,CY,45.5,math.radians(j*15-90))} L{P(CX,CY,47.5 if j%6 else 49,math.radians(j*15-90))}"/>' for j in range(24))
        ring=f'<g class="ticks">{ticks}</g><g class="facets" filter="url(#{u}glow)">{fac}</g>'
    else:
        arc=""
        if prog and state=="executing":
            C=2*math.pi*46; f=prog[0]/prog[1]
            arc=f'<circle class="parc" cx="{CX}" cy="{CY}" r="46" stroke-dasharray="{C*f:.1f} {C:.1f}" transform="rotate(-90 {CX} {CY})"/>'
        ring=f'<circle class="rim" cx="{CX}" cy="{CY}" r="40.5" fill="none" stroke-width="5" filter="url(#{u}glow)"{" stroke-dasharray=\"7 5\"" if state=="waiting" else ""}/><circle cx="{CX}" cy="{CY}" r="40.5" fill="none" stroke="#fff" stroke-width="1" opacity=".55" stroke-dasharray="40 300" transform="rotate(-150 {CX} {CY})"/>{arc}'
    badge={"done":"✓","error":"!","waiting":"‖"}.get(state,"")
    bx,by=(96,16) if not compact else (96,16)
    defs=(f'<defs><radialGradient id="{u}f" cx="36%" cy="30%" r="78%"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#f2f4f7"/><stop offset=".85" stop-color="#d3d8e0"/><stop offset="1" stop-color="#b9c0cb"/></radialGradient>'
      f'<radialGradient id="{u}s" cx="40%" cy="28%" r="80%"><stop offset="0" stop-color="#4a505c"/><stop offset=".45" stop-color="#181a20"/><stop offset="1" stop-color="#050608"/></radialGradient>'
      f'<radialGradient id="{u}h"><stop offset="0" style="stop-color:var(--sem,var(--a))" stop-opacity=".5"/><stop offset="1" style="stop-color:var(--sem,var(--a))" stop-opacity="0"/></radialGradient>'
      f'<linearGradient id="{u}j" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#34363e"/><stop offset=".5" stop-color="#1b1c21"/><stop offset="1" stop-color="#0c0d10"/></linearGradient>'
      f'<linearGradient id="{u}m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3d46"/><stop offset="1" stop-color="#121318"/></linearGradient>'
      f'<linearGradient id="{u}coat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbf4e4"/><stop offset="1" stop-color="#c9bc9e"/></linearGradient>'
      f'<linearGradient id="{u}gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1b8"/><stop offset=".5" stop-color="#f2b93b"/><stop offset="1" stop-color="#9a6a12"/></linearGradient>'
      f'<linearGradient id="{u}shoe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c8ccd4"/></linearGradient>'
      f'<radialGradient id="{u}glove" cx="35%" cy="30%"><stop offset="0" stop-color="#3a3c44"/><stop offset="1" stop-color="#101114"/></radialGradient>'
      f'<filter id="{u}glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>')
    headg=(f'<g class="head"><circle cx="{CX}" cy="{CY}" r="44" fill="url(#{u}s)"/>{ring}'
           f'<circle cx="{CX}" cy="{CY+2}" r="33" fill="url(#{u}f)"/><ellipse cx="47" cy="34" rx="11" ry="5.5" fill="#fff" opacity=".85" transform="rotate(-25 47 34)"/>'
           f'<path d="M30 30 Q36 14 54 9" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".35"/>'
           f'{face(v,state)}{head_acc(v,u)}</g>')
    fx=(f'<g class="thought"><circle cx="{CX}" cy="2" r="2.6"/><circle cx="{CX}" cy="98" r="2"/><circle cx="16" cy="{CY}" r="1.6"/></g>' if state=="thinking" else "")
    fx+=(f'<g class="waves"><circle cx="{CX}" cy="{CY}" r="47"/><circle cx="{CX}" cy="{CY}" r="47" style="animation-delay:-.9s"/></g>' if state=="listening" else "")
    fx+=(f'<g class="spark">'+"".join(f'<path d="M{P(CX,CY,52,math.radians(a))} l0 -4 M{P(CX,CY,52,math.radians(a))} l-2 -2 M{P(CX,CY,52,math.radians(a))} l2 -2" />' for a in (-150,-90,-30,200,-20))+'</g>' if state=="done" else "")
    bdg=(f'<g class="bdg"><circle cx="{bx}" cy="{by}" r="11" fill="{sem}" stroke="#07090a" stroke-width="3"/><text x="{bx}" y="{by+5}" text-anchor="middle" font-size="15" font-weight="800" fill="#07090a" font-family="system-ui,sans-serif">{badge}</text></g>' if badge else "")
    vb="12 -6 96 106" if compact else "0 -6 120 156"
    full="" if compact else f'<ellipse cx="60" cy="147" rx="34" ry="4.5" fill="#000" opacity=".55"/><ellipse class="floor" cx="60" cy="147" rx="28" ry="2.4" style="fill:var(--sem,var(--a))" opacity=".25"/>'
    styl=f"--s:{size}px;--agent-accent:{col}"+(f";--sem:{sem}" if sem else "")
    return (f'<span class="ov2{" compact" if compact else ""}" data-mode="{mode}" data-state="{state}" data-v="{v}" style="{styl}" role="img" aria-label="Avatar de {label or name or nm} ({stl})">'
            f'<svg viewBox="{vb}" aria-hidden="true" focusable="false">{defs}<ellipse class="halo" cx="{CX}" cy="{CY}" rx="56" ry="56" fill="url(#{u}h)"/>{full}'
            f'<g class="fig">{"" if compact else "<g class=\"bod\">"+body(v,u,state)+"</g>"}{headg}</g>{fx}{bdg}</svg></span>')
CSS=r"""
.ov2{--a:var(--brand-accent,var(--agent-accent));--s:96px;display:inline-block;width:var(--s);height:calc(var(--s)*1.3);flex:none;vertical-align:middle}.ov2.compact{height:calc(var(--s)*1.1)}
.ov2 svg{width:100%;height:100%;display:block;overflow:visible}.ov2 :is(.eyes,.arm-r,.prop,.bdg,.spark,.waves circle,.sweat,.halo,.thought){transform-box:fill-box;transform-origin:center}.ov2 .arm-r,.ov2 .prop{transform-origin:20% 90%}
.ov2 .fig{transform-box:view-box;transform-origin:60px 146px}.ov2 .head{transform-box:view-box;transform-origin:60px 90px}
.ov2 .rim{stroke:var(--sem,var(--a))}.ov2 .parc{fill:none;stroke:var(--a);stroke-width:2.4;stroke-linecap:round;opacity:.95}
.ov2 .ticks path{stroke:color-mix(in srgb,var(--sem,var(--a)) 55%,#cfd6d0);stroke-width:1}
.ov2 .fc{fill:color-mix(in srgb,var(--sem,var(--a)) 20%,#1b1d22)}.ov2 .fc.on{fill:var(--sem,var(--a))}.ov2 .fc.cur{fill:color-mix(in srgb,var(--a) 55%,#1b1d22)}
.ov2[data-state=idle] .fc.on{opacity:.75}.ov2[data-state=waiting] .fc:nth-child(odd){opacity:.35}
.ov2 .halo{opacity:0}.ov2[data-state=thinking] .halo,.ov2[data-state=executing] .halo,.ov2[data-state=listening] .halo{opacity:.55}
.ov2 .thought circle{fill:var(--a)}.ov2 .waves circle{fill:none;stroke:var(--a);stroke-width:1.6;opacity:.45}.ov2 .spark path{stroke:var(--sem);stroke-width:1.8;stroke-linecap:round}
.ov2[data-state=thinking] .eyes{transform:translate(1.5px,-2.5px)}.ov2[data-state=listening] .head{transform:rotate(-7deg)}.ov2[data-state=error] .head{transform:rotate(5deg)}
.ov2[data-state=waiting] .head{transform:translateY(1px)}
@media (prefers-reduced-motion:no-preference){
:root:not(.rm) .ov2[data-state=idle] .fig{animation:o2-breathe 4.2s ease-in-out infinite}
:root:not(.rm) .ov2[data-state=idle] .eyes,:root:not(.rm) .ov2[data-state=waiting] .eyes{animation:o2-blink 5.5s infinite}
:root:not(.rm) .ov2[data-state=listening] .head{animation:o2-tilt 3.2s ease-in-out infinite}:root:not(.rm) .ov2[data-state=listening] .waves circle{animation:o2-wave 1.8s ease-out infinite}
:root:not(.rm) .ov2[data-state=listening] .fc{animation:o2-ripple 1.8s ease-in-out infinite;animation-delay:calc(var(--i)*-.15s)}
:root:not(.rm) .ov2[data-state=thinking] .eyes{animation:o2-look 3.2s ease-in-out infinite}:root:not(.rm) .ov2[data-state=thinking] .fc{animation:o2-chase 2.4s linear infinite;animation-delay:calc(var(--i)*.2s)}
:root:not(.rm) .ov2[data-state=thinking] .thought{transform-box:view-box;transform-origin:60px 50px;animation:o2-spin 4s linear infinite}:root:not(.rm) .ov2[data-state=thinking] .halo{animation:o2-pulse 3.2s ease-in-out infinite}
:root:not(.rm) .ov2[data-state=executing] .arm-r,:root:not(.rm) .ov2[data-state=executing] .prop{animation:o2-work 1.8s ease-in-out infinite}:root:not(.rm) .ov2[data-state=executing] .fig{animation:o2-bob 1.8s ease-in-out infinite}
:root:not(.rm) .ov2[data-state=executing] .fc.cur,:root:not(.rm) .ov2[data-state=executing] .parc{animation:o2-glow 2s ease-in-out infinite}:root:not(.rm) .ov2[data-state=executing] .logo{animation:o2-glow 2s ease-in-out infinite}
:root:not(.rm) .ov2[data-state=waiting] .facets,:root:not(.rm) .ov2[data-state=waiting] .rim{animation:o2-dim 4s ease-in-out infinite}
:root:not(.rm) .ov2[data-state=done] .fig{animation:o2-hop .8s cubic-bezier(.2,.8,.3,1.2) 1 both}:root:not(.rm) .ov2[data-state=done] .spark{animation:o2-burst .9s .2s ease-out 1 both}:root:not(.rm) .ov2[data-state=done] .bdg{animation:o2-pop .5s .45s ease-out 1 both}
:root:not(.rm) .ov2[data-state=error] .head{animation:o2-shake .55s ease-out 1 both}:root:not(.rm) .ov2[data-state=error] .sweat{animation:o2-drop .8s .3s ease-in 1 both}
:root:not(.rm) .hov:hover .ov2 .fig,:root:not(.rm) .hov:focus-within .ov2 .fig{animation:o2-hi .9s ease-out 1}}
@keyframes o2-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.012,.988)}}@keyframes o2-blink{0%,94%,100%{transform:scaleY(1)}96.5%{transform:scaleY(.1)}}
@keyframes o2-tilt{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(-3deg)}}@keyframes o2-wave{0%{transform:scale(.94);opacity:.6}100%{transform:scale(1.22);opacity:0}}
@keyframes o2-ripple{0%,100%{opacity:.55}50%{opacity:1}}@keyframes o2-chase{0%{opacity:1}40%,100%{opacity:.3}}@keyframes o2-spin{to{transform:rotate(360deg)}}
@keyframes o2-look{0%,100%{transform:translate(1.5px,-2.5px)}50%{transform:translate(-1.5px,-2.5px)}}@keyframes o2-pulse{0%,100%{opacity:.3}50%{opacity:.7}}
@keyframes o2-work{0%,100%{transform:rotate(0)}50%{transform:rotate(-8deg)}}@keyframes o2-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.6px)}}
@keyframes o2-glow{0%,100%{opacity:.55}50%{opacity:1}}@keyframes o2-dim{0%,100%{opacity:.5}50%{opacity:1}}
@keyframes o2-hop{0%{transform:translateY(0)}35%{transform:translateY(-10px) scale(1.03,.97)}70%{transform:translateY(0) scale(.98,1.02)}100%{transform:none}}
@keyframes o2-burst{0%{opacity:0;transform:scale(.6)}50%{opacity:1}100%{opacity:0;transform:scale(1.15)}}@keyframes o2-pop{0%{opacity:0;transform:scale(.3)}100%{opacity:1;transform:scale(1)}}
@keyframes o2-shake{0%{transform:rotate(0)}25%{transform:rotate(-8deg)}55%{transform:rotate(7deg)}100%{transform:rotate(5deg)}}@keyframes o2-drop{0%{opacity:0;transform:translateY(-3px)}100%{opacity:1;transform:translateY(2px)}}
@keyframes o2-hi{0%,100%{transform:rotate(0)}30%{transform:rotate(-4deg) translateY(-3px)}65%{transform:rotate(3deg)}}
"""
