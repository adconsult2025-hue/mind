// noop — gate rimosso. I controlli accesso passano da guards Firebase.
window.identity_gate = { enabled:false, init(){}, check(){return true;}, enforce(){return true;} };
