// Static hosting fallback. The Python server redirects these routes itself.
const home = typeof document !== 'undefined' && document.currentScript ? new URL('.', document.currentScript.src).pathname : '/';
const path = '/' + window.location.pathname.slice(home.length);
const reserved = /^\/(?:api|assets|data|scripts|work|node_modules|panel|test|tests)(?:\/|$)/;
if (!reserved.test(path) && !path.split('/').some(part => part.startsWith('.')) && !/\.[^/]+$/.test(path)) {
  window.location.replace(home);
}
