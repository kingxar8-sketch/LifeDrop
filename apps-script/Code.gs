/**
 * LifeDrop – Google Sheet backend (Google Apps Script web app)
 * Tabs (created automatically): Donors, Requests, Users.
 * Every call must carry a Google sign-in token; it is verified with Google, so nobody can write as someone else.
 */
const CLIENT_ID = "PASTE_YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com"; // same ID as GOOGLE_CLIENT_ID in index.html

const TABS = {
  Donors:   ["uid","name","phone","hidePhone","city","group","available","count","last","bio","lat","lng","updated"],
  Requests: ["id","uid","patient","group","don","units","urg","hospital","city","addr","phone","lat","lng","at","open"],
  Users:    ["uid","email","name","profile","updated"]
};
const NUM = {count:1,last:1,lat:1,lng:1,at:1,units:1,updated:1};   // numeric columns; everything else is stored as text
const BOOL = {hidePhone:1,available:1,open:1};
const MAX_REQ_PER_HOUR = 5;

function out_(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet(){ return out_({ok:true,app:"LifeDrop"}); }

function doPost(e){
  const lock = LockService.getScriptLock();
  try{
    const b = JSON.parse(e.postData.contents);
    const u = verify_(b.token);
    if(!u) return out_({error:"auth"});
    lock.waitLock(20000);
    switch(b.action){
      case "list":          return out_(list_());
      case "me":            return out_({profile:me_(u)});
      case "saveProfile":   return out_(saveProfile_(u,b.profile||{}));
      case "addRequest":    return out_(addRequest_(u,b.request||{}));
      case "closeRequest":  return out_(closeRequest_(u,String(b.id)));
      case "deleteAccount": return out_(deleteAccount_(u));
    }
    return out_({error:"unknown action"});
  }catch(err){ return out_({error:String(err && err.message || err)}); }
  finally{ try{lock.releaseLock();}catch(_){} }
}

/* ---------- sign-in token check ---------- */
function verify_(token){
  if(!token) return null;
  const cache = CacheService.getScriptCache();
  const key = "t" + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
  const hit = cache.get(key);
  if(hit) return JSON.parse(hit);
  const r = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(token), {muteHttpExceptions:true});
  if(r.getResponseCode() !== 200) return null;
  const j = JSON.parse(r.getContentText());
  const left = Number(j.exp) - Math.floor(Date.now()/1000);
  if(j.aud !== CLIENT_ID || String(j.email_verified) !== "true" || !(left > 0)) return null;
  const u = {uid:String(j.sub), email:j.email||"", name:j.name||""};
  cache.put(key, JSON.stringify(u), Math.max(1, Math.min(300, left)));
  return u;
}

/* ---------- sheet helpers ---------- */
function sheet_(name){
  const ss = SpreadsheetApp.getActiveSpreadsheet(), cols = TABS[name];
  let sh = ss.getSheetByName(name);
  if(!sh){
    sh = ss.insertSheet(name);
    sh.getRange(1,1,1,cols.length).setValues([cols]).setFontWeight("bold");
    sh.setFrozenRows(1);
    cols.forEach(function(c,i){ if(!NUM[c] && !BOOL[c]) sh.getRange(1,i+1,sh.getMaxRows(),1).setNumberFormat("@"); }); // text: keeps 0171… and long IDs intact
  }
  return sh;
}
function all_(name){
  const sh = sheet_(name), cols = TABS[name], v = sh.getDataRange().getValues(), rows = [];
  for(let i=1;i<v.length;i++){
    const o = {_row:i+1};
    cols.forEach(function(c,j){
      let x = v[i][j];
      if(BOOL[c]) x = (x===true || String(x).toLowerCase()==="true");
      else if(NUM[c]) x = (x===""||x===null) ? null : Number(x);
      else x = (x===null||x===undefined) ? "" : String(x);
      o[c] = x;
    });
    rows.push(o);
  }
  return rows;
}
function put_(name, key, obj){          // insert or update the row whose first column equals key
  const sh = sheet_(name), cols = TABS[name];
  const line = cols.map(function(c){ const x = obj[c]; return x===undefined||x===null ? "" : x; });
  const hit = all_(name).filter(function(r){ return r[cols[0]]===String(key); })[0];
  const row = hit ? hit._row : sh.getLastRow()+1;
  cols.forEach(function(c,i){ if(!NUM[c] && !BOOL[c]) sh.getRange(row,i+1).setNumberFormat("@"); }); // set text format BEFORE writing so 0171… keeps its zero
  sh.getRange(row,1,1,cols.length).setValues([line]);
}
function dropWhere_(name, col, val){
  const sh = sheet_(name), rows = all_(name);
  for(let i=rows.length-1;i>=0;i--) if(rows[i][col]===String(val)) sh.deleteRow(rows[i]._row);
}
const s_ = function(x,n){ return String(x==null?"":x).slice(0,n||120); };
const clean_ = function(o){ delete o._row; return o; };

