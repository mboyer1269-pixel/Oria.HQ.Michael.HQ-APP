import numpy as np, cv2, os, json, glob
from PIL import Image
OUT='/workspace/oria-design/remake/ext/avatars-v2/figurine'; os.makedirs(OUT,exist_ok=True)
def clean(im):
  a=np.array(im.convert('RGBA')).astype(np.float32)
  al=a[...,3]
  al=cv2.erode(al,np.ones((3,3),np.uint8),1)       # retire la frange 1px
  al=cv2.GaussianBlur(al,(3,3),0.6)
  al[al<12]=0
  # supprime les îlots parasites
  n,lab,st,_=cv2.connectedComponentsWithStats((al>40).astype(np.uint8))
  if n>1:
    big=st[1:,cv2.CC_STAT_AREA].max(); keep=np.zeros(n,bool); keep[1:]=st[1:,cv2.CC_STAT_AREA]>big*0.02
    m=keep[lab]; m=cv2.dilate(m.astype(np.uint8),np.ones((5,5),np.uint8))>0; al[~m]=0
  a[...,3]=al; o=Image.fromarray(a.clip(0,255).astype(np.uint8)); return o.crop(o.getbbox())
def mask(im):
  a=np.array(im).astype(np.uint8); hsv=cv2.cvtColor(a[...,:3],cv2.COLOR_RGB2HSV).astype(np.float32)/255
  s,v=hsv[...,1],hsv[...,2]
  ss=lambda e0,e1,x: np.clip((x-e0)/(e1-e0),0,1)**1
  m=ss(.22,.5,s)*ss(.10,.28,v)*(a[...,3]/255.)
  m=cv2.GaussianBlur(m,(3,3),0)
  out=np.zeros_like(a); out[...,:3]=255; out[...,3]=(m*255).astype(np.uint8); return Image.fromarray(out)
def save(im,name,h,q=84):
  w=round(im.width*h/im.height); r=im.resize((w,h),Image.LANCZOS)
  r.save(f'{OUT}/{name}.webp','WEBP',quality=q,method=6,alpha_quality=90)
  mask(r).save(f'{OUT}/{name}.m.webp','WEBP',quality=70,method=6,alpha_quality=70)
  return [w,h]
def fade(im,frac=.16):
  a=np.array(im).astype(np.float32);h=a.shape[0];n=int(h*frac)
  ramp=np.ones(h);ramp[h-n:]=np.linspace(1,0,n)**1.4;a[...,3]*=ramp[:,None];return Image.fromarray(a.astype(np.uint8))
def sq(im,cx,top,side):
  return im.crop((int(cx-side/2),int(top),int(cx+side/2),int(top+side)))
meta={}
HEAD=json.load(open('heads.json'))
for k in ['ori','nexus','scout','nova','aegis','pulse']:
  im=clean(Image.open(f'{k}-raw.png')); meta[k]={'full':save(im,f'{k}-corps',520)}
  W,H=im.size; hx,hy,hs=HEAD[k]   # fractions
  hd=fade(sq(im,hx*W,hy*H,hs*W)); meta[k]['tete']=save(hd,f'{k}-tete',256)
  save(hd,f'{k}-tete-64',64,q=90)
  bu=fade(im.crop((0,0,W,int(H*0.66))),.12); meta[k]['buste']=save(bu,f'{k}-buste',360)
for f in sorted(glob.glob('pick/*.png')):
  k=os.path.basename(f)[:-4]; im=clean(Image.open(f)); meta['exp-'+k]=save(im,'exp-'+k,min(240,im.height*2))
json.dump(meta,open(f'{OUT}/meta.json','w'),indent=1)
