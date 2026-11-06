import {numeric} from './domain.js';
export function percent(cost, price, method = 'margin') {
    const base = method === 'markup' ? cost : price;
    return base > 0 ? (price - cost) * 100 / base : null;
}
export function priceFrom(cost, rate, method = 'margin') {
    const n = Number(String(rate).replace(',', '.'));
    if (!String(rate).trim() || !Number.isFinite(n) || n < 0 || (method === 'margin' && n >= 100)) throw Error('Informe um percentual válido (margem menor que 100%).');
    if (!Number.isSafeInteger(cost) || cost <= 0) throw Error('Informe um custo maior que zero para calcular pelo percentual.');
    const result = Math.round(method === 'markup' ? cost * (1 + n / 100) : cost / (1 - n / 100));
    if (!Number.isSafeInteger(result)) throw Error('Preço muito alto.');
    return result;
}
export function pricingDraft(draft, key, value) {
    const next = {...draft,[key]:value, pricingError:''};
    try {
        const cost = numeric(next.cost,true);
        if (key === 'rate' || (key === 'cost' && next.keepRate)) next.price = String(priceFrom(cost,next.rate,next.pricingMethod) / 100);
        const rate = percent(cost,numeric(next.price,true),next.pricingMethod);
        if (key !== 'rate') next.rate = rate === null ? '' : rate.toFixed(2).replace('.',',');
    } catch(error) { next.pricingError = error.message; }
    return next;
}
export function localDate(now = new Date()) {
    return [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
}
export function validDate(text) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    const date = new Date(text + 'T12:00:00');
    return Number.isFinite(date.getTime()) && localDate(date) === text;
}
export function saveEntry(state, draft, options = {}) {
    const product = state.products.find(p => p.id === draft.productId);
    if (!product) throw Error('Selecione um produto.');
    if (!validDate(draft.date)) throw Error('Informe a data no formato AAAA-MM-DD.');
    const quantity = numeric(draft.quantity), cost = numeric(draft.cost,true), price = numeric(draft.price,true);
    if (quantity < 1) throw Error('Quantidade deve ser maior que zero.');
    if (![quantity * cost,quantity * price,product.stock + quantity].every(Number.isSafeInteger)) throw Error('Valor muito alto.');
    const entry = {id:state.nextId++, productId:product.id, productName:product.name, categoryId:product.categoryId,
        categoryName:state.categories.find(c => c.id === product.categoryId)?.name ?? '',
        date:draft.date, registeredAt:new Date().toISOString(), quantity, cost, price,
        pricingMethod:draft.pricingMethod ?? product.pricingMethod ?? 'margin',
        costTotal:quantity * cost, salePotential:quantity * price, profitPotential:quantity * (price - cost),
        previousCost:product.cost, previousPrice:product.price, updateCost:!!options.updateCost, updatePrice:!!options.updatePrice};
    state.entries.push(entry);
    product.stock += quantity;
    if (options.updateCost) product.cost = cost;
    if (options.updatePrice) product.price = price;
    return entry;
}
export function reverseEntry(state, id, reason) {
    const entry = state.entries.find(e => e.id === id);
    if (!entry || entry.reversedAt) throw Error('Entrada inexistente ou já estornada.');
    const product = state.products.find(p => p.id === entry.productId);
    if (!reason?.trim()) throw Error('Informe o motivo do estorno.');
    if (!product || product.stock < entry.quantity) throw Error('Estoque insuficiente para estornar. As unidades podem já estar em pedidos.');
    product.stock -= entry.quantity;
    entry.reversedAt = new Date().toISOString(); entry.reversalReason = reason.trim();
}
export function dateRange(period, now = new Date()) {
    let from = new Date(now.getFullYear(),now.getMonth(),now.getDate());
    let to = new Date(from);
    if (period === 'yesterday') {from.setDate(from.getDate()-1);to = new Date(from);}
    if (period === 'week') from.setDate(from.getDate()-6);
    if (period === 'month') from.setDate(1);
    if (period === 'previous') {from = new Date(now.getFullYear(),now.getMonth()-1,1);to = new Date(now.getFullYear(),now.getMonth(),0);}
    return {from:localDate(from),to:localDate(to)};
}
export function entryReport(state, filter) {
    const rows = (state.entries ?? []).filter(e => !e.reversedAt && e.date >= filter.from && e.date <= filter.to && (!filter.productId || e.productId === filter.productId) && (!filter.categoryId || e.categoryId === filter.categoryId)).sort((a,b) => b.date.localeCompare(a.date) || b.id-a.id);
    const sum = entries => {
        const result = entries.reduce((s,e) => ({quantity:s.quantity+e.quantity,count:s.count+1,cost:s.cost+e.costTotal,sale:s.sale+e.salePotential,profit:s.profit+e.profitPotential}),{quantity:0,count:0,cost:0,sale:0,profit:0});
        return {...result,margin:percent(result.cost,result.sale)};
    };
    const group = key => [...new Set(rows.map(e => e[key]))].map(id => ({id,name:rows.find(e => e[key]===id)[key==='productId'?'productName':'categoryName'],...sum(rows.filter(e => e[key]===id))}));
    return {rows,...sum(rows),products:group('productId'),categories:group('categoryId')};
}
const csvCell = value => '"' + String(value ?? '').replace(/^[=+\-@\t\r]/, c => "'" + c).replaceAll('"','""') + '"';
export function entriesCsv(report) {
    const rows = [['Data','Produto','Categoria','Quantidade','Custo unitário','Venda unitária','Custo total','Venda potencial','Lucro potencial'],
        ...report.rows.map(e => [e.date,e.productName,e.categoryName,e.quantity,...[e.cost,e.price,e.costTotal,e.salePotential,e.profitPotential].map(n => (n/100).toFixed(2).replace('.',','))])];
    return '\ufeff' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
}
