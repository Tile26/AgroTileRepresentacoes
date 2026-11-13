import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('./domain.js', import.meta.url),'utf8');
const {empty,change,saveOrder,remove,report,numeric} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
let state = empty();
state.clients = [{id:1,name:'Cliente'}];
state.products = [{id:2,name:'Produto',stock:10,cost:500,price:1000}];
state.nextId = 3;
state = change(state,s => saveOrder(s,{clientId:1,items:[{productId:2,quantity:3,price:900}]}));
assert.equal(state.products[0].stock,7);
const id = state.orders[0].id;
assert.throws(() => change(state,s => saveOrder(s,{id,clientId:1,items:[{productId:2,quantity:11,price:900}]})));
assert.equal(state.products[0].stock,7);
state = change(state,s => saveOrder(s,{id,clientId:1,items:[{productId:2,quantity:4,price:900}]}));
assert.equal(state.products[0].stock,6);
state.orders[0].final = 3500;
state.orders[0].delivered = '2026-11-03T12:00:00.000Z';
state.expenses = [{id:4,date:'2026-11-03T12:00:00.000Z',amount:300}];
assert.equal(report(state,'2026-11-01','2026-12-01').profit,1200);
assert.throws(() => change(state,s => remove(s,'products',2)));
state = change(state,s => remove(s,'orders',id));
assert.equal(state.products[0].stock,10);
assert.equal(report(state,'2026-11-01','2026-12-01').revenue,0);
assert.throws(() => numeric('-1'));
assert.equal(numeric('12,34',true),1234);
console.log('Estoque, edição, exclusão, lucro e valores monetários verificados.');
assert.throws(() => change(state,s => saveOrder(s,{clientId:1,items:[{productId:2,quantity:6,price:1000},{productId:2,quantity:5,price:1000}]})));
assert.equal(state.products[0].stock,10);
let multi = change(state,s => saveOrder(s,{clientId:1,items:[{productId:2,quantity:2,price:1000},{productId:2,quantity:3,price:900}]}));
assert.equal(multi.products[0].stock,5);
multi.products[0].cost = 700;
multi = change(multi,s => saveOrder(s,{...s.orders[0],items:[{productId:2,quantity:1,price:1000}]}));
assert.equal(multi.products[0].stock,9);
assert.equal(multi.orders[0].items[0].cost,500);
console.log('Pedidos com vários itens e preservação do custo histórico verificados.');

const {dashboard, customerActivity} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const now = new Date(2026,10,3,12);
const sample = empty();
sample.clients = [{id:1,name:'Antigo'},{id:2,name:'Sem compra'},{id:3,name:'Hoje'}];
sample.products = [{id:1,stock:5,cost:200,price:500}];
sample.orders = [
    {id:1,clientId:1,date:new Date(2026,9,20,12).toISOString(),delivered:new Date(2026,9,20,12).toISOString(),final:900,items:[{productId:1,quantity:1,price:1000}]},
    {id:2,clientId:3,date:now.toISOString(),delivered:now.toISOString(),final:0,items:[{productId:1,quantity:1,price:1000}]},
    {id:3,clientId:2,date:now.toISOString(),items:[{productId:1,quantity:2,price:1000}]},
];
assert.deepEqual(dashboard(sample,now),{stockValue:1000,stockSaleValue:2500,stockPotentialProfit:1500,stockMargin:60,clientCount:3,pendingCount:1,pendingValue:2000,monthlySales:1,monthlyRevenue:0});
assert.deepEqual(customerActivity(sample,now).map(a => [a.client.id,a.days]),[[2,null],[1,14],[3,0]]);
sample.orders.push({id:4,clientId:1,delivered:new Date(2026,10,2,23).toISOString(),final:800,items:[]});
assert.equal(dashboard(sample,now).monthlyRevenue,800);
assert.equal(customerActivity(sample,now).find(a => a.client.id === 1).days,1);
sample.orders.pop();
assert.equal(customerActivity(sample,now).find(a => a.client.id === 1).days,14);
const cleared = change(sample,s => remove(s,'orders',3));
assert.equal(dashboard(cleared,now).pendingCount,0);
assert.equal(dashboard(cleared,now).stockValue,1400);
assert.equal(customerActivity(empty(),now).length,0);
console.log('Painel mensal, pedidos pendentes e dias sem comprar verificados.');

const {packingList} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const manifestState = empty();
manifestState.clients = [{id:1,name:'Cliente A'},{id:2,name:'Cliente B'}];
manifestState.products = [{id:10,name:'Produto A',categoryId:5},{id:11,name:'Produto B',categoryId:6}];
manifestState.orders = [
    {id:1,clientId:1,date:now.toISOString(),items:[{productId:10,quantity:2},{productId:11,quantity:7},{productId:10,quantity:3}]},
    {id:2,clientId:2,date:now.toISOString(),items:[{productId:10,quantity:4}]},
    {id:3,clientId:1,final:0,items:[{productId:10,quantity:100}]},
];
const manifest = packingList(manifestState,5);
assert.equal(manifest.quantity,9);
assert.equal(manifest.orders.length,2);
assert.equal(manifest.orders[0].items.length,1);
assert.equal(manifest.orders[0].items[0].quantity,5);
assert.equal(manifest.orders[1].client,'Cliente B');
assert.equal(packingList(manifestState,6).quantity,7);
assert.equal(packingList(manifestState,5,11).quantity,0);
assert.equal(packingList(manifestState,5,10).quantity,9);
assert.equal(packingList(manifestState,null).orders.length,0);
manifestState.orders[0].final = 1;
assert.equal(packingList(manifestState,5).quantity,4);
manifestState.orders.splice(1,1);
assert.equal(packingList(manifestState,5).orders.length,0);
console.log('Romaneio por categoria/produto, agrupamento e retirada de entregues verificados.');

assert.equal(dashboard(empty()).stockMargin,null);
const loss = {...empty(),products:[{stock:2,cost:200,price:100}]};
assert.equal(dashboard(loss).stockPotentialProfit,-200);
assert.equal(dashboard(loss).stockMargin,-100);
assert.equal(dashboard(cleared,now).stockSaleValue,3500);
assert.equal(dashboard({...empty(),products:[{stock:2,cost:200,price:0}]}).stockMargin,null);
