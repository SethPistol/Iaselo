/* IASELO · générateur de QR code (écrit pour IASELO, sans dépendance) : mode octet (UTF-8), correction M, versions 1 à 10
   (jusqu'à 213 octets), choix automatique du masque (pénalités de la norme ISO/IEC 18004).
   IaseloQR.matrice(texte) → tableau de lignes de booléens ; IaseloQR.svg(texte, {taille, marge, titre}) → chaîne SVG. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IaseloQR=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';
// [codewords de correction par bloc, [nombre de blocs, octets de données], ...] pour la correction M.
const BLOCS=[null,[10,[1,16]],[16,[1,28]],[26,[1,44]],[18,[2,32]],[24,[2,43]],[16,[4,27]],[18,[4,31]],[22,[2,38],[2,39]],[22,[3,36],[2,37]],[26,[4,43],[1,44]]];
const ALIGN=[null,[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50]];
const INFO_VERSION=[0,0,0,0,0,0,0,0x07C94,0x085BC,0x09A99,0x0A4D3];
// Corps de Galois GF(256), polynôme 0x11D.
const EXP=new Array(512),LOG=new Array(256);(()=>{let x=1;for(let i=0;i<255;i++){EXP[i]=x;LOG[x]=i;x<<=1;if(x&256)x^=0x11D}for(let i=255;i<512;i++)EXP[i]=EXP[i-255]})();
const mul=(a,b)=>a&&b?EXP[LOG[a]+LOG[b]]:0;
function generateur(n){let g=[1];for(let i=0;i<n;i++){const r=new Array(g.length+1).fill(0);for(let j=0;j<g.length;j++){r[j]^=g[j];r[j+1]^=mul(g[j],EXP[i])}g=r}return g}
function reedSolomon(data,n){const g=generateur(n),r=data.concat(new Array(n).fill(0));for(let i=0;i<data.length;i++){const c=r[i];if(c)for(let j=0;j<g.length;j++)r[i+j]^=mul(g[j],c)}return r.slice(data.length)}
function utf8(s){return Array.from(new TextEncoder().encode(String(s)))}
function capacite(v){const b=BLOCS[v];return b.slice(1).reduce((n,[k,d])=>n+k*d,0)}
function donnees(octets){
 let v=1;for(;v<=10;v++){const bits=4+(v<10?8:16)+8*octets.length;if(bits<=capacite(v)*8)break}
 if(v>10)throw new Error('Texte trop long pour le QR code (213 octets au plus).');
 const bits=[],push=(val,n)=>{for(let i=n-1;i>=0;i--)bits.push((val>>>i)&1)};
 push(4,4);push(octets.length,v<10?8:16);octets.forEach(o=>push(o,8));
 const cap=capacite(v)*8;push(0,Math.min(4,cap-bits.length));while(bits.length%8)bits.push(0);
 const cw=[];for(let i=0;i<bits.length;i+=8)cw.push(parseInt(bits.slice(i,i+8).join(''),2));
 for(let p=0;cw.length<capacite(v);p++)cw.push(p%2?0x11:0xEC);
 // Découpage en blocs, correction, entrelacement.
 const [ec,...groupes]=BLOCS[v],blocs=[];let k=0;for(const [n,d] of groupes)for(let i=0;i<n;i++){const b=cw.slice(k,k+d);k+=d;blocs.push({d:b,e:reedSolomon(b,ec)})}
 const out=[],max=Math.max(...blocs.map(b=>b.d.length));for(let i=0;i<max;i++)for(const b of blocs)if(i<b.d.length)out.push(b.d[i]);
 for(let i=0;i<ec;i++)for(const b of blocs)out.push(b.e[i]);
 return {v,cw:out};
}
const MASQUES=[(i,j)=>(i+j)%2===0,(i)=>i%2===0,(i,j)=>j%3===0,(i,j)=>(i+j)%3===0,(i,j)=>(Math.floor(i/2)+Math.floor(j/3))%2===0,(i,j)=>(i*j)%2+(i*j)%3===0,(i,j)=>((i*j)%2+(i*j)%3)%2===0,(i,j)=>((i+j)%2+(i*j)%3)%2===0];
function base(v){
 const n=17+4*v,m=Array.from({length:n},()=>new Array(n).fill(null));
 const finder=(r,c)=>{for(let i=-1;i<=7;i++)for(let j=-1;j<=7;j++){const y=r+i,x=c+j;if(y<0||x<0||y>=n||x>=n)continue;m[y][x]=i>=0&&i<=6&&j>=0&&j<=6&&(i===0||i===6||j===0||j===6||(i>=2&&i<=4&&j>=2&&j<=4))}};
 finder(0,0);finder(0,n-7);finder(n-7,0);
 for(let i=8;i<n-8;i++){m[6][i]=i%2===0;m[i][6]=i%2===0}
 const a=ALIGN[v];const der=a.length-1;a.forEach((r,ir)=>a.forEach((c,ic)=>{if((ir===0&&ic===0)||(ir===0&&ic===der)||(ir===der&&ic===0))return;for(let i=-2;i<=2;i++)for(let j=-2;j<=2;j++)m[r+i][c+j]=Math.max(Math.abs(i),Math.abs(j))!==1}))
 m[n-8][8]=true;// module sombre
 // Réserve format et version.
 for(let i=0;i<9;i++){if(m[8][i]===null)m[8][i]=false;if(m[i][8]===null)m[i][8]=false}
 for(let i=0;i<8;i++){if(m[8][n-1-i]===null)m[8][n-1-i]=false;if(m[n-1-i][8]===null)m[n-1-i][8]=false}
 if(v>=7)for(let i=0;i<6;i++)for(let j=0;j<3;j++){m[i][n-11+j]=false;m[n-11+j][i]=false}
 return m;
}
function formatBits(masque){const d=(0<<3)|masque;let r=d<<10;for(let i=14;i>=10;i--)if((r>>i)&1)r^=0x537<<(i-10);return ((d<<10)|r)^0x5412}
function poserInfos(m,masque,v){
 const n=m.length,f=formatBits(masque),bit=i=>((f>>i)&1)===1;
 for(let i=0;i<=5;i++)m[i][8]=bit(i);m[7][8]=bit(6);m[8][8]=bit(7);m[8][7]=bit(8);for(let i=9;i<15;i++)m[8][14-i]=bit(i);
 for(let i=0;i<8;i++)m[8][n-1-i]=bit(i);for(let i=8;i<15;i++)m[n-15+i][8]=bit(i);m[n-8][8]=true;
 if(v>=7){const iv=INFO_VERSION[v];for(let i=0;i<18;i++){const b=((iv>>i)&1)===1,r=Math.floor(i/3),c=i%3;m[r][n-11+c]=b;m[n-11+c][r]=b}}
}
function placer(m,cw,masque,reserve){
 const n=m.length,bits=[];cw.forEach(o=>{for(let i=7;i>=0;i--)bits.push((o>>i)&1)});let k=0,haut=true;
 for(let c=n-1;c>0;c-=2){if(c===6)c=5;for(let t=0;t<n;t++){const r=haut?n-1-t:t;for(const x of [c,c-1]){if(reserve[r][x])continue;let b=k<bits.length?bits[k]===1:false;k++;if(MASQUES[masque](r,x))b=!b;m[r][x]=b}}haut=!haut}
}
function penalite(m){
 const n=m.length;let p=0;
 for(let l=0;l<2;l++)for(let i=0;i<n;i++){let run=1;for(let j=1;j<n;j++){const a=l?m[j][i]:m[i][j],b=l?m[j-1][i]:m[i][j-1];if(a===b){run++;if(j===n-1&&run>=5)p+=run-2}else{if(run>=5)p+=run-2;run=1}}}
 for(let i=0;i<n-1;i++)for(let j=0;j<n-1;j++){const a=m[i][j];if(a===m[i+1][j]&&a===m[i][j+1]&&a===m[i+1][j+1])p+=3}
 const motif=[1,0,1,1,1,0,1,0,0,0,0],motif2=[0,0,0,0,1,0,1,1,1,0,1];
 for(let i=0;i<n;i++)for(let j=0;j<=n-11;j++)for(const pat of [motif,motif2]){let h=true,v=true;for(let k=0;k<11;k++){if(+m[i][j+k]!==pat[k])h=false;if(+m[j+k][i]!==pat[k])v=false}if(h)p+=40;if(v)p+=40}
 let sombres=0;for(const r of m)for(const x of r)if(x)sombres++;p+=Math.floor(Math.abs(sombres*20/(n*n)-10))*10;
 return p;
}
function matrice(texte){
 const {v,cw}=donnees(utf8(texte));const r0=base(v),reserve=r0.map(r=>r.map(x=>x!==null));let best=null,bp=Infinity;
 for(let k=0;k<8;k++){const m=r0.map(r=>r.slice());placer(m,cw,k,reserve);poserInfos(m,k,v);const p=penalite(m);if(p<bp){bp=p;best=m}}
 return best;
}
function svg(texte,{taille=200,marge=4,titre='QR code'}={}){
 const m=matrice(texte),n=m.length+2*marge;let d='';
 m.forEach((r,i)=>r.forEach((x,j)=>{if(x)d+='M'+(j+marge)+' '+(i+marge)+'h1v1h-1z'}));
 const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${taille}" height="${taille}" role="img" aria-label="${esc(titre)}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
return {matrice,svg};
});