/* ---------- actions ---------- */
function list_(){
  const donors = all_("Donors").map(clean_);
  const requests = all_("Requests").map(clean_).sort(function(a,b){return (b.at||0)-(a.at||0);}).slice(0,200);
  return {donors:donors, requests:requests};
}
function me_(u){
  const r = all_("Users").filter(function(x){return x.uid===u.uid;})[0];
  if(!r || !r.profile) return null;
  try{ return JSON.parse(r.profile); }catch(e){ return null; }
}
function saveProfile_(u,p){
  const hist = Array.isArray(p.history) ? p.history.slice(0,500) : [];
  const last = Math.max(Number(p.last)||0, hist.reduce(function(m,h){return Math.max(m,Number(h&&h.at)||0);},0));
  const prof = {name:s_(p.name,80),phone:s_(p.phone,30),city:s_(p.city,80),group:s_(p.group,4),available:!!p.available,hidePhone:!!p.hidePhone,
                bio:s_(p.bio,300),lat:p.lat==null?null:Number(p.lat),lng:p.lng==null?null:Number(p.lng),count:Number(p.count)||0,last:last,history:hist};
  put_("Users", u.uid, {uid:u.uid,email:u.email,name:prof.name,profile:JSON.stringify(prof),updated:Date.now()});
  if(prof.name && prof.phone && prof.group){
    put_("Donors", u.uid, {uid:u.uid,name:prof.name,phone:prof.hidePhone?"":prof.phone,hidePhone:prof.hidePhone,city:prof.city,group:prof.group,
      available:prof.available,count:prof.count,last:last,bio:prof.bio,lat:prof.lat,lng:prof.lng,updated:Date.now()});
  } else dropWhere_("Donors","uid",u.uid);
  return {ok:true};
}
function addRequest_(u,r){
  const hourAgo = Date.now()-3600000;
  const recent = all_("Requests").filter(function(x){return x.uid===u.uid && x.at>hourAgo;}).length;
  if(recent >= MAX_REQ_PER_HOUR) return {error:"Too many requests – try again later"};
  if(!r.patient || !r.hospital || !r.group || !r.phone) return {error:"Missing details"};
  const req = {id:Utilities.getUuid().slice(0,8),uid:u.uid,patient:s_(r.patient,80),group:s_(r.group,4),don:s_(r.don,30),units:Number(r.units)||1,
    urg:["Critical","Urgent","Scheduled"].indexOf(r.urg)>-1?r.urg:"Urgent",hospital:s_(r.hospital,100),city:s_(r.city,80),addr:s_(r.addr,160),
    phone:s_(r.phone,30),lat:r.lat==null?null:Number(r.lat),lng:r.lng==null?null:Number(r.lng),at:Date.now(),open:true};
  put_("Requests", req.id, req);
  return {request:req};
}
function closeRequest_(u,id){
  const r = all_("Requests").filter(function(x){return x.id===id;})[0];
  if(!r) return {error:"Not found"};
  if(r.uid!==u.uid) return {error:"Not allowed"};
  sheet_("Requests").getRange(r._row, TABS.Requests.indexOf("open")+1).setValue(false);
  return {ok:true};
}
function deleteAccount_(u){
  dropWhere_("Requests","uid",u.uid); dropWhere_("Donors","uid",u.uid); dropWhere_("Users","uid",u.uid);
  return {ok:true};
}
