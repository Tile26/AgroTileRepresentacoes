const prefix = '789000000';
export function internalBarcode(sequence) {
    if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999) throw Error('A numeração de 001 a 999 está esgotada.');
    const base = prefix + String(sequence).padStart(3,'0');
    const sum = [...base].reduce((total,digit,index) => total + Number(digit)*(index%2 ? 3 : 1),0);
    return base + ((10-sum%10)%10);
}

export function assignBarcodes(state,categoryId) {
    if (!state.categories.find(c=>c.id===categoryId)?.generateBarcode) return;
    const occupied = new Set(state.products.flatMap(p=>[p.barcode,p.internalBarcode]).filter(Boolean));
    let last = state.settings.lastBarcodeSequence ?? 0;
    for (const product of state.products) {
        if (product.categoryId !== categoryId || product.internalBarcode) continue;
        let code;
        do {code=internalBarcode(++last);} while (occupied.has(code));
        occupied.add(code);
        product.internalBarcode=code;
    }
    state.settings.lastBarcodeSequence=last;
}

export function validateBarcodes(state) {
    const last = state.settings.lastBarcodeSequence ?? 0;
    if (!Number.isInteger(last) || last < 0 || last > 999) throw Error('Sequência de códigos de barras inválida.');
    const owners = new Map();
    for (const p of state.products) {
        if (p.internalBarcode === undefined) continue;
        const code=p.internalBarcode;
        const sequence=Number(String(code).slice(9,12));
        if (sequence>last || internalBarcode(sequence)!==code || owners.has(code)) throw Error('Código gerado inválido ou duplicado.');
        owners.set(code,p.id);
    }
    for (const p of state.products) {
        if (owners.has(p.barcode) && owners.get(p.barcode)!==p.id) throw Error('Este código de barras já pertence a outro produto.');
    }
}
