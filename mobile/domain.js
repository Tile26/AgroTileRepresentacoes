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


export function dashboard(state, now = new Date()) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    const pending = state.orders.filter(order => order.final === undefined);
    const billed = state.orders.filter(order => order.final !== undefined);
    const monthly = billed.filter(order => order.delivered >= start && order.delivered < end);
    return {
        stockValue: state.products.reduce((sum, product) => sum + product.stock * product.cost, 0),
        clientCount: state.clients.length,
        pendingCount: pending.length,
        pendingValue: pending.reduce((sum, order) => sum + total(order), 0),
        monthlySales: monthly.length,
        monthlyRevenue: monthly.reduce((sum, order) => sum + order.final, 0),
    };
}
export function customerActivity(state, now = new Date()) {
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return state.clients.map(client => {
        const purchases = state.orders
            .filter(order => order.clientId === client.id && order.final !== undefined)
            .map(order => new Date(order.delivered))
            .filter(date => Number.isFinite(date.getTime()));
        const lastPurchase = purchases.length ? new Date(Math.max(...purchases.map(date => date.getTime()))) : null;
        const days = lastPurchase
            ? Math.max(0, Math.round((today - Date.UTC(lastPurchase.getFullYear(), lastPurchase.getMonth(), lastPurchase.getDate())) / 86400000))
            : null;
        return {client, lastPurchase, days};
    }).sort((a, b) => (b.days ?? Infinity) - (a.days ?? Infinity) || a.client.name.localeCompare(b.client.name, 'pt-BR'));
}

export function packingList(state, categoryId, productId = null) {
    const products = new Map(state.products
        .filter(product => product.categoryId === categoryId && (productId === null || product.id === productId))
        .map(product => [product.id, product]));
    const clients = new Map(state.clients.map(client => [client.id, client]));
    const totals = new Map();
    const orders = [];
    for (const order of state.orders) {
        if (order.final !== undefined) continue;
        const items = order.items.filter(item => products.has(item.productId));
        if (!items.length) continue;
        const grouped = new Map();
        for (const item of items) {
            const product = products.get(item.productId);
            const row = grouped.get(item.productId) ?? {productId:product.id, name:product.name, quantity:0};
            row.quantity += item.quantity;
            grouped.set(item.productId, row);
            totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.quantity);
        }
        orders.push({
            id:order.id,
            date:order.date,
            client:clients.get(order.clientId)?.name ?? 'Cliente não encontrado',
            items:[...grouped.values()],
        });
    }
    const items = [...totals].map(([id, quantity]) => ({productId:id, name:products.get(id).name, quantity}))
        .sort((a,b) => a.name.localeCompare(b.name,'pt-BR'));
    return {items, orders, quantity:items.reduce((sum,item) => sum + item.quantity,0)};
}
