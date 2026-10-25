from rembg import remove, new_session
from PIL import Image
S=new_session('isnet-general-use')
a=Image.open('/workspace/uploads/billy-a.png').convert('RGB')
px={'ori-joie':(0,120),'ori-clin':(125,230),'nexus-focus':(228,335),'nova-pouce':(355,460),'scout-idee':(460,550),'scout-cap':(540,612),'scout-jumelles':(598,700),'pulse-ecoute':(698,775),'pulse-pouce':(770,855),'aegis-garde':(855,940),'aegis-fier':(935,1024)}
for k,(x0,x1) in px.items():
  im=a.crop((int(x0*1.5),770,int(x1*1.5),950)); remove(im,session=S,post_process_mask=True).save(f'g/exp-{k}-raw.png')
