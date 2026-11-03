import React, {useState, useEffect, useRef} from 'react';
import {Alert, SafeAreaView, ScrollView, View, Text, TextInput, Pressable, Modal, StyleSheet} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {empty, money, numeric, change, saveOrder, remove, total, report} from './domain';

const labels = {clients:'Clientes',categories:'Categorias',products:'Produtos',orders:'Pedidos',billing:'Faturamento',expenses:'Despesas',reports:'Relatórios'};
const storageKey = 'agrotile-v1';
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function Button({title,onPress}) { return <Pressable style={s.button} onPress={onPress}><Text style={s.buttonText}>{title}</Text></Pressable>; }
function Field({label,value,onChangeText,numeric:decimal}) { return <View><Text style={s.label}>{label}</Text><TextInput style={s.input} value={String(value ?? '')} onChangeText={onChangeText} keyboardType={decimal ? 'decimal-pad' : 'default'}/></View>; }
function Select({label,entries,value,onChange}) { return <View><Text style={s.label}>{label}</Text><View style={s.row}>{entries.map(entry => <Pressable key={entry.id} onPress={() => onChange(entry.id)} style={[s.choice,value === entry.id && s.selected]}><Text style={value === entry.id && {color:'white'}}>{entry.name}</Text></Pressable>)}</View></View>; }

