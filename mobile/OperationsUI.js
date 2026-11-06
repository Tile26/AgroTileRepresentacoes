import React, {useState, useRef} from 'react';
import {View,Text,TextInput,Alert} from 'react-native';
import {File,Paths} from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Crypto from 'expo-crypto';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {money,numeric} from './domain';
import {percent,pricingDraft,localDate,dateRange,validDate,saveEntry,reverseEntry,entryReport,entriesCsv} from './business';
import {encryptBackup,decryptBackup} from './backup';
const esc = v => String(v ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function PricingFields({draft,setDraft,Field,Select}) {
    const edit = (key,value) => setDraft(pricingDraft(draft,key,value));
    return <>
        <Select label="Método de precificação" entries={[{id:'margin',name:'Margem sobre venda'},{id:'markup',name:'Markup sobre custo'}]} value={draft.pricingMethod ?? 'margin'} onChange={v => edit('pricingMethod',v)}/>
        <Select label="Ao alterar o custo" entries={[{id:false,name:'Manter preço de venda'},{id:true,name:'Recalcular venda pelo percentual'}]} value={draft.keepRate ?? false} onChange={v => setDraft({...draft,keepRate:v})}/>
        <Field label="Custo unitário (R$)" numeric value={draft.cost} onChangeText={v => edit('cost',v)}/>
        <Field label="Preço de venda (R$)" numeric value={draft.price} onChangeText={v => edit('price',v)}/>
        <Field label={draft.pricingMethod === 'markup' ? 'Markup sobre custo (%)' : 'Margem de Lucro (%)'} numeric value={draft.rate} onChangeText={v => edit('rate',v)}/>
        {!!draft.pricingError && <Text>{draft.pricingError}</Text>}
        <Text>O percentual é calculado sobre o preço arredondado em centavos. Alterar o método mantém os preços atuais.</Text>
    </>;
}
export function EntryScreen({data,commit,openProduct,Button,Field,Select,styles:s}) {
    const blank = () => ({date:localDate(),quantity:'1',cost:'0',price:'0',pricingMethod:'margin',rate:'',keepRate:false});
    const [draft,setDraft] = useState(blank);
    const [period,setPeriod] = useState('month');
    const [filter,setFilter] = useState({...dateRange('month'),productId:null,categoryId:null});
    const [reason,setReason] = useState('');
    const [count,setCount] = useState(20);
    const options = data.products.map(p => ({...p,categoryName:data.categories.find(c => c.id===p.categoryId)?.name}));
    const valid = validDate(filter.from) && validDate(filter.to) && filter.from <= filter.to;
    const report = entryReport(data,valid ? filter : {...filter,from:'z',to:''});
    let totals = null;
    try { const q=numeric(draft.quantity),c=numeric(draft.cost,true),p=numeric(draft.price,true); totals={cost:q*c,sale:q*p,profit:q*(p-c),margin:percent(c,p)}; } catch { /* incomplete input */ }
    const selectProduct = id => {const p=data.products.find(p=>p.id===id);setDraft({...draft,productId:id,cost:String(p.cost/100),price:String(p.price/100),pricingMethod:p.pricingMethod,rate:percent(p.cost,p.price,p.pricingMethod)?.toFixed(2) ?? '',pricingError:''});};
    const submit = async options => {
        if (draft.pricingError) return Alert.alert('Confira os preços',draft.pricingError);
        if (await commit(state => saveEntry(state,draft,options))) setDraft(blank());
    };
    const save = () => {
        try {
            const product=data.products.find(p=>p.id===draft.productId);
            if (!product) throw Error('Selecione um produto.');
            const cost=numeric(draft.cost,true);
            if (cost === product.cost) return submit({});
            Alert.alert('Deseja atualizar o preço de custo deste produto?','A entrada sempre preserva o custo informado. O preço de venda só muda se você escolher atualizar ambos.',[
                {text:'Cancelar',style:'cancel'},
                {text:'Manter custo cadastrado',onPress:()=>submit({})},
                {text:'Atualizar custo cadastrado',onPress:()=>Alert.alert('Preço de venda','Manter o preço atual ou aplicar o preço calculado e exibido nesta entrada?',[
                    {text:'Cancelar',style:'cancel'},
                    {text:'Manter venda',onPress:()=>submit({updateCost:true})},
                    {text:'Aplicar custo e venda',onPress:()=>submit({updateCost:true,updatePrice:true})},
                ])},
            ]);
        } catch(e) {Alert.alert('Entrada',e.message);}
    };
    async function exportReport(format) {
        try {
            if (!valid) throw Error('Confira o período.');
            if (format === 'csv') {
                const file=new File(Paths.cache,'entradas-'+Crypto.randomUUID()+'.csv'); await file.write(entriesCsv(report));
                await Sharing.shareAsync(file.uri,{mimeType:'text/csv',dialogTitle:'Exportar entradas'});
            } else {
                const html='<html><meta charset="utf-8"><body style="font-family:Arial;padding:24px;color:#123c2e"><h1>AgroTile · Entradas</h1><p>'+esc(filter.from)+' a '+esc(filter.to)+'</p><p>'+report.count+' lançamentos · '+report.quantity+' unidades</p><p>Custo '+money(report.cost)+' · Venda potencial '+money(report.sale)+' · Lucro bruto potencial '+money(report.profit)+' · Margem '+(report.margin?.toFixed(2) ?? '—')+'%</p><p>Valores potenciais, sujeitos à venda. Estornos excluídos.</p><table style="width:100%;border-collapse:collapse"><tr><th>Data</th><th>Produto / categoria</th><th>Qtd.</th><th>Custo</th><th>Venda potencial</th></tr>'+report.rows.map(e=>'<tr><td>'+esc(e.date)+'</td><td>'+esc(e.productName)+' / '+esc(e.categoryName)+'</td><td>'+e.quantity+'</td><td>'+money(e.costTotal)+'</td><td>'+money(e.salePotential)+'</td></tr>').join('')+'</table></body></html>';
                const file=await Print.printToFileAsync({html});await Sharing.shareAsync(file.uri,{mimeType:'application/pdf'});
            }
        } catch(e) {Alert.alert('Exportar relatório',e.message);}
    }
    return <>
        <View style={s.card}><Text style={s.title}>Registrar entrada</Text>
            <Select label="Produto · nome, referência ou código" entries={options} value={draft.productId} onChange={selectProduct}/>
            <Button title="Cadastrar novo produto" secondary onPress={openProduct}/><Text>O lançamento fica preenchido enquanto cadastra o produto. Depois, selecione-o acima. Para receber por esta entrada, cadastre estoque inicial zero.</Text>
            <Field label="Data (AAAA-MM-DD)" value={draft.date} onChangeText={v=>setDraft({...draft,date:v})}/>
            <Field label="Quantidade recebida" numeric value={draft.quantity} onChangeText={v=>setDraft({...draft,quantity:v})}/>
            <PricingFields draft={draft} setDraft={setDraft} Field={Field} Select={Select}/>
            {totals && <Text>Custo total {money(totals.cost)}{ '\n'}Venda potencial {money(totals.sale)}{ '\n'}Lucro bruto potencial {money(totals.profit)}{ '\n'}Margem bruta {totals.margin?.toFixed(2) ?? '—'}%</Text>}
            <Button title="Registrar entrada e somar estoque" onPress={save}/>
        </View>
        <View style={s.card}><Text style={s.title}>Relatório de entradas</Text><Text>Lucro potencial das mercadorias recebidas. O lucro realizado continua nos Relatórios de vendas.</Text>
            <Select label="Período" value={period} entries={[{id:'today',name:'Hoje'},{id:'yesterday',name:'Ontem'},{id:'week',name:'Últimos 7 dias'},{id:'month',name:'Mês atual'},{id:'previous',name:'Mês anterior'},{id:'custom',name:'Período personalizado'}]} onChange={v=>{setPeriod(v);setCount(20);if(v!=='custom')setFilter({...filter,...dateRange(v)});}}/>
            {period==='custom' && <><Field label="De (AAAA-MM-DD)" value={filter.from} onChangeText={v=>setFilter({...filter,from:v})}/><Field label="Até (AAAA-MM-DD)" value={filter.to} onChangeText={v=>setFilter({...filter,to:v})}/></>}
            <Select label="Produto" entries={[{id:null,name:'Todos'},...options]} value={filter.productId} onChange={v=>{setFilter({...filter,productId:v});setCount(20);}}/>
            <Select label="Categoria na entrada" entries={[{id:null,name:'Todas'},...data.categories]} value={filter.categoryId} onChange={v=>{setFilter({...filter,categoryId:v});setCount(20);}}/>
            {!valid ? <Text>Período inválido.</Text> : <>
                <Text>{report.quantity} unidades · {report.count} lançamentos{ '\n'}Custo {money(report.cost)}{ '\n'}Venda potencial {money(report.sale)}{ '\n'}Lucro bruto potencial {money(report.profit)}{ '\n'}Margem consolidada {report.margin?.toFixed(2) ?? '—'}%</Text>
                <Text style={s.title}>Por produto</Text>{report.products.map(p=><Text key={p.id}>{p.name} · {p.quantity} un. · Lucro potencial {money(p.profit)}</Text>)}
                <Text style={s.title}>Por categoria</Text>{report.categories.map(p=><Text key={p.id}>{p.name} · {p.quantity} un. · Lucro potencial {money(p.profit)}</Text>)}
                <Button title="Exportar PDF" onPress={()=>exportReport('pdf')}/><Button title="Exportar CSV · Excel" secondary onPress={()=>exportReport('csv')}/>
            </>}
        </View>
        <Text style={s.title}>Histórico filtrado por data</Text>
        <Field label="Motivo para eventual estorno" value={reason} onChangeText={setReason}/>
        {report.rows.slice(0,count).map(e=><View key={e.id} style={s.card}><Text>#{e.id} · {e.date} · {e.productName}{'\n'}{e.quantity} unidades · Custo {money(e.costTotal)} · Venda potencial {money(e.salePotential)}{'\n'}Registrado em {new Date(e.registeredAt).toLocaleString('pt-BR')}</Text>
            <Button title="Estornar entrada" secondary onPress={()=>Alert.alert('Confirmar estorno','Retirar '+e.quantity+' unidades do estoque? O histórico será preservado. Os preços atuais do cadastro serão mantidos.',[{text:'Cancelar',style:'cancel'},{text:'Estornar',style:'destructive',onPress:()=>commit(state=>reverseEntry(state,e.id,reason))}])}/>
        </View>)}
        {report.rows.length>count && <Button title="Mostrar mais entradas" onPress={()=>setCount(count+20)}/>}
        <Text style={s.title}>Entradas estornadas</Text>
        {data.entries.filter(e=>e.reversedAt && e.date>=filter.from && e.date<=filter.to && (!filter.productId || e.productId===filter.productId) && (!filter.categoryId || e.categoryId===filter.categoryId)).slice(0,count).map(e=><Text key={e.id}>#{e.id} · {e.productName} · {e.quantity} un. · {e.reversalReason} · {new Date(e.reversedAt).toLocaleString('pt-BR')}</Text>)}
    </>;
}
export function BackupScreen({data,restore,Button,styles:s}) {
    const [password,setPassword]=useState(''); const [repeat,setRepeat]=useState('');
    const [busy,setBusy]=useState(false); const lock=useRef(false);
    const [last,setLast]=useState(null); const [preview,setPreview]=useState(null);
    React.useEffect(()=>{AsyncStorage.getItem('agrotile-backup-info').then(raw=>setLast(raw?JSON.parse(raw):null)).catch(()=>{});},[]);
    async function run(action) {if(lock.current)return;lock.current=true;setBusy(true);try{await action();}catch(e){Alert.alert('Backup e restauração',e.message);}finally{lock.current=false;setBusy(false);}}
    async function create() {
        if(password!==repeat) throw Error('As senhas não conferem.');
        const text=await encryptBackup(data,password,Crypto.getRandomBytesAsync);
        const name='AgroTile-'+Date.now()+'.agrotile';const file=new File(Paths.document,name);await file.write(text);
        // Confirm durable content before showing a successful backup timestamp.
        if(await file.text()!==text) throw Error('Falha ao verificar o arquivo salvo.');
        const info={uri:file.uri,date:new Date().toISOString(),size:new TextEncoder().encode(text).length};
        await AsyncStorage.setItem('agrotile-backup-info',JSON.stringify(info));setLast(info);setPassword('');setRepeat('');
        Alert.alert('Backup criado','Arquivo criptografado salvo neste aparelho. Use Exportar Backup para guardar uma cópia fora do aplicativo.');
    }
    async function pick() {
        setPreview(null);
        const result=await DocumentPicker.getDocumentAsync({type:'*/*',copyToCacheDirectory:true});if(result.canceled)return;
        const file=new File(result.assets[0].uri);
        try {
            if(file.size>40*1024*1024) throw Error('Arquivo excede 40 MB.');
            const decoded=await decryptBackup(await file.text(),password);setPreview(decoded);setPassword('');setRepeat('');
        } finally {await file.delete();}
    }
    return <View style={s.card}><Text style={s.title}>Backup e Restauração</Text>
        <Text>Dados locais neste celular. Escolha uma senha de pelo menos 12 caracteres. Guarde-a em lugar seguro: perder a senha impede recuperar o arquivo. Não há conta ou sincronização remota.</Text>
        <Text>Senha do backup</Text><TextInput style={s.input} secureTextEntry autoCapitalize="none" autoCorrect={false} value={password} onChangeText={setPassword}/>
        <Text>Confirme a senha para criar</Text><TextInput style={s.input} secureTextEntry autoCapitalize="none" autoCorrect={false} value={repeat} onChangeText={setRepeat}/>
        <Text>Dados em uso: {new TextEncoder().encode(JSON.stringify(data)).length.toLocaleString('pt-BR')} bytes</Text>
        <Text>Último backup local: {last ? new Date(last.date).toLocaleString('pt-BR')+' · '+last.size+' bytes' : 'Ainda não criado'}</Text>
        <Text>A exportação abre as opções do aparelho. Confirme o salvamento no destino escolhido. Backup automático externo indisponível.</Text>
        {busy ? <Text>Processando com segurança… aguarde.</Text> : <>
            <Button title="Fazer Backup" onPress={()=>run(create)}/>
            <Button title="Exportar Backup" secondary onPress={()=>run(async()=>{if(!last || !new File(last.uri).exists)throw Error('Crie um backup primeiro.');await Sharing.shareAsync(last.uri,{mimeType:'application/octet-stream',dialogTitle:'Guardar backup fora do celular'});})}/>
            <Button title="Restaurar Backup" secondary onPress={()=>run(pick)}/>
        </>}
        {preview && <><Text style={s.title}>Conferir antes de restaurar</Text><Text>Backup de {new Date(preview.createdAt).toLocaleString('pt-BR')}{'\n'}{preview.data.clients.length} clientes · {preview.data.products.length} produtos · {preview.data.orders.length} pedidos · {preview.data.entries.length} entradas · {preview.data.expenses.length} despesas</Text>
            <Text>A restauração substituirá os dados atuais. Confira se o arquivo pertence à sua operação. Uma cópia local anterior será preservada para recuperação.</Text>
            <Button title="Confirmar substituição dos dados" onPress={()=>Alert.alert('Autoriza substituir os dados?','Confirmo que este backup pertence à minha operação e autorizo substituir todos os dados locais.',[{text:'Cancelar',style:'cancel'},{text:'Restaurar',style:'destructive',onPress:()=>run(async()=>{if(await restore(preview.data)){setPreview(null);Alert.alert('Restauração concluída','Dados recuperados com sucesso.');}})}])}/>
            <Button title="Descartar prévia" secondary onPress={()=>setPreview(null)}/>
        </>}
    </View>;
}
