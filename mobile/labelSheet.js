import iguacuArt from './assets/iguacuLabelArt.js';
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
// Sheet geometry measured proportionally from the 905 × 1280 reference on A4.
export const iguacuLayout = {columns:3,rows:7,width:68.2,height:40.37,left:0,top:0.93,gapX:0.15,gapY:2.1};

function iguacuContents(product,code,symbol) {
    const caption = product.name + (product.reference ? ' Ref. ' + product.reference : '');
    const fit = [...caption].length > 32 ? ' textLength="274" lengthAdjust="spacingAndGlyphs"' : '';
    return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 294 174" preserveAspectRatio="none" style="width:100%;height:100%">' +
        '<use href="#iguacu-art" xlink:href="#iguacu-art"/>' +
        symbol.replace('<svg ', '<svg x="48" y="68" width="196" height="54" ') +
        '<g text-anchor="middle" font-family="Arial,sans-serif" fill="black"><text x="146" y="137" font-size="13" letter-spacing="0.9">'+htmlText(code)+'</text>' +
        '<text x="147" y="155" font-size="16" font-weight="bold"'+fit+'>'+htmlText(caption)+'</text></g></svg>';
}

export function sheetHtml(product,input,model='plain') {
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
        if (model === 'iguacu') return '<section style="position:absolute;overflow:hidden;left:'+x+'mm;top:'+y+'mm;width:'+l.width+'mm;height:'+l.height+'mm">'+iguacuContents(product,code,svg)+'</section>';
        return '<section style="left:'+x+'mm;top:'+y+'mm;width:'+l.width+'mm;height:'+l.height+'mm"><strong>'+htmlText(product.name)+'</strong><small>Ref. '+htmlText(product.reference || '—')+'</small>'+svg+'<span>'+htmlText(code)+'</span></section>';
    });
    if (model === 'iguacu') {
        const defs='<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="position:absolute;width:0;height:0"><defs><image id="iguacu-art" width="294" height="174" href="'+iguacuArt+'" xlink:href="'+iguacuArt+'"/></defs></svg>';
        return '<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4 portrait;margin:0}body{margin:0;background:white}section>svg{display:block}</style></head><body>'+defs+cells.join('')+'</body></html>';
    }
    return '<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4 portrait;margin:0}*{box-sizing:border-box}body{margin:0;font:9pt Arial;color:black}section{position:absolute;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1mm;background:white}strong,small,span{max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;line-height:1.1}svg{width:100%;height:48%;flex-shrink:0}span{font:8pt monospace}</style></head><body>'+cells.join('')+'</body></html>';
}