export default function App() {
    const [data,setData] = useState(null);
    const current = useRef(null);
    const saving = useRef(false);
    const [tab,setTab] = useState('orders');
    const [editor,setEditor] = useState(null);
    const [history,setHistory] = useState(null);
    const [period,setPeriod] = useState(new Date().toISOString().slice(0,7));
    useEffect(() => { AsyncStorage.getItem(storageKey).then(raw => {
        const loaded = raw ? JSON.parse(raw) : empty();
        if (loaded.version !== 1) throw Error('Versão dos dados desconhecida.');
        current.current = loaded;
        setData(loaded);
    }).catch(error => Alert.alert('Não foi possível carregar os dados',error.message)); },[]);
    async function commit(action) {
        if (saving.current) return;
        saving.current = true;
        try {
            const next = change(current.current,action);
            await AsyncStorage.setItem(storageKey,JSON.stringify(next));
            current.current = next;
            setData(next);
            setEditor(null);
        } catch(error) { Alert.alert('Verifique os dados',error.message); }
        finally { saving.current = false; }
    }
    function drop(collection,id) {
        Alert.alert('Confirmar exclusão','Excluir este registro? Pedidos excluídos devolvem os itens ao estoque e saem dos relatórios.',[
            {text:'Cancelar',style:'cancel'}, {text:'Excluir',style:'destructive',onPress:() => commit(state => remove(state,collection,id))}
        ]);
    }
    function open(collection,record = {}) {
        const draft = {...record};
        if (collection === 'products') Object.assign(draft,{price:String((record.price ?? 0)/100),cost:String((record.cost ?? 0)/100)});
        if (collection === 'expenses') Object.assign(draft,{amount:String((record.amount ?? 0)/100)});
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
            if (collection === 'products') {
                if (!state.categories.some(c => c.id === draft.categoryId)) throw Error('Selecione uma categoria.');
                Object.assign(record,{stock:numeric(draft.stock),price:numeric(draft.price,true),cost:numeric(draft.cost,true)});
            }
            if (collection === 'expenses') Object.assign(record,{amount:numeric(draft.amount,true),date:draft.date ?? new Date().toISOString()});
            const index = state[collection].findIndex(r => r.id === record.id);
            if (index < 0) state[collection].push({...record,id:state.nextId++});
            else state[collection][index] = record;
        });
    }
    async function pdf(order) {
        try {
            const client = data.clients.find(c => c.id === order.clientId);
            const html = '<html><meta charset="utf-8"><body style="font-family:Arial;padding:30px"><h1>AgroTile Representações</h1><h2>Pedido #' + order.id + '</h2><p>' + escape(client?.name) + '</p><p>' + escape(client?.address ?? '') + '</p><p>' + new Date(order.date).toLocaleDateString('pt-BR') + '</p><table width="100%"><tr><th>Produto</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr>' + order.items.map(i => '<tr><td>' + escape(i.name) + '</td><td>' + i.quantity + '</td><td>' + money(i.price) + '</td><td>' + money(i.price*i.quantity) + '</td></tr>').join('') + '</table><h2>Total ' + money(order.final ?? total(order)) + '</h2><p>' + escape(order.payment ?? 'Pedido aguardando entrega') + '</p></body></html>';
            const file = await Print.printToFileAsync({html});
            await Sharing.shareAsync(file.uri,{mimeType:'application/pdf',dialogTitle:'Enviar pedido por WhatsApp',UTI:'com.adobe.pdf'});
        } catch(error) { Alert.alert('Compartilhar PDF',error.message); }
    }
    if (!data) return <SafeAreaView><Text>Carregando AgroTile…</Text></SafeAreaView>;
    const collection = tab === 'billing' ? 'orders' : tab;
    const records = tab === 'reports' ? [] : data[collection].filter(r => tab === 'orders' ? r.final === undefined : tab === 'billing' ? r.final !== undefined : true);
    const draft = editor?.draft;
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
    return <SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.content}>
        <Text style={s.brand}>AgroTile</Text><Text style={s.subtitle}>Representações</Text>
        <View style={s.row}>{Object.entries(labels).map(([key,label]) => <Button key={key} title={label} onPress={() => {setTab(key);setHistory(null);}}/>)}</View>
        <Text style={s.heading}>{labels[tab]}</Text>
        {!['reports','billing'].includes(tab) && <Button title="Adicionar" onPress={() => open(tab)}/>}
        {records.map(record => <View key={record.id} style={s.card}>
            <Text style={s.title}>{collection === 'orders' ? '#' + record.id + ' · ' + data.clients.find(c => c.id === record.clientId)?.name : record.name}</Text>
            {collection === 'orders' && <><Text>{new Date(record.date).toLocaleDateString('pt-BR')} · {money(record.final ?? total(record))}</Text>{record.items.map((i,index) => <Text key={index}>{i.quantity} × {i.name} · {money(i.price)}</Text>)}<Text>{record.payment}</Text><Button title="Enviar por WhatsApp · PDF" onPress={() => pdf(record)}/>{record.final === undefined && <Button title="Pedido entregue" onPress={() => open('billing',record)}/>}</>}
            {collection === 'products' && <Text>{record.stock} unidades · Venda {money(record.price)} · Custo {money(record.cost)}</Text>}
            {collection === 'expenses' && <Text>{money(record.amount)} · {new Date(record.date).toLocaleDateString('pt-BR')}</Text>}
            <View style={s.row}><Button title="Editar" onPress={() => open(collection,record)}/>{tab === 'billing' && <Button title="Editar pagamento" onPress={() => open('billing',record)}/>}<Button title="Excluir" onPress={() => drop(collection,record.id)}/>{collection === 'clients' && <Button title="Histórico" onPress={() => setHistory(record.id)}/>}</View>
            {history === record.id && collection === 'clients' && data.orders.filter(o => o.clientId === record.id).map(o => <Text key={o.id}>#{o.id} · {new Date(o.date).toLocaleDateString('pt-BR')} · {o.final === undefined ? 'Pedido' : 'Faturado'} · {money(o.final ?? total(o))}</Text>)}
        </View>)}
        {tab === 'reports' && <View style={s.card}>
            <Text style={s.title}>Semana atual · segunda a domingo</Text><Text>Pedidos em aberto criados na semana · {money(weekly.pending)}</Text><Text>Faturamento da semana · {money(weekly.revenue)}</Text>
            <Field label="Mês (AAAA-MM)" value={period} onChangeText={setPeriod}/>
            {monthValid ? <><Text>Faturamento · {money(monthly.revenue)}</Text><Text>Custo vendido · {money(monthly.cost)}</Text><Text>Despesas · {money(monthly.expenses)}</Text><Text style={s.title}>Lucro · {money(monthly.profit)}</Text></> : <Text>Informe um mês válido.</Text>}
            <Text style={s.title}>Estoque a preço de custo</Text><Text>Total · {money(data.products.reduce((sum,p) => sum+p.stock*p.cost,0))}</Text>
            {data.categories.map(c => <Text key={c.id}>{c.name} · {money(data.products.filter(p => p.categoryId === c.id).reduce((sum,p) => sum+p.stock*p.cost,0))}</Text>)}
        </View>}
    </ScrollView>
    <Modal visible={!!editor} onRequestClose={() => setEditor(null)} animationType="slide"><SafeAreaView style={s.page}><ScrollView contentContainerStyle={s.content}>
        <Text style={s.heading}>{labels[editor?.collection]}</Text>
        {editor && !['orders','billing'].includes(editor.collection) && <Field label="Nome / descrição" value={draft.name} onChangeText={v => update('name',v)}/>}
        {editor?.collection === 'clients' && <><Field label="Telefone / WhatsApp" value={draft.phone} onChangeText={v => update('phone',v)}/><Field label="Endereço" value={draft.address} onChangeText={v => update('address',v)}/></>}
        {editor?.collection === 'products' && <><Select label="Categoria" entries={data.categories} value={draft.categoryId} onChange={v => update('categoryId',v)}/>{[['stock','Estoque disponível'],['cost','Custo unitário (R$)'],['price','Preço de venda (R$)']].map(([key,label]) => <Field key={key} label={label} numeric value={draft[key]} onChangeText={v => update(key,v)}/>)}</>}
        {editor?.collection === 'expenses' && <Field label="Valor (R$)" numeric value={draft.amount} onChangeText={v => update('amount',v)}/>}
        {editor?.collection === 'billing' && <><Field label="Valor final (R$)" numeric value={draft.final} onChangeText={v => update('final',v)}/><Field label="Forma de pagamento" value={draft.payment} onChangeText={v => update('payment',v)}/></>}
        {editor?.collection === 'orders' && <>
            <Select label="Cliente" entries={data.clients} value={draft.clientId} onChange={v => update('clientId',v)}/>
            <Select label="Adicionar produto" entries={data.products} onChange={id => {const product = data.products.find(p => p.id === id);update('items',[...draft.items,{productId:id,name:product.name,quantity:1,price:product.price}]);}}/>
            {draft.items.map((item,index) => <View key={index} style={s.card}><Text>{item.name}</Text>
                <Field label="Quantidade" numeric value={item.quantity} onChangeText={value => update('items',draft.items.map((i,n) => n === index ? {...i,quantity:value} : i))}/>
                <Field label="Preço unitário (R$)" numeric value={item.priceText ?? String(item.price/100)} onChangeText={value => update('items',draft.items.map((i,n) => n === index ? {...i,priceText:value} : i))}/>
                <Button title="Remover item" onPress={() => Alert.alert('Remover item?','A alteração será aplicada ao salvar.',[{text:'Cancelar'},{text:'Remover',onPress:() => update('items',draft.items.filter((_,n) => n !== index))}])}/>
            </View>)}
        </>}
        <Button title="Salvar" onPress={() => {
            if (editor.collection === 'orders') {
                try {
                    const parsed = {...draft,items:draft.items.map(i => ({...i,quantity:numeric(i.quantity),price:i.priceText === undefined ? i.price : numeric(i.priceText,true)}))};
                    commit(state => saveOrder(state,parsed));
                } catch(error) { Alert.alert('Verifique os dados',error.message); }
            } else save();
        }}/><Button title="Cancelar" onPress={() => setEditor(null)}/>
    </ScrollView></SafeAreaView></Modal></SafeAreaView>;
}
const s = StyleSheet.create({
    page:{flex:1,backgroundColor:'#edf3ed',paddingTop:28},
    content:{padding:20,paddingBottom:50},
    brand:{fontSize:32,fontWeight:'800',color:'#17482f'},
    subtitle:{fontSize:16,color:'#53705c',marginBottom:20},
    heading:{fontSize:24,fontWeight:'700',marginVertical:20,color:'#17482f'},
    title:{fontSize:18,fontWeight:'700',marginBottom:8},
    row:{flexDirection:'row',flexWrap:'wrap',gap:8},
    button:{backgroundColor:'#246140',padding:12,borderRadius:8,marginVertical:4,alignSelf:'flex-start'},
    buttonText:{color:'white',fontWeight:'600'},
    card:{backgroundColor:'white',padding:18,borderRadius:12,marginVertical:8,gap:6},
    input:{backgroundColor:'white',borderWidth:1,borderColor:'#b3c5b7',padding:12,borderRadius:8,marginVertical:8},
    label:{fontWeight:'600',marginTop:12},
    choice:{padding:10,backgroundColor:'#dce8dd',borderRadius:6,marginVertical:4},
    selected:{backgroundColor:'#246140'}
});
