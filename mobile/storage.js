import {migrate} from './domain.js';
import {validDate} from './business.js';
export const storageKey = 'agrotile-v1';
export function validateState(input) {
    if (!input || ![1,2].includes(input.version)) throw Error('Versão de dados incompatível.');
    for (const key of ['clients','categories','products','orders','expenses']) if (!Array.isArray(input[key])) throw Error('Coleção ausente: ' + key);
    const state = migrate(input);
    const integer = n => Number.isSafeInteger(n) && n >= 0;
    const timestamp = d => typeof d === 'string' && Number.isFinite(Date.parse(d));
    const ids = {};
    for (const key of ['clients','categories','products','orders','expenses','entries']) {
        if (!Array.isArray(state[key]) || state[key].length > 100000) throw Error('Coleção inválida: ' + key);
        ids[key] = new Set();
        for (const row of state[key]) {
            if (!row || !integer(row.id) || row.id < 1 || ids[key].has(row.id)) throw Error('Identificador inválido ou duplicado.');
            ids[key].add(row.id);
        }
    }
    if (!integer(state.nextId) || Object.values(ids).some(set => [...set].some(id => id >= state.nextId))) throw Error('Sequência de identificadores inválida.');
    for (const key of ['clients','categories','products']) for (const row of state[key]) if (typeof row.name !== 'string' || !row.name.trim()) throw Error('Nome inválido.');
    for (const p of state.products) {
        if (!ids.categories.has(p.categoryId) || ![p.cost,p.price,p.stock].every(integer) || typeof p.reference !== 'string' || typeof p.barcode !== 'string' || !['margin','markup'].includes(p.pricingMethod)) throw Error('Produto inválido ou categoria ausente.');
    }
    for (const c of state.categories) if (typeof c.bonusEnabled !== 'boolean') throw Error('Categoria inválida.');
    for (const o of state.orders) {
        if (!ids.clients.has(o.clientId) || !timestamp(o.date) || !Array.isArray(o.items) || !o.items.length) throw Error('Pedido inválido.');
        const seen = new Set();
        for (const i of o.items) {
            if (!ids.products.has(i.productId) || ![i.price,i.cost,i.quantity,i.bonus].every(integer) || i.quantity < 1 || typeof i.itemId !== 'string' || !i.itemId || seen.has(i.itemId) || !Number.isSafeInteger(i.price*i.quantity) || !Number.isSafeInteger(i.cost*(i.quantity+i.bonus))) throw Error('Item de pedido inválido.');
            seen.add(i.itemId);
        }
        if (!Number.isSafeInteger(o.items.reduce((sum,i) => sum + i.price*i.quantity,0)) || !Number.isSafeInteger(o.items.reduce((sum,i) => sum + i.cost*(i.quantity+i.bonus),0))) throw Error('Total do pedido muito alto.');
        if (o.final !== undefined && (!integer(o.final) || !timestamp(o.delivered) || typeof o.payment !== 'string')) throw Error('Faturamento inválido.');
    }
    for (const e of state.expenses) if (!integer(e.amount) || !timestamp(e.date)) throw Error('Despesa inválida.');
    for (const e of state.entries) {
        if (!ids.products.has(e.productId) || !ids.categories.has(e.categoryId) || !validDate(e.date) || !timestamp(e.registeredAt) || ![e.quantity,e.cost,e.price,e.costTotal,e.salePotential].every(integer) || e.quantity < 1 || e.costTotal !== e.cost*e.quantity || e.salePotential !== e.price*e.quantity || e.profitPotential !== e.salePotential-e.costTotal || (e.reversedAt && !timestamp(e.reversedAt))) throw Error('Entrada inválida.');
    }
    if (!state.settings || typeof state.settings !== 'object' || Array.isArray(state.settings)) throw Error('Configurações inválidas.');
    return state;
}
// The live snapshot changes only after the single persistent write succeeds.
export async function replaceStored(storage, next, recoveryKey = storageKey + '-before-restore') {
    const validated = validateState(next);
    const previous = await storage.getItem(storageKey);
    if (previous !== null) await storage.setItem(recoveryKey,previous);
    await storage.setItem(storageKey,JSON.stringify(validated));
    return validated;
}
export async function loadStored(storage, empty) {
    const raw = await storage.getItem(storageKey);
    if (!raw) return empty();
    const original = JSON.parse(raw);
    const state = validateState(original);
    if (original.version !== state.version) await replaceStored(storage,state,storageKey + '-before-v2');
    return state;
}
