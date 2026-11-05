import {RepairSession} from './game-state.js';

const DB_NAME='garage-life-saves';
const DB_VERSION=1;
const STORE='slots';
export const SAVE_SLOTS=['auto','slot1','slot2','slot3'];
const MAX_BYTES=1024*1024;

// FNV-1a only detects accidental damage, not adversarial tampering.
export function checksum(text){let hash=2166136261;for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16).padStart(8,'0');}
export function validateSave(save){
  if(!save||save.version!==1||!SAVE_SLOTS.includes(save.slot)||!Number.isFinite(save.updatedAt))throw new Error('Неизвестный формат сохранения');
  if(!Number.isFinite(save.elapsed)||save.elapsed<0||save.elapsed>1e8)throw new Error('Повреждено игровое время');
  if(!save.session||typeof save.session!=='object')throw new Error('Повреждённое состояние ремонта');
  new RepairSession().restore(save.session);
  if(!Array.isArray(save.camera)||save.camera.length!==5||save.camera.some(v=>!Number.isFinite(v)||Math.abs(v)>100))
    throw new Error('Некорректная позиция камеры');
  if(!save.settings||!['low','balanced','high'].includes(save.settings.quality)||
     !Number.isFinite(save.settings.sensitivity)||save.settings.sensitivity<.3||save.settings.sensitivity>2)
    throw new Error('Некорректные настройки');
  return save;
}
export function createSave(slot,session,{elapsed=0,camera=[-5.4,1.7,-5.8,0,0],quality='balanced',sensitivity=1,muted=true}={}){
  const save={version:1,slot,updatedAt:Date.now(),appVersion:'0.2.0',session:session.snapshot(),
    elapsed,camera:[...camera],settings:{quality,sensitivity,muted:Boolean(muted)}};
  return validateSave(save);
}
function encode(save){const content=JSON.stringify(validateSave(save));if(content.length>MAX_BYTES)throw new Error('Сохранение слишком большое');return {slot:save.slot,content,hash:checksum(content)};}
function decode(record){if(!record||typeof record.content!=='string'||record.content.length>MAX_BYTES||checksum(record.content)!==record.hash)throw new Error('Контрольная сумма не совпадает');return validateSave(JSON.parse(record.content));}
function openDB(){return new Promise((resolve,reject)=>{
  if(typeof indexedDB==='undefined')return reject(new Error('IndexedDB недоступна'));
  const r=indexedDB.open(DB_NAME,DB_VERSION);
  r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:'slot'});};
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('IndexedDB error'));
  r.onblocked=()=>reject(new Error('IndexedDB заблокирована другим окном'));
});}
function txRequest(db,method,...args){return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,method==='put'||method==='delete'?'readwrite':'readonly');
  const request=tx.objectStore(STORE)[method](...args);
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  tx.onerror=()=>reject(tx.error);
});}
/** IndexedDB first; localStorage fallback for restricted WebViews. */
export class SaveStore {
  constructor({idb=true,storage=typeof localStorage!=='undefined'?localStorage:null}={}){this.idb=idb;this.storage=storage;this.db=null;this.backend='unknown';}
  async init(){
    if(this.backend!=='unknown')return this.backend;
    if(this.idb&&typeof indexedDB!=='undefined')try{this.db=await openDB();this.backend='indexeddb';return this.backend;}catch(e){console.warn('IndexedDB unavailable, trying localStorage',e);}
    if(this.storage)try{const key='garage-life-storage-check';this.storage.setItem(key,'1');this.storage.removeItem(key);this.backend='localstorage';return this.backend;}catch(e){console.warn('No persistent storage available',e);}
    this.backend='unavailable';return this.backend;
  }
  async _get(slot){await this.init();if(this.backend==='indexeddb')return txRequest(this.db,'get',slot);
    if(this.backend==='localstorage'){const v=this.storage.getItem(`garage-life:${slot}`);return v?JSON.parse(v):null;}
    throw new Error('Сохранения недоступны: нет места или разрешения на запись');}
  async _put(record){await this.init();if(this.backend==='indexeddb')return txRequest(this.db,'put',record);
    if(this.backend==='localstorage')return this.storage.setItem(`garage-life:${record.slot}`,JSON.stringify(record));
    throw new Error('Нет доступного хранилища');}
  async write(slot,save){if(!SAVE_SLOTS.includes(slot))throw new Error('Неизвестный слот');
    return this._put(encode({...save,slot}));}
  async read(slot){if(!SAVE_SLOTS.includes(slot))throw new Error('Неизвестный слот');const rec=await this._get(slot);return rec?decode(rec):null;}
  async list(){const slots=[];for(const slot of SAVE_SLOTS){try{const save=await this.read(slot);if(save)slots.push({slot,updatedAt:save.updatedAt,jobId:save.session.jobId,mode:save.session.mode,progress:save.session.actionOrder.length,completed:save.session.completedSteps.length});}
    catch(error){slots.push({slot,corrupted:true,error:error.message});}}
    return slots;}
  async remove(slot){if(!SAVE_SLOTS.includes(slot))throw new Error('Неизвестный слот');await this.init();
    if(this.backend==='indexeddb')return txRequest(this.db,'delete',slot);
    if(this.backend==='localstorage')return this.storage.removeItem(`garage-life:${slot}`);
    throw new Error('Хранилище недоступно');}
  async exportSlot(slot){const save=await this.read(slot);if(!save)throw new Error('Пустой слот');return JSON.stringify(save,null,2);}
  async importSlot(slot,text){if(typeof text!=='string'||text.length>MAX_BYTES)throw new Error('Файл слишком большой');
    const save=validateSave(JSON.parse(text));return this.write(slot,{...save,slot,updatedAt:Date.now()});}
}
