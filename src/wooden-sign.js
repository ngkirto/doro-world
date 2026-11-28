import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Three destinations only: future arcade is explicitly marked as unavailable.
export const SIGN_LABELS = ['歐潤吉投投樂', '街機 · 籌備中', 'DORO · 起點'];
export function createSignGeometry(position, station) {
  const parts = [];
  const rows = 4;
  function mapUV(g, row, width, height, depth, vertical = false) {
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      let u, v;
      if (Math.abs(n.getZ(i)) > .5) {
        u = .5 + p.getX(i) / width * (n.getZ(i) > 0 ? 1 : -1);
        v = .5 + p.getY(i) / height;
      } else if (Math.abs(n.getX(i)) > .5) { u = .5 + p.getZ(i) / depth; v = .5 + p.getY(i) / height; }
      else { u = .5 + p.getX(i) / width; v = .5 + p.getZ(i) / depth; }
      const faceRow = Math.abs(n.getZ(i)) > .5 ? row : 3;
      if (vertical) [u, v] = [v, u];
      uv.setXY(i, faceRow === 3 ? .15 + u * .82 : .02 + u * .96, 1 - (faceRow + .04 + (1 - v) * .92) / rows);
    }
    return g;
  }
  function box(w,h,d,x,y,z, vertical=false) {
    const g = new THREE.BoxGeometry(w,h,d).toNonIndexed();
    mapUV(g,3,w,h,d,vertical);g.translate(x,y,z);parts.push(g);
  }
  box(.14,2.22,.14,0,1.11,0,true);
  for (const y of [.35,2.1]) {
    const band = new THREE.BoxGeometry(.16,.065,.16).toNonIndexed();
    const uv = band.attributes.uv;
    for(let i=0;i<uv.count;i++) uv.setXY(i,.015+uv.getX(i)*.07,.015+uv.getY(i)*.2);
    band.translate(0,y,0);parts.push(band);
  }
  const targets = [station, new THREE.Vector3(-8,0,-4), new THREE.Vector3(.85,0,1)];
  for (let row = 0; row < 3; row++) {
    const shape = new THREE.Shape();
    // One broad nick, otherwise a cheap, strong arrow silhouette.
    [[-.83,-.17],[-.40,-.17],[-.37,-.145],[-.30,-.17],[.61,-.17],[.85,0],[.61,.17],[-.83,.17]]
      .forEach(([x,y],i)=>i ? shape.lineTo(x,y) : shape.moveTo(x,y));
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape,{depth:.065,bevelEnabled:false,curveSegments:1});
    g.translate(0,0,-.0325); mapUV(g,row,1.7,.34,.065);
    const yaw = Math.atan2(-(targets[row].z-position.z), targets[row].x-position.x);
    g.rotateZ(row===1 ? -.035 : .025);g.rotateY(yaw);g.translate(0,1.87-row*.47,.13);parts.push(g);
  }
  const geometry = mergeGeometries(parts, false);
  parts.forEach(g=>g.dispose());
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

export function createWoodenSign(position, station) {
  const sign = new THREE.Group();sign.name='RPGWoodenSign';sign.position.copy(position);
  const geometry=createSignGeometry(position,station);
  const material=new THREE.MeshStandardMaterial({color:0xc9b69f,roughness:.94});
  const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=mesh.receiveShadow=true;sign.add(mesh);
  let texture, disposed=false;
  const result = {sign,dispose(){disposed=true;sign.removeFromParent();geometry.dispose();material.dispose();texture?.dispose();}};
  if (typeof document === 'undefined') return result;
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;
  const ctx=canvas.getContext('2d');
  function paint(image) {
    ctx.fillStyle='#8b5634';ctx.fillRect(0,0,1024,1024);
    for(let row=0;row<4;row++) {
      const y=row*256;
      if(image) ctx.drawImage(image,0,row*190,1024,256,0,y,1024,256);
      if(row===3) continue;
      // Flat paint, grain and nail/rust detail share the same atlas as the timber.
      ctx.strokeStyle='rgba(50,25,12,.4)';ctx.lineWidth=4;
      ctx.strokeRect(10,y+10,1004,236);
      ctx.fillStyle='#f5e2b9';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.font='bold 76px "Noto Serif TC", "Microsoft JhengHei", serif';
      ctx.fillText(SIGN_LABELS[row],485,y+132,760);
      for(const ny of [38,218]) {
        ctx.fillStyle='#69452e';ctx.beginPath();ctx.arc(135,y+ny,10,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#39312b';ctx.beginPath();ctx.arc(135,y+ny,6,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#a18b65';ctx.fillRect(132,y+ny-3,4,2);
      }
    }
    ctx.fillStyle='#61564a';ctx.fillRect(0,768,110,256);
    for(let i=0;i<24;i++){ctx.fillStyle=i%2 ? '#77634c' : '#4e463e';ctx.fillRect((i*37)%100,780+(i*53)%230,8,3);}
    if(!texture) {texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;material.map=texture;material.needsUpdate=true;}
    texture.needsUpdate=true;
  }
  paint();
  new THREE.ImageLoader().load(`${import.meta.env.BASE_URL}textures/sign-wood.webp`,image=>{if(!disposed)paint(image);},undefined,()=>console.warn('Sign wood texture unavailable; using brown fallback.'));
  return result;
}
