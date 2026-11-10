import React,{useState} from 'react';
import {View,Text,Alert} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {layoutFields,sheetLayout,sheetHtml,iguacuLayout} from './labelSheet';

export function LabelScreen({data,commit,products,Button,Select,Field,styles:s}) {
    const [model,setModel]=useState('iguacu');
    const settingsKey=model === 'iguacu' ? 'iguacuLabelSheet' : 'labelSheet';
    const saved=data.settings[settingsKey] ?? (model === 'iguacu' ? iguacuLayout : null);
    function chooseModel(value) {
        const layout=value === 'iguacu' ? (data.settings.iguacuLabelSheet ?? iguacuLayout) : data.settings.labelSheet;
        setModel(value);setDraft(layout ?? {left:'0',top:'0',gapX:'0',gapY:'0'});setEditing(!layout);
    }
    const [editing,setEditing]=useState(!saved);
    const [draft,setDraft]=useState(saved ?? {left:'0',top:'0',gapX:'0',gapY:'0'});
    const [productId,setProductId]=useState(null);
    const product=products.find(p=>p.id===productId);
    async function saveLayout() {
        try {
            const layout=sheetLayout(draft);
            if (await commit(state=>{state.settings[settingsKey]=layout;})) setEditing(false);
        } catch(error){Alert.alert('Modelo A4',error.message);}
    }
    async function printSheet() {
        try {
            const html=sheetHtml(product,saved,model);
            const file=await Print.printToFileAsync({html,width:595.28,height:841.89});
            await Sharing.shareAsync(file.uri,{mimeType:'application/pdf',dialogTitle:'Etiquetas A4'});
        } catch(error){Alert.alert('Imprimir Etiqueta',error.message);}
    }
    return <View style={s.card}>
        <Select label="Modelo da etiqueta" entries={[{id:'iguacu',name:'Chapéus Iguaçu'},{id:'plain',name:'Etiqueta simples'}]} value={model} onChange={chooseModel}/>
        <Select label="Selecionar produto" entries={products} value={productId} onChange={setProductId}/>
        {product && <Text>{product.name} · Ref. {product.reference || '—'}{'\n'}{product.internalBarcode || product.barcode || 'Produto sem código de barras'}</Text>}
        {editing ? <>
            <Text style={s.title}>Modelo da folha A4</Text>
            <Text>Informe as medidas da sua folha de etiquetas. O modelo fica salvo para as próximas impressões.</Text>
            {Object.entries(layoutFields).map(([key,label])=><Field numeric key={key} label={label} value={draft[key]} onChangeText={v=>setDraft({...draft,[key]:v})}/>)}
            <Button title="Salvar modelo A4" onPress={saveLayout}/>
            {saved && <Button title="Cancelar" secondary onPress={()=>{setDraft(saved);setEditing(false);}}/>}
        </> : <>
            <Text>Folha A4 · {saved.columns} colunas × {saved.rows} linhas · {saved.rows*saved.columns} etiquetas do produto</Text>
            {product && !!(product.internalBarcode || product.barcode) && <Button title="Gerar PDF de etiquetas" onPress={printSheet}/>}
            <Button title="Ajustar medidas da folha" secondary onPress={()=>setEditing(true)}/>
        </>}
    </View>;
}
