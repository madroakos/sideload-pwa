import { useEffect,useState } from 'react';
import { api,type Status } from '../api/client';
export function useTV() {
  const [status,setStatus]=useState<Status>();
  const [offline,setOffline]=useState(false);
  useEffect(()=>{
    let live=true;
    const refresh=()=>api<Status>('/status').then(data=>{if(live){setStatus(data);setOffline(false);}}).catch(()=>{if(live) setOffline(true);});
    void refresh(); const timer=setInterval(refresh,5000);
    const focus=()=>{void refresh();}; window.addEventListener('focus',focus); document.addEventListener('visibilitychange',focus);
    return ()=>{live=false;clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);};
  },[]);
  return {status,offline,setStatus};
}
