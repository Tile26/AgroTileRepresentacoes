export function normalizeSearch(value) {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}
export function searchEntries(entries, query, alphabetical = true) {
    const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
    const found = entries.filter(entry => {
        const text = normalizeSearch([
            entry.id, entry.internalBarcode, entry.internalBarcode?.slice(-4), entry.reference, entry.barcode, entry.name, entry.legalName, entry.tradeName, entry.document,
            entry.phone, entry.city, entry.state, entry.categoryName, entry.clientName,
            String(entry.document ?? '').replace(/\D/g, ''),
            String(entry.phone ?? '').replace(/\D/g, ''),
            ...(entry.items ?? []).map(item => item.name),
        ].filter(value => value !== undefined).join(' '));
        return terms.every(term => text.includes(term));
    });
    return alphabetical ? found.sort((a,b) => String(a.name ?? '').localeCompare(String(b.name ?? ''),'pt-BR',{sensitivity:'base',numeric:true})) : found;
}
