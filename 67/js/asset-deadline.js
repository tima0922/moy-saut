export const VEHICLE_ASSET_TIMEOUT = 40_000;

export async function withAssetDeadline(load, timeout = 14000) {
  let timer;
  try {
    return await Promise.race([load, new Promise((_,reject)=>{
      timer = setTimeout(()=>reject(new Error('Превышено время загрузки ресурса')),timeout);
    })]);
  } finally {
    clearTimeout(timer);
  }
}
