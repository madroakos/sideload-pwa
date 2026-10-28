import { useEffect,useRef,useState } from 'react';
import { GestureEngine,type GestureCallbacks,type Region,type Point } from './engine';
export function useGestures(callbacks:GestureCallbacks,enabled=true) {
  const ref=useRef<HTMLDivElement>(null);
  const current=useRef(callbacks);current.current=callbacks;
  const [region,setRegion]=useState<Region|null>(null);
  const [point,setPoint]=useState<Point>();
  const [back,setBack]=useState(0);
  useEffect(()=>{
    if(!enabled) return;
    const element=ref.current!;
    const engine=new GestureEngine({key:code=>current.current.key(code),hold:zone=>current.current.hold(zone),volume:delta=>current.current.volume?.(delta),feedback:(r,p)=>{setRegion(r);if(p)setPoint(p);},back:setBack},element.clientWidth,element.clientHeight);
    const coordinates=(e:PointerEvent)=>{const r=element.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
    const down=(e:PointerEvent)=>{if(e.button!==0)return;if(engine.down(e.pointerId,coordinates(e),performance.now())) element.setPointerCapture(e.pointerId);};
    const move=(e:PointerEvent)=>engine.move(e.pointerId,coordinates(e));
    const up=(e:PointerEvent)=>{engine.move(e.pointerId,coordinates(e));engine.up(e.pointerId,performance.now());};
    const cancel=(e:PointerEvent)=>engine.cancel(e.pointerId);
    element.addEventListener('pointerdown',down);element.addEventListener('pointermove',move);element.addEventListener('pointerup',up);element.addEventListener('pointercancel',cancel);element.addEventListener('lostpointercapture',cancel);
    const blur=()=>engine.cancel();window.addEventListener('blur',blur);
    const observer=new ResizeObserver(()=>engine.resize(element.clientWidth,element.clientHeight));observer.observe(element);
    return()=>{engine.cancel();observer.disconnect();element.removeEventListener('pointerdown',down);element.removeEventListener('pointermove',move);element.removeEventListener('pointerup',up);element.removeEventListener('pointercancel',cancel);element.removeEventListener('lostpointercapture',cancel);window.removeEventListener('blur',blur);};
  },[enabled]);
  return {ref,region,point,back};
}
