"""Astrolabe Oria — avatars génératifs déterministes (id + rôle → forme). SVG + CSS, transform/opacity seulement."""
import hashlib, math
HUES=[("#4dff9a","#0b3a22"),("#7cc4ff","#0b2440"),("#ffb340","#3a2400"),("#b9a2ff","#1e1440"),("#ff8f80","#3a100a"),("#5ee6d6","#06302b")]
_n=[0]
def seed(aid,role):
    h=hashlib.sha256(f"{aid}|{role}".encode()).digest(); return list(h)
def params(aid,role):
    b=seed(aid,role)
    r=list(hashlib.sha256(role.encode()).digest())
    return dict(hue=HUES[r[0]%len(HUES)],contours=3+b[1]%3,k1=2+b[2]%4,k2=5+b[3]%4,a1=.035+b[4]/255*.05,a2=.015+b[5]/255*.03,p1=b[6]/255*6.28,p2=b[7]/255*6.28,rot=b[8]/255*360,facets=5+b[9]%4,core=.22+b[10]/255*.06,tilt=-20+b[11]/255*40,hash=hashlib.sha256(f"{aid}|{role}".encode()).hexdigest()[:8])
def blob(R,p,phase=0,n=72):
    pts=[]
    for i in range(n):
        t=i/n*2*math.pi; r=R*(1+p["a1"]*math.sin(p["k1"]*t+p["p1"]+phase)+p["a2"]*math.sin(p["k2"]*t+p["p2"]-phase))
        pts.append(f"{50+r*math.cos(t):.2f},{50+r*math.sin(t):.2f}")
    return "M"+" L".join(pts)+"Z"
def sector(i,n,r0,r1,gap=4):
    a0=math.radians(i*360/n+gap/2-90);a1=math.radians((i+1)*360/n-gap/2-90)
    P=lambda r,a:f"{50+r*math.cos(a):.2f},{50+r*math.sin(a):.2f}"
    return f"M{P(r1,a0)} A{r1},{r1} 0 0 1 {P(r1,a1)} L{P(r0,a1)} A{r0},{r0} 0 0 0 {P(r0,a0)}Z"
EMB={"chaton":'<g class="emb"><path d="M41 47l2-9 5 6M59 47l-2-9-5 6" fill="#f3e6ff"/><circle cx="50" cy="52" r="9" fill="#f3e6ff"/><circle cx="46.5" cy="51" r="1.4" fill="#24103a"/><circle cx="53.5" cy="51" r="1.4" fill="#24103a"/><circle cx="50" cy="50" r="13" fill="none" stroke="#e8f3ec" stroke-width="1.2" opacity=".75"/></g>'}
STL={"idle":"au repos","executing":"exécute","waiting":"bloqué — attend votre décision","thinking":"réfléchit","listening":"écoute","done":"a terminé","error":"en erreur"}
def astre(aid,role,size=48,state="idle",prog=None,emblem=None,label=None,name=None):
    p=params(aid,role); c,dk=p["hue"]; _n[0]+=1; u=f"a{_n[0]}"
    if state=="error": c="#ff6b5e"
    total=prog[1] if prog else p["facets"]; doneN=prog[0] if prog else (total if state=="done" else 0)
    stl=STL[state]+(f", étape {prog[0]} sur {prog[1]}" if prog and state=="executing" else "")
    cont="".join(f'<path class="ct ct{i}" d="{blob(40-i*7,p,i*.7)}" style="--i:{i}"/>' for i in range(p["contours"]))
    crown="".join(f'<path class="fc{" on" if i<doneN else ""}{" cur" if state=="executing" and i==doneN else ""}" d="{sector(i,total,44,48)}"/>' for i in range(total))
    cr=p["core"]*100
    crystal=""
    if state=="done":
        pts=" ".join(f"{50+cr*1.25*math.cos(math.radians(a+p['rot'])):.1f},{50+cr*1.25*math.sin(math.radians(a+p['rot'])):.1f}" for a in range(0,360,60))
        crystal=f'<polygon class="cry" points="{pts}"/><path class="cry2" d="M50 {50-cr*1.25:.1f}V{50+cr*1.25:.1f}M{50-cr*1.08:.1f} {50-cr*.62:.1f}L{50+cr*1.08:.1f} {50+cr*.62:.1f}"/>'
    frac='<path class="crack" d="M44 30 L52 44 L47 52 L56 70"/>' if state=="error" else ""
    currents=f'<g class="cur1"><ellipse cx="50" cy="{50-cr*.45:.1f}" rx="{cr*.75:.1f}" ry="{cr*.3:.1f}" fill="url(#{u}w)"/></g><g class="cur2"><ellipse cx="50" cy="{50+cr*.4:.1f}" rx="{cr*.6:.1f}" ry="{cr*.25:.1f}" fill="url(#{u}w)"/></g>' if state in("thinking","executing") else ""
    emb=EMB.get(emblem,"")
    return (f'<span class="astre" data-state="{state}" style="--s:{size}px;--c:{c}" role="img" aria-label="Avatar de {label or name or aid} ({stl})">'
      f'<svg viewBox="0 0 100 100" aria-hidden="true"><defs><radialGradient id="{u}g" cx="42%" cy="38%" r="65%"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".35" stop-color="{c}"/><stop offset="1" stop-color="{dk}"/></radialGradient>'
      f'<radialGradient id="{u}h"><stop offset="0" stop-color="{c}" stop-opacity=".55"/><stop offset="1" stop-color="{c}" stop-opacity="0"/></radialGradient><radialGradient id="{u}w"><stop offset="0" stop-color="#fff" stop-opacity=".8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>'
      f'<circle class="halo" cx="50" cy="50" r="50" fill="url(#{u}h)"/><circle cx="50" cy="50" r="42" fill="#0a0f10"/>'
      f'<g class="ticks">'+"".join(f'<path d="M50 {7.5 if j%6==0 else 8.8}V10.2" style="transform:rotate({j*15}deg)"/>' for j in range(24))+'</g>'+f'<g class="rot" style="transform:rotate({p["rot"]:.0f}deg)"><g class="shell">{cont}</g></g><g class="crown">{crown}</g>'
      f'<g class="core"><g class="half h1"><circle cx="50" cy="50" r="{cr:.1f}" fill="url(#{u}g)"/></g>{currents}</g>{crystal}{frac}{emb}'
      f'</svg></span>')
