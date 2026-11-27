import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Modal, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { theme as t } from './src/theme';
import { addPoint, elapsed, formatPace, formatTime, pause, resume } from './src/run.mjs';
import type { Run } from './src/run.mjs';
import { Brand, FrameMark, Action, Section, Metric, WeekChart, Nav, RunCard, s } from './src/ui';
import { weekSummary } from './src/activity.mjs';

type Tab = 'Hoy' | 'Comunidad' | 'Correr' | 'Actividad' | 'Perfil';
type Finished = { id: string; startedAt: number; endedAt: number; activeMs: number; distanceM: number };
type Saved = { run: Run | null; history: Finished[]; checkpoint: number; localProfile?: { name: string; weeklyKm: number } };
const KEY = 'rawrun.local.v1';
const initial: Saved = {run:null,history:[],checkpoint:0};

export default function App() {
  const [tab,setTab] = useState<Tab>('Hoy');
  const [detail,setDetail] = useState<Finished | null>(null);
  const [activityView,setActivityView] = useState<'Semana' | 'Diario'>('Semana');
  const [editProfile,setEditProfile] = useState(false);
  const [nameDraft,setNameDraft] = useState('');
  const [goalDraft,setGoalDraft] = useState('20');
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
        const finished={id:r.id,startedAt:r.startedAt,endedAt:stamp,activeMs:r.activeMs,distanceM:r.distanceM};
        store({...s,run:null,checkpoint:stamp,history:[finished,...s.history]});
        setDetail(finished);setActivityView('Diario');setTab('Actividad');
      }}
    ]);
  }
  const time=run?elapsed(run,now):0;
  const meters=run?.distanceM??0;
  const total=data.history.reduce((sum,r)=>sum+r.distanceM,0);
  const profile=data.localProfile??{name:'',weeklyKm:20};
  const week=weekSummary(data.history,now);
  const progress=Math.min(1,week.distanceM/(profile.weeklyKm*1000));
  const goRun=()=>setTab('Correr');
  const selectRun=(r:Finished)=>setDetail(r);
  function openProfile(){setNameDraft(profile.name);setGoalDraft(String(profile.weeklyKm));setEditProfile(true);}
  function saveProfile(){const goal=Number(goalDraft.replace(',','.'));if(!Number.isFinite(goal)||goal<1||goal>300){Alert.alert('Objetivo semanal','Introduce un objetivo entre 1 y 300 km.');return;}store({...current.current,localProfile:{name:nameDraft.trim().slice(0,60),weeklyKm:goal}});setEditProfile(false);}

  return <SafeAreaView style={s.safe}>
    <StatusBar barStyle="dark-content"/>
    <View style={s.header}><Brand/><View style={s.headerRight}><Text style={s.micro}>{new Date(now).toLocaleDateString('es-ES',{day:'2-digit',month:'short'}).toUpperCase()}</Text><Pressable accessibilityRole="button" accessibilityLabel="Mi perfil" onPress={()=>setTab('Perfil')} style={s.avatarSmall}><Text style={s.avatarText}>{profile.name.slice(0,1).toUpperCase()||'R'}</Text></Pressable></View></View>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      {!ready&&<Text style={s.muted}>Cargando tu diario…</Text>}
      {storageError&&<Text style={s.error}>No se pudo leer o guardar el estado local. Revisa el almacenamiento antes de cerrar.</Text>}
      {tab==='Hoy'&&<>
        <View style={s.heading}><Text style={s.micro}>TU HISTORIA EN MOVIMIENTO</Text><Text style={s.display}>Hoy.</Text><Text style={s.body}>{profile.name?'Hola, '+profile.name+'.':'Cada carrera deja algo.'}</Text></View>
        <View style={s.feature}>
          <View style={s.spread}><Text style={s.lightMicro}>RAW / FRAME</Text><Text style={s.lightMicro}>001</Text></View>
          <View style={s.featureArt}><FrameMark size={148} color={t.signal}/><View style={s.orbitOne}/><View style={s.orbitTwo}/></View>
          <Text style={s.featureTitle}>No todos los kilómetros se recuerdan.</Text><Text style={s.featureSub}>Algunos momentos, sí.</Text>
          <Action label={run?'Volver a mi carrera':'Salir a correr'} onPress={goRun} kind="signal"/>
        </View>
        <Section title="Esta semana" link="Ver actividad" onPress={()=>{setActivityView('Semana');setTab('Actividad');}}/>
        <View style={s.statsRow}><Metric value={(week.distanceM/1000).toFixed(1)} unit="km" label="DISTANCIA"/><Metric value={String(week.count)} label="CARRERAS"/><Metric value={formatPace(week.activeMs,week.distanceM)} label="RITMO"/></View>
        <View style={s.surface}><View style={s.spread}><Text style={s.label}>Objetivo semanal</Text><Text style={s.micro}>{(week.distanceM/1000).toFixed(1)} / {profile.weeklyKm} KM</Text></View><View style={s.progress}><View style={[s.progressFill,{width:`${progress*100}%`}]}/></View></View>
        <Section title="Última carrera" link="Diario" onPress={()=>{setActivityView('Diario');setTab('Actividad');}}/>
        {data.history[0]?<RunCard run={data.history[0]} onPress={()=>selectRun(data.history[0])}/>:<View style={s.empty}><FrameMark size={46} color={t.mist}/><Text style={s.h2}>Tu primer recuerdo</Text><Text style={s.muted}>Registra tu primera carrera y empieza a construir tu historia.</Text></View>}
      </>}
      {tab==='Comunidad'&&<>
        <View style={s.heading}><Text style={s.micro}>02 / RUN TOGETHER</Text><Text style={s.display}>Comunidad.</Text><Text style={s.body}>Cada persona, una perspectiva.</Text></View>
        <View style={s.feature}><View style={s.spread}><Text style={s.lightMicro}>RAW MOMENTS</Text><FrameMark size={28} color={t.signal}/></View><View style={s.duo}><View style={s.photoPlaceholder}><FrameMark size={54} color={t.signal}/><Text style={s.lightMicro}>01 / ENTORNO</Text></View><View style={s.photoPlaceholder2}><Text style={s.photoIndex}>02</Text><Text style={s.lightMicro}>TU PERSPECTIVA</Text></View></View><Text style={s.featureTitle}>Una carrera. Dos miradas.</Text><Text style={s.featureSub}>Tu momento en color, con tus kilómetros y tu historia.</Text></View>
        <View style={s.empty}><Text style={s.h2}>Aún no hay publicaciones</Text><Text style={s.muted}>El feed social se activará cuando conectemos las cuentas y la privacidad de las fotos. No mostramos corredores ni publicaciones inventadas.</Text></View>
      </>}
      {tab==='Correr'&&<>
        <View style={s.spread}><View style={s.heading}><Text style={s.micro}>03 / EN MOVIMIENTO</Text><Text style={s.display}>Correr.</Text></View><View style={s.status}><View style={[s.dot,{backgroundColor:running&&gps==='GPS conectado'?'#557C38':t.mist}]}/><Text style={s.micro}>{gps==='GPS conectado'?'GPS OK':running?'GPS…':'GPS'}</Text></View></View>
        <View style={s.runPanel}><View style={s.spread}><Text style={s.lightMicro}>{running?'EN CURSO':run?'EN PAUSA':'LISTO PARA SALIR'}</Text><FrameMark size={30} color={t.signal}/></View><Text adjustsFontSizeToFit numberOfLines={1} style={s.timer}>{formatTime(time)}</Text><Text style={s.lightMicro}>TIEMPO ACTIVO</Text><View style={s.darkDivider}/><Text style={s.distance}>{(meters/1000).toFixed(2)}<Text style={s.distanceUnit}> km</Text></Text><Text style={s.lightMicro}>DISTANCIA</Text><View style={s.darkDivider}/><View style={s.spread}><Text style={s.lightMicro}>RITMO MEDIO</Text><Text style={s.pace}>{formatPace(time,meters)} <Text style={s.lightMicro}>/ KM</Text></Text></View></View>
        <View style={s.surface}><View style={s.spread}><Text style={s.label}>Raw Moment</Text><FrameMark size={24} color={t.ink}/></View><View style={s.timeline}><View style={[s.timelineFill,{width:`${Math.min(100,time/600000*100)}%`}]}/><View style={s.timelineMarker}/></View><Text style={s.muted}>{run?.momentStatus==='skipped'?'Omitido en esta carrera.':run?.momentStatus==='offered'?'Tu momento ha llegado.': 'A partir de 10 minutos activos puede aparecer tu momento.'}</Text></View>
        {run?.momentStatus==='offered'&&<View style={s.signalSurface}><Text style={s.h2}>Es tu momento.</Text><Text style={s.body}>La cámara aún no está habilitada. Puedes continuar sin foto.</Text><Action label="Continuar sin foto" onPress={()=>{const v=current.current;if(v.run)store({...v,run:{...v.run,momentStatus:'skipped'},checkpoint:Date.now()});}}/></View>}
        {running?<Action label="Pausar carrera" onPress={stop} kind="signal"/>:<Action label={busy?'Comprobando GPS…':run?'Reanudar carrera':'Iniciar carrera'} onPress={startOrResume} disabled={!ready||busy} kind="signal"/>}
        {run&&<Action label="Finalizar y guardar" onPress={finish} kind="outline"/>}
        <Text style={s.muted}>En esta versión el GPS necesita la app abierta. Al bloquear el iPhone se pausa la carrera.</Text>
      </>}
      {tab==='Actividad'&&<>
        <View style={s.heading}><Text style={s.micro}>04 / TU EVOLUCIÓN</Text><Text style={s.display}>Actividad.</Text></View>
        <View style={s.segment}>{(['Semana','Diario'] as const).map(x=><Pressable key={x} accessibilityRole="button" accessibilityState={{selected:activityView===x}} onPress={()=>setActivityView(x)} style={[s.segmentItem,activityView===x&&s.segmentSelected]}><Text style={[s.label,activityView===x&&{color:t.paper}]}>{x}</Text></Pressable>)}</View>
        {activityView==='Semana'?<>
          <View style={s.surface}><Text style={s.micro}>DISTANCIA ESTA SEMANA</Text><Text style={s.bigNumber}>{(week.distanceM/1000).toFixed(1)}<Text style={s.smallUnit}> km</Text></Text><WeekChart days={week.days}/><View style={s.divider}/><View style={s.statsRow}><Metric compact value={String(week.count)} label="CARRERAS"/><Metric compact value={formatTime(week.activeMs)} label="TIEMPO"/><Metric compact value={formatPace(week.activeMs,week.distanceM)} label="RITMO"/></View></View>
          <View style={s.signalSurface}><Text style={s.micro}>TU META PERSONAL</Text><Text style={s.h2}>{profile.weeklyKm} km / semana</Text><View style={s.progress}><View style={[s.progressFill,{width:`${progress*100}%`}]}/></View><Text style={s.body}>{progress>=1?'Objetivo alcanzado.':`Te quedan ${Math.max(0,profile.weeklyKm-week.distanceM/1000).toFixed(1)} km para tu objetivo.`}</Text><Action label="Editar objetivo" kind="outline" onPress={openProfile}/></View>
        </>:<>
          <Section title="Tus recuerdos"/>
          <Text style={s.muted}>Tu diario de carreras guardadas en este dispositivo.</Text>
          {data.history.length===0?<View style={s.empty}><FrameMark size={48} color={t.mist}/><Text style={s.h2}>Un diario por escribir.</Text><Action label="Registrar una carrera" onPress={goRun}/></View>:data.history.map(r=><RunCard key={r.id} run={r} onPress={()=>selectRun(r)}/>)}
        </>}
      </>}
      {tab==='Perfil'&&<>
        <View style={s.heading}><Text style={s.micro}>05 / TU ESPACIO</Text><Text style={s.display}>Perfil.</Text></View>
        <View style={s.profileHero}><View style={s.avatarLarge}><Text style={s.avatarBigText}>{profile.name.slice(0,1).toUpperCase()||'R'}</Text></View><Text style={s.h2}>{profile.name||'Tu nombre'}</Text><Text style={s.muted}>Perfil local · Solo tú puedes verlo</Text><Action label="Editar perfil" onPress={openProfile} kind="outline"/></View>
        <View style={s.statsRow}><Metric value={String(data.history.length)} label="CARRERAS"/><Metric value={(total/1000).toFixed(1)} unit="km" label="TOTAL"/><Metric value={formatPace(data.history.reduce((n,r)=>n+r.activeMs,0),total)} label="RITMO"/></View>
        <Pressable onPress={()=>{setActivityView('Diario');setTab('Actividad');}} style={s.surface}><View style={s.spread}><Text style={s.h2}>Mi diario</Text><Text style={s.arrow}>↗</Text></View><Text style={s.muted}>Recupera tus carreras y momentos.</Text></Pressable>
        <View style={s.surface}><Text style={s.h2}>Privacidad</Text><Text style={s.muted}>Tus entrenamientos y tu perfil todavía se guardan en local. No se envían a ningún servidor.</Text></View>
      </>}
    </ScrollView>
    <Nav active={tab} onChange={setTab}/>
    <Modal visible={detail!==null} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setDetail(null)}>
      <SafeAreaView style={s.safe}><View style={s.modalHeader}><Text style={s.micro}>RAW / RECAP</Text><Pressable onPress={()=>setDetail(null)} accessibilityRole="button" style={s.close}><Text style={s.label}>Cerrar</Text></Pressable></View>
      {detail&&<ScrollView contentContainerStyle={s.content}><Text style={s.display}>Tu carrera.</Text><Text style={s.body}>{new Date(detail.startedAt).toLocaleString('es-ES')}</Text><View style={s.feature}><View style={s.spread}><Text style={s.lightMicro}>CARRERA GUARDADA</Text><FrameMark size={38} color={t.signal}/></View><Text style={s.distance}>{(detail.distanceM/1000).toFixed(2)} km</Text><View style={s.darkDivider}/><Text style={s.pace}>{formatTime(detail.activeMs)}</Text><Text style={s.lightMicro}>TIEMPO ACTIVO</Text><Text style={s.pace}>{formatPace(detail.activeMs,detail.distanceM)} /km</Text></View><View style={s.empty}><FrameMark size={48} color={t.mist}/><Text style={s.h2}>Un momento para recordar</Text><Text style={s.muted}>La captura y publicación de fotos llegarán cuando la cámara y las cuentas estén integradas.</Text></View><Action label="Hecho" onPress={()=>setDetail(null)} kind="signal"/></ScrollView>}</SafeAreaView>
    </Modal>
    <Modal visible={editProfile} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setEditProfile(false)}><SafeAreaView style={s.safe}><View style={s.modalHeader}><Text style={s.micro}>MI PERFIL</Text><Pressable accessibilityRole="button" onPress={()=>setEditProfile(false)} style={s.close}><Text style={s.label}>Cancelar</Text></Pressable></View><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"><Text style={s.display}>Tu espacio.</Text><Text style={s.label}>Nombre</Text><TextInput style={s.input} value={nameDraft} onChangeText={setNameDraft} placeholder="Tu nombre" placeholderTextColor={t.mist} maxLength={60}/><Text style={s.label}>Objetivo semanal (km)</Text><TextInput style={s.input} value={goalDraft} onChangeText={setGoalDraft} keyboardType="decimal-pad" maxLength={6}/><Action label="Guardar" onPress={saveProfile} kind="signal"/></ScrollView></SafeAreaView></Modal>
  </SafeAreaView>;
}
