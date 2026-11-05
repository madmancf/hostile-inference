// The local preview keeps its existing origin contract. Release hosts pass an
// explicit policy; untrusted forwarded headers never choose the public origin.
export function requestPolicy(value) {
 if (typeof value === 'number') return {origins:[`http://127.0.0.1:${value}`,`http://localhost:${value}`],secureCookies:false};
 if (!value || !Array.isArray(value.origins) || !value.origins.length) throw Error('Explicit request origins required');
 return value;
}
export function allowedRequest(req, value, header) {
 const policy=requestPolicy(value);
 return (!req.headers.origin || policy.origins.includes(req.headers.origin)) && req.headers['sec-fetch-site']!=='cross-site' && req.headers['x-hi-client']===header;
}
