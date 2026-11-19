// Static hosting fallback. The Python server redirects these routes itself.
const path = window.location.pathname;
const reserved = /^\/(?:api|assets|data|scripts|work|node_modules|panel|test|tests)(?:\/|$)/;
if (!reserved.test(path) && !path.split('/').some(part => part.startsWith('.')) && !/\.[^/]+$/.test(path)) {
  window.location.replace('/');
}
