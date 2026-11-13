import {KeyboardScrollView, KeyboardInput as TextInput, KeyboardArea} from './KeyboardForm';
import {assignBarcodes} from './barcode';
import {LabelScreen} from './LabelScreen';
import React, {useState, useEffect, useRef} from 'react';
import {Alert, SafeAreaView, View, Text, Pressable, Modal, FlatList, StyleSheet} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as Crypto from 'expo-crypto';
import {loadStored, replaceStored, validateState} from './storage';
import {percent} from './business';
import {EntryScreen, BackupScreen, PricingFields} from './OperationsUI';
import representedBrands from './assets/represented-brands.json';
import {searchEntries} from './search';
import {empty, money, numeric, change, saveOrder, remove, total, report, dashboard, customerActivity, packingList, bonuses} from './domain';

const labels = {home:'Início',settings:'Configurações',entries:'Entrada',labels:'Imprimir Etiqueta',clients:'Clientes',categories:'Categorias',products:'Produtos',orders:'Pedidos',billing:'Faturamento',expenses:'Despesas',reports:'Relatórios',packing:'Romaneio'};
const storageKey = 'agrotile-v1';
const seller = {
    name: 'Dionatan Stadler de Freitas',
    phone: '(41) 9 9722-6198',
    city: 'Campo Largo - PR',
};
const clientFields = [
    ['legalName', 'Nome completo / razão social'],
    ['tradeName', 'Nome fantasia'],
    ['document', 'CPF / CNPJ'],
    ['stateRegistration', 'Inscrição estadual (ou ISENTO)'],
    ['municipalRegistration', 'Inscrição municipal'],
    ['contactName', 'Pessoa de contato'],
    ['phone', 'Telefone / WhatsApp'],
    ['email', 'E-mail para recebimento da nota'],
    ['postalCode', 'CEP'],
    ['address', 'Endereço / logradouro'],
    ['addressNumber', 'Número (ou S/N)'],
    ['complement', 'Complemento'],
    ['district', 'Bairro'],
    ['city', 'Município'],
    ['state', 'UF'],
    ['notes', 'Observações do cadastro'],
];
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function Button({title,onPress,secondary = false}) {
    const danger = title === 'Excluir' || title === 'Remover item';
    return <Pressable accessibilityRole="button" style={({pressed}) => [s.button,secondary && s.secondaryButton,danger && s.dangerButton,pressed && {opacity:0.7}]} onPress={onPress}>
        <Text style={[s.buttonText,secondary && s.secondaryText,danger && s.dangerText]}>{title}</Text>
    </Pressable>;
}
function Field({label,value,onChangeText,numeric:decimal}) { return <View><Text style={s.label}>{label}</Text><TextInput style={s.input} value={String(value ?? '')} onChangeText={onChangeText} keyboardType={decimal ? 'decimal-pad' : 'default'}/></View>; }
function Select({label,entries,value,onChange}) {
    const [visible,setVisible] = useState(false);
    const [query,setQuery] = useState('');
    const selected = entries.find(entry => entry.id === value);
    const options = searchEntries(entries,query);
    return <View>
        <Text style={s.label}>{label}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={label + ', ' + (selected?.name ?? 'Selecionar')} style={s.selectControl} onPress={() => {setQuery('');setVisible(true);}}>
            <Text style={s.selectValue}>{selected?.name ?? 'Toque para buscar e selecionar'}</Text><Text style={s.muted}>Buscar ›</Text>
        </Pressable>
        <Modal visible={visible} animationType="slide" onRequestClose={() => setVisible(false)}>
            <SafeAreaView style={s.page}><KeyboardArea><View style={s.pickerContainer}>
                <Text style={s.heading}>{label}</Text>
                <TextInput accessibilityLabel={'Buscar ' + label} placeholder="Nome, referência, código ou documento…" placeholderTextColor="#6c7d73" style={s.search} value={query} onChangeText={setQuery} autoCorrect={false}/>
                <Text style={s.resultCount}>{options.length} opção(ões) · ordem alfabética</Text>
                <FlatList key={query} data={options} extraData={value} keyExtractor={item => typeof item.id + ':' + String(item.id)} keyboardShouldPersistTaps="handled" initialNumToRender={15}
                    ListEmptyComponent={<Text style={s.muted}>Nenhum resultado. Tente outro termo ou cadastre um registro.</Text>}
                    renderItem={({item}) => <Pressable accessibilityRole="button" accessibilityState={{selected:item.id === value}} style={[s.pickerRow,item.id === value && s.pickerSelected]} onPress={() => {onChange(item.id);setVisible(false);}}>
                        <Text style={s.title}>{item.name}</Text>
                        {!!item.document && <Text style={s.muted}>{item.document}</Text>}
                        {!!item.reference && <Text style={s.muted}>Referência · {item.reference}</Text>}
                        {!!item.internalBarcode && <Text style={s.muted}>Código do produto · {item.internalBarcode.slice(-4)}</Text>}
                        {!!item.barcode && <Text style={s.muted}>Código · {item.barcode}</Text>}
                        {!!item.city && <Text style={s.muted}>{item.city} {item.state}</Text>}
                        {!!item.phone && <Text style={s.muted}>{item.phone}</Text>}
                        {item.stock !== undefined && <Text style={s.muted}>{item.categoryName} · Estoque {item.stock} · {money(item.price)}</Text>}
                    </Pressable>}/>
                <Button title="Fechar seleção" secondary onPress={() => setVisible(false)}/>
            </View></KeyboardArea></SafeAreaView>
        </Modal>
    </View>;
}
export default function App() {
    const [data,setData] = useState(null);
    const current = useRef(null);
    const saving = useRef(false);
    const [tab,setTab] = useState('home');
    const [editor,setEditor] = useState(null);
    const [history,setHistory] = useState(null);
    const [showActivity,setShowActivity] = useState(false);
    const [search,setSearch] = useState('');
    const [visibleCount,setVisibleCount] = useState(20);
    const [productCategory,setProductCategory] = useState(null);
    const [packingCategory,setPackingCategory] = useState(null);
    const [packingProduct,setPackingProduct] = useState(null);
    const [period,setPeriod] = useState(new Date().toISOString().slice(0,7));
    useEffect(() => { loadStored(AsyncStorage,empty).then(loaded => {
        current.current = loaded; setData(loaded);
    }).catch(error => Alert.alert('Não foi possível carregar os dados',error.message + ' Seus dados foram mantidos.')); },[]);
    async function commit(action) {
        if (saving.current) return;
        saving.current = true;
        try {
            const next = validateState(change(current.current,action));
            await AsyncStorage.setItem(storageKey,JSON.stringify(next));
            current.current = next;
            setData(next);
            setEditor(null);
            return true;
        } catch(error) { Alert.alert('Verifique os dados',error.message); }
        finally { saving.current = false; }
    }
    async function restore(next) {
        if (saving.current) return false;
        saving.current = true;
        try {
            const restored = await replaceStored(AsyncStorage,next);
            current.current = restored; setData(restored); setEditor(null); setHistory(null);
            return true;
        } catch(error) {Alert.alert('Restauração não aplicada',error.message);return false;}
        finally {saving.current = false;}
    }
    function drop(collection,id) {
        Alert.alert('Confirmar exclusão','Excluir este registro? Pedidos excluídos devolvem os itens ao estoque e saem dos relatórios.',[
            {text:'Cancelar',style:'cancel'}, {text:'Excluir',style:'destructive',onPress:() => commit(state => remove(state,collection,id))}
        ]);
    }
    function open(collection,record = {}) {
        const draft = {...record};
        delete draft.categoryName;
        delete draft.clientName;
        if (collection === 'products') Object.assign(draft,{stock:record.stock ?? 0,price:String((record.price ?? 0)/100),cost:String((record.cost ?? 0)/100),pricingMethod:record.pricingMethod ?? 'margin',keepRate:false,rate:percent(record.cost ?? 0,record.price ?? 0,record.pricingMethod)?.toFixed(2) ?? ''});
        if (collection === 'expenses') Object.assign(draft,{amount:String((record.amount ?? 0)/100),expenseDate:(record.date ?? new Date().toISOString()).slice(0,10)});
        if (collection === 'billing') Object.assign(draft,{final:String((record.final ?? total(record))/100),payment:record.payment ?? 'Pix'});
        if (collection === 'orders') draft.items = (record.items ?? []).map(i => ({...i}));
        setEditor({collection,draft});
    }
    const update = (key,value) => setEditor(old => ({...old,draft:{...old.draft,[key]:value}}));
    function save() {
        const {collection,draft} = editor;
        commit(state => {
            if (collection === 'orders') return saveOrder(state,draft);
            if (collection === 'billing') {
                const record = state.orders.find(o => o.id === draft.id);
                if (!draft.payment?.trim()) throw Error('Informe a forma de pagamento.');
                Object.assign(record,{final:numeric(draft.final,true),payment:draft.payment.trim(),delivered:record.delivered ?? new Date().toISOString()});
                return;
            }
            if (!draft.name?.trim()) throw Error('Informe o nome ou descrição.');
            const record = {...draft,name:draft.name.trim()};
            if (collection === 'clients') {
                for (const [key] of clientFields) record[key] = String(draft[key] ?? '').trim();
                record.state = record.state.toUpperCase();
                record.needsInvoice = draft.needsInvoice ?? false;
                if (record.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)) throw Error('Confira o e-mail do cliente.');
                if (record.state && !/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(record.state)) throw Error('Informe uma UF válida, como PR.');
                if (record.postalCode && !/^\d{5}-?\d{3}$/.test(record.postalCode)) throw Error('Informe o CEP com 8 dígitos.');
            }
            if (collection === 'categories') record.bonusEnabled = draft.bonusEnabled ?? false;
            if (collection === 'products') {
                if (draft.pricingError) throw Error(draft.pricingError);
                record.reference = String(draft.reference ?? '').trim(); record.barcode = String(draft.barcode ?? '').trim();
                record.pricingMethod = draft.pricingMethod ?? 'margin';
                delete record.rate; delete record.keepRate; delete record.pricingError;
                if (!state.categories.some(c => c.id === draft.categoryId)) throw Error('Selecione uma categoria.');
                Object.assign(record,{stock:numeric(draft.stock),price:numeric(draft.price,true),cost:numeric(draft.cost,true)});
            }
            if (collection === 'expenses') {
                const date = new Date(draft.expenseDate + 'T12:00:00');
                if (Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== draft.expenseDate) throw Error('Informe uma data válida no formato AAAA-MM-DD.');
                Object.assign(record,{amount:numeric(draft.amount,true),date:date.toISOString()});
            }
            const index = state[collection].findIndex(r => r.id === record.id);
            if (index < 0) state[collection].push({...record,id:state.nextId++});
            else state[collection][index] = record;
            if (collection === 'products') assignBarcodes(state,record.categoryId);
            if (collection === 'categories') assignBarcodes(state,state[collection][index < 0 ? state[collection].length - 1 : index].id);
        });
    }
    async function pdf(order) {
        try {
            const client = data.clients.find(c => c.id === order.clientId);
            const clientDetails = clientFields
                .filter(([key]) => key !== 'notes' && client?.[key])
                .map(([key,label]) => '<p><strong>' + escape(label) + '</strong> · ' + escape(client[key]) + '</p>')
                .join('');
            const brandHeader = '<div style="display:flex;align-items:center;justify-content:space-between;gap:18px;background:white;padding:12px 0 18px;break-inside:avoid">'
                + representedBrands.map(brand => '<div style="flex:1;min-width:0;text-align:center"><img src="' + brand.uri + '" alt="' + escape(brand.name) + '" style="width:100%;height:86px;object-fit:contain;display:block"></div>').join('')
                + '</div>';
            const sellerDetails = '<p><strong>Vendedor</strong> · ' + escape(seller.name) + '<br>Telefone · ' + escape(seller.phone) + '<br>' + escape(seller.city) + '</p>';
            const html = '<html><head><meta charset="utf-8"><style>body{font-family:Arial;color:#203b2e;padding:30px;font-size:12px}h1{background:#123c2e;color:white;padding:22px;border-bottom:5px solid #cdb36a;font-size:25px}h2{color:#123c2e;margin-top:22px}table{border-collapse:collapse;width:100%;margin-top:18px}th{background:#eaf0e3;text-align:left}th,td{padding:10px;border-bottom:1px solid #dce3d6}tr{page-break-inside:avoid}hr{border:0;border-top:2px solid #cdb36a;margin-top:24px}p{line-height:1.5}</style></head><body>' + brandHeader + '<h1>AgroTile Representações</h1><h2>Pedido #' + order.id + '</h2><p>' + escape(client?.name) + '</p>' + clientDetails + '<p>' + (client?.needsInvoice ? 'Cliente solicita nota fiscal' : '') + '</p><p>' + new Date(order.date).toLocaleDateString('pt-BR') + '</p><table width="100%"><tr><th>Produto</th><th>Qtd. cobrada</th><th>Bonificação</th><th>Unitário</th><th>Total</th></tr>' + order.items.map(i => '<tr><td>' + escape(i.name) + '</td><td>' + i.quantity + '</td><td>' + (i.bonus ?? 0) + '</td><td>' + money(i.price) + '</td><td>' + money(i.price*i.quantity) + '</td></tr>').join('') + '</table><h2>Total ' + money(order.final ?? total(order)) + '</h2><p>Resumo de Bonificações: ' + bonuses(order).quantity + ' unidades · Valor bonificado ' + money(bonuses(order).value) + '</p><p>' + escape(order.payment ?? 'Pedido aguardando entrega') + '</p><hr>' + sellerDetails + '</body></html>';
            const file = await Print.printToFileAsync({html});
            await Sharing.shareAsync(file.uri,{mimeType:'application/pdf',dialogTitle:'Enviar pedido por WhatsApp',UTI:'com.adobe.pdf'});
        } catch(error) { Alert.alert('Compartilhar PDF',error.message); }
    }
    async function sharePackingList() {
        try {
            const category = current.current.categories.find(item => item.id === packingCategory);
            if (!category) throw Error('Selecione uma categoria.');
            const manifest = packingList(current.current,packingCategory,packingProduct);
            if (!manifest.items.length) throw Error('Não há itens aguardando entrega para este filtro.');
            const row = item => '<tr><td>' + escape(item.name) + '</td><td>' + item.quantity + '</td></tr>';
            const html = '<html><head><meta charset="utf-8"><style>body{font-family:Arial;color:#203b2e;padding:24px;font-size:12px}h1{background:#123c2e;color:white;padding:22px;border-bottom:5px solid #cdb36a}th{background:#eaf0e3}hr{border:0;border-top:2px solid #cdb36a;margin-top:24px}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #ccd5ce;padding:8px;text-align:left}thead{display:table-header-group}tr{page-break-inside:avoid}h2,h3{page-break-after:avoid}</style></head><body>'
                + '<h1>AgroTile Representações</h1><h2>Romaneio · ' + escape(category.name) + '</h2>'
                + '<p>Pedidos aguardando entrega · Emitido em ' + escape(new Date().toLocaleString('pt-BR')) + '</p>'
                + (packingProduct === null ? '' : '<p>Filtro por produto · ' + escape(manifest.items[0].name) + '</p>')
                + '<h3>Resumo para separação</h3><table><thead><tr><th>Produto</th><th>Quantidade</th></tr></thead><tbody>'
                + manifest.items.map(row).join('') + '</tbody></table>'
                + '<p>' + manifest.orders.length + ' pedido(s) · ' + manifest.quantity + ' unidade(s)</p>'
                + '<h2>Separação por pedido e cliente</h2>'
                + manifest.orders.map(order => '<h3>Pedido #' + order.id + ' · ' + escape(order.client) + '</h3><p>'
                    + escape(new Date(order.date).toLocaleDateString('pt-BR')) + '</p><table><thead><tr><th>Produto</th><th>Quantidade</th></tr></thead><tbody>'
                    + order.items.map(row).join('') + '</tbody></table>').join('')
                + '<hr><p>Vendedor · ' + escape(seller.name) + '<br>Telefone · ' + escape(seller.phone) + '<br>' + escape(seller.city) + '</p></body></html>';
            const file = await Print.printToFileAsync({html});
            await Sharing.shareAsync(file.uri,{mimeType:'application/pdf',dialogTitle:'Enviar romaneio ao setor responsável',UTI:'com.adobe.pdf'});
        } catch(error) { Alert.alert('Romaneio',error.message); }
    }
    if (!data) return <SafeAreaView><Text>Carregando AgroTile…</Text></SafeAreaView>;
    const collection = tab === 'billing' ? 'orders' : tab;
    const records = ['home','settings','labels','entries','reports','packing'].includes(tab) ? [] : data[collection].filter(r => tab === 'orders' ? r.final === undefined : tab === 'billing' ? r.final !== undefined : true);
    const query = search.trim();
    const categoryNames = new Map(data.categories.map(category => [category.id,category.name]));
    const clientNames = new Map(data.clients.map(client => [client.id,client.name]));
    const productOptions = data.products.map(product => ({...product,categoryName:categoryNames.get(product.categoryId) ?? ''}));
    const searchableRecords = records
        .filter(record => tab !== 'products' || productCategory === null || record.categoryId === productCategory)
        .map(record => ({...record,categoryName:categoryNames.get(record.categoryId),clientName:clientNames.get(record.clientId)}));
    const visibleRecords = searchEntries(searchableRecords,query,['clients','products','categories'].includes(tab));
    const draft = editor?.draft;
    const overview = dashboard(data);
    const manifest = packingList(data, packingCategory, packingProduct);
    const manifestCategory = data.categories.find(category => category.id === packingCategory);
    const activity = customerActivity(data);
    const activityByClient = new Map(activity.map(entry => [entry.client.id, entry]));
    const monthValid = /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
    const start = monthValid ? new Date(Number(period.slice(0,4)),Number(period.slice(5))-1,1) : new Date();
    const end = new Date(start.getFullYear(),start.getMonth()+1,1);
    const monthly = report(data,start.toISOString(),end.toISOString());
    const weekStart = new Date();
    weekStart.setHours(0,0,0,0);
    weekStart.setDate(weekStart.getDate() - (weekStart.getDay()+6)%7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate()+7);
    const weekly = report(data,weekStart.toISOString(),weekEnd.toISOString());
    return <SafeAreaView style={s.page}><KeyboardScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
        {tab === 'home' && <>
        <View style={s.hero}>
            <View style={s.brandRow}><View style={s.monogram}><Text style={s.monogramText}>AT</Text></View><View><Text style={s.brand}>AgroTile</Text><Text style={s.subtitle}>REPRESENTAÇÕES</Text></View></View>
            <View style={s.heroDivider}/>
            <Text style={s.heroGreeting}>Sua operação, em dia.</Text>
            <Text style={s.heroDetail}>{seller.name}</Text>
            <Text style={s.heroDetail}>{seller.phone} · {seller.city}</Text>
        </View>
        <View style={s.quickActions}>
            <Button title="+ Novo pedido" onPress={() => open('orders')}/>
            <Button title="+ Cliente" secondary onPress={() => open('clients')}/>
        </View>
        <Text style={s.heading}>Resumo do mês</Text>
        <View style={s.row}>
            <View style={s.metric}><Text>Valor do estoque</Text><Text style={s.metricValue}>{money(overview.stockValue)}</Text><Text>A preço de custo</Text></View>
            <View style={s.metric}><Text>Valor de venda do estoque</Text><Text style={s.metricValue}>{money(overview.stockSaleValue)}</Text><Text>Lucro bruto potencial: {money(overview.stockPotentialProfit)}</Text><Text>Margem sobre a venda: {overview.stockMargin === null ? '—' : overview.stockMargin.toLocaleString('pt-BR',{maximumFractionDigits:2}) + '%'}</Text><Text>Antes de descontos e despesas</Text></View>
            <View style={s.metric}><Text>Vendas do mês</Text><Text style={s.metricValue}>{overview.monthlySales}</Text><Text>Pedidos faturados</Text></View>
            <View style={s.metric}><Text>Faturamento do mês</Text><Text style={s.metricValue}>{money(overview.monthlyRevenue)}</Text><Text>Valores finais</Text></View>
            <View style={s.metric}><Text>Clientes cadastrados</Text><Text style={s.metricValue}>{overview.clientCount}</Text></View>
            <View style={s.metric}><Text>Pedidos a entregar</Text><Text style={s.metricValue}>{overview.pendingCount}</Text><Text>{overview.pendingCount === 0 ? 'Tudo entregue' : money(overview.pendingValue) + ' em pedidos'}</Text></View>
        </View>
        <View style={s.card}>
            <Text style={s.title}>Positivação de clientes</Text>
            <Text>Última compra baseada na entrega e no faturamento. Clientes sem compras aparecem primeiro, seguidos dos que estão há mais tempo sem comprar.</Text>
            <Button title={showActivity ? 'Recolher lista' : 'Ver clientes para contato'} onPress={() => setShowActivity(!showActivity)}/>
            {showActivity && activity.length === 0 && <Text>Cadastre clientes para acompanhar suas compras.</Text>}
            {showActivity && activity.map(entry => <View key={entry.client.id} style={s.activity}>
                <Text style={s.title}>{entry.client.name}</Text>
                <Text>{entry.days === null ? 'Sem compras faturadas' : entry.days + ' dia(s) sem comprar'}</Text>
                {entry.lastPurchase && <Text>Última compra · {entry.lastPurchase.toLocaleDateString('pt-BR')}</Text>}
                {!!entry.client.phone && <Text>Telefone · {entry.client.phone}</Text>}
            </View>)}
        </View>
        </>}
        <Text style={s.eyebrow}>AGROTILE · GERENCIAR</Text>
        <View style={s.menu}>{Object.entries(labels).map(([key,label]) => <Pressable key={key} accessibilityRole="button" accessibilityState={{selected:tab === key}} style={[s.menuItem,tab === key && s.menuSelected]} onPress={() => {setTab(key);setHistory(null);setSearch('');setVisibleCount(20);setProductCategory(null);}}><Text style={[s.menuText,tab === key && s.menuSelectedText]}>{label}</Text></Pressable>)}</View>
        <Text style={s.heading}>{labels[tab]}</Text>
        {tab === 'products' && <Button title="Entrada" onPress={() => setTab('entries')}/>}
        {tab === 'entries' && <><Button title="Voltar para Produtos" secondary onPress={() => setTab('products')}/><EntryScreen data={data} commit={commit} openProduct={() => open('products')} Button={Button} Field={Field} Select={Select} styles={s}/></>}
        {tab === 'labels' && <LabelScreen data={data} commit={commit} products={productOptions} Button={Button} Select={Select} Field={Field} styles={s}/>}
        {tab === 'settings' && <BackupScreen data={data} restore={restore} Button={Button} styles={s}/>}
        {!['home','settings','labels','entries','reports','billing','packing'].includes(tab) && <Button title="Adicionar" onPress={() => open(tab)}/>}
        {!['home','settings','labels','entries','reports','packing'].includes(tab) && <View>
            <TextInput accessibilityLabel="Buscar registros" placeholder="Nome, referência, código, CPF/CNPJ…" placeholderTextColor="#6c7d73" style={s.search} value={search} onChangeText={value => {setSearch(value);setVisibleCount(20);}}/>
            {tab === 'products' && <Select label="Filtrar por categoria" entries={[{id:null,name:'Todas as categorias'},...data.categories]} value={productCategory} onChange={id => {setProductCategory(id);setVisibleCount(20);}}/>}
            <Text style={s.resultCount}>Mostrando {Math.min(visibleCount,visibleRecords.length)} de {visibleRecords.length} registro(s){['clients','products','categories'].includes(tab) ? ' · A–Z' : ''}</Text>
            {visibleRecords.length === 0 && <View style={s.emptyState}><Text style={s.title}>{query ? 'Nenhum resultado encontrado' : 'Vamos começar?'}</Text><Text style={s.muted}>{query ? 'Tente outro nome ou número.' : 'Os registros desta seção aparecerão aqui.'}</Text></View>}
        </View>}
        {visibleRecords.slice(0,visibleCount).map(record => <View key={record.id} style={s.card}>
            {collection === 'orders' && <View style={[s.badge,record.final !== undefined && s.deliveredBadge]}><Text style={s.badgeText}>{record.final === undefined ? 'AGUARDANDO ENTREGA' : 'FATURADO'}</Text></View>}
            <Text style={s.title}>{collection === 'orders' ? '#' + record.id + ' · ' + data.clients.find(c => c.id === record.clientId)?.name : record.name}</Text>
            {collection === 'orders' && <><Text>{new Date(record.date).toLocaleDateString('pt-BR')} · {money(record.final ?? total(record))}</Text>{record.items.map(i => <Text key={i.itemId}>{i.quantity} × {i.name} · {money(i.price)} · Bonificação {i.bonus ?? 0} un.</Text>)}<Text>Resumo de Bonificações · {bonuses(record).quantity} un. · {money(bonuses(record).value)}</Text><Text>{record.payment}</Text><Button title="Enviar por WhatsApp · PDF" onPress={() => pdf(record)}/>{record.final === undefined && <Button title="Pedido entregue" onPress={() => open('billing',record)}/>}</>}
            {collection === 'clients' && <View>
                <Text>{activityByClient.get(record.id)?.days === null ? 'Sem compras faturadas' : activityByClient.get(record.id)?.days + ' dia(s) sem comprar'}</Text>
                {!!record.legalName && <Text>{record.legalName}</Text>}
                {!!record.document && <Text>CPF / CNPJ · {record.document}</Text>}
                {!!record.phone && <Text>{record.phone}</Text>}
                {!!record.city && <Text>{record.city} {record.state}</Text>}
                {record.needsInvoice && <Text>Solicita nota fiscal</Text>}
            </View>}
            {collection === 'products' && <Text>{record.stock} unidades · Venda {money(record.price)} · Custo {money(record.cost)}{'\n'}Referência {record.reference || '—'} · Código {record.internalBarcode?.slice(-4) || record.barcode || '—'}</Text>}
            {collection === 'expenses' && <Text>{money(record.amount)} · {new Date(record.date).toLocaleDateString('pt-BR')}</Text>}
            <View style={s.row}><Button title="Editar" secondary onPress={() => open(collection,record)}/>{tab === 'billing' && <Button title="Editar pagamento" onPress={() => open('billing',record)}/>}<Button title="Excluir" onPress={() => drop(collection,record.id)}/>{collection === 'clients' && <Button title="Histórico" secondary onPress={() => setHistory(record.id)}/>}</View>
            {history === record.id && collection === 'clients' && data.orders.filter(o => o.clientId === record.id).map(o => <Text key={o.id}>#{o.id} · {new Date(o.date).toLocaleDateString('pt-BR')} · {o.final === undefined ? 'Pedido' : 'Faturado'} · {money(o.final ?? total(o))}</Text>)}
        </View>)}
        {visibleRecords.length > visibleCount && <Button title="Mostrar mais 20 registros" secondary onPress={() => setVisibleCount(count => count + 20)}/>}
        {tab === 'packing' && <View style={s.card}>
            <Text style={s.title}>Romaneio para separação</Text>
            <Text>Itens de pedidos aguardando entrega. A categoria considerada é a do cadastro atual do produto.</Text>
            <Select label="Categoria" entries={data.categories} value={packingCategory} onChange={id => {setPackingCategory(id);setPackingProduct(null);}}/>
            {data.categories.length === 0 && <Text>Cadastre uma categoria para gerar um romaneio.</Text>}
            {manifestCategory && <>
                <Select label="Produto" entries={[{id:null,name:'Todos os produtos'},...productOptions.filter(product => product.categoryId === packingCategory)]} value={packingProduct} onChange={setPackingProduct}/>
                <Text>{manifest.orders.length} pedido(s) · {manifest.quantity} unidade(s)</Text>
                {manifest.items.map(item => <Text key={item.productId}>{item.name} · {item.quantity} unidade(s)</Text>)}
                {manifest.items.length === 0 ? <Text>Nenhum item aguardando entrega neste filtro.</Text> : <Button title="Gerar PDF e compartilhar" onPress={sharePackingList}/>}
            </>}
        </View>}
        {tab === 'reports' && <View style={s.card}>
            <Text style={s.title}>Semana atual · segunda a domingo</Text><Text>Pedidos em aberto criados na semana · {money(weekly.pending)}</Text><Text>Faturamento da semana · {money(weekly.revenue)}</Text>
            <Field label="Mês (AAAA-MM)" value={period} onChangeText={setPeriod}/>
            {monthValid ? <><Text>Faturamento · {money(monthly.revenue)}</Text><Text>Custo vendido · {money(monthly.cost)}</Text><Text>Despesas · {money(monthly.expenses)}</Text><Text style={s.title}>Lucro · {money(monthly.profit)}</Text></> : <Text>Informe um mês válido.</Text>}
            <Text style={s.title}>Estoque a preço de custo</Text><Text>Total · {money(data.products.reduce((sum,p) => sum+p.stock*p.cost,0))}</Text>
            {data.categories.map(c => <Text key={c.id}>{c.name} · {money(data.products.filter(p => p.categoryId === c.id).reduce((sum,p) => sum+p.stock*p.cost,0))}</Text>)}
        </View>}
    </KeyboardScrollView>
    <Modal visible={!!editor} onRequestClose={() => setEditor(null)} animationType="slide"><SafeAreaView style={s.page}><KeyboardScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
        <Text style={s.heading}>{labels[editor?.collection]}</Text>
        {editor && !['orders','billing'].includes(editor.collection) && <Field label={editor.collection === 'clients' ? 'Nome de identificação do cliente' : 'Nome / descrição'} value={draft.name} onChangeText={v => update('name',v)}/>}
        {editor?.collection === 'clients' && <>
            <Text style={s.title}>Dados para faturamento</Text>
            <Text>Preencha os dados disponíveis para encaminhar ao responsável pela emissão da nota fiscal.</Text>
            <Select label="Solicita nota fiscal?" entries={[{id:false,name:'Não'},{id:true,name:'Sim'}]} value={draft.needsInvoice ?? false} onChange={v => update('needsInvoice',v)}/>
            {clientFields.map(([key,label]) => <Field key={key} label={label} value={draft[key]} onChangeText={v => update(key,v)}/>)}
        </>}
        {editor?.collection === 'categories' && <Select label="Gerar código de barras" entries={[{id:false,name:'Não'},{id:true,name:'Sim'}]} value={draft.generateBarcode ?? false} onChange={v => update('generateBarcode',v)}/>}
        {editor?.collection === 'categories' && <Select label="Gerar Bonificação" entries={[{id:false,name:'Desativado'},{id:true,name:'Ativado'}]} value={draft.bonusEnabled ?? false} onChange={v => update('bonusEnabled',v)}/>}
        {editor?.collection === 'products' && <>
            <Select label="Categoria" entries={data.categories} value={draft.categoryId} onChange={v => update('categoryId',v)}/>
            <Field label="Referência" value={draft.reference} onChangeText={v => update('reference',v)}/>
            {!!draft.internalBarcode && <Text>Código do produto · {draft.internalBarcode.slice(-4)} · {draft.internalBarcode}</Text>}
            <Field label="Código de barras do fornecedor" value={draft.barcode} onChangeText={v => update('barcode',v)}/>
            <Field label="Estoque disponível" numeric value={draft.stock} onChangeText={v => update('stock',v)}/>
            <PricingFields draft={draft} setDraft={next => setEditor(old => ({...old,draft:next}))} Field={Field} Select={Select}/>
        </>}
        {editor?.collection === 'expenses' && <><Field label="Valor (R$)" numeric value={draft.amount} onChangeText={v => update('amount',v)}/><Field label="Data (AAAA-MM-DD)" value={draft.expenseDate} onChangeText={v => update('expenseDate',v)}/></>}
        {editor?.collection === 'billing' && <><Field label="Valor final (R$)" numeric value={draft.final} onChangeText={v => update('final',v)}/><Field label="Forma de pagamento" value={draft.payment} onChangeText={v => update('payment',v)}/></>}
        {editor?.collection === 'orders' && <>
            <Select label="Cliente" entries={data.clients} value={draft.clientId} onChange={v => update('clientId',v)}/>
            <Select label="Adicionar produto" entries={productOptions} onChange={id => {const product = data.products.find(p => p.id === id);update('items',[{itemId:Crypto.randomUUID(),productId:id,name:product.name,quantity:1,bonus:0,price:product.price},...draft.items]);}}/>
            {draft.items.map((item,index) => <View key={item.itemId} style={s.card}><Text>{item.name}</Text>
                <Field label="Quantidade" numeric value={item.quantity} onChangeText={value => update('items',draft.items.map((i,n) => n === index ? {...i,quantity:value} : i))}/>
                <Field label="Preço unitário (R$)" numeric value={item.priceText ?? String(item.price/100)} onChangeText={value => update('items',draft.items.map((i,n) => n === index ? {...i,priceText:value} : i))}/>
                {(Number(item.bonus) > 0 || data.orders.find(o => o.id === draft.id)?.items.some(i => i.itemId === item.itemId && (i.bonus ?? 0) > 0) || data.categories.find(c => c.id === data.products.find(p => p.id === item.productId)?.categoryId)?.bonusEnabled) && <Field label="Bonificação (unidades gratuitas)" numeric value={item.bonus ?? 0} onChangeText={value => update('items',draft.items.map((i,n) => n === index ? {...i,bonus:value} : i))}/>}
                <Button title="Remover item" onPress={() => Alert.alert('Remover item?','A alteração será aplicada ao salvar.',[{text:'Cancelar'},{text:'Remover',onPress:() => update('items',draft.items.filter((_,n) => n !== index))}])}/>
            </View>)}
            <OrderSummary draft={draft}/>
        </>}
        <Button title="Salvar" onPress={() => {
            if (editor.collection === 'orders') {
                try {
                    const parsed = {...draft,items:draft.items.map(i => ({...i,quantity:numeric(i.quantity),bonus:numeric(i.bonus ?? 0),price:i.priceText === undefined ? i.price : numeric(i.priceText,true)}))};
                    commit(state => saveOrder(state,parsed));
                } catch(error) { Alert.alert('Verifique os dados',error.message); }
            } else save();
        }}/><Button title="Cancelar" secondary onPress={() => setEditor(null)}/>
    </KeyboardScrollView></SafeAreaView></Modal></SafeAreaView>;
}
function OrderSummary({draft}) {
    let order;
    try {
        order = {items:draft.items.map(i => ({...i,quantity:numeric(i.quantity),bonus:numeric(i.bonus ?? 0),price:i.priceText === undefined ? i.price : numeric(i.priceText,true)}))};
    } catch {order = null;}
    if (!order) return <Text>Complete quantidades e preços para ver o resumo.</Text>;
    const bonus = bonuses(order);
    return <View><Text style={s.title}>Total do pedido {money(total(order))}</Text><Text>Resumo de Bonificações · {bonus.quantity} unidades · {money(bonus.value)}</Text></View>;
}
const s = StyleSheet.create({
    pickerContainer:{flex:1,padding:18,paddingBottom:24},
    pickerRow:{padding:16,borderBottomWidth:1,borderBottomColor:'#dce3d6',backgroundColor:'#ffffff',gap:4},
    pickerSelected:{backgroundColor:'#e2efe2'},
    selectControl:{backgroundColor:'#ffffff',borderWidth:1,borderColor:'#bdcbb7',padding:15,borderRadius:12,marginVertical:8,minHeight:54,gap:6},
    selectValue:{fontSize:16,fontWeight:'600',color:'#203b2e'},
    page:{flex:1,backgroundColor:'#f4f5ef',paddingTop:28},
    content:{padding:18,paddingBottom:48},
    hero:{backgroundColor:'#123c2e',borderRadius:24,padding:24,marginBottom:16},
    brandRow:{flexDirection:'row',alignItems:'center',gap:14},
    monogram:{width:56,height:56,borderRadius:16,backgroundColor:'#cdb36a',alignItems:'center',justifyContent:'center'},
    monogramText:{fontSize:23,fontWeight:'900',color:'#123c2e'},
    brand:{fontSize:32,fontWeight:'800',color:'#ffffff',letterSpacing:-1},
    subtitle:{fontSize:11,color:'#e1d3a6',letterSpacing:2.4,marginTop:2},
    heroDivider:{height:1,backgroundColor:'#3c5b4b',marginVertical:18},
    heroGreeting:{fontSize:21,fontWeight:'700',color:'#ffffff',marginBottom:10},
    heroDetail:{fontSize:13,lineHeight:21,color:'#d6e3d9'},
    quickActions:{flexDirection:'row',flexWrap:'wrap',gap:10,marginBottom:4},
    metric:{backgroundColor:'#ffffff',padding:18,borderRadius:18,flexGrow:1,flexBasis:'45%',gap:8,borderWidth:1,borderColor:'#e4e8dd',borderTopWidth:3,borderTopColor:'#bd9f50'},
    metricValue:{fontSize:24,fontWeight:'800',color:'#123c2e',letterSpacing:-0.5},
    activity:{borderTopWidth:1,borderTopColor:'#e4e8dd',paddingTop:14,marginTop:10},
    heading:{fontSize:24,fontWeight:'800',marginTop:24,marginBottom:16,color:'#123c2e',letterSpacing:-0.5},
    title:{fontSize:18,fontWeight:'700',marginBottom:8,color:'#203b2e'},
    eyebrow:{fontSize:11,fontWeight:'800',letterSpacing:1.8,color:'#657867',marginTop:24,marginBottom:12},
    row:{flexDirection:'row',flexWrap:'wrap',gap:10},
    menu:{flexDirection:'row',flexWrap:'wrap',gap:8},
    menuItem:{paddingHorizontal:15,paddingVertical:13,borderRadius:12,borderWidth:1,borderColor:'#dce3d6',backgroundColor:'#ffffff',minHeight:46},
    menuSelected:{backgroundColor:'#123c2e',borderColor:'#123c2e'},
    menuText:{fontSize:14,fontWeight:'600',color:'#3d5647'},
    menuSelectedText:{color:'#ffffff'},
    button:{backgroundColor:'#1b5740',paddingHorizontal:18,paddingVertical:14,borderRadius:12,marginVertical:4,alignSelf:'flex-start',minHeight:48,justifyContent:'center'},
    buttonText:{color:'#ffffff',fontWeight:'700',fontSize:14},
    secondaryButton:{backgroundColor:'#e9eee3',borderWidth:1,borderColor:'#d4dfcd'},
    secondaryText:{color:'#244e35'},
    dangerButton:{backgroundColor:'#fff1ed',borderWidth:1,borderColor:'#efcfc5'},
    dangerText:{color:'#9b3428'},
    card:{backgroundColor:'#ffffff',padding:20,borderRadius:18,marginVertical:9,gap:8,borderWidth:1,borderColor:'#e3e8dd'},
    input:{backgroundColor:'#ffffff',borderWidth:1,borderColor:'#bdcbb7',padding:14,borderRadius:12,marginVertical:8,minHeight:50,fontSize:16,color:'#203b2e'},
    label:{fontWeight:'600',marginTop:16,color:'#3d5647',fontSize:13},
    choice:{paddingHorizontal:14,paddingVertical:12,backgroundColor:'#eef2e8',borderRadius:10,marginVertical:4,minHeight:44},
    selected:{backgroundColor:'#246140'},
    search:{backgroundColor:'#ffffff',borderWidth:1,borderColor:'#dce3d6',padding:15,borderRadius:14,minHeight:50,marginTop:14,fontSize:15,color:'#203b2e'},
    resultCount:{color:'#657867',fontSize:12,marginVertical:10},
    emptyState:{padding:26,backgroundColor:'#eaf0e3',borderRadius:18,marginVertical:8},
    muted:{color:'#52674e',lineHeight:22},
    badge:{backgroundColor:'#fff2d6',borderRadius:7,paddingHorizontal:10,paddingVertical:7,alignSelf:'flex-start',marginBottom:4},
    deliveredBadge:{backgroundColor:'#e2efe2'},
    badgeText:{fontSize:10,fontWeight:'800',letterSpacing:1,color:'#44552e'},
});
