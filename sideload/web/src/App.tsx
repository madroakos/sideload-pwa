import { useEffect,useRef,useState,type ReactNode,type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeft,ArrowUp,ArrowDown,ArrowRight,ChevronUp,ChevronDown,ChevronLeft,ChevronRight,Power,House,Mic,Keyboard,Expand,Settings2,Monitor,Grid2X2,Clapperboard,SlidersHorizontal,Volume2,VolumeX,Play,SkipBack,SkipForward,X,Check,Wifi,RefreshCw,Pin,Plus,ExternalLink,Timer,Radio,GripVertical,CornerDownLeft,Delete } from 'lucide-react';
import { api,getTvBase,setTvBase,tvUrl,type App as TVApp,type MediaItem } from './api/client';
import { useTV } from './state/tv';
import { useSettings,haptic,type Action,type Zone } from './state/settings';
import { useGestures } from './gestures/useGestures';
import { createRecognizer,speechSupport,type SpeechSupport } from './speech';
type Tab='Remote'|'Apps'|'Jellyfin'|'Settings';
type Sheet='holds'|'quick'|'sleep'|'dictation'|null;
const labels:Record<string,string>={DPAD_CENTER:'OK',DPAD_UP:'Up',DPAD_DOWN:'Down',DPAD_LEFT:'Left',DPAD_RIGHT:'Right',ASSIST:'Assistant',HOME:'Home',BACK:'Back',POWER:'Power',VOLUME_UP:'Volume +',VOLUME_DOWN:'Volume −',VOLUME_MUTE:'Mute',TV_INPUT:'TV input',MEDIA_PLAY_PAUSE:'Play / pause',MEDIA_REWIND:'Rewind',MEDIA_FAST_FORWARD:'Fast forward'};
const appColors:Record<string,string>={'Apple TV':'#eee','YouTube':'#ff4c49','SmartTube':'#ec7063','Jellyfin':'#9c8cff','Kodi':'#39b4d9','VLC':'#ef9b41'};
function readHints() {try{return localStorage.getItem('sideload.hintsSeen')==='true';}catch{return false;}}
export function App() {
  const {status,offline,setStatus}=useTV();
  const [tab,setTab]=useState<Tab>('Remote');
  const [onboarding,setOnboarding]=useState(location.pathname==='/onboarding');
  const [gesture,setGesture]=useState(false);
  const [sheet,setSheet]=useState<Sheet>(null);
  const [toast,setToast]=useState('');
  const toastTimer=useRef<ReturnType<typeof setTimeout>>(undefined);
  const [apps,setApps]=useState<{pinned:TVApp[];all:TVApp[]}>({pinned:[],all:[]});
  const [media,setMedia]=useState<{latest:MediaItem[];nextup:MediaItem[]}>({latest:[],nextup:[]});
  const [mediaError,setMediaError]=useState('');
  const [refreshing,setRefreshing]=useState(false);
  const [serverName,setServerName]=useState('');
  const [hints,setHints]=useState(false);
  const settings=useSettings();
  const [appMenu,setAppMenu]=useState<TVApp|null>(null);
  const [sleepUntil,setSleepUntil]=useState<number|null>(null);
  const [clock,setClock]=useState(Date.now());
  const surface=useRef<HTMLDivElement>(null);
  const commandBusy=useRef(false);
  const volumePending=useRef(0);
  const volumeRunning=useRef(false);
  const volumeStop=useRef<ReturnType<typeof setTimeout>>(undefined);
  const [volumeDelta,setVolumeDelta]=useState<number|null>(null);
  const [ip,setIP]=useState('192.168.1.100');
  const [pairStep,setPairStep]=useState<'address'|'code'|'done'>('address');
  const [code,setCode]=useState('');
  const [pairBusy,setPairBusy]=useState(false);
  const [pairError,setPairError]=useState('');
  const doneTimer=useRef<ReturnType<typeof setTimeout>>(undefined);
  const doneHeld=useRef(false);
  const doneOrigin=useRef<{x:number;y:number}>(undefined);
  const pull=useRef<number|null>(null);
  const [pullDistance,setPullDistance]=useState(0);
  const showToast=(message:string)=>{clearTimeout(toastTimer.current);setToast(message);toastTimer.current=setTimeout(()=>setToast(''),3200);};
  const updateStatus=async()=>{try{const next=await api<NonNullable<typeof status>>('/status');setStatus(next);return next;}catch{return undefined;}};
  const loadApps=()=>api<typeof apps>('/apps').then(setApps).catch(error=>showToast(error.message));
  const refreshMedia=async()=>{
    setRefreshing(true);setMediaError('');
    try {
      const [latest,nextup]=await Promise.all([api<{items:MediaItem[]}>('/jellyfin/latest'),api<{items:MediaItem[]}>('/jellyfin/nextup')]);
      setMedia({latest:latest.items,nextup:nextup.items});
    } catch(error) {setMedia({latest:[],nextup:[]});setMediaError((error as Error).message);}
    finally {setRefreshing(false);}
  };
  useEffect(()=>{void loadApps();api<{ok:boolean;serverName?:string}>('/jellyfin/configured').then(info=>setServerName(info.ok ? info.serverName || 'Jellyfin' : '')).catch(()=>{});},[]);
  useEffect(()=>{if(tab==='Jellyfin')void refreshMedia();},[tab]);
  useEffect(()=>{if(status && !status.paired && status.state==='disconnected')setOnboarding(true);if(status?.ip)setIP(status.ip);},[status?.paired,status?.state,status?.ip]);
  const sendKey=async(key:string,quiet=false)=>{
    if(commandBusy.current) return;
    commandBusy.current=true;haptic();
    try {await api('/key',{code:key});if(!quiet)showToast(labels[key] || key);}
    catch(error) {showToast((error as Error).message);}
    finally {commandBusy.current=false;}
  };
  const launch=async(packageName:string)=>{
    haptic(); showToast('Opening app on TV…');
    try {const result=await api<{ok:boolean;confirmed?:boolean}>('/app',{packageName});showToast(result.confirmed===false?'Launch sent — check the TV':'App opened on TV');}
    catch(error) {showToast((error as Error).message);}
  };
  const playItem=async(item:MediaItem)=>{
    haptic(); showToast(`Playing ${item.seriesName||item.name}…`);
    try {await api('/jellyfin/play',{itemId:item.id,kind:item.type==='Series'?'Series':item.type});showToast('Now playing on TV');}
    catch(error) {showToast((error as Error).message);}
  };
  const dispatchVolume=(delta:number)=>{
    // Retain only a small recent intent window; never queue an unbounded drag.
    volumePending.current=Math.max(-5,Math.min(5,volumePending.current+delta));
    if(volumeRunning.current) return;
    volumeRunning.current=true;
    void (async()=>{
      try {
        while(volumePending.current!==0) {
          const step=Math.sign(volumePending.current);volumePending.current-=step;
          haptic();
          await api('/key',{code:step>0?'VOLUME_UP':'VOLUME_DOWN'});
          setVolumeDelta(value=>(value ?? 0)+step);
          clearTimeout(volumeStop.current);volumeStop.current=setTimeout(()=>setVolumeDelta(null),1000);
          await new Promise(resolve=>setTimeout(resolve,80));
        }
      } catch(error) {volumePending.current=0;showToast((error as Error).message);}
      finally {volumeRunning.current=false;}
    })();
  };
  const perform=(action:Action)=>{haptic(16);if(action==='quick'||action==='sleep')setSheet(action);else if(action.startsWith('app:'))void launch(action.slice(4));else void sendKey(action);};
  const gestures=useGestures({key:key=>void sendKey(key),hold:zone=>perform(useSettings.getState().holds[zone]),volume:dispatchVolume},gesture&&!sheet&&!hints);
  // The gesture capture node stays mounted, so its event engine survives overlays.
  // No history entries are pushed in gesture mode: a phone edge gesture must
  // never navigate this site. The in-app back swipe and the Back pill send
  // the TV's back key instead.
  useEffect(()=>()=>{clearTimeout(toastTimer.current);clearTimeout(doneTimer.current);clearTimeout(volumeStop.current);},[]);
  useEffect(()=>{
    const onFullscreen=()=>{if(!document.fullscreenElement && gesture){setSheet(null);setGesture(false);}};
    document.addEventListener('fullscreenchange',onFullscreen);return()=>document.removeEventListener('fullscreenchange',onFullscreen);
  },[gesture]);
  useEffect(()=>{
    if(!sleepUntil)return;
    const timer=setInterval(()=>{setClock(Date.now());if(Date.now()>=sleepUntil){setSleepUntil(null);void sendKey('POWER');}},1000);
    return()=>clearInterval(timer);
  },[sleepUntil]);
  const enterGesture=()=>{
    setGesture(true);
    if(!readHints())setHints(true);
    // Invoked directly in the click to preserve transient user activation.
    const fullscreen=surface.current?.requestFullscreen?.();
    if(fullscreen) void fullscreen.then(()=>{const orientation=screen.orientation as ScreenOrientation & {lock?:(direction:string)=>Promise<void>};return orientation.lock?.('portrait');}).catch(()=>{});
  };
  const exitGesture=()=>{setSheet(null);setGesture(false);if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});};
  // When the PWA runs from GitHub Pages it must talk to the TV's HTTPS port; the
  // TV-hosted copy keeps using its own origin. Nothing is stored anywhere else.
  const normalizeAddress=(value:string)=>{const v=value.trim().replace(/\/+$/,'');return /^https?:\/\//.test(v)?v:`https://${v}`;};
  const pair=async()=>{setPairBusy(true);setPairError('');try{setTvBase(normalizeAddress(ip));await api('/pair',{ip});setPairStep('code');setCode('');}catch(error){setPairError((error as Error).message);}finally{setPairBusy(false);}};
  const submitCode=async()=>{setPairBusy(true);setPairError('');try{await api('/pair/code',{code});await updateStatus();setPairStep('done');}catch(error){setPairError((error as Error).message);setPairStep('address');}finally{setPairBusy(false);}};
  const pin=async(app:TVApp)=>{
    const names=apps.pinned.map(a=>a.packageName);const included=names.includes(app.packageName);
    try{setApps(await api<typeof apps>('/apps/pinned',{packageNames:included?names.filter(n=>n!==app.packageName):[...names,app.packageName]},'PUT'));setAppMenu(null);showToast(included?'Removed from pinned':'Pinned to your remote');}catch(error){showToast((error as Error).message);}
  };
  const reorder=async(index:number,direction:number)=>{
    const names=apps.pinned.map(a=>a.packageName);[names[index],names[index+direction]]=[names[index+direction],names[index]];
    try{setApps(await api<typeof apps>('/apps/pinned',{packageNames:names},'PUT'));}catch(error){showToast((error as Error).message);}
  };
  const connected=status?.state==='ready'&&!offline;
  const statusLabel=offline?'Proxy unavailable':status?.state==='ready'?'Connected':status?.state==='connecting'?'Reconnecting':status?.state==='pairing'?'Pairing':status?.state==='error'?'TV unavailable':'Not paired';
  const pill=<span className={`status ${connected?'ready':offline||status?.state==='error'?'error':''}`}><i/>{statusLabel}</span>;
  const actions:ReactNode=<>{[['BACK','Back',ArrowLeft],['HOME','Home',House],['ASSIST','Assistant',Mic],['keyboard','Keyboard',Keyboard]].map(([key,label,Icon])=>{const Glyph=Icon as typeof House;return <button className="quick-button" key={key as string} disabled={key==='keyboard'} onClick={()=>{if(key==='ASSIST')setSheet('dictation');else void sendKey(key as string);}}><Glyph size={22}/><span>{label as string}{key==='keyboard'&&<small>v1.1</small>}</span></button>;})}</>;
  const holdSheet=<><p className="eyebrow">MAKE IT YOURS</p><h2>Customize hold actions</h2><p className="muted">A long press. Your favorite shortcut.</p>{(['center','top','bottom'] as Zone[]).map(zone=><label className="hold-row" key={zone}><span><strong>Hold {zone}</strong><small>{zone==='center'?'Long-press the OK ring':`Long-press the ${zone==='top'?'upper':'lower'} zone`}</small></span><select aria-label={`Hold ${zone}`} value={settings.holds[zone]} onChange={event=>settings.setHold(zone,event.target.value as Action)}><option value="ASSIST">Voice Assistant</option><option value="HOME">Home</option><option value="quick">Quick settings</option><option value="BACK">Back</option><option value="POWER">Power</option><option value="sleep">Sleep timer</option>{apps.all.map(app=><option key={app.packageName} value={`app:${app.packageName}`}>Open {app.name}</option>)}</select></label>)}<div className="sheet-footer"><button className="text-button" onClick={settings.reset}>Reset defaults</button><button className="primary compact" onClick={()=>setSheet(null)}>Done <Check size={16}/></button></div></>;
  return <div className="app-root">
    <div className="shell">
      <header className="brand"><span className="brand-mark"><Monitor size={19}/></span><strong>sideload<span>®</span></strong><span className="local-label"><Wifi size={12}/> LOCAL CONNECTION</span></header>
      {!status&&!offline?<main className="loading"><RefreshCw className="spin"/>Finding your companion…</main>:onboarding?<main className="onboarding">
        <p className="eyebrow">YOUR PHONE. YOUR TV.</p><h1>{pairStep==='code'?'Look at your TV.':pairStep==='done'?'You’re connected.':'A little closer\nto your TV.'}</h1>
        <p className="muted">{pairStep==='code'?'Enter the six-character code on your TV screen. It can include letters A–F.':pairStep==='done'?'One screen for everything you want to watch. Your remote is ready.':'Pair once. Then tap, swipe, and settle in.'}</p>
        <div className="pair-illustration"><Monitor size={70} strokeWidth={1}/><span>{pairStep==='done'?<Check/>:<Wifi/>}</span></div>
        {pairStep==='address'&&<><label className="input-label">Companion address<input value={ip} autoCapitalize="off" autoCorrect="off" onChange={event=>setIP(event.target.value)} inputMode="url" placeholder="192.168.1.10:8791"/></label><button className="primary full" disabled={pairBusy||offline||!ip.trim()} onClick={()=>void pair()}>{pairBusy?'Contacting companion…':'Pair with TV'}<ArrowRight size={18}/></button><p className="fine">Keep the TV awake and your phone on the same Wi-Fi. First time from this browser? Trust the companion’s local certificate first — the setup guide covers it (Caddy serves HTTPS on port 8791).</p></>}
        {pairStep==='code'&&<><label className="input-label">Pairing code<input className="code-input" autoFocus autoCapitalize="characters" autoComplete="one-time-code" maxLength={6} value={code} onChange={event=>setCode(event.target.value.toUpperCase().replace(/[^0-9A-F]/g,''))} placeholder="······"/></label><button className="primary full" disabled={pairBusy||code.length!==6} onClick={()=>void submitCode()}>{pairBusy?'Connecting…':'Connect remote'}<ArrowRight size={18}/></button><button className="text-button full" disabled={pairBusy} onClick={()=>void api('/pair/cancel',{}).then(()=>{setPairStep('address');void updateStatus();}).catch(error=>setPairError(error.message))}>Cancel pairing</button></>}
        {pairStep==='done'&&<button className="primary full" onClick={()=>{setOnboarding(false);history.replaceState({},'','/');}}>Meet your remote <ArrowRight size={18}/></button>}
        {pairError&&<p role="alert" className="error-message">{pairError}</p>}{offline&&<p role="alert" className="error-message">Companion unavailable. Check your Wi-Fi and proxy.</p>}
        {status?.paired&&pairStep==='address'&&<button className="text-button full" onClick={()=>setOnboarding(false)}>Back to remote</button>}
      </main>:<>
        <main className="main" onPointerDown={event=>{if(tab==='Jellyfin'&&window.scrollY===0)pull.current=event.clientY;}} onPointerMove={event=>{if(pull.current!==null)setPullDistance(Math.min(100,Math.max(0,event.clientY-pull.current)));}} onPointerUp={()=>{if(pullDistance>70)void refreshMedia();pull.current=null;setPullDistance(0);}} onPointerCancel={()=>{pull.current=null;setPullDistance(0);}}>
          <section className="screen-heading"><div><p className="eyebrow">{tab==='Remote'?'THE BEST SEAT IS YOURS':tab==='Apps'?'STRAIGHT TO THE GOOD STUFF':tab==='Jellyfin'?'YOUR LIBRARY, ON THE BIG SCREEN':'JUST THE WAY YOU LIKE IT'}</p><h1>{tab==='Remote'?'TCL Google TV':tab==='Apps'?'Your apps.':tab==='Jellyfin'?'Movie night?':'Settings.'}</h1><div className="connection-line">{pill}<span className="ip">{status?.ip}</span></div></div>{tab==='Remote'?<button className="power-button" aria-label="Power" onClick={()=>void sendKey('POWER')}><Power size={21}/></button>:tab==='Jellyfin'?<button className="icon-button" aria-label="Refresh library" disabled={refreshing} onClick={()=>void refreshMedia()}><RefreshCw className={refreshing?'spin':''} size={20}/></button>:null}</section>
          {(!connected || offline)&&<div className="connection-warning">{offline?'Companion unavailable. Check your Wi-Fi.':status?.lastError||'Wake your TV or pair again in Settings.'}</div>}
          {tab==='Remote'&&<>
            <button className="gesture-cta" onClick={enterGesture}><span className="cta-caption">LESS BUTTONS. MORE CONTROL.</span><Expand className="expand-icon" size={18}/><span className="ok-ring">OK</span><strong>Gesture mode</strong><span>Tap, swipe & hold.<br/>A familiar remote. A whole new feel.</span><span className="enter-label">GO FULLSCREEN <ArrowRight size={14}/></span></button>
            <div className="quick-row">{actions}</div><button className="sheet-link" onClick={()=>setSheet('holds')}><Settings2 size={17}/>Customize hold actions</button>
            <div className="section-label"><h2>One tap away</h2><button className="text-button" onClick={()=>setTab('Apps')}>All apps <ArrowRight size={14}/></button></div>
            <div className="app-grid">{apps.pinned.map(app=><AppTile key={app.packageName} app={app} onLaunch={()=>void launch(app.packageName)} onHold={()=>setAppMenu(app)}/>)}</div>{!apps.pinned.length&&<p className="muted">Pin your favorite apps from the Apps tab.</p>}
            <div className="playback"><button aria-label="Rewind" onClick={()=>void sendKey('MEDIA_REWIND')}><SkipBack size={20}/></button><button aria-label="Play or pause" onClick={()=>void sendKey('MEDIA_PLAY_PAUSE')}><Play size={22}/></button><button aria-label="Fast forward" onClick={()=>void sendKey('MEDIA_FAST_FORWARD')}><SkipForward size={20}/></button><span/><button aria-label="Volume down" onClick={()=>void sendKey('VOLUME_DOWN')}><Volume2 size={18}/>−</button><button aria-label="Volume up" onClick={()=>void sendKey('VOLUME_UP')}><Volume2 size={18}/>+</button></div>
            <p className="bottom-note"><span/>MADE FOR YOUR LIVING ROOM</p>
          </>}
          {tab==='Apps'&&<><p className="muted">Long-press an app to pin it to your remote.</p><div className="section-label"><h2>Pinned</h2><span className="count">{apps.pinned.length}</span></div><div className="app-grid">{apps.pinned.map(app=><AppTile key={app.packageName} app={app} onLaunch={()=>void launch(app.packageName)} onHold={()=>setAppMenu(app)}/>)}</div>{!apps.pinned.length&&<p className="fine">Your favorites will appear here.</p>}<div className="section-label"><h2>All apps</h2><span className="count">{apps.all.length}</span></div><div className="app-grid all-apps">{apps.all.map(app=><AppTile key={app.packageName} app={app} pinned={apps.pinned.some(a=>a.packageName===app.packageName)} onLaunch={()=>void launch(app.packageName)} onHold={()=>setAppMenu(app)}/>)}</div>{apps.pinned.length>1&&<details className="reorder"><summary><GripVertical size={16}/>Arrange pinned apps</summary>{apps.pinned.map((app,index)=><div key={app.packageName}><span>{app.name}</span><button className="icon-button" disabled={index===0} aria-label={`Move ${app.name} earlier`} onClick={()=>void reorder(index,-1)}><ArrowUp size={17}/></button><button className="icon-button" disabled={index===apps.pinned.length-1} aria-label={`Move ${app.name} later`} onClick={()=>void reorder(index,1)}><ArrowDown size={17}/></button></div>)}</details>}<p className="fine">Configured apps only. No TV packages are changed.</p></>}
          {tab==='Jellyfin'&&<><p className="muted">Pick something good. We’ll start it on your TV.</p>{pullDistance>20&&<p className="fine">{pullDistance>70?'Release to refresh':'Pull to refresh'}</p>}{mediaError?<div className="empty-state"><Clapperboard size={40}/><h2>A quiet night in.</h2><p>{mediaError}</p><button className="secondary" onClick={()=>void refreshMedia()}>Try again</button></div>:refreshing&&!media.latest.length?<div className="loading"><RefreshCw className="spin"/>Loading your library…</div>:<><Shelf title="Continue watching" items={media.nextup} onPlay={playItem}/><Shelf title="Recently added" items={media.latest} onPlay={playItem}/>{!media.latest.length&&!media.nextup.length&&<p className="fine">Nothing here yet. Add something to your Jellyfin library.</p>}</>}<p className="fine">Tap a poster to play it on the TV and resume where you left off. If Jellyfin isn’t in front, we’ll bring it up first; shows start your next-up episode.</p></>}
          {tab==='Settings'&&<>
            <div className="settings-card"><p className="eyebrow">TELEVISION</p><div className="settings-row"><Monitor size={24}/><span><strong>TCL Google TV</strong><small>{status?.ip} · Remote protocol v2</small></span></div><div className="settings-row"><span>Connection</span>{pill}</div><button className="secondary full" onClick={()=>{setPairStep('address');setPairError('');setOnboarding(true);}}>Pair a TV <ArrowRight size={16}/></button></div>
            <div className="settings-card"><p className="eyebrow">COMPANION ADDRESS</p><p className="muted">Where this remote finds the TV. Only needed when the app runs from GitHub Pages; the copy the companion serves fills this in itself.</p><label className="input-label">Address<input value={ip} autoCapitalize="off" autoCorrect="off" inputMode="url" onChange={event=>setIP(event.target.value)} placeholder="192.168.1.10:8791"/></label><button className="secondary full" disabled={!ip.trim()} onClick={()=>{setTvBase(normalizeAddress(ip));showToast('Companion address saved');void updateStatus();void loadApps();}}>Save address <Check size={16}/></button><p className="fine">Using {getTvBase()||'this page’s own origin'}. The address never leaves this phone.</p></div>
            <div className="settings-card"><p className="eyebrow">JELLYFIN</p><div className="settings-row"><Clapperboard size={24}/><span><strong>{serverName || 'Not connected'}</strong><small>Managed by your companion proxy</small></span></div><p className="fine">Server address and credentials live in the proxy’s environment file.</p></div>
            <div className="settings-card"><p className="eyebrow">PREFERENCES</p><label className="settings-row"><span><strong>Haptic feedback</strong><small>A little confirmation with every tap</small></span><input className="switch" type="checkbox" checked={settings.haptics} onChange={event=>settings.setHaptics(event.target.checked)}/></label><button className="settings-row text-row" onClick={()=>setSheet('holds')}><span><strong>Hold actions</strong><small>Your shortcuts, your way</small></span><ChevronRight size={18}/></button><button className="settings-row text-row" onClick={()=>{try{localStorage.removeItem('sideload.hintsSeen');}catch{}showToast('Hints will appear next time you open gesture mode.');}}><span>Show gesture hints again</span><RefreshCw size={17}/></button></div>
            <div className="settings-card"><p className="eyebrow">ON YOUR HOME SCREEN</p><p className="muted">Open your browser menu and choose “Add to Home Screen”. {window.isSecureContext?'This secure connection supports the installable offline app.':'This HTTP address works as a remote. Offline installation needs trusted HTTPS; see the setup guide.'}</p></div><p className="fine centered">sideload · local by design<br/>No accounts. Just your living room.</p>
          </>}
        </main>
        <nav className="tabbar" aria-label="Main navigation">{([['Remote',Monitor],['Apps',Grid2X2],['Jellyfin',Clapperboard],['Settings',SlidersHorizontal]] as const).map(([name,Icon])=><button key={name} className={tab===name?'active':''} aria-current={tab===name?'page':undefined} onClick={()=>setTab(name)}><Icon size={21} strokeWidth={1.6}/><span>{name}</span></button>)}</nav>
      </>}
    </div>
    <div className={`gesture-root ${gesture?'visible':''}`} ref={surface} aria-hidden={!gesture} inert={!gesture}>
      <div className="gesture-pad" ref={gestures.ref} aria-label="Gesture remote surface" role="application"/>
      <span className="tv-micro"><i className={connected?'connected':''}/>TCL GOOGLE TV · {statusLabel.toUpperCase()}</span>
      <button className="back-pill" onClick={()=>void sendKey('BACK')}><ChevronLeft size={14}/>BACK</button>
      <button className="done-pill" onPointerDown={event=>{doneHeld.current=false;doneOrigin.current={x:event.clientX,y:event.clientY};event.currentTarget.setPointerCapture(event.pointerId);doneTimer.current=setTimeout(()=>{doneHeld.current=true;haptic(16);setSheet('holds');},550);}} onPointerMove={event=>{if(doneOrigin.current&&Math.hypot(event.clientX-doneOrigin.current.x,event.clientY-doneOrigin.current.y)>10){clearTimeout(doneTimer.current);doneHeld.current=true;}}} onPointerUp={()=>clearTimeout(doneTimer.current)} onPointerCancel={()=>{clearTimeout(doneTimer.current);doneHeld.current=true;}} onClick={()=>{if(!doneHeld.current)exitGesture();}}>Done <X size={14}/></button>
      <span className={`ok-ring-big ${gestures.region==='center'?'pressed':''}`}>OK</span>
      {([['up',ChevronUp],['down',ChevronDown],['left',ChevronLeft],['right',ChevronRight]] as const).map(([region,Icon])=><Icon key={region} className={`chevron ${region} ${gestures.region===region?'lit':''}`} size={26}/>)}
      <span className="volume-strip"><span className="volume-track"><span style={{height:`${status?.volume?.max?status.volume.level/status.volume.max*100:30}%`}}/></span><Volume2 size={16}/></span>
      {volumeDelta!==null&&<div className="volume-osd"><strong>{volumeDelta>0?'+':''}{volumeDelta}</strong><span>VOLUME CHANGE</span></div>}
      <span className="back-peek" style={{width:gestures.back}}><ChevronLeft/><span>BACK</span></span><span className="back-mark"/>
      {gestures.point&&gestures.region&&<span className="touch-ripple" style={{left:gestures.point.x,top:gestures.point.y}}/>}
      <p className="gesture-footer">TAP TO MOVE · HOLD FOR MORE</p>
      {hints&&gesture&&<div className="hints"><p className="eyebrow">GET A FEEL FOR IT</p><h2>Your whole screen.<br/>Your remote.</h2><ol><li><strong>Tap to navigate</strong><span>Center for OK. Around it for directions.</span></li><li><strong>Hold for a shortcut</strong><span>Center: Assistant. Top: quick settings. Bottom: Home.</span></li><li><strong>Slide for volume</strong><span>Drag the right edge up or down.</span></li><li><strong>Swipe to go back</strong><span>Swipe rightward from the left side of the screen. Tap Done to leave.</span></li></ol><button className="primary full" onClick={()=>{setHints(false);try{localStorage.setItem('sideload.hintsSeen','true');}catch{}}}>Got it <Check size={17}/></button></div>}
      {gesture&&sheet&&<SheetFrame close={()=>setSheet(null)}>{sheet==='holds'?holdSheet:sheet==='dictation'?<DictationSheet notify={showToast}/>:renderQuick(sheet)}</SheetFrame>}
      {gesture&&toast&&<div className="toast" role="status">{toast}</div>}
    </div>
    {!gesture&&sheet&&<SheetFrame close={()=>setSheet(null)}>{sheet==='holds'?holdSheet:sheet==='dictation'?<DictationSheet notify={showToast}/>:renderQuick(sheet)}</SheetFrame>}
    {!gesture&&appMenu&&<SheetFrame close={()=>setAppMenu(null)}><p className="eyebrow">APP SHORTCUT</p><h2>{appMenu.name}</h2><button className="primary full" onClick={()=>{void launch(appMenu.packageName);setAppMenu(null);}}>Open on TV <ExternalLink size={17}/></button><button className="secondary full" onClick={()=>void pin(appMenu)}><Pin size={17}/>{apps.pinned.some(a=>a.packageName===appMenu.packageName)?'Unpin app':'Pin to remote'}</button></SheetFrame>}
    {!gesture&&toast&&<div className="toast" role="status">{toast}</div>}
    {sleepUntil&&<div className="sleep-badge"><Timer size={13}/>{Math.max(0,Math.ceil((sleepUntil-clock)/60000))} min<button aria-label="Cancel sleep timer" onClick={()=>{setSleepUntil(null);showToast('Sleep timer cancelled');}}><X size={14}/></button></div>}
  </div>;
  function renderQuick(which:Sheet) {
    return which==='sleep'?<><p className="eyebrow">WIND DOWN</p><h2>Sleep timer</h2><p className="muted">Keep this remote open. When time’s up, we send the power key. Phone sleep can delay it.</p><div className="timer-options">{[15,30,60,90].map(minutes=><button className="secondary" key={minutes} onClick={()=>{setSleepUntil(Date.now()+minutes*60000);setClock(Date.now());setSheet(null);showToast(`Sleep timer: ${minutes} minutes`);}}>{minutes} min</button>)}</div>{sleepUntil&&<button className="text-button full" onClick={()=>{setSleepUntil(null);setSheet(null);}}>Cancel timer</button>}</>:<><p className="eyebrow">A FEW HANDY THINGS</p><h2>Quick settings</h2>{([['Power off','POWER',Power],['Assistant','ASSIST',Mic],['Sleep timer','sleep',Timer],['TV input','TV_INPUT',Radio],['Mute','VOLUME_MUTE',VolumeX]] as const).map(([name,action,Icon])=><button className="quick-setting" key={name} onClick={()=>{if(action==='sleep')setSheet('sleep');else{void sendKey(action);setSheet(null);}}}><Icon size={20}/>{name}<ChevronRight size={17}/></button>)}</>;
  }
}
function SheetFrame({children,close}:{children:ReactNode;close:()=>void}) {
  const ref=useRef<HTMLElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const focusable=()=>Array.from(ref.current!.querySelectorAll<HTMLElement>('button, select, input, [tabindex="0"]')).filter(e=>!e.hasAttribute('disabled'));
    focusable()[0]?.focus();
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();close();}if(event.key==='Tab'){const elements=focusable(),first=elements[0],last=elements[elements.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}};
    document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus();};
  },[]);
  return <div className="sheet-scrim" onClick={close}><section className="sheet" ref={ref} role="dialog" aria-modal="true" aria-label="Remote options" onClick={event=>event.stopPropagation()}><div className="sheet-handle"/><button className="sheet-close icon-button" aria-label="Close options" onClick={close}><X size={20}/></button>{children}</section></div>;
}
function AppTile({app,onLaunch,onHold,pinned=false}:{app:TVApp;onLaunch:()=>void;onHold:()=>void;pinned?:boolean}) {
  const timer=useRef<ReturnType<typeof setTimeout>>(undefined),held=useRef(false),start=useRef({x:0,y:0});
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  const down=(event:ReactPointerEvent)=>{if(event.button!==0)return;held.current=false;start.current={x:event.clientX,y:event.clientY};timer.current=setTimeout(()=>{held.current=true;haptic(16);onHold();},550);};
  return <button className="app-tile" onPointerDown={down} onPointerMove={event=>{if(Math.hypot(event.clientX-start.current.x,event.clientY-start.current.y)>10){clearTimeout(timer.current);held.current=true;}}} onPointerUp={()=>clearTimeout(timer.current)} onPointerLeave={()=>clearTimeout(timer.current)} onPointerCancel={()=>{clearTimeout(timer.current);held.current=true;}} onContextMenu={event=>{event.preventDefault();clearTimeout(timer.current);held.current=true;onHold();}} onClick={()=>{if(!held.current)onLaunch();}}><span className={`app-icon ${app.name.toLowerCase().replace(' ','-')}`} style={{color:appColors[app.name]}}>{app.name==='YouTube'||app.name==='SmartTube'?<Play size={27} fill="currentColor"/>:app.name==='Jellyfin'?<span className="jellyfin-icon">△</span>:app.name==='Apple TV'?<span className="apple-icon">tv<span>+</span></span>:app.name==='Kodi'?<Grid2X2 size={29}/>:<span className="vlc-icon">▲</span>}{pinned&&<Pin className="pin-mark" size={11}/>}</span><span>{app.name}</span></button>;
}
function DictationSheet({notify}:{notify:(message:string)=>void}) {
  const [support]=useState<SpeechSupport>(speechSupport);
  const [text,setText]=useState('');
  const [partial,setPartial]=useState('');
  const [listening,setListening]=useState(false);
  const [busy,setBusy]=useState(false);
  const stopRef=useRef<()=>void>(()=>{});
  useEffect(()=>()=>stopRef.current(),[]);
  const toggle=()=>{
    if(listening) {stopRef.current();setListening(false);return;}
    try {
      const recognizer=createRecognizer();
      recognizer.lang=navigator.language||'en-US';recognizer.continuous=true;recognizer.interimResults=true;
      let committed='';
      recognizer.onresult=event=>{
        let interim='';
        for(let index=event.resultIndex;index<event.results.length;index++) {
          const result=event.results[index];
          if(result.isFinal) committed+=`${result[0].transcript} `;
          else interim+=result[0].transcript;
        }
        setPartial(interim);
        if(committed) {setText(current=>current?`${current.trimEnd()} ${committed.trim()}`:committed.trim());setPartial('');}
      };
      recognizer.onerror=event=>{notify(event.error==='not-allowed'||event.error==='service-not-allowed'?'Microphone permission denied. Allow it for this site.':'Voice recognition failed. Tap the mic and try again.');setListening(false);};
      recognizer.onend=()=>setListening(false);
      recognizer.start();
      stopRef.current=()=>{recognizer.onresult=null;recognizer.onend=null;try{recognizer.stop();}catch{/* already stopped */}};
      setListening(true);
    } catch {notify('Voice recognition could not start.');setListening(false);}
  };
  const typeOnTV=async()=>{
    setBusy(true);
    try {
      const result=await api<{ok:boolean;typed:string;stripped:boolean}>('/text',{text});
      notify(result.stripped?'Typed on TV. Unsupported characters were removed.':'Typed on TV');
    } catch(error) {notify((error as Error).message);}
    finally {setBusy(false);}
  };
  const sendKeyOnTV=async(code:string,message:string)=>{
    try {await api('/key',{code});notify(message);}
    catch(error) {notify((error as Error).message);}
  };
  return <><p className="eyebrow">TALK TO YOUR TV</p><h2>Dictation</h2>
    <p className="muted">Focus a text field on the TV first (for example, search in Jellyfin). Dictate, check the words, then type them over.</p>
    {support!=='ok'&&<p role="alert" className="error-message">{support==='insecure'?'Voice input needs a trusted HTTPS connection. Open this remote over HTTPS (port 8791), then try again.':'This browser does not support voice input.'}</p>}
    <button className={`mic-button ${listening?'active':''}`} onClick={toggle} disabled={support!=='ok'} aria-pressed={listening}><Mic size={26}/><span>{listening?'Listening… tap to stop':'Tap to dictate'}</span></button>
    {partial&&<p className="dictation-partial">{partial}…</p>}
    <textarea className="dictation-text" rows={3} value={text} onChange={event=>setText(event.target.value)} placeholder="Your words appear here. Edit them if needed."/>
    <button className="primary full" disabled={!text.trim()||busy} onClick={()=>void typeOnTV()}><Keyboard size={17}/>Type on TV</button>
    <div className="dictation-row">
      <button className="secondary" onClick={()=>void sendKeyOnTV('DEL','Backspace sent')}><Delete size={16}/>Backspace</button>
      <button className="secondary" onClick={()=>void sendKeyOnTV('ENTER','Enter sent')}><CornerDownLeft size={16}/>Enter</button>
      <button className="secondary" onClick={()=>setText('')}>Clear</button>
    </div>
    <p className="fine">Typed text lands in the focused TV field. Enter submits it — nothing sends itself.</p>
  </>;
}
function Shelf({title,items,onPlay}:{title:string;items:MediaItem[];onPlay:(item:MediaItem)=>void}) {if(!items.length)return null;return <section className="shelf"><div className="section-label"><h2>{title}</h2><span className="count">{items.length}</span></div><div className="poster-row">{items.map(item=><button className="poster" key={item.id} onClick={()=>onPlay(item)}><span className="poster-image">{item.imageTag?<img loading="lazy" src={tvUrl(`/api/jellyfin/images/${encodeURIComponent(item.imageId||item.id)}?tag=${encodeURIComponent(item.imageTag)}`)} alt="" onError={event=>{event.currentTarget.style.display='none';}}/>:null}<Clapperboard size={30}/>{item.progress!==undefined&&<span className="progress"><span style={{width:`${item.progress*100}%`}}/></span>}</span><strong>{item.seriesName||item.name}</strong><small>{item.episodeLabel||item.year||item.name}</small></button>)}</div></section>;}
