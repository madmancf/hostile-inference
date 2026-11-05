import {isIP} from 'node:net';
import {requestPolicy} from './http-policy.mjs';

function canonical(value){
 if(typeof value!=='string'||value.includes('%'))return null;
 if(value.startsWith('::ffff:')&&isIP(value.slice(7))===4)value=value.slice(7);
 if(isIP(value)===4)return value;
 if(isIP(value)===6)return new URL('http://['+value+']/').hostname.slice(1,-1);
 return null;
}
export function trustedProxies(value=''){
 const ips=value?value.split(',').map(s=>canonical(s.trim())):[];
 if(ips.some(ip=>!ip))throw Error('HI_TRUSTED_PROXIES must contain exact IP addresses');
 return ips;
}
export function clientSource(req,policy){
 const peer=canonical(req.socket?.remoteAddress)||'unknown';
 const trusted=requestPolicy(policy).trustedProxies||[];
 let address=peer;
 // A configured immediate proxy must overwrite this single header. Never trust
 // an arbitrary X-Forwarded-For chain or a visitor-selected origin.
 if(trusted.includes(peer))address=canonical(req.headers['x-real-ip'])||'invalid-proxy-client';
 if(isIP(address)===6){
  const halves=address.split('::'),left=halves[0]?halves[0].split(':'):[],right=halves[1]?halves[1].split(':'):[];
  const words=halves.length===2?[...left,...Array(8-left.length-right.length).fill('0'),...right]:left;
  return words.slice(0,4).map(n=>n.padStart(4,'0')).join(':')+'::/64';
 }
 return address;
}
