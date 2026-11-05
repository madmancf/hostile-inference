import {MODEL_ASSETS} from './model-asset-keys.js';

export const MODEL_CACHE = 'hostile-inference-models-v1';
const sha256 = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');

// The HTTP cache may decline large GLBs even with immutable headers. Keep one
// current set in Cache Storage, independent of the release URL. No game state,
// account data, parsed scenes or GPU resources are stored here.
export async function createModelCache(baseURL, {assets=MODEL_ASSETS, storage, fetcher=globalThis.fetch}={}) {
 const base = new URL(baseURL), key = asset => new URL('/__hi-model-cache/v1/' + asset.sha256, base).href;
 let cache;
 try {
  cache = await (storage === undefined ? globalThis.caches : storage)?.open(MODEL_CACHE);
  if (cache) {
   const keep = new Set(Object.values(assets).map(key));
   for (const request of await cache.keys()) if (!keep.has(request.url)) await cache.delete(request);
  }
 } catch { cache = null; } // Private/denied/full storage must not prevent play.
 const pending = new Map();
 const valid = async (bytes, asset) => bytes.byteLength === asset.bytes && await sha256(bytes) === asset.sha256;
 const read = async file => {
  const asset = assets[file], url = new URL(file, base).href;
  // Developer-only original models have no runtime cache entry.
  if (cache && asset) {
   try {
    const response = await cache.match(key(asset));
    if (response) {
     const bytes = await response.arrayBuffer();
     if (await valid(bytes, asset)) return bytes;
     await cache.delete(key(asset));
    }
   } catch { /* Fall back to the network after a failed cache read. */ }
  }
  const response = await fetcher(url);
  if (!response.ok) throw Error('Unable to download ' + file + ' (' + response.status + ').');
  const bytes = await response.arrayBuffer();
  if (asset && !await valid(bytes, asset)) throw Error('Incomplete or outdated model: ' + file + '. Reload to retry.');
  if (cache && asset) {
   try {
    await cache.put(key(asset), new Response(bytes, {headers:{'Content-Type':'model/gltf-binary','Content-Length':String(bytes.byteLength)}}));
   } catch { /* Quota failures are optional-cache failures, not asset failures. */ }
  }
  return bytes;
 };
 return {
  load(file) {
   if (!pending.has(file)) {
    const request = read(file).finally(() => pending.delete(file));
    pending.set(file, request);
   }
   return pending.get(file);
  }
 };
}
