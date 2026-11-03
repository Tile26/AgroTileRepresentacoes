export const empty = () => ({version:1, nextId:1, clients:[], categories:[], products:[], orders:[], expenses:[]});
export const money = value => (value / 100).toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
export function numeric(value, cents = false) {
    const text = String(value).trim().replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(text)) throw Error('Informe um número positivo válido.');
    const result = Number(text) * (cents ? 100 : 1);
    if (!Number.isSafeInteger(Math.round(result))) throw Error('Valor muito alto.');
    if (!cents && !Number.isInteger(result)) throw Error('A quantidade deve ser inteira.');
    return Math.round(result);
}
export function change(original, action) {
    const state = JSON.parse(JSON.stringify(original));
    action(state);
    return state;
}
export function saveOrder(state, draft) {
    const old = state.orders.find(o => o.id === draft.id);
    if (!state.clients.some(c => c.id === draft.clientId)) throw Error('Selecione um cliente.');
    if (!draft.items.length) throw Error('Adicione um produto ao pedido.');
    if (old) for (const item of old.items) state.products.find(p => p.id === item.productId).stock += item.quantity;
    const items = draft.items.map(item => {
        const product = state.products.find(p => p.id === item.productId);
        if (!product || !Number.isInteger(item.quantity) || item.quantity < 1) throw Error('Produto ou quantidade inválidos.');
        if (product.stock < item.quantity) throw Error('Estoque insuficiente para ' + product.name);
        if (!Number.isSafeInteger(item.price) || item.price < 0) throw Error('Preço inválido.');
        product.stock -= item.quantity;
        return {productId:item.productId, quantity:item.quantity, price:item.price, name:product.name, cost:old?.items.find(i => i.productId === item.productId)?.cost ?? product.cost};
    });
    const record = {...old, id:old?.id ?? state.nextId++, date:old?.date ?? new Date().toISOString(), clientId:draft.clientId, items};
    if (old) state.orders[state.orders.indexOf(old)] = record;
    else state.orders.push(record);
}
export function remove(state, collection, id) {
    if (collection === 'clients' && state.orders.some(o => o.clientId === id)) throw Error('Este cliente possui pedidos. Exclua os pedidos primeiro.');
    if (collection === 'products' && state.orders.some(o => o.items.some(i => i.productId === id))) throw Error('Este produto possui pedidos. Exclua os pedidos primeiro.');
    if (collection === 'categories' && state.products.some(p => p.categoryId === id)) throw Error('Mova os produtos para outra categoria primeiro.');
    const record = state[collection].find(r => r.id === id);
    if (!record) throw Error('Registro não encontrado.');
    if (collection === 'orders') for (const item of record.items) state.products.find(p => p.id === item.productId).stock += item.quantity;
    state[collection] = state[collection].filter(r => r.id !== id);
}
export const total = order => order.items.reduce((sum,item) => sum + item.price * item.quantity,0);
export function report(state, from, until) {
    const within = value => value >= from && value < until;
    const pending = state.orders.filter(o => o.final === undefined && within(o.date));
    const billed = state.orders.filter(o => o.final !== undefined && within(o.delivered));
    const revenue = billed.reduce((sum,o) => sum + o.final,0);
    const cost = billed.reduce((sum,o) => sum + o.items.reduce((s,i) => s + i.cost * i.quantity,0),0);
    const expenses = state.expenses.filter(e => within(e.date)).reduce((sum,e) => sum + e.amount,0);
    return {pending:pending.reduce((sum,o) => sum + total(o),0), revenue, cost, expenses, profit:revenue-cost-expenses};
}

