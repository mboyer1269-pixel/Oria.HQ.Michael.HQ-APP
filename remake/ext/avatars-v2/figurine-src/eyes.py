import cv2,numpy as np,json,glob,os,sys
D='../figurine/';out={}
PREFOPEN=False
def detect(path):
    global PREFOPEN;PREFOPEN='nexus' in path
    im=cv2.imread(path,cv2.IMREAD_UNCHANGED);H,W=im.shape[:2]
    a=im[:,:,3] if im.shape[2]==4 else np.full((H,W),255,np.uint8);bgr=im[:,:,:3]
    hsv=cv2.cvtColor(bgr,cv2.COLOR_BGR2HSV);V=hsv[:,:,2].astype(int);S=hsv[:,:,1].astype(int)
    bright=((V>165)&(S<90)&(a>200)).astype(np.uint8)
    bright=cv2.morphologyEx(bright,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
    n,l,st,ce=cv2.connectedComponentsWithStats(bright)
    best=None
    for i in range(1,n):
        x,y,w,h,ar=st[i]
        if ar<0.01*H*W or ce[i][1]>0.75*H: continue
        sc=ar*(1.2 if w/h<1.6 else .5)
        if best is None or sc>best[0]: best=(sc,i)
    if best is None: return None
    face=(l==best[1]).astype(np.uint8)
    cs,_=cv2.findContours(face,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    hull=np.zeros_like(face);cv2.drawContours(hull,[cv2.convexHull(max(cs,key=cv2.contourArea))],-1,1,-1)
    fx,fy,fw,fh=cv2.boundingRect(hull)
    dark=((V<(80 if PREFOPEN else 95))&(a>200)&(hull>0)).astype(np.uint8)
    if PREFOPEN:
        d0=((V<38)&(a>200)).astype(np.uint8);d0[:, :2]=0;d0[:, -2:]=0
        cs2,_=cv2.findContours(d0,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE);dark=np.zeros_like(d0)
        for c in cs2:
            x,y,w,h=cv2.boundingRect(c);c=cv2.convexHull(c);ar=cv2.contourArea(c)
            if w*h>0 and ar/(w*h)>.55 and .9<h/max(w,1)<2.5 and 0.012*W<w<0.2*W and x>0 and x+w<W: cv2.drawContours(dark,[c],-1,1,-1)
        fx,fy,fw,fh=0,0,W,H
    n,l,st,ce=cv2.connectedComponentsWithStats(dark);cand=[]
    for i in range(1,n):
        x,y,w,h,ar=st[i]
        if ar<max(4,0.0008*fw*fh) or ar>0.06*fw*fh: continue
        if ce[i][1]>fy+0.72*fh: continue
        if x<=fx+1 or x+w>=fx+fw-1: continue
        cnt,_=cv2.findContours((l==i).astype(np.uint8),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
        c=max(cnt,key=cv2.contourArea)
        if len(c)>=5: (cx,cy),(d1,d2),ang=cv2.fitEllipse(c)
        else: cx,cy,d1,d2,ang=x+w/2,y+h/2,w,h,0
        fill=ar/(w*h)
        cand.append(dict(cx=float(cx),cy=float(cy),w=int(w),h=int(h),area=int(ar),fill=round(fill,2),ang=round(float(ang),1)))
    # eye pair: two comps of similar y, horizontally separated, highest in face
    pairs=[]
    for i,p in enumerate(cand):
        for q in cand[i+1:]:
            dy=abs(p['cy']-q['cy']);dx=abs(p['cx']-q['cx'])
            if dy<0.12*fh and 0.12*fw<dx<0.65*fw: pairs.append(((0 if (p['h']/max(p['w'],1)>=.5 and p['fill']>=.45 and q['h']/max(q['w'],1)>=.5 and q['fill']>=.45) else 1)*(0 if PREFOPEN else 0)+(0.5 if PREFOPEN and not (p['h']>=p['w']*.5 and p['fill']>=.45 and q['h']>=q['w']*.5 and q['fill']>=.45) else 0)+dy/fh+ (p['cy']+q['cy'])/2/fh*.3 - min(p['area'],q['area'])/(fw*fh)*8,p,q))
    if not pairs: return dict(face=[fx,fy,fw,fh],eyes=[],cand=cand)
    _,p,q=min(pairs,key=lambda t:t[0]);eyes=[]
    for e in sorted([p,q],key=lambda e:e['cx']):
        closed=e['h']/max(e['w'],1)<0.5 or e['fill']<0.45
        # face colour sampled in a ring around the eye
        m=np.zeros((H,W),np.uint8);cv2.ellipse(m,(int(e['cx']),int(e['cy'])),(int(e['w']*.9)+2,int(e['h']*.9)+2),0,0,360,1,-1)
        cv2.ellipse(m,(int(e['cx']),int(e['cy'])),(int(e['w']*.6)+1,int(e['h']*.6)+1),0,0,360,0,-1)
        ring=bgr[(m>0)&(V>150)]
        col=np.median(ring[np.argsort(ring.sum(1))[len(ring)//5:]],0) if len(ring) else np.array([230,230,235])
        eyes.append(dict(cx=round(e['cx']/W,4),cy=round(e['cy']/H,4),rx=round(e['w']/2/W,4),ry=round(e['h']/2/H,4),rot=0,ferme=bool(closed),couleur='#%02x%02x%02x'%tuple(int(c) for c in col[::-1])))
    return dict(taille=[W,H],face=[fx,fy,fw,fh],eyes=eyes)
for f in sorted(glob.glob(D+'*.webp')):
    if f.endswith('.m.webp'): continue
    out[os.path.basename(f)[:-5]]=detect(f)
for k in list(out):
    if k.endswith('-tete-64') and out.get(k[:-3]): out[k]=dict(out[k[:-3]],taille=list(cv2.imread(D+k+'.webp',-1).shape[1::-1]),face=[0,0,1,1],source=k[:-3])
json.dump({k:{kk:vv for kk,vv in v.items() if kk!='cand'} if v else None for k,v in out.items()},open('eyes.json','w'),indent=1)
# contact sheet
tiles=[]
for k,v in out.items():
    im=cv2.imread(D+k+'.webp',cv2.IMREAD_UNCHANGED);H,W=im.shape[:2]
    bg=np.full((H,W,3),40,np.uint8);al=im[:,:,3:4]/255.;im=(im[:,:,:3]*al+bg*(1-al)).astype(np.uint8)
    if v:
        fx,fy,fw,fh=v['face'] if v['face']!=[0,0,1,1] else [0,0,W,H];cv2.rectangle(im,(fx,fy),(fx+fw,fy+fh),(255,200,0),1)
        for e in v['eyes']:
            cv2.ellipse(im,(int(e['cx']*W),int(e['cy']*H)),(max(1,int(e['rx']*W)),max(1,int(e['ry']*H))),0,0,360,(0,0,255) if e['ferme'] else (0,255,0),1)
    # crop on face
    if v: fx,fy,fw,fh=v['face'] if v['face']!=[0,0,1,1] else [0,0,W,H];pad=int(.25*max(fw,fh));im=im[max(0,fy-pad):fy+fh+pad,max(0,fx-pad):fx+fw+pad]
    im=cv2.resize(im,(220,int(220*im.shape[0]/im.shape[1])));im=cv2.copyMakeBorder(im,0,max(0,260-im.shape[0]),0,0,cv2.BORDER_CONSTANT)[:260]
    cv2.putText(im,k,(4,252),cv2.FONT_HERSHEY_SIMPLEX,.42,(255,255,255),1);tiles.append(im)
while len(tiles)%6: tiles.append(np.zeros_like(tiles[0]))
cv2.imwrite('/tmp/eyes-sheet.png',np.vstack([np.hstack(tiles[i:i+6]) for i in range(0,len(tiles),6)]))
for k,v in out.items(): print(k, None if not v else [(e['ferme'],round(e['rx']*v['taille'][0],1),round(e['ry']*v['taille'][1],1)) for e in v['eyes']])
