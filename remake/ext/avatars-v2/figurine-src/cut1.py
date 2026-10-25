import numpy as np
from rembg import remove, new_session
from PIL import Image
S=new_session('isnet-anime')
b=Image.open('/workspace/uploads/billy-b.png').convert('RGB')
boxes={'ori':(110,80,460,475),'nexus':(600,80,940,475),'scout':(1030,80,1370,475),
'nova':(120,525,480,930),'aegis':(580,525,1010,930),'pulse':(1080,525,1400,930)}
for k,bx in boxes.items():
  im=b.crop(bx); o=remove(im,session=S,post_process_mask=True); o.save(f'{k}-raw.png')
  bb=o.getbbox(); print(k,bb)
