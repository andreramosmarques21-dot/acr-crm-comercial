function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;")}
function treeSVG(t){
  // grade: raiz no topo; 2 filhos; até 2 netos por filho
  const W=900, bw=190, bh=64, rw=240, rh=78;
  const rootX=W/2-rw/2, rootY=10;
  const childY=150, leafY=286;
  const cx=[W*0.27, W*0.73];
  const leafX=[[W*0.15,W*0.39],[W*0.61,W*0.85]];
  const box=(x,y,w,h,n,cls)=>{ if(!n) return "";
    const midx=x+w/2;
    return `<rect class="box ${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>`+
      `<text class="lk" x="${midx}" y="${y+18}" text-anchor="middle">${esc(n[0])}</text>`+
      `<text class="lv ${cls}" x="${midx}" y="${y+(cls==="root"?50:41)}" text-anchor="middle">${esc(n[1])}</text>`+
      (n[2]?`<text class="ld" x="${midx}" y="${y+h-8}" text-anchor="middle">${esc(n[2])}</text>`:"");
  };
  const wire=(x1,y1,x2,y2)=>`<path class="wire" d="M${x1} ${y1} V${(y1+y2)/2} H${x2} V${y2}"/>`;
  const op=(x,y,s)=>`<circle class="op" cx="${x}" cy="${y}" r="13"/><text class="opt" x="${x}" y="${y+5}" text-anchor="middle">${s}</text>`;
  const isCons = !!t.avg;
  let s=`<svg class="tree" viewBox="0 0 ${W} 370" role="img" aria-label="${esc(t.root[0])} de ${esc(t.root[1])} formado por ${esc(t.a[0])} e ${esc(t.b[0])}">`;
  // fios raiz → filhos
  s+=wire(W/2,rootY+rh,cx[0],childY)+wire(W/2,rootY+rh,cx[1],childY);
  if(!isCons) s+=op(W/2,rootY+rh+(childY-rootY-rh)/2,"÷"); else s+=`<text class="ld" x="${W/2}" y="${rootY+rh+34}" text-anchor="middle">média ponderada dos setores</text>`;
  // filhos → netos
  [["a",0],["b",1]].forEach(([k,i])=>{
    const n1=t[k+"1"], n2=t[k+"2"];
    if(n1&&n2){ s+=wire(cx[i],childY+bh,leafX[i][0],leafY)+wire(cx[i],childY+bh,leafX[i][1],leafY);
      s+=op(cx[i],childY+bh+(leafY-childY-bh)/2, (k==="b"&&t.bop)||(k==="a"||isCons?"÷":"×")); }
    else if(n1){ s+=`<path class="wire" d="M${cx[i]} ${childY+bh} V${leafY}"/>`; }
  });
  s+=box(rootX,rootY,rw,rh,t.root,"root");
  s+=box(cx[0]-bw/2,childY,bw,bh,t.a,"");
  s+=box(cx[1]-bw/2,childY,bw,bh,t.b,"");
  [["a",0],["b",1]].forEach(([k,i])=>{
    const n1=t[k+"1"], n2=t[k+"2"];
    if(n1&&n2){ s+=box(leafX[i][0]-92,leafY,184,bh,n1,"leaf")+box(leafX[i][1]-92,leafY,184,bh,n2,"leaf"); }
    else if(n1){ s+=box(cx[i]-92,leafY,184,bh,n1,"leaf"); }
  });
  return s+"</svg>";
}
function brl(v){return "R$ "+v.toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2})}
