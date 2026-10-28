type Recognizer={start():void;stop():void;abort():void;continuous:boolean;interimResults:boolean;lang:string;
  onresult:((event:{resultIndex:number;results:{length:number;[index:number]:{isFinal:boolean;[index:number]:{transcript:string}}}})=>void)|null;
  onerror:((event:{error:string})=>void)|null;onend:(()=>void)|null};
type RecognizerCtor=new ()=>Recognizer;
export type SpeechSupport='ok'|'insecure'|'unsupported';
export function speechSupport():SpeechSupport {
  const w=window as unknown as {SpeechRecognition?:RecognizerCtor;webkitSpeechRecognition?:RecognizerCtor};
  if(!(w.SpeechRecognition??w.webkitSpeechRecognition)) return window.isSecureContext?'unsupported':'insecure';
  // Safari/Chrome gate the microphone behind a secure context; plain LAN HTTP
  // cannot dictate, regardless of the constructor being present.
  return window.isSecureContext?'ok':'insecure';
}
export function createRecognizer():Recognizer {
  const w=window as unknown as {SpeechRecognition?:RecognizerCtor;webkitSpeechRecognition?:RecognizerCtor};
  return new (w.SpeechRecognition??w.webkitSpeechRecognition)!();
}
