(function(root){
function tarEntry(name,bytes){const h=new Uint8Array(512),enc=new TextEncoder();const text=(at,size,value)=>h.set(enc.encode(value).slice(0,size),at);text(0,100,name);text(100,8,'0000600\0');text(108,8,'0000000\0');text(116,8,'0000000\0');text(124,12,bytes.length.toString(8).padStart(11,'0')+'\0');text(136,12,Math.floor(Date.now()/1000).toString(8).padStart(11,'0')+'\0');for(let i=148;i<156;i++)h[i]=32;text(156,1,'0');text(257,6,'ustar\0');text(263,2,'00');text(148,8,h.reduce((n,x)=>n+x,0).toString(8).padStart(6,'0')+'\0 ');return [h,bytes,new Uint8Array((512-bytes.length%512)%512)];}
root.parcoursTar=entries=>{const chunks=[];for(const [name,bytes]of entries)chunks.push(...tarEntry(name,bytes));chunks.push(new Uint8Array(1024));return new Blob(chunks,{type:'application/x-tar'});};
if(typeof module!=='undefined')module.exports={parcoursTar:root.parcoursTar};
})(typeof window!=='undefined'?window:globalThis);
