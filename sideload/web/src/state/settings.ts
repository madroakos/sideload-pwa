import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export type Zone='center'|'top'|'bottom';
export type Action='ASSIST'|'HOME'|'quick'|'BACK'|'POWER'|'sleep'|`app:${string}`;
export const defaults:Record<Zone,Action>={center:'ASSIST',top:'quick',bottom:'HOME'};
interface Settings {haptics:boolean;holds:Record<Zone,Action>;setHaptics:(value:boolean)=>void;setHold:(zone:Zone,value:Action)=>void;reset:()=>void}
export const useSettings=create<Settings>()(persist(set=>({haptics:true,holds:{...defaults},setHaptics:haptics=>set({haptics}),setHold:(zone,value)=>set(state=>({holds:{...state.holds,[zone]:value}})),reset:()=>set({holds:{...defaults}})}),{name:'sideload.settings'}));
export function haptic(ms=8) {if(useSettings.getState().haptics) navigator.vibrate?.(ms);}
