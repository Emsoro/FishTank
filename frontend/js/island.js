// 小岛场景 —— 手工建模的环海小岛（保留原建模与配色，
// 只做了与桌面壳集成的少量改动，见 tools/extract_island.py）。three.js r169 与
// OrbitControls 由 three.min.js 提供，暴露为全局 THREE / OrbitControls。
(function () {
const OrbitControls = window.OrbitControls;

// 海岛鱼缸 — a hand-built, self-contained miniature.
const scene=new THREE.Scene();
scene.background=new THREE.Color('#c4dfe2');
scene.fog=new THREE.Fog('#c4dfe2',58,120);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.06;
document.body.appendChild(renderer.domElement);
const camera=new THREE.PerspectiveCamera(35,innerWidth/innerHeight,.1,180);
camera.position.set(22,19,27);
const controls=new OrbitControls(camera,renderer.domElement);
controls.target.set(0,-.45,0);controls.enableDamping=true;controls.dampingFactor=.065;controls.minDistance=1.2;controls.maxDistance=62;controls.maxPolarAngle=Math.PI*.49;controls.enablePan=true;controls.zoomSpeed=.8;controls.rotateSpeed=.65;
const hemi=new THREE.HemisphereLight('#defaff','#487d82',1.8);scene.add(hemi);
const sun=new THREE.DirectionalLight('#ffdf9b',2.8);sun.position.set(-12,22,12);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-13;sun.shadow.camera.right=13;sun.shadow.camera.top=15;sun.shadow.camera.bottom=-12;sun.shadow.camera.far=65;sun.shadow.normalBias=.035;sun.shadow.bias=-.0001;scene.add(sun);
const fill=new THREE.DirectionalLight('#83d9e5',1.25);fill.position.set(12,8,-10);scene.add(fill);
const root=new THREE.Group();scene.add(root);
const animated=new THREE.Group();scene.add(animated);
let seed=719;function rand(a=0,b=1){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return a+(b-a)*seed/4294967296}const pick=a=>a[Math.floor(rand(0,a.length))];
const V=(x,y,z)=>new THREE.Vector3(x,y,z);

const grad=new THREE.DataTexture(new Uint8Array([90,90,90,255,164,164,164,255,218,218,218,255,255,255,255,255]),4,1,THREE.RGBAFormat);grad.minFilter=grad.magFilter=THREE.NearestFilter;grad.needsUpdate=true;
const mats=new Map();function mat(c,extra={}){const key=c+JSON.stringify(extra);if(!mats.has(key))mats.set(key,new THREE.MeshToonMaterial({color:c,gradientMap:grad,...extra}));return mats.get(key)}
const C={ink:'#294b48',wood:'#946446',woodLight:'#ba8c5f',woodDark:'#55493b',cream:'#fff0ca',roof:'#265f66',roofLight:'#467e82',grass:'#77b64f',sand:'#ead39a',stone:'#819a8b',coral:'#ed7857'};
const edgeMat=new THREE.LineBasicMaterial({color:'#244e48',transparent:true,opacity:.37});
function mesh(g,m,x=0,y=0,z=0,parent=root,outline=false){let o=new THREE.Mesh(g,typeof m==='string'?mat(m):m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);if(outline){let e=new THREE.LineSegments(new THREE.EdgesGeometry(g,28),edgeMat);o.add(e)}return o}
function box(x,y,z,w,h,d,c,p=root,edge=true){return mesh(new THREE.BoxGeometry(w,h,d),c,x,y,z,p,edge)}
function ball(x,y,z,r,c,p=root,detail=1){return mesh(new THREE.IcosahedronGeometry(r,detail),c,x,y,z,p)}
function cyl(x,y,z,rt,rb,h,c,p=root,n=10,edge=false){return mesh(new THREE.CylinderGeometry(rt,rb,h,n),c,x,y,z,p,edge)}
function line(points,c=C.woodDark,r=.025,p=root){const curve=new THREE.CatmullRomCurve3(points.map(q=>q.isVector3?q:V(...q)));return mesh(new THREE.TubeGeometry(curve,Math.max(4,points.length*4),r,5,false),c,0,0,0,p)}
function beam(a,b,r,c,p=root){let av=V(...a),bv=V(...b);let o=cyl(...av.clone().add(bv).multiplyScalar(.5).toArray(),r,r,av.distanceTo(bv),c,p,7);o.quaternion.setFromUnitVectors(V(0,1,0),bv.sub(av).normalize());return o}
function torus(x,y,z,r,t,c,p=root,rx=0,ry=0){const o=mesh(new THREE.TorusGeometry(r,t,6,24),c,x,y,z,p,true);o.rotation.set(rx,ry,0);return o}
function rock(x,y,z,r=1,c=C.stone,p=root){const o=ball(x,y,z,r,c,p,0);o.scale.set(rand(.8,1.3),rand(.5,.85),rand(.7,1.2));o.rotation.set(rand(0,1),rand(0,4),rand(0,.3));return o}
function coast(a){return 6.45+.35*Math.sin(a*3+.4)+.27*Math.cos(a*5-1)+.18*Math.sin(a*7)}
function radial(x,z){return Math.sqrt((x/1.02)**2+(z/1.02)**2)/coast(Math.atan2(z,x))}
function streamX(z){return .35+Math.sin(z*.88)*.65}
function height(x,z){const t=radial(x,z);let h=.24+2.72*Math.pow(Math.max(0,1-t*t),1.55)+.28*Math.sin(x*.85)*Math.sin(z*.6)*(1-Math.min(t,1));if(z>-.5&&z<5.9){h-=.34*Math.exp(-(((x-streamX(z))/.43)**2))*Math.min(1,(z+.5)*2)}const lagoon=Math.exp(-(((x-.75)/.84)**4+((z-5.16)/.96)**4));h=h*(1-lagoon)+.238*lagoon;return h}
// Complete square, with alternating exposed sediment and volcanic layers.
box(0,-2.32,0,18,.48,18,'#344e54');
box(0,-1.96,0,18,.28,18,'#718184');
box(0,-1.60,0,18,.44,18,'#455d65');
box(0,-1.30,0,18,.18,18,'#a3aca1');
box(0,-.91,0,18,.60,18,'#687e7b');
box(0,-.53,0,18,.16,18,'#c5c6ad');
box(0,-.35,0,18,.20,18,'#e4d8b3');
for(let side=0;side<4;side++){
 let group=new THREE.Group();group.rotation.y=side*Math.PI/2;root.add(group);
 for(let i=0;i<29;i++){let x=-8.65+i*.61,y=rand(-2.35,-.65);rock(x,y,8.99,rand(.11,.34),pick(['#415d60','#738d87','#abb1a0']),group);if(i%2===0)line([[x,-.63,9.015],[x+.14,-1.05,9.018],[x-.08,-1.36,9.018],[x+.08,-1.82,9.018]],'#3c5859',.014,group)}
 for(let j=0;j<4;j++){let pts=[];for(let i=0;i<=36;i++)pts.push([-9+i*.5,-.69-j*.43+.035*Math.sin(i*1.7+j),9.017]);line(pts,j%2?'#aeb5a6':'#314c54',.018,group)}
}
// A low-relief sea bed, visible through the blue water.
for(let i=0;i<180;i++){let x=rand(-8.8,8.8),z=rand(-8.8,8.8);if(radial(x,z)<1)continue;let o=ball(x,-.195,z,rand(.035,.11),pick(['#ecd9a7','#bbd8b5','#f5e9c4']),root,0);o.scale.y=.25}
for(let i=0;i<50;i++){let x=rand(-8.4,8.4),z=rand(-8.4,8.4);if(radial(x,z)<1.07)continue;let pts=[];for(let j=0;j<9;j++)pts.push([x+j*.12,-.224,z+Math.sin(j*.6)*.045]);line(pts,'#c1cda8',.012)}
// Radial triangulation makes a continuous irregular shoreline and green hill.
const N=128,R=30,pos=[],colors=[],idx=[];const sand=new THREE.Color(C.sand),grass=new THREE.Color(C.grass);
for(let j=0;j<=R;j++)for(let i=0;i<=N;i++){let a=i/N*Math.PI*2,t=j/R,r=coast(a)*t,x=Math.cos(a)*r*1.02,z=Math.sin(a)*r*1.02;pos.push(x,height(x,z),z);let col=sand.clone().lerp(grass,THREE.MathUtils.smoothstep(1-t,.10,.24));col.multiplyScalar(1+rand(-.035,.035));colors.push(col.r,col.g,col.b)}
for(let j=0;j<R;j++)for(let i=0;i<N;i++){let a=j*(N+1)+i,b=a+N+1;idx.push(a,a+1,b,b,a+1,b+1)}
const landGeo=new THREE.BufferGeometry();landGeo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));landGeo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));landGeo.setIndex(idx);landGeo.computeVertexNormals();mesh(landGeo,mat('#ffffff',{vertexColors:true}));
// Water: restrained moving caustics and sunlit strokes, clipped to the square specimen.
const waterMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:{value:0}},vertexShader:`varying vec3 vP; uniform float time; void main(){vec3 p=position; p.z+=.018*sin(p.x*2.+time*.7)*sin(p.y*2.4+time*.5);vec4 w=modelMatrix*vec4(p,1.);vP=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,fragmentShader:`varying vec3 vP;uniform float time;void main(){vec2 p=vP.xz;float d=length(p);float deep=smoothstep(5.7,11.,d);vec3 c=mix(vec3(.20,.79,.69),vec3(.035,.43,.61),deep);float a=sin(p.x*9.+sin(p.y*7.+time*.32))*sin(p.y*10.-p.x*2.+time*.23);float caustic=smoothstep(.72,.97,a);c+=caustic*.13*(1.-deep*.7);float wave=sin(p.x*2.2+p.y*3.5+time*.7);float glint=smoothstep(.988,1.,wave)*smoothstep(.4,.8,sin(p.x*7.-p.y*3.));c+=glint*.17;gl_FragColor=vec4(c,.20+.42*deep);}`});
const sea=mesh(new THREE.PlaneGeometry(18,18,100,100),waterMat,0,.105,0);sea.rotation.x=-Math.PI/2;sea.castShadow=false;sea.receiveShadow=false;
// Ocean cut edge: a thin translucent glass-blue border, no endless sea.
const waterSide=new THREE.MeshBasicMaterial({color:'#24b9c5',transparent:true,opacity:.60});box(0,-.03,8.995,18,.26,.018,waterSide,root,false);box(8.995,-.03,0,.018,.26,18,waterSide,root,false);box(0,-.03,-8.995,18,.26,.018,waterSide,root,false);box(-8.995,-.03,0,.018,.26,18,waterSide,root,false);
for(let ring=0;ring<3;ring++)for(let seg=0;seg<14;seg++){let a=seg/14*Math.PI*2,pts=[];for(let j=0;j<14;j++){let th=a+j/14*.29;let r=coast(th)+.14+ring*.23;pts.push([Math.cos(th)*r*1.02,.13+ring*.004,Math.sin(th)*r*1.02])}line(pts,ring===0?'#f3ffe4':'#a0eadc',ring===0?.035:.016)}
for(let i=0;i<33;i++){let x=rand(-8.4,8.1),z=rand(-8.5,8.5);if(radial(x,z)<1.15)continue;line([[x,.15,z],[x+.25,.152,z-.02],[x+.5,.15,z]],'#bcefe4',rand(.012,.025))}
// Pebbled creek and a lagoon, cutting the hillside from its spring.
const creek=[];for(let i=0;i<=36;i++){let z=-.15+i*5.93/36,x=streamX(z);creek.push([x,height(x,z)+.055,z])}
function ribbon(path,width,c){let vs=[],is=[];for(let i=0;i<path.length;i++){let q=path[i];vs.push(q[0]-width/2,q[1],q[2],q[0]+width/2,q[1],q[2]);if(i<path.length-1){let k=i*2;is.push(k,k+1,k+2,k+1,k+3,k+2)}}let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vs,3));g.setIndex(is);g.computeVertexNormals();return mesh(g,c)}
ribbon(creek,.58,new THREE.MeshPhysicalMaterial({color:'#53cbbb',roughness:.19,transparent:true,opacity:.86,metalness:.12,side:THREE.DoubleSide}));
for(let i=2;i<35;i++){let [x,y,z]=creek[i];for(let s of [-1,1])rock(x+s*rand(.32,.43),y-.035,z,rand(.10,.22),pick(['#8eaa91','#abb7a1','#688d7a']));if(i%3===0)line([[x-.17,y+.012,z],[x,y+.014,z+.03],[x+.17,y+.013,z+.01]],'#c2ffdf',.013)}
const pool=cyl(.75,.265,5.25,.78,.78,.025,new THREE.MeshToonMaterial({color:'#65cabb',transparent:true,opacity:.83}),root,36);pool.scale.z=1.15;
// Reusable vegetation: pointed leaves with a folded, two-tone surface.
function leaf(a,b,w,c,p=root){let av=V(...a),bv=V(...b),mid=av.clone().lerp(bv,.48);let side=bv.clone().sub(av).cross(V(0,1,0)).normalize().multiplyScalar(w);if(side.length()<.01)side=V(w,0,0);let ridge=mid.clone().add(V(0,w*.24,0));let vs=[...av.toArray(),...mid.clone().add(side).toArray(),...ridge.toArray(),...bv.toArray(),...mid.clone().sub(side).toArray()];let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vs,3));g.setIndex([0,1,2,1,3,2,0,2,4,4,2,3]);g.computeVertexNormals();return mesh(g,mat(c,{side:THREE.DoubleSide}),0,0,0,p)}
function tuft(x,y,z,s=1,p=root){for(let i=0;i<5;i++){let a=i*2.4;leaf([x,y,z],[x+Math.cos(a)*s*.25,y+s*rand(.35,.64),z+Math.sin(a)*s*.25],s*.075,pick(['#468c5d','#80b94f','#b4cc64']),p)}}
function fern(x,y,z,s=1,p=root){for(let k=0;k<6;k++){let a=k*Math.PI/3+rand(-.2,.2),dx=Math.cos(a),dz=Math.sin(a);for(let j=1;j<6;j++){let t=j/6,m=[x+dx*t*s*.66,y+Math.sin(t*2)*s*.4,z+dz*t*s*.66];let w=(1-t)*s*.28;for(let side of [-1,1])leaf(m,[m[0]+dx*.13-dz*w*side,m[1]-.02,m[2]+dz*.13+dx*w*side],s*.065,pick(['#398660','#5aa561','#81b960']),p)}}}
function flower(x,y,z,s=.09,c='#f6eee0',p=root){beam([x,y-.16,z],[x,y,z],.012,'#4b9159',p);for(let i=0;i<5;i++){let a=i*Math.PI*.4;let o=ball(x+Math.cos(a)*s*.75,y,z+Math.sin(a)*s*.75,s*.6,c,p,0);o.scale.y=.42}ball(x,y+.025,z,s*.36,'#f5c252',p,0)}
function bush(x,y,z,s=1,c='#4e9755',p=root){for(let i=0;i<5;i++){let a=i*2.4;ball(x+Math.cos(a)*s*.27,y+rand(.18,.38)*s,z+Math.sin(a)*s*.24,s*rand(.28,.42),c,p,1)}}
function vine(x,y,z,len=1,p=root,axis='z'){let pts=[];for(let j=0;j<9;j++)pts.push([x+Math.sin(j*.9)*.06,y-j*len/8,z+.025*j]);line(pts,'#507653',.018,p);for(let j=1;j<9;j++){let q=pts[j];leaf(q,[q[0]+(j%2?-.15:.15),q[1]-.12,q[2]+.07],.075,pick(['#4b935b','#7aad61']),p)}}
function palm(x,z,h=4,lean=.65){let y=height(x,z),top=[x+lean,y+h,z+.12],pts=[];for(let i=0;i<=8;i++){let t=i/8;pts.push([x+lean*t*t,y+h*t,z+.12*t])}line(pts,C.wood,.12);for(let i=0;i<13;i++){let t=i/13;const ring=torus(x+lean*t*t,y+h*t,z+.12*t,.126,.017,'#d3ad75',root,Math.PI/2);ring.rotation.z=-lean/h}for(let i=0;i<9;i++){let a=i*Math.PI*2/9+rand(-.2,.2),len=rand(1.45,2.15),dx=Math.cos(a),dz=Math.sin(a),p=[];for(let j=0;j<=8;j++){let t=j/8;p.push([top[0]+dx*len*t,top[1]+Math.sin(t*Math.PI)*.43-t*t*.72,top[2]+dz*len*t])}leaf(p[0],p[8],.21,pick(['#429461','#6cb152','#84bc58']));line(p,'#628e48',.025);for(let j=1;j<8;j++){let t=j/8,q=p[j],w=Math.sin(t*Math.PI)*.35;for(let s of [-1,1])leaf(q,[q[0]+dx*.28-dz*w*s,q[1]-.13,q[2]+dz*.28+dx*w*s],.14,pick(['#3b905e','#70b355','#91c75f']))}}for(let i=0;i<3;i++)ball(top[0]+rand(-.17,.17),top[1]-.16,top[2]+rand(-.17,.17),.16,'#877549');for(let i=0;i<4;i++){let a=i*1.7;line([[x,y+.1,z],[x+Math.cos(a)*.35,y-.05,z+Math.sin(a)*.35],[x+Math.cos(a)*.65,height(x+Math.cos(a)*.65,z+Math.sin(a)*.65)+.02,z+Math.sin(a)*.65]],'#806a44',.045)}}
function tree(x,z,s=1,flame=false){let y=height(x,z);beam([x,y,z],[x+.16,y+2.3*s,z],.16*s,'#6c6950');for(let i=0;i<6;i++){let a=i*2.4,tx=x+Math.cos(a)*s*.85,tz=z+Math.sin(a)*s*.85,ty=y+rand(2.1,2.9)*s;beam([x+.12,y+1.5*s,z],[tx,ty,tz],.075*s,'#77714e');for(let j=0;j<3;j++){let o=ball(tx+rand(-.4,.4)*s,ty+rand(-.1,.25)*s,tz+rand(-.4,.4)*s,rand(.55,.8)*s,flame?pick(['#dc7145','#ef9953','#e8864a']):pick(['#438b57','#60a35a','#89b763']));o.scale.y=.65}}for(let i=0;i<5;i++){let a=i*1.25;line([[x,y+.35,z],[x+Math.cos(a)*s*.35,y+.04,z+Math.sin(a)*s*.35],[x+Math.cos(a)*s*.7,height(x+Math.cos(a)*s*.7,z+Math.sin(a)*s*.7)+.025,z+Math.sin(a)*s*.7]],'#82784f',.06)}}
function banana(x,z,s=1){let y=height(x,z);for(let i=0;i<6;i++){let a=i*2.4;let top=[x+Math.cos(a)*s*.1,y+s*(1.2+i*.1),z+Math.sin(a)*s*.1];beam([x,y,z],top,.045,'#8aab58');leaf(top,[x+Math.cos(a)*s*1.15,top[1]-.23,z+Math.sin(a)*s*1.15],s*.3,pick(['#4f9e5b','#7bb94f','#9ac75d']))}}
// Shore boulders and the rocky lee cliff.
for(let i=0;i<48;i++){let a=i/48*Math.PI*2;if(a>.6&&a<2.6)continue;let r=coast(a)*.94,x=Math.cos(a)*r,z=Math.sin(a)*r;let s=rand(.28,.65);rock(x,height(x,z)-.05,z,s,pick(['#6d8e85','#8ca393','#a9b5a0']));if(i%3===0)bush(x,height(x,z)+s*.3,z,.5)}
for(let i=0;i<10;i++){let x=rand(3.8,5.4),z=rand(-3.4,-1.3);rock(x,height(x,z)-.16,z,rand(.4,.75),'#81968a')}
// The island loop connects the house, lighthouse, harbor, and beach.
const route=[];for(let i=0;i<84;i++){let a=i/84*Math.PI*2,x=Math.cos(a)*4.2,z=Math.sin(a)*4.05;route.push([x,z]);let o=box(x,height(x,z)+.04,z,rand(.29,.46),.07,rand(.3,.46),pick(['#c9cbb0','#b8bfa8','#e0d8b5']),root,false);o.rotation.y=-a+rand(-.2,.2)}
function stepping(a,b,n=12){for(let i=0;i<=n;i++){let t=i/n,x=a[0]*(1-t)+b[0]*t,z=a[1]*(1-t)+b[1]*t;let o=box(x,height(x,z)+.055,z,.40,.11,.30,pick(['#c9c8aa','#ded7b8']),root,true);o.rotation.y=Math.atan2(b[0]-a[0],b[1]-a[1])}}
stepping([-2.0,1.4],[-2.8,4.55],13);stepping([2.1,2.0],[4,-2.0],18);
// Bridge arches over the creek, with individual weathered planks and rope rails.
let bz=2.65,bx=streamX(bz),by=height(bx,bz)+.28;
for(let i=0;i<11;i++){let x=bx-.9+i*.18,y=by+Math.sin(i/10*Math.PI)*.17;box(x,y,bz,.167,.075,.87,pick([C.wood,C.woodLight,'#a77a51']))}
for(let s of [-1,1]){for(let j of [-1,0,1])cyl(bx+j*.83,by+.3,bz+s*.46,.038,.045,.63,C.woodDark);line([[bx-.83,by+.6,bz+s*.46],[bx,by+.65,bz+s*.46],[bx+.83,by+.6,bz+s*.46]],'#c0ae7a',.028)}
// Main Japanese timber cottage with deep ceramic eaves.
const hx=-1.65,hz=-.65,hy=height(hx,hz)+.10;const house=new THREE.Group();house.position.set(hx,hy,hz);root.add(house);
box(0,.05,.25,3.55,.20,3.12,'#777c67',house);box(0,1.08,0,3.05,1.98,2.45,C.cream,house);
for(let i=0;i<7;i++)box(0,.16+i*.115,1.236,3.04,.085,.05,i%2?C.wood:C.woodLight,house);
for(let x of [-1.5,-.51,.53,1.5])box(x,1.1,1.27,.085,2.1,.10,C.woodDark,house);
for(let z of [-1.2,0,1.2])box(1.54,1.06,z,.09,2.05,.09,C.woodDark,house);
box(0,2.03,1.27,3.15,.11,.12,C.woodDark,house);
const glow=mat('#ffdaa1',{emissive:'#e4a950',emissiveIntensity:.52});
function windowAt(x,y,z,w=.68,h=.83,ry=0){let g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=ry;house.add(g);box(0,0,0,w+.13,h+.12,.07,C.woodDark,g);box(0,0,.044,w,h,.018,glow,g,false);for(let i=-1;i<=1;i++)box(i*w/3,0,.066,.027,h,.03,C.woodDark,g,false);box(0,0,.067,w,.028,.03,C.woodDark,g,false);box(0,-h/2-.05,.11,w+.2,.07,.23,C.woodLight,g)}
windowAt(-.98,1.35,1.285,.63,.80);windowAt(1.01,1.35,1.285,.63,.80);windowAt(1.57,1.36,0,.93,.78,Math.PI/2);
box(0,.87,1.285,.72,1.65,.08,C.woodDark,house);box(0,1.1,1.34,.60,1.08,.04,glow,house,false);for(let i=-2;i<=2;i++)box(i*.11,1.1,1.37,.025,1.09,.025,C.woodDark,house,false);box(0,.55,1.38,.67,.06,.04,C.woodDark,house);
// Gable ends and curved segmented roof surfaces.
for(let x of [-1.53,1.53]){let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([x,2.03,-1.22,x,2.03,1.22,x,3.04,0],3));g.computeVertexNormals();mesh(g,mat('#dddfbf',{side:THREE.DoubleSide}),0,0,0,house);beam([x,2.06,-1.25],[x,3.08,0],.055,C.woodDark,house);beam([x,3.08,0],[x,2.06,1.25],.055,C.woodDark,house)}
for(let side of [-1,1])for(let row=0;row<7;row++){let z0=row*.25,z1=(row+1)*.25;function roofY(z){return 3.1-.65*z+.11*z*z}let y0=roofY(z0),y1=roofY(z1);for(let k=0;k<18;k++){let x=-1.93+k*.221;let tile=box(x,(y0+y1)/2,side*(z0+z1)/2,.217,.075,Math.hypot(z1-z0,y1-y0)+.04,pick([C.roof,C.roof,C.roofLight,'#326c72']),house,false);tile.rotation.x=-side*Math.atan2(y1-y0,z1-z0);if(row===6)ball(x,y1+.012,side*z1,.07,'#4e8181',house,0)}}
beam([-2.07,3.15,0],[2.07,3.15,0],.12,'#376d70',house);for(let x of [-2.05,2.05]){line([[x,3.16,0],[x+(x>0?.13:-.13),3.26,0],[x+(x>0?.16:-.16),3.39,0]],C.roof,.085,house)}
for(let x of [-1.86,1.86])for(let side of [-1,1])line([[x,3.13,0],[x,2.64,side*.9],[x,2.30,side*1.74]],C.woodDark,.055,house);
// Solar panel, radio aerial, chimney and small copper weather vane.
let panel=box(.7,2.91,-.66,.91,.045,.58,'#244a64',house);panel.rotation.x=-.4;for(let j=0;j<4;j++){let o=box(.35+j*.23,2.93,-.66,.012,.012,.56,'#85b4bd',house,false);o.rotation.x=-.4}
box(-.94,3.07,-.55,.30,.9,.32,'#a47559',house);box(-.94,3.55,-.55,.42,.10,.42,'#606c63',house);
beam([1.24,3.0,0],[1.24,3.95,0],.02,'#59675e',house);beam([.9,3.78,0],[1.56,3.78,0],.018,'#59675e',house);beam([1.24,3.95,0],[1.24,4.16,0],.025,C.woodDark,house);leaf([.96,4.06,0],[1.53,4.06,0],.13,'#c78554',house);
// Engawa veranda and the little things left behind.
for(let i=0;i<18;i++)box(-1.7+i*.2,.22,1.88,.184,.11,1.09,pick([C.wood,C.woodLight,'#ae8053']),house);
for(let x of [-1.6,1.6])for(let z of [1.48,2.25])beam([x,-.45,z],[x,.25,z],.065,C.woodDark,house);
for(let i=0;i<3;i++)box(0,.14-i*.11,2.55+i*.21,1.0,.14,.24,C.woodLight,house);
function crate(x,y,z,s=.43,p=root){box(x,y+s/2,z,s,s,s,C.woodLight,p);for(let i=0;i<4;i++)box(x,y+.05+i*s*.25,z+s/2+.008,s,.016,.022,C.wood,p,false);for(let v of [-1,1])box(x+v*s*.39,y+s/2,z+s/2+.02,.047,s,.035,C.woodDark,p);beam([x-s*.39,y+.04,z+s/2+.04],[x+s*.39,y+s-.04,z+s/2+.04],.021,C.woodDark,p)}
crate(-1.24,.3,1.89,.40,house);crate(-1.20,.70,1.89,.31,house);
function lifeRing(x,y,z,r=.22,p=root){torus(x,y,z,r,r*.24,'#f6e9cc',p);for(let i=0;i<4;i++){let a=i*Math.PI/2;let o=box(x+Math.cos(a)*r,y+Math.sin(a)*r,z,.13,.11,.11,C.coral,p,false);o.rotation.z=a}}
lifeRing(1.52,1.24,1.42,.24,house);
function chair(x,y,z,p=root,angle=0){let g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=angle;p.add(g);for(let s of [-1,1]){beam([s*.22,0,-.22],[s*.22,.56,.21],.024,C.cream,g);beam([s*.22,0,.25],[s*.22,.53,-.19],.024,C.cream,g);beam([s*.22,.34,-.14],[s*.22,.88,-.34],.024,C.cream,g)}box(0,.40,.01,.46,.045,.42,'#e8ce9d',g);let o=box(0,.64,-.23,.43,.48,.04,'#f1e7c8',g);o.rotation.x=-.38;box(0,.645,-.205,.11,.44,.011,'#518d85',g,false).rotation.x=-.38}
chair(.76,.3,2.01,house,-.22);cyl(1.44,.56,2.04,.28,.28,.06,C.woodLight,house,16);cyl(1.44,.42,2.04,.035,.05,.28,C.woodDark,house);cyl(1.44,.64,2.04,.045,.045,.11,'#f1e8cf',house);
line([[-1.40,2.2,1.72],[-1.40,1.96,1.72]],'#625f4b',.009,house);ball(-1.40,1.91,1.72,.075,'#99d5c6',house);box(-1.40,1.70,1.72,.045,.19,.01,'#f5ddb4',house,false);
for(let i=0;i<7;i++)vine(-1.55,2.15-i*.07,1.31,.65+rand(0,.5),house);
for(let i=0;i<18;i++)flower(-1.58+rand(-.2,.2),rand(.7,2.1),1.42+rand(-.05,.12),.067,pick(['#dd7188','#f38ca0','#f3ad98']),house);
// White lighthouse on the opposite ridge, subordinate to the cottage.
const lx=4.04,lz=-2.43,ly=height(lx,lz)+.30;const lightHouse=new THREE.Group();lightHouse.position.set(lx,ly,lz);root.add(lightHouse);
cyl(0,.03,0,.88,.99,.19,'#b8b89a',lightHouse,12,true);cyl(0,1.38,0,.46,.66,2.62,'#f7efd4',lightHouse,14,true);cyl(0,.25,0,.65,.69,.18,'#dba477',lightHouse,14);cyl(0,2.64,0,.68,.68,.15,'#486e6c',lightHouse,16,true);cyl(0,2.79,0,.62,.62,.13,C.cream,lightHouse,16);
const glass=mat('#c0e9d7',{transparent:true,opacity:.44});cyl(0,3.12,0,.46,.46,.55,glass,lightHouse,12);cyl(0,3.16,0,.14,.14,.36,glow,lightHouse,10);
for(let i=0;i<8;i++){let a=i*Math.PI/4;beam([Math.cos(a)*.46,2.85,Math.sin(a)*.46],[Math.cos(a)*.46,3.43,Math.sin(a)*.46],.025,'#4b6663',lightHouse);beam([Math.cos(a)*.69,2.73,Math.sin(a)*.69],[Math.cos(a)*.69,3.01,Math.sin(a)*.69],.019,C.cream,lightHouse)}
torus(0,3.00,0,.69,.022,C.cream,lightHouse,Math.PI/2);cyl(0,3.51,0,.03,.66,.38,C.coral,lightHouse,12,true);cyl(0,3.75,0,.055,.07,.15,'#874e41',lightHouse);ball(0,3.87,0,.078,mat('#ff9b5d',{emissive:'#f98740',emissiveIntensity:.8}),lightHouse);
box(0,.61,.59,.34,.88,.055,'#668782',lightHouse);box(0,1.79,.526,.22,.39,.06,C.woodDark,lightHouse);box(0,1.79,.564,.15,.30,.02,glow,lightHouse);
// Windblown orange pennant, animated gently.
beam([lx+.9,ly,lz],[lx+.9,ly+2.1,lz],.029,'#c5bb94');const flagGeo=new THREE.PlaneGeometry(.69,.34,12,4);const flag=mesh(flagGeo,mat('#ec9663',{side:THREE.DoubleSide}),lx+1.23,ly+1.88,lz,animated);flag.userData.base=flagGeo.attributes.position.array.slice();
// Dock, boat and fishing equipment.
let dx=-3.65,dz=5.66;const dock=new THREE.Group();dock.position.set(dx,.54,dz);dock.rotation.y=-.10;root.add(dock);
for(let i=0;i<21;i++){let z=-1.25+i*.17;let o=box(0,rand(-.014,.014),z,1.25,.10,.154,pick(['#b69062','#a17c54','#c39a6d']),dock);o.rotation.z=rand(-.015,.015);if(i%3===0)line([[-.47,.061,z],[.04,.062,z+.012],[.49,.061,z-.01]],'#805f42',.008,dock)}
for(let x of [-.51,.51]){box(x,-.11,.45,.10,.16,3.9,C.woodDark,dock);for(let z of [-1.19,.15,2.03]){cyl(x,-.32,z,.095,.12,1.22,C.woodDark,dock);cyl(x,.25,z,.105,.105,.12,'#d5b684',dock);for(let j=0;j<3;j++)torus(x,.11+j*.032,z,.10,.017,'#ddc895',dock,Math.PI/2)}}
function barrel(x,y,z,p=root,s=1){cyl(x,y+.26*s,z,.21*s,.20*s,.52*s,C.wood,p,12,true);for(let h of [.09,.40])torus(x,y+h*s,z,.211*s,.023*s,'#566d65',p,Math.PI/2);cyl(x,y+.53*s,z,.205*s,.205*s,.025*s,C.woodLight,p,12)}
barrel(-.30,.07,-.75,dock);crate(.25,.06,.25,.35,dock);barrel(.33,.06,1.65,dock,.66);
for(let i=0;i<5;i++)torus(-.26,.07+i*.017,1.20,.13-i*.011,.014,'#debd84',dock,Math.PI/2);
// Hanging diamond-mesh fishing net.
for(let i=0;i<8;i++){let x=-.52+i*.15;line([[x,.08,-.1],[x+.07,-.15,.28],[x+.14,-.47,.58]],'#7f9c85',.009,dock)}for(let j=0;j<7;j++){let t=j/6;line([[-.52+t*.14,.08-t*.55,-.1+t*.68],[0+t*.14,.04-t*.55,-.1+t*.68],[.53+t*.14,.08-t*.55,-.1+t*.68]],'#7f9c85',.009,dock)}
for(let i=0;i<4;i++)ball(-.48+i*.29,.10,.05,.068,pick([C.coral,C.cream,'#639e9c']),dock,1);
for(let x of [-.72,-.98])beam([x,-.56,1.46],[x,.15,1.46],.025,C.woodLight,dock);for(let j=0;j<5;j++)beam([-.72,-.5+j*.15,1.46],[-.98,-.5+j*.15,1.46],.022,C.woodLight,dock);
const boat=new THREE.Group();boat.position.set(-5.2,.19,6.63);boat.rotation.y=-.20;animated.add(boat);
const boatShape=new THREE.Shape();boatShape.moveTo(0,-1.15);boatShape.bezierCurveTo(.43,-.8,.47,.48,.28,.90);boatShape.quadraticCurveTo(0,1.32,-.28,.90);boatShape.bezierCurveTo(-.47,.48,-.43,-.8,0,-1.15);
const hull=mesh(new THREE.ExtrudeGeometry(boatShape,{depth:.31,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.055,bevelThickness:.07}), '#af6351',0,0,0,boat,true);hull.rotation.x=Math.PI/2;hull.position.y=.33;
const inner=mesh(new THREE.ShapeGeometry(boatShape,20),'#5f9c98',0,.345,0,boat);inner.rotation.x=Math.PI/2;inner.scale.set(.86,.91,1);inner.material=mat('#69a7a0',{side:THREE.DoubleSide});
for(let z of [-.52,.16,.67])box(0,.40,z,.68,.065,.14,C.woodLight,boat);for(let s of [-1,1])line([[0,.38,-1.16],[s*.35,.39,-.68],[s*.43,.4,.26],[s*.25,.4,.95],[0,.4,1.17]],C.cream,.035,boat);
beam([-.24,.47,-.66],[.18,.46,.95],.022,C.woodLight,boat);let paddle=box(.18,.46,.91,.13,.025,.32,C.woodLight,boat);paddle.rotation.y=-.25;box(.06,.40,-.57,.32,.10,.38,'#c7c3a4',boat);lifeRing(-.36,.39,.20,.14,boat);
line([[-4.18,.71,7.55],[-4.65,.24,7.55],[-5.05,.59,7.70]],'#d8c294',.018);
// Mooring anchor on the planks.
beam([dx+.16,.67,dz+.6],[dx+.16,.67,dz+1.12],.026,'#53696a');torus(dx+.16,.67,dz+.58,.06,.019,'#53696a',root,Math.PI/2);line([[dx-.04,.67,dz+.97],[dx+.16,.67,dz+1.12],[dx+.36,.67,dz+.97]],'#53696a',.027);
// Small garden lanterns, mailbox, phone booth and bicycle.
function lamp(x,z,y=height(x,z),p=root){cyl(x,y+.19,z,.075,.13,.38,'#6d7d6c',p,8);box(x,y+.43,z,.19,.20,.19,glow,p);cyl(x,y+.56,z,.02,.18,.11,'#536e61',p,4);for(let s of [-1,1])box(x+s*.09,y+.44,z,.022,.23,.21,'#526c5c',p,false)}
for(let [x,z] of [[-2.8,2.6],[-2.7,4.45],[2.8,1.1],[3.8,-.65],[-.2,-3.8]])lamp(x,z);lamp(dx+.52,dz+2.04,.87);
const tx=-4.1,tz=.55,ty=height(tx,tz);const booth=new THREE.Group();booth.position.set(tx,ty,tz);booth.rotation.y=.24;root.add(booth);
box(0,.06,0,.79,.12,.77,'#8b9881',booth);for(let x of [-.34,.34])for(let z of [-.32,.32])box(x,.88,z,.063,1.66,.063,'#a65f4d',booth);box(0,1.77,0,.89,.16,.84,'#b87052',booth);box(0,.30,0,.69,.40,.64,'#84988a',booth);const boothGlass=mat('#a1cfc3',{transparent:true,opacity:.42});box(0,1.02,-.32,.64,1.11,.025,boothGlass,booth);for(let s of [-1,1])box(s*.34,1.02,0,.02,1.11,.63,boothGlass,booth);box(0,.98,-.17,.27,.38,.19,'#427d6c',booth);beam([-.09,.89,-.04],[-.09,1.11,-.04],.036,'#284e46',booth);line([[-.09,.9,-.01],[-.13,.75,.04],[.05,.73,.04],[.07,.88,-.01]],'#354f47',.012,booth);vine(.31,1.81,.32,1.35,booth);
const mx=-2.95,mz=2.00,my=height(mx,mz);beam([mx,my,mz],[mx,my+.73,mz],.04,C.woodDark);box(mx,my+.79,mz,.34,.29,.29,'#b66450');box(mx,my+.82,mz+.151,.23,.025,.008,'#534f40',root,false);
function sign(x,z){let y=height(x,z);beam([x,y,z],[x,y+.75,z],.035,C.woodDark);let b=box(x,y+.67,z,.48,.22,.06,C.woodLight);b.rotation.z=.06;for(let i=0;i<3;i++){let xx=x-.15+i*.13;line([[xx,y+.72,z+.035],[xx+.07,y+.70,z+.035],[xx+.015,y+.62,z+.035]],'#685c44',.013)}}sign(3.3,-1.65);sign(-3.4,3.48);
const bike=new THREE.Group();bike.position.set(-3.00,height(-3,1.05)+.28,1.05);bike.rotation.y=.28;root.add(bike);for(let x of [-.39,.39]){torus(x,0,0,.245,.027,'#344e4c',bike);torus(x,0,0,.213,.012,'#bdbf9f',bike);for(let i=0;i<8;i++){let a=i*Math.PI/4;beam([x,0,0],[x+Math.cos(a)*.215,Math.sin(a)*.215,0],.006,'#b8c6b4',bike)}}for(let [a,b] of [[[-.39,0,0],[-.12,.4,0]],[[-.39,0,0],[.02,0,0]],[[.02,0,0],[-.12,.4,0]],[[.02,0,0],[.27,.37,0]],[[-.12,.4,0],[.27,.37,0]],[[.27,.37,0],[.39,0,0]]])beam(a,b,.022,'#d68555',bike);box(-.12,.44,0,.20,.04,.12,C.woodDark,bike);beam([.27,.37,0],[.25,.57,0],.018,'#617a6c',bike);beam([.25,.57,-.12],[.25,.57,.12],.019,'#617a6c',bike);
// Clothes line tucked beside the house, no people.
let cy=height(-3.7,-1.6);for(let z of [-1.75,-3.2])beam([-3.7,cy,z],[-3.7,cy+1.45,z],.04,C.woodDark);line([[-3.7,cy+1.45,-1.75],[-3.7,cy+1.31,-2.47],[-3.7,cy+1.45,-3.2]],'#aba77e',.012);for(let i=0;i<3;i++){let o=box(-3.69,cy+1.10,-2.0-i*.43,.02,.50,.32,pick(['#f4ead0','#769f9b','#d7986e']));o.rotation.z=-.07}
// Telegraph poles and slack wires, with tiny perched seabirds.
const poles=[[-2.7,-2.9],[1.0,-4.05],[4.05,-3.1]];for(let [x,z] of poles){let y=height(x,z);beam([x,y,z],[x,y+3.0,z],.055,C.wood);beam([x-.32,y+2.82,z],[x+.32,y+2.82,z],.035,C.woodDark);for(let s of [-1,1])cyl(x+s*.23,y+2.91,z,.045,.045,.09,'#c2d2bb')}
for(let i=0;i<2;i++){let [x,z]=poles[i],[xx,zz]=poles[i+1],y=height(x,z)+2.95,yy=height(xx,zz)+2.95;for(let s of [-1,1])line([[x+s*.23,y,z],[(x+xx)/2+s*.23,(y+yy)/2-.49,(z+zz)/2],[xx+s*.23,yy,zz]],'#3e5551',.012)}
function bird(x,y,z,s=.14){let o=ball(x,y,z,s,'#f4eacb',root,1);o.scale.set(1,.63,.67);ball(x+s*.65,y+s*.42,z,s*.48,'#f5eedc');leaf([x-s*.12,y+.04,z],[x-s*1.1,y+.12,z-s*.3],s*.36,'#638a88');beam([x,y-.04,z],[x,y-.15,z],.008,C.woodDark);beam([x+s*.84,y+s*.43,z],[x+s*1.22,y+s*.4,z],.018,'#dca759')}
bird(1.02,height(1,-4.05)+3.04,-4.05,.115);bird(-4.13,.97,7.70,.14);
// Botanical silhouette: tall palms, broad leaves and a small flame tree.
palm(-5.0,1.2,3.65,-.53);palm(-4.8,-2.65,4.4,-.40);palm(-2.4,-4.55,4.25,.45);palm(1.25,-5.0,4.0,.42);palm(5.15,.9,3.25,-.28);palm(-5.4,3.0,3.05,.48);
tree(.15,-3.42,1.13,true);tree(2.2,-3.3,.80,false);tree(-3.5,-3.6,.76,false);banana(4.6,2.5,.8);banana(-4.7,-.5,.8);banana(2.85,-4.2,.65);
for(let i=0;i<140;i++){let x=rand(-6.1,6.1),z=rand(-5.9,5.9),r=radial(x,z);if(r>.95||r<.25)continue;if(x>-3.6&&x<.2&&z>-2.2&&z<2.6)continue;if(Math.abs(x-streamX(z))<.6&&z>-.5)continue;if(x>3.3&&x<4.9&&z<-1.5&&z>-3.5)continue;let y=height(x,z);let nearPath=Math.abs(Math.hypot(x/4.2,z/4.05)-1)<.06;if(nearPath)continue;if(i%6===0)fern(x,y,z,rand(.6,.95));else if(i%5===0)bush(x,y,z,rand(.5,.95),pick(['#4c965a','#69a859','#80b662']));else tuft(x,y,z,rand(.4,.9));if(i%3===0)for(let j=0;j<3;j++)flower(x+rand(-.2,.2),y+rand(.14,.3),z+rand(-.2,.2),rand(.045,.078),pick(['#f6efd4','#b79ccc','#f08076']))}
// Foreground tropical flower clusters and mossy path-side mushrooms.
for(let [x,z,s] of [[-5.0,4.0,1.1],[3.7,4.1,1.15],[5.65,2.2,.9],[-5.8,-1.2,.8]]){let y=height(x,z);fern(x,y,z,s);for(let i=0;i<5;i++)flower(x+rand(-.35,.35),y+rand(.25,.55),z+rand(-.3,.3),.11,pick(['#ef866a','#f5b072']))}
for(let i=0;i<12;i++){let x=3.1+rand(-.3,.3),z=.2+i*.13,y=height(x,z);cyl(x,y+.08,z,.018,.025,.16,'#efdfb2',root,6);let m=ball(x,y+.17,z,.074,'#c77657',root,1);m.scale.y=.5}
// Vines and marine debris hang down all four sides of the specimen.
for(let side=0;side<4;side++){let g=new THREE.Group();g.rotation.y=side*Math.PI/2;root.add(g);for(let i=0;i<8;i++){let x=rand(-8.5,8.5);vine(x,-.41,9.025,rand(.5,1.65),g);if(i%2===0){let o=ball(x+.18,-1.2,9.065,.12,'#e1cdb2',g,1);o.scale.z=.32;for(let j=0;j<3;j++)beam([x+.3,-1.7,9.07],[x+.3+rand(-.15,.15),-1.4,9.09],.024,'#c8806d',g)}}}
// Shells, driftwood, a bottle, sea glass, and small footprints in the sand.
function shell(x,y,z,s=.09){let o=ball(x,y,z,s,pick(['#fff1d4','#edc6ac','#e9ddd0']),root,1);o.scale.set(1,.3,.76);for(let j=0;j<4;j++){let a=j*.65+.55;beam([x,y+.025,z-s*.4],[x+Math.cos(a)*s*.8,y+.028,z+Math.sin(a)*s*.7],.005,'#c7ab91')}}
for(let i=0;i<60;i++){let a=rand(.05,Math.PI-.05),r=coast(a)*rand(.87,.99),x=Math.cos(a)*r,z=Math.sin(a)*r;if(i%3===0)shell(x,height(x,z)+.035,z);else if(i%4===0){let o=rock(x,height(x,z)+.01,z,.055,'#72baa8');o.scale.y=.25}}
line([[2.8,height(2.8,5)+.08,5],[3.25,height(3.25,4.9)+.09,4.9],[3.8,height(3.8,4.6)+.07,4.6]],'#b59e74',.095);beam([3.2,height(3.2,4.9)+.1,4.9],[3.4,height(3.4,4.8)+.25,4.8],.045,'#b39a6c');
let bottle=cyl(2.25,height(2.25,5.55)+.08,5.55,.045,.061,.24,mat('#6fba9f',{transparent:true,opacity:.8}),root,8);bottle.rotation.z=1.3;
for(let i=0;i<15;i++){let x=-1.85+i*.22,z=5.25+Math.sin(i*.23)*.18+(i%2?.07:-.07);let o=ball(x,height(x,z)+.008,z,.048,'#c6b887',root,1);o.scale.set(.55,.08,1.4)}
for(let i=0;i<6;i++){let x=.5+rand(-.5,.5),z=4.3+rand(-.7,.4),y=height(x,z)+.085;let pad=cyl(x,y,z,.11,.11,.012,'#86af65',root,10);if(i%3===0)flower(x,y+.04,z,.043,'#ffdfc6')}
// Submerged coral gardens, kelp, and slow schools of fish.
const fishes=[];for(let i=0;i<45;i++){let x=rand(-8.3,8.3),z=rand(-8.3,8.3);if(radial(x,z)<1.08)continue;if(i%3===0)rock(x,-.17,z,.21,'#83ad9f');for(let j=0;j<4;j++){let a=j*1.7;line([[x,-.23,z],[x+Math.cos(a)*.10,-.03,z+Math.sin(a)*.1],[x+Math.cos(a)*.17,.015,z+Math.sin(a)*.17]],pick(['#438f82','#72a67c','#c69285']),.017)}}
// Collector's miniature floats above a quiet powder-blue studio backdrop.
const floor=mesh(new THREE.PlaneGeometry(300,300),new THREE.MeshStandardMaterial({color:'#c4dfe2',roughness:1}),0,-2.89,0,scene);floor.rotation.x=-Math.PI/2;floor.castShadow=false;
// Merge static meshes by material. This preserves thousands of handmade details with few draw calls.
function consolidate(group){group.updateMatrixWorld(true);const batches=new Map(),lineBatches=new Map(),remove=[];group.traverse(o=>{if(o.isMesh&&!Array.isArray(o.material)){let arr=batches.get(o.material)||[];let g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);arr.push(g);batches.set(o.material,arr);remove.push(o)}else if(o.isLineSegments){let arr=lineBatches.get(o.material)||[];let g=o.geometry.clone();g.applyMatrix4(o.matrixWorld);arr.push(g);lineBatches.set(o.material,arr);remove.push(o)}});function combine(gs,isLine=false){let keys=isLine?['position']:['position','normal'];if(gs[0].getAttribute('color'))keys.push('color');let out=new THREE.BufferGeometry();for(let key of keys){let total=gs.reduce((n,g)=>n+(g.getAttribute(key)?.array.length||0),0),a=new Float32Array(total),off=0;for(let g of gs){let src=g.getAttribute(key)?.array;if(src){a.set(src,off);off+=src.length}}out.setAttribute(key,new THREE.BufferAttribute(a,3))}gs.forEach(g=>g.dispose());out.computeBoundingSphere();return out}for(let o of remove)o.removeFromParent();for(let [m,gs] of batches){let o=new THREE.Mesh(combine(gs),m);o.castShadow=m!==waterMat&&!m.transparent;o.receiveShadow=true;scene.add(o)}for(let [m,gs] of lineBatches)scene.add(new THREE.LineSegments(combine(gs,true),m));}
// Water requires its plane-local coordinates, so retain it outside the static batch.
root.remove(sea);scene.add(sea);consolidate(root);
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const clock=new THREE.Clock();let active=true;document.addEventListener('visibilitychange',()=>{active=!document.hidden});
let previousFit=camera.position.distanceTo(controls.target);function resize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);const fit=Math.max(40,14/(Math.tan(35*Math.PI/360)*camera.aspect));camera.position.sub(controls.target).multiplyScalar(fit/previousFit).add(controls.target);previousFit=fit;scene.fog.near=Math.max(58,fit+22);scene.fog.far=scene.fog.near+65;controls.maxDistance=Math.max(62,fit*1.5)}addEventListener('resize',resize);resize();controls.update();
const hooks=[];let lastT=0;
function frame(){requestAnimationFrame(frame);if(!active)return;let t=clock.getElapsedTime();const dt=Math.min(Math.max(t-lastT,0),.05);lastT=t;
if(!reduced){waterMat.uniforms.time.value=t;boat.position.y=.19+Math.sin(t*1.05)*.028;boat.rotation.z=Math.sin(t*.8)*.019;const p=flag.geometry.attributes.position,b=flag.userData.base;for(let i=0;i<p.count;i++){let x=b[i*3];p.setZ(i,Math.sin(x*7-t*2.2)*.065*(x/.69+.5))}p.needsUpdate=true;}for(const h of hooks)h(t,dt);
controls.update();renderer.render(scene,camera)}frame();
// Read-only scene diagnostics for local verification; nothing is drawn on screen.
window.__island={renderer,scene,camera,controls,ready:true};

// ---------------------------------------------------------------------------
// 集成导出：鱼群 / 饲料从外部挂进来，场景本身保持原样
// ---------------------------------------------------------------------------
renderer.shadowMap.autoUpdate=false;   // 静态场景：阴影只烘一次
renderer.shadowMap.needsUpdate=true;

window.Island={
    renderer, scene, camera, controls, root, animated, sea, waterMat, boat, flag,
    height, coast, radial, streamX,
    seaLevel:.105,
    hooks,
    resetFit:()=>resize(),
};

})();
