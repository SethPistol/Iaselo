// IASELO · PDF texte minimal (PDF 1.4, Helvetica, WinAnsi), sans dépendance.
// Sert à joindre la lettre de liaison au message MSSanté et à l'intégrer au CDA du DMP (PDF embarqué).
// Entrée : blocs {t:'titre'|'sous-titre'|'section'|'libelle'|'texte', s} (voir dist/lettre-liaison-regles.js).
const W=[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const SPECIAL={'€':0x80,'‚':0x82,'„':0x84,'…':0x85,'‘':0x91,'’':0x92,'“':0x93,'”':0x94,'•':0x95,'–':0x96,'—':0x97,'œ':0x9c,'Œ':0x8c,'Ÿ':0x9f,'₂':0x32,'≥':0x3e,'≤':0x3c,'→':0x3e,'·':0xb7};
const code=ch=>{if(SPECIAL[ch])return SPECIAL[ch];const c=ch.codePointAt(0);if(c===9)return 32;return c>=32&&c<=126||c>=160&&c<=255?c:63};
const width=(ch,size,bold)=>{const c=code(ch),base=c>=32&&c<=126?W[c-32]:c>=0xc0?(/[a-zß-ÿ]/.test(ch)?556:667):556;return base*(bold?1.06:1)*size/1000};
const escapeByte=b=>b===0x28||b===0x29||b===0x5c?'\\'+String.fromCharCode(b):b<32||b>126?'\\'+b.toString(8).padStart(3,'0'):String.fromCharCode(b);
const pdfString=s=>'('+[...s].map(ch=>escapeByte(code(ch))).join('')+')';

function wrap(text,size,bold,max){
 const lines=[];
 for(const para of String(text).replace(/\r/g,'').split('\n')){
  let line='',w=0;
  for(const word of para.split(/(\s+)/)){
   const ww=[...word].reduce((a,ch)=>a+width(ch,size,bold),0);
   if(w+ww>max&&line.trim()){lines.push(line.trimEnd());line=word.trimStart();w=[...line].reduce((a,ch)=>a+width(ch,size,bold),0);continue}
   line+=word;w+=ww;
  }
  lines.push(line.trimEnd());
 }
 return lines;
}

export function textPdf(blocks,{title='Document'}={}){
 const PW=595.28,PH=841.89,M=56,maxW=PW-2*M,style={titre:[17,true,10],'sous-titre':[9,false,2],section:[12,true,8],libelle:[9.5,true,2],texte:[10,false,4]};
 const pages=[];let ops=[],y=PH-M;
 const newPage=()=>{if(ops.length)pages.push(ops);ops=[];y=PH-M};
 for(const b of blocks){
  const [size,bold,gap]=style[b.t]||style.texte,lead=size*1.32;
  if(b.t==='section'||b.t==='titre')y-=gap;
  const lines=wrap(b.s||'',size,bold,maxW);
  if(b.t==='section'&&y-lead*3<M)newPage();
  for(const l of lines){if(y-lead<M)newPage();y-=lead;ops.push('BT /'+(bold?'F2':'F1')+' '+size+' Tf '+M+' '+y.toFixed(2)+' Td '+pdfString(l)+' Tj ET')}
  if(b.t==='section'){ops.push('0.75 w '+M+' '+(y-3).toFixed(2)+' m '+(PW-M)+' '+(y-3).toFixed(2)+' l S');y-=4}
  y-=b.t==='texte'?gap:0;
 }
 newPage();
 const n=pages.length,objs=[];
 objs[1]='<< /Type /Catalog /Pages 2 0 R >>';
 objs[2]='<< /Type /Pages /Kids ['+pages.map((_,i)=>(5+2*i)+' 0 R').join(' ')+'] /Count '+n+' >>';
 objs[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
 objs[4]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
 pages.forEach((p,i)=>{
  const footer='BT /F1 8 Tf '+M+' 28 Td '+pdfString(title+' · page '+(i+1)+'/'+n)+' Tj ET';
  const stream=[...p,footer].join('\n');
  objs[5+2*i]='<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+PW+' '+PH+'] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents '+(6+2*i)+' 0 R >>';
  objs[6+2*i]='<< /Length '+Buffer.byteLength(stream,'latin1')+' >>\nstream\n'+stream+'\nendstream';
 });
 const info=objs.length;objs[info]='<< /Title '+pdfString(title)+' /Producer (IASELO) >>';
 let out='%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';const offsets=[];
 for(let i=1;i<objs.length;i++){offsets[i]=Buffer.byteLength(out,'latin1');out+=i+' 0 obj\n'+objs[i]+'\nendobj\n'}
 const xref=Buffer.byteLength(out,'latin1');
 out+='xref\n0 '+objs.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('');
 out+='trailer\n<< /Size '+objs.length+' /Root 1 0 R /Info '+info+' 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
 return Buffer.from(out,'latin1');
}
