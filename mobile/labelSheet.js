import JsBarcode from 'jsbarcode';
const htmlText = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const layoutFields = {columns:'Colunas',rows:'Linhas',width:'Largura da etiqueta (mm)',height:'Altura da etiqueta (mm)',left:'Margem esquerda (mm)',top:'Margem superior (mm)',gapX:'Espaço entre colunas (mm)',gapY:'Espaço entre linhas (mm)'};
export function sheetLayout(input) {
    const layout={};
    for (const key of Object.keys(layoutFields)) {
        const raw=String(input?.[key] ?? '').trim().replace(',','.');
        if (!/^\d+(\.\d+)?$/.test(raw)) throw Error('Confira o campo '+layoutFields[key]+'.');
        layout[key]=Number(raw);
    }
    const {columns,rows,width,height,left,top,gapX,gapY}=layout;
    if (![columns,rows].every(n=>Number.isSafeInteger(n) && n>0) || columns*rows>1000 || width<=0 || height<=0) throw Error('Confira o tamanho e a quantidade de etiquetas.');
    if (left+columns*width+(columns-1)*gapX>210.001 || top+rows*height+(rows-1)*gapY>297.001) throw Error('As etiquetas ultrapassam a folha A4. Confira as medidas.');
    return layout;
}
export function sheetHtml(product,input) {
    const l=sheetLayout(input);
    const code=product.internalBarcode || product.barcode;
    if (!code) throw Error('Este produto ainda não tem código de barras.');
    const symbol={};
    try { JsBarcode(symbol,code,{format:/^\d{13}$/.test(code)?'EAN13':'CODE128',flat:true}); }
    catch {throw Error('Confira o código de barras no cadastro do produto.');}
    const bits=symbol.encodings.map(e=>e.data).join('');
    const bars=Array.from(bits.matchAll(/1+/g),m=>'<rect x="'+(m.index+11)+'" width="'+m[0].length+'" height="40"/>').join('');
    const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+(bits.length+22)+' 40" preserveAspectRatio="none">'+bars+'</svg>';
    const cells=Array.from({length:l.rows*l.columns},(_,i)=>{
        const x=l.left+(i%l.columns)*(l.width+l.gapX);
        const y=l.top+Math.floor(i/l.columns)*(l.height+l.gapY);
        return '<section style="left:'+x+'mm;top:'+y+'mm;width:'+l.width+'mm;height:'+l.height+'mm"><strong>'+htmlText(product.name)+'</strong><small>Ref. '+htmlText(product.reference || '—')+'</small>'+svg+'<span>'+htmlText(code)+'</span></section>';
    });
    return '<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4 portrait;margin:0}*{box-sizing:border-box}body{margin:0;font:9pt Arial;color:black}section{position:absolute;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1mm;background:white}strong,small,span{max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;line-height:1.1}svg{width:100%;height:48%;flex-shrink:0}span{font:8pt monospace}</style></head><body>'+cells.join('')+'</body></html>';
}
