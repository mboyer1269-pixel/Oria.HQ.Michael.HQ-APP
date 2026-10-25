"""Famille « Glyphe » — monogramme typographique sur tuile. Piste sobre, lisible dès 24 px, pour listes denses et équipes qui préfèrent un rendu non figuratif."""
V={"signal":("#4dff9a","#03140a"),"azur":("#7cc4ff","#06121f"),"ambre":("#ffb340","#1f1300"),"lilas":("#c8a8ff","#160b2a"),"corail":("#ff8f80","#240806")}
STL={"idle":"au repos","executing":"exécute","waiting":"bloqué — attend votre décision","thinking":"réfléchit","listening":"écoute","done":"a terminé","error":"en erreur"}
def render(aid,role,size=48,state="idle",prog=None,variante="signal",label=None,name=None):
    c,dk=V[variante]; ini="¤" if name=="§" else (name or aid.split("-")[-1])[:1].upper()
    if state=="error": c="#ff6b5e"
    if state=="waiting": c="#ffb340"
    stl=STL[state]+(f", étape {prog[0]} sur {prog[1]}" if prog and state=="executing" else "")
    bar=""
    if state=="executing" and prog:
        t=prog[1]; w=(76-(t-1)*3)/t
        bar="".join(f'<rect class="pb{" on" if i<prog[0] else ""}{" cur" if i==prog[0] else ""}" x="{12+i*(w+3):.1f}" y="84" width="{w:.1f}" height="5" rx="2"/>' for i in range(t))
    eq='<g class="eq">'+"".join(f'<rect x="{38+i*7}" y="78" width="4" height="10" rx="2" style="animation-delay:{-i*.3}s"/>' for i in range(4))+'</g>' if state=="listening" else ""
    dots='<g class="dt">'+"".join(f'<circle cx="{40+i*10}" cy="84" r="3" style="animation-delay:{-i*.5}s"/>' for i in range(3))+'</g>' if state=="thinking" else ""
    badge={"done":"✓","error":"!","waiting":"‖"}.get(state,"")
    return (f'<span class="glyphe" data-state="{state}" style="--s:{size}px;--c:{c}" role="img" aria-label="Avatar de {label or name or aid} ({stl})"><svg viewBox="0 0 100 100" aria-hidden="true">'
     f'<rect class="tile" x="4" y="4" width="92" height="92" rx="22" fill="{dk}" stroke="{c}" stroke-width="3"{" stroke-dasharray=\"8 6\"" if state=="waiting" else ""}/>'
     f'<text class="ini" x="50" y="64" text-anchor="middle" font-size="52" font-weight="700" font-family="Space Grotesk,system-ui,sans-serif" fill="{c}">{ini}</text>{bar}{eq}{dots}'
     +(f'<g class="bdg"><circle cx="86" cy="14" r="12" fill="{c}" stroke="#07090a" stroke-width="3"/><text x="86" y="19" text-anchor="middle" font-size="15" font-weight="700" fill="#07090a">{badge}</text></g>' if badge else "")+'</svg></span>')
CSS=r"""
.glyphe{--s:48px;display:inline-block;width:var(--s);height:var(--s);flex:none}.glyphe svg{width:100%;height:100%;display:block;overflow:visible}.glyphe *{transform-box:fill-box;transform-origin:center}
.glyphe .pb{fill:color-mix(in srgb,var(--c) 22%,#111)}.glyphe .pb.on{fill:var(--c)}.glyphe .pb.cur{fill:color-mix(in srgb,var(--c) 55%,#111)}.glyphe .eq rect,.glyphe .dt circle{fill:var(--c)}
.glyphe[data-state=idle] .tile{opacity:.75}
@media (prefers-reduced-motion:no-preference){
.glyphe[data-state=listening] .eq rect{animation:gl-eq 1.6s ease-in-out infinite}.glyphe[data-state=thinking] .dt circle{animation:gl-dot 1.8s ease-in-out infinite}
.glyphe[data-state=thinking] .ini{animation:gl-breathe 3.2s ease-in-out infinite}.glyphe[data-state=executing] .pb.cur{animation:gl-glow 2s ease-in-out infinite}
.glyphe[data-state=waiting] .tile{animation:gl-glow 4s ease-in-out infinite}.glyphe[data-state=done] .ini{animation:gl-settle .6s ease-out 1 both}.glyphe[data-state=done] .bdg{animation:gl-pop .5s .3s ease-out 1 both}
.glyphe[data-state=error] svg{animation:gl-shake .5s ease-out 1 both}}
@keyframes gl-eq{0%,100%{transform:scaleY(.4)}50%{transform:scaleY(1)}}@keyframes gl-dot{0%,100%{opacity:.3}50%{opacity:1}}@keyframes gl-breathe{0%,100%{opacity:.7}50%{opacity:1}}
@keyframes gl-glow{0%,100%{opacity:.5}50%{opacity:1}}@keyframes gl-settle{0%{transform:scale(1.12)}100%{transform:scale(1)}}@keyframes gl-pop{0%{opacity:0;transform:scale(.3)}100%{opacity:1;transform:scale(1)}}
@keyframes gl-shake{0%,100%{transform:translateX(0)}30%{transform:translateX(-3px)}65%{transform:translateX(3px)}}
"""
