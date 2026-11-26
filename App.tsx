import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { theme as t } from './src/theme';
import { addPoint, elapsed, formatPace, formatTime, pause, resume } from './src/run.mjs';
import type { Run } from './src/run.mjs';

type Tab = 'Hoy' | 'Correr' | 'Memorias' | 'Perfil';
type Finished = { id: string; startedAt: number; endedAt: number; activeMs: number; distanceM: number };
type Saved = { run: Run | null; history: Finished[]; checkpoint: number };
const KEY = 'rawrun.local.v1';
const initial: Saved = {run:null,history:[],checkpoint:0};

export default function App() {
  const [tab,setTab] = useState<Tab>('Hoy');
  const [data,setData] = useState<Saved>(initial);
  const [ready,setReady] = useState(false);
  const [now,setNow] = useState(Date.now());
  const [busy,setBusy] = useState(false);
  const [gps,setGps] = useState('GPS en espera');
  const [storageError,setStorageError] = useState(false);
  const current = useRef(data);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const starting = useRef(false);
  const run = data.run;
  const running = run != null && run.resumeAt !== null;
  const activeId = running ? run.id : null;

  function store(next: Saved) {
    current.current=next;
    setData(next);
    queue.current=queue.current.catch(()=>{}).then(async()=>{
      await AsyncStorage.setItem(KEY,JSON.stringify(next));
      setStorageError(false);
    }).catch(()=>setStorageError(true));
  }
  useEffect(()=>{
    let live=true;
    AsyncStorage.getItem(KEY).then(raw=>{
      if(!live) return;
      if(raw) {
        const saved=JSON.parse(raw) as Saved;
        const recovered={...saved,run:saved.run?pause(saved.run,saved.checkpoint):null};
        current.current=recovered; setData(recovered);
        if(recovered.run) setTab('Correr');
      }
    }).catch(()=>{if(live)setStorageError(true);}).finally(()=>{if(live)setReady(true);});
    return ()=>{live=false;};
  },[]);
  useEffect(()=>{
    const timer=setInterval(()=>{
      const stamp=Date.now();setNow(stamp);
      const s=current.current;
      if(s.run?.resumeAt!=null && stamp-s.checkpoint>=5000) store({...s,checkpoint:stamp});
    },1000);
    return ()=>clearInterval(timer);
  },[]);
  useEffect(()=>{
    const sub=AppState.addEventListener('change',state=>{
      const s=current.current;
      if(state!=='active' && s.run?.resumeAt!=null) {
        const stamp=Date.now();
        store({...s,run:pause(s.run,stamp),checkpoint:stamp});
      }
    });
    return ()=>sub.remove();
  },[]);
  useEffect(()=>{
    if(!activeId){setGps('GPS en espera');return;}
    let live=true;
    let sub: Location.LocationSubscription | undefined;
    setGps('Buscando señal GPS…');
    Location.watchPositionAsync({accuracy:Location.Accuracy.High,timeInterval:1000,distanceInterval:3},loc=>{
      if(!live) return;
      const s=current.current;
      if(!s.run || s.run.id!==activeId || s.run.resumeAt===null) return;
      const point={latitude:loc.coords.latitude,longitude:loc.coords.longitude,accuracy:loc.coords.accuracy,timestamp:loc.timestamp};
      const next=addPoint(s.run,point);
      setGps(point.accuracy!==null && point.accuracy<=25?'GPS conectado':'Buscando mejor señal…');
      if(next!==s.run) store({...s,run:next,checkpoint:Date.now()});
    }).then(v=>{if(live)sub=v;else v.remove();}).catch(()=>{
      if(!live)return;
      setGps('GPS no disponible');
      const s=current.current;
      if(s.run?.id===activeId)store({...s,run:pause(s.run,Date.now()),checkpoint:Date.now()});
    });
    return ()=>{live=false;sub?.remove();};
  },[activeId]);
  useEffect(()=>{
    const s=current.current;
    if(s.run && s.run.resumeAt!==null && s.run.momentStatus==='waiting' && elapsed(s.run,now)>=s.run.momentAtMs) {
      store({...s,run:{...s.run,momentStatus:'offered'},checkpoint:now});
    }
  },[now]);

  async function startOrResume() {
    if(!ready || starting.current)return;
    starting.current=true;setBusy(true);
    try {
      const permission=await Location.requestForegroundPermissionsAsync();
      if(permission.status!=='granted'){Alert.alert('Permiso necesario','Activa la ubicación para registrar la distancia.');return;}
      if(!await Location.hasServicesEnabledAsync()){Alert.alert('GPS desactivado','Activa la ubicación del iPhone.');return;}
      const stamp=Date.now(),s=current.current;
      if(s.run?.resumeAt!=null)return;
      const next:Run=s.run?resume(s.run,stamp):{
        id:stamp.toString(36)+'-'+Math.random().toString(36).slice(2),startedAt:stamp,activeMs:0,resumeAt:stamp,distanceM:0,lastPoint:null,
        momentAtMs:(10+Math.random()*8)*60000,momentStatus:'waiting',
      };
      store({...s,run:next,checkpoint:stamp});setNow(stamp);setTab('Correr');
    }catch{Alert.alert('No se pudo iniciar','Comprueba los permisos y vuelve a intentarlo.');}
    finally{starting.current=false;setBusy(false);}
  }
  function stop() {
    const s=current.current;if(!s.run)return;
    const stamp=Date.now();store({...s,run:pause(s.run,stamp),checkpoint:stamp});setNow(stamp);
  }
  function finish() {
    stop();
    Alert.alert('Finalizar carrera','Se guardará en este dispositivo.',[
      {text:'Cancelar',style:'cancel'},
      {text:'Guardar',onPress:()=>{
        const s=current.current;if(!s.run)return;
        const stamp=Date.now(),r=pause(s.run,stamp);
        store({run:null,checkpoint:stamp,history:[{id:r.id,startedAt:r.startedAt,endedAt:stamp,activeMs:r.activeMs,distanceM:r.distanceM},...s.history]});
        setTab('Memorias');
      }}
    ]);
  }
  const time=run?elapsed(run,now):0;
  const meters=run?.distanceM??0;
  const total=data.history.reduce((sum,r)=>sum+r.distanceM,0);

  return <SafeAreaView style={styles.safe}>
    <StatusBar barStyle="dark-content"/>
    <View style={styles.header}><Text style={styles.brand}>rawrun<Text style={{color:'#718644'}}>.</Text></Text><Text style={styles.tag}>RAW / FRAME</Text></View>
    <ScrollView contentContainerStyle={styles.content}>
      {!ready&&<Text style={styles.muted}>Cargando tus datos…</Text>}
      {storageError&&<Text style={styles.warning}>No se pudo leer o guardar el estado local. No cierres la app hasta revisar el almacenamiento.</Text>}
      {tab==='Hoy'&&<>
        <Text style={styles.kicker}>TU HISTORIA EN MOVIMIENTO</Text>
        <Text style={styles.h1}>Hoy.</Text>
        <View style={styles.hero}><Text style={styles.heroSmall}>01 / CADA CARRERA DEJA ALGO</Text><Text style={styles.heroTitle}>No solo{ '\n' }kilómetros.</Text><View style={styles.line}/><Text style={styles.heroBody}>Sal a correr. Vive el momento.</Text><Action label={run?'Volver a mi carrera':'Empezar a correr'} onPress={()=>setTab('Correr')} signal/></View>
        <Text style={styles.h2}>Tu actividad</Text><View style={styles.row}><Metric label="Kilómetros" value={(total/1000).toFixed(2)}/><Metric label="Carreras" value={String(data.history.length)}/></View>
        <Text style={styles.muted}>Vista local de desarrollo. El feed social se conectará en una fase posterior.</Text>
      </>}
      {tab==='Correr'&&<>
        <Text style={styles.kicker}>01 / EN MOVIMIENTO</Text><Text style={styles.h1}>Correr.</Text>
        <View style={styles.hero}><Text style={styles.heroSmall}>{running?'● EN CURSO':run?'EN PAUSA':'LISTO PARA SALIR'}</Text><Text style={styles.timer}>{formatTime(time)}</Text><Text style={styles.heroBody}>TIEMPO ACTIVO</Text><View style={styles.line}/><Text style={styles.distance}>{(meters/1000).toFixed(2)}<Text style={styles.unit}> km</Text></Text><Text style={styles.heroBody}>DISTANCIA</Text><Text style={styles.heroSmall}>RITMO MEDIO  /  {formatPace(time,meters)} min/km</Text></View>
        <Text style={styles.muted}>{gps}</Text>
        {run?.momentStatus==='offered'&&<View style={styles.signalCard}><Text style={styles.h2}>Tu Raw Moment.</Text><Text>Detente en un lugar seguro. La captura de cámara todavía no está disponible en esta versión.</Text><Action label="Omitir" onPress={()=>{const s=current.current;if(s.run)store({...s,run:{...s.run,momentStatus:'skipped'},checkpoint:Date.now()});}}/></View>}
        {running?<Action label="Pausar" onPress={stop}/>:<Action label={busy?'Comprobando GPS…':run?'Reanudar':'Iniciar carrera'} onPress={startOrResume} disabled={!ready||busy} signal/>}
        {run&&<Action label="Finalizar y guardar" onPress={finish}/>}
        <Text style={styles.muted}>Prueba inicial: el registro se pausa al bloquear el móvil o salir de la app. El GPS en segundo plano está pendiente.</Text>
      </>}
      {tab==='Memorias'&&<>
        <Text style={styles.kicker}>02 / TU DIARIO</Text><Text style={styles.h1}>Memorias.</Text>
        {data.history.length===0?<View style={styles.panel}><Text style={styles.h2}>Tu historia empieza aquí.</Text><Text style={styles.muted}>Las carreras que guardes aparecerán en tu diario privado.</Text></View>:data.history.map(r=><View key={r.id} style={styles.panel}><Text style={styles.kicker}>{new Date(r.startedAt).toLocaleDateString('es-ES')}</Text><Text style={styles.h1}>{(r.distanceM/1000).toFixed(2)} km</Text><Text style={styles.muted}>{formatTime(r.activeMs)} · {formatPace(r.activeMs,r.distanceM)} min/km</Text></View>)}
        <Text style={styles.muted}>Historial guardado solo en este dispositivo.</Text>
      </>}
      {tab==='Perfil'&&<>
        <Text style={styles.kicker}>03 / TU ESPACIO</Text><Text style={styles.h1}>Perfil.</Text><View style={styles.panel}><Text style={styles.h2}>Corredor local</Text><Text style={styles.muted}>Versión de desarrollo 0.1.0</Text><Text style={styles.muted}>La cuenta, amigos y sincronización con Supabase todavía no están conectados.</Text></View>
      </>}
    </ScrollView>
    <View style={styles.nav}>{(['Hoy','Correr','Memorias','Perfil'] as Tab[]).map((item,i)=><Pressable accessibilityRole="tab" accessibilityState={{selected:tab===item}} key={item} onPress={()=>setTab(item)} style={[styles.navItem,tab===item&&styles.selected]}><Text style={[styles.navIcon,tab===item&&{color:t.ink}]}>{['◫','▶','▤','○'][i]}</Text><Text style={[styles.navLabel,tab===item&&{fontWeight:'700',color:t.ink}]}>{item}</Text></Pressable>)}</View>
  </SafeAreaView>;
}
function Metric({label,value}:{label:string;value:string}) {return <View style={[styles.panel,{flex:1}]}><Text style={styles.h2}>{value}</Text><Text style={styles.muted}>{label}</Text></View>;}
function Action({label,onPress,signal=false,disabled=false}:{label:string;onPress:()=>void;signal?:boolean;disabled?:boolean}){return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({pressed})=>[styles.action,signal&&styles.signal,(pressed||disabled)&&{opacity:.55}]}><Text style={[styles.actionText,signal&&{color:t.ink}]}>{label}</Text></Pressable>;}
const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:t.paper},header:{paddingHorizontal:22,paddingVertical:14,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  brand:{fontSize:35,fontWeight:'900',letterSpacing:-2.8,color:t.ink},tag:{fontSize:10,letterSpacing:2,color:t.mist,fontWeight:'700'},
  content:{paddingHorizontal:22,paddingTop:12,paddingBottom:24,gap:16},
  kicker:{fontSize:11,fontWeight:'700',letterSpacing:1.6,color:t.mist},h1:{fontSize:48,fontWeight:'800',letterSpacing:-2.5,color:t.ink},h2:{fontSize:25,fontWeight:'700',letterSpacing:-.8,color:t.ink},
  hero:{backgroundColor:t.ink,borderRadius:t.radius,padding:22,gap:17},heroSmall:{color:t.signal,fontSize:12,letterSpacing:1,fontWeight:'700'},heroTitle:{color:t.paper,fontSize:46,letterSpacing:-2,fontWeight:'800',lineHeight:49},heroBody:{color:'#D0D0C8',fontSize:13,letterSpacing:.5},line:{height:1,backgroundColor:'#525450'},
  timer:{fontSize:51,fontWeight:'800',color:t.paper,fontVariant:['tabular-nums'],letterSpacing:-2},distance:{fontSize:55,fontWeight:'800',color:t.paper,fontVariant:['tabular-nums'],letterSpacing:-2},unit:{fontSize:21,fontWeight:'500'},
  muted:{fontSize:14,color:t.mist,lineHeight:21},warning:{color:t.danger,fontSize:14},row:{flexDirection:'row',gap:12},panel:{padding:18,backgroundColor:t.stone,borderRadius:18,gap:8},
  signalCard:{padding:18,borderRadius:18,backgroundColor:t.signal,gap:12},action:{minHeight:54,backgroundColor:t.ink,borderRadius:15,justifyContent:'center',alignItems:'center',paddingHorizontal:14},signal:{backgroundColor:t.signal},actionText:{color:t.paper,fontWeight:'700',fontSize:16},
  nav:{flexDirection:'row',paddingHorizontal:12,paddingTop:8,paddingBottom:8,borderTopWidth:1,borderColor:t.stone,gap:4},navItem:{flex:1,alignItems:'center',justifyContent:'center',minHeight:55,borderRadius:16,gap:2},selected:{backgroundColor:t.signal},navIcon:{fontSize:23,color:t.mist},navLabel:{fontSize:11,color:t.mist},
});
