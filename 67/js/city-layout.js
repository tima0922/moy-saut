import { CatmullRomCurve3, MathUtils, Vector3 } from 'three';

const { clamp, lerp, smoothstep } = MathUtils;
const route = [
  [-140,738],[-38,738],[60,738],[146,740],[194,761],[206,803],
  [206,850],[229,888],[252,928],[255,971],[233,1016],[190,1053],
  [128,1072],[73,1071],[31,1051],[5,1014],[-28,1000],[-65,1011],
  [-109,1045],[-160,1072],[-213,1070],[-248,1044],[-250,1007],
  [-222,972],[-202,938],[-207,902],[-238,875],[-259,843],
  [-259,811],[-245,775],[-204,748],[-177,739],
];

export function createCityLayout() {
  const spline = new CatmullRomCurve3(route.map(([x,z])=>new Vector3(x,0,z)),true);
  spline.arcLengthDivisions = 4096;
  const count = 768;
  const road = spline.getSpacedPoints(count).slice(0,-1);
  const wrap = i=>(i+count)%count;
  const directions = road.map((p,i)=>road[wrap(i+1)].clone().sub(road[wrap(i-1)]).normalize());
  const spacing = spline.getLength()/count;
  const widths = road.map(({x,z})=>9.2+2.1*(1-smoothstep(z,744,788))*smoothstep(x,-221,-168)
    -.85*smoothstep(z,975,1010)*(1-smoothstep(x,30,115)));
  const curves = directions.map((_,i)=>{
    const a=directions[wrap(i-3)],b=directions[wrap(i+3)];
    return Math.atan2(a.z*b.x-a.x*b.z,a.dot(b))/(spacing*6);
  });
  const bank = curves.map(curvature=>clamp(-curvature*1.45,-.075,.075));
  for (const p of road) {
    const bridge=smoothstep(p.z,796,895)*(1-smoothstep(p.z,980,1060))*smoothstep(p.x,177,232);
    p.y=.18+7.2*bridge;
  }

  function project(x,z) {
    let index=0,fraction=0,side=0,distance=Infinity;
    for (let i=0;i<count;i++) {
      const a=road[i],b=road[wrap(i+1)];
      const dx=b.x-a.x,dz=b.z-a.z,rx=x-a.x,rz=z-a.z;
      const t=clamp((rx*dx+rz*dz)/(dx*dx+dz*dz),0,1);
      const square=(rx-t*dx)**2+(rz-t*dz)**2;
      if (square>=distance) continue;
      index=i;
      fraction=t;
      distance=square;
      side=rx*directions[i].z-rz*directions[i].x;
    }
    return {index,fraction,side,distance};
  }

  function heightAt(x,z) {
    const {index,fraction,side,distance}=project(x,z);
    if (distance>(widths[index]+2.5)**2) return -.12;
    const next=wrap(index+1);
    return lerp(road[index].y,road[next].y,fraction)+clamp(side,-widths[index],widths[index])*
      lerp(bank[index],bank[next],fraction);
  }

  const corners=[];
  const ordering=curves.map((curvature,i)=>({curvature,i})).sort((a,b)=>Math.abs(b.curvature)-Math.abs(a.curvature));
  for (const {curvature,i} of ordering) {
    if (Math.abs(curvature)<.016) break;
    if (corners.some(c=>Math.min(Math.abs(c.i-i),count-Math.abs(c.i-i))*spacing<41)) continue;
    const radius=1/Math.abs(curvature);
    corners.push({i,angle:curvature,speed:Math.round(Math.sqrt(radius*11.4)*3.6/5)*5});
  }
  corners.sort((a,b)=>a.i-b.i);

  const sections=[
    {i:0,name:'Стартовый бульвар'},
    {i:project(194,761).index,name:'Речной мост'},
    {i:project(128,1072).index,name:'Рыночные кварталы'},
    {i:project(-248,1044).index,name:'Вокзальный тоннель'},
  ];
  const arena={x:0,z:906,w:610,d:450};
  return {
    city:true,id:'city2',road,directions,widths,bank,spacing,arena,corners,sections,heightAt,
    mapViewBox:'-310 -1128 621 431',
    gates:sections.map(({i})=>({position:road[i],direction:directions[i]})),
    spawn:{x:road[0].x,z:road[0].z,yaw:-Math.PI/2},
  };
}