CSS=r"""
.astre{--s:48px;--c:#4dff9a;display:inline-block;width:var(--s);height:var(--s);flex:none;position:relative}.astre svg{width:100%;height:100%;display:block;overflow:visible}
.astre *{transform-box:fill-box;transform-origin:center}.astre .shell,.astre .rot{transform-box:view-box;transform-origin:50px 50px}
.astre .ct{fill:none;stroke:color-mix(in srgb,var(--c) 55%,#e8dcc4);stroke-width:1.3;opacity:calc(.95 - var(--i)*.15)}
.astre .fc{fill:color-mix(in srgb,var(--c) 18%,#1a2224)}.astre .fc.on{fill:var(--c)}.astre .fc.cur{fill:color-mix(in srgb,var(--c) 60%,#1a2224)}
.astre .ticks path{stroke:color-mix(in srgb,var(--c) 40%,#e8dcc4);stroke-width:.8;transform-box:view-box;transform-origin:50px 50px}.astre .halo{opacity:0}.astre .core{opacity:.9}.astre .crack{fill:none;stroke:#ffd9d4;stroke-width:2;stroke-linejoin:round}
.astre .cry{fill:color-mix(in srgb,var(--c) 25%,transparent);stroke:#f4fff8;stroke-width:1.2}.astre .cry2{stroke:#f4fff8;stroke-width:.6;opacity:.7}
.astre[data-state=idle] .core{opacity:.65}.astre[data-state=idle] .crown{opacity:.45}
.astre[data-state=thinking] .halo,.astre[data-state=executing] .halo{opacity:.7}.astre[data-state=listening] .halo{opacity:.5}
.astre[data-state=waiting]{opacity:.8}.astre[data-state=waiting] .core{opacity:.5}.astre[data-state=waiting] .ct{stroke-dasharray:2 3}
.astre[data-state=error] .h1{transform:translate(-2px,1px)}.astre[data-state=error] .shell .ct{stroke:#ff6b5e}
.astre .emb{transform-box:view-box;transform-origin:50px 50px}
@media (prefers-reduced-motion:no-preference){
.astre[data-state=listening] .ct{animation:as-wave 1.8s ease-in-out infinite;animation-delay:calc(var(--i)*-.3s)}
.astre[data-state=thinking] .halo{animation:as-breathe 3.4s ease-in-out infinite}.astre[data-state=thinking] .cur1{animation:as-spin 5s linear infinite}.astre[data-state=thinking] .cur2{animation:as-spin 7s linear infinite reverse}
.astre[data-state=thinking] .shell{animation:as-drift 24s linear infinite}
.astre[data-state=executing] .shell{animation:as-drift 12s linear infinite}.astre[data-state=executing] .fc.cur{animation:as-glow 2s ease-in-out infinite}.astre[data-state=executing] .cur1{animation:as-spin 3.2s linear infinite}.astre[data-state=executing] .cur2{animation:as-spin 4.4s linear infinite reverse}.astre[data-state=executing] .halo{animation:as-breathe 2.6s ease-in-out infinite}
.astre[data-state=waiting] .core{animation:as-dim 4.5s ease-in-out infinite}
.astre[data-state=done] .cry,.astre[data-state=done] .cry2{animation:as-cry .9s cubic-bezier(.2,.8,.2,1.1) 1 both}.astre[data-state=done] .halo{animation:as-fade 1.6s ease-out 1 both}
.astre[data-state=error] .h1{animation:as-frac .6s ease-out 1 both}.astre[data-state=error] .crack{animation:as-crack .6s ease-out 1 both}}
@keyframes as-spin{to{transform:rotate(360deg)}}@keyframes as-drift{from{transform:rotate(0)}to{transform:rotate(360deg)}}
@keyframes as-wave{0%,100%{transform:scale(1,1)}50%{transform:scale(1.06,.94)}}
@keyframes as-breathe{0%,100%{opacity:.35;transform:scale(.95)}50%{opacity:.85;transform:scale(1.04)}}
@keyframes as-glow{0%,100%{opacity:.55}50%{opacity:1}}@keyframes as-dim{0%,100%{opacity:.35}50%{opacity:.6}}
@keyframes as-cry{0%{opacity:0;transform:scale(.4) rotate(-30deg)}100%{opacity:1;transform:scale(1) rotate(0)}}@keyframes as-fade{0%{opacity:.9}100%{opacity:0}}
@keyframes as-frac{0%{transform:translate(0,0)}100%{transform:translate(-2px,1px)}}@keyframes as-crack{0%{opacity:0}100%{opacity:1}}
"""
