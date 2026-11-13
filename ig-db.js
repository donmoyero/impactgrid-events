/* ════════════════════════════════════════════════════
   ig-db.js — drop-in replacement for the Firebase Firestore browser SDK.

   The browser no longer talks to Firestore. Every call goes to the ImpactGrid API
   (/api/db/admin for the admin, /api/db/owner for read-only owner stats), which checks
   the Supabase login on the server. Firestore rules can therefore be "deny all".

   Supports exactly what the site uses:
     db.collection(c).where(f,op,v).orderBy(f,dir).limit(n).get()
     db.collection(c).add(data) / .doc(id).get() / .set(data,opts) / .update(data) / .delete()
     snapshot: .docs  .empty  .size  .forEach   doc: .id  .data()  .exists
   Timestamps come back as objects with toDate() / toMillis() / seconds, like Firestore's.
════════════════════════════════════════════════════ */
(function(){
  var API = (typeof EVENTS_API !== 'undefined' && EVENTS_API) || 'https://impactgrid-events-api.onrender.com';

  async function authHeader(){
    try{
      if(typeof getSupabase !== 'function') return {};
      var r = await getSupabase().auth.getSession();
      var t = r && r.data && r.data.session ? r.data.session.access_token : null;
      return t ? { 'Authorization': 'Bearer ' + t } : {};
    }catch(e){ return {}; }
  }

  function Ts(ms){ this._ms = ms; this.seconds = Math.floor(ms/1000); this.nanoseconds = (ms%1000)*1e6; }
  Ts.prototype.toDate   = function(){ return new Date(this._ms); };
  Ts.prototype.toMillis = function(){ return this._ms; };
  Ts.prototype.valueOf  = function(){ return this._ms; };

  function decode(v){            /* API → page */
    if(v && typeof v === 'object'){
      if(Array.isArray(v)) return v.map(decode);
      if(typeof v.__ts === 'number') return new Ts(v.__ts);
      var o = {}; for(var k in v) o[k] = decode(v[k]); return o;
    }
    return v;
  }
  function encode(v){            /* page → API */
    if(v && typeof v === 'object'){
      if(v.__sv) return { __sv: true };
      if(v instanceof Ts) return { __ts: v._ms };
      if(v instanceof Date) return { __ts: v.getTime() };
      if(Array.isArray(v)) return v.map(encode);
      var o = {}; for(var k in v){ if(v[k] !== undefined) o[k] = encode(v[k]); } return o;
    }
    return v;
  }

  async function call(path, body){
    var h = Object.assign({ 'Content-Type': 'application/json' }, await authHeader());
    var res = await fetch(API + path, { method: 'POST', headers: h, body: JSON.stringify(body) });
    var json = null; try{ json = await res.json(); }catch(e){}
    if(!res.ok){
      var err = new Error((json && json.error) || ('Request failed (' + res.status + ')'));
      err.status = res.status; throw err;
    }
    return json || {};
  }

  function mkDoc(col, d){
    return { id: d.id, exists: true, data: function(){ return d.data; }, ref: { id: d.id, path: col + '/' + d.id } };
  }
  function mkSnap(col, docs){
    var arr = docs.map(function(d){ return mkDoc(col, { id: d.id, data: decode(d.data) }); });
    return { docs: arr, empty: arr.length === 0, size: arr.length, forEach: function(fn){ arr.forEach(fn); } };
  }

  function Query(col, endpoint, state){ this._c = col; this._e = endpoint; this._s = state || { where: [], orderBy: [], limit: null }; }
  Query.prototype._with = function(patch){
    var s = { where: this._s.where.slice(), orderBy: this._s.orderBy.slice(), limit: this._s.limit };
    for(var k in patch) s[k] = patch[k];
    return new Query(this._c, this._e, s);
  };
  Query.prototype.where   = function(f, op, v){ return this._with({ where: this._s.where.concat([[f, op, encode(v)]]) }); };
  Query.prototype.orderBy = function(f, dir){ return this._with({ orderBy: this._s.orderBy.concat([[f, dir || 'asc']]) }); };
  Query.prototype.limit   = function(n){ return this._with({ limit: n }); };
  Query.prototype.get     = async function(){
    var body = { op: 'query', col: this._c, where: this._s.where, orderBy: this._s.orderBy, limit: this._s.limit };
    var r = await call(this._e, body);
    return mkSnap(this._c, r.docs || []);
  };

  function Collection(col, endpoint){ Query.call(this, col, endpoint); }
  Collection.prototype = Object.create(Query.prototype);
  Collection.prototype.constructor = Collection;
  Collection.prototype.add = async function(data){
    var r = await call(this._e, { op: 'add', col: this._c, data: encode(data) });
    return { id: r.id };
  };
  Collection.prototype.doc = function(id){
    var col = this._c, ep = this._e;
    return {
      id: id,
      get: async function(){
        var r = await call(ep, { op: 'get', col: col, id: id });
        if(!r.exists) return { id: id, exists: false, data: function(){ return undefined; } };
        return mkDoc(col, { id: r.id, data: decode(r.data) });
      },
      set:    async function(data, opts){ await call(ep, { op: 'set', col: col, id: id, data: encode(data), merge: !!(opts && opts.merge) }); },
      update: async function(data){ await call(ep, { op: 'update', col: col, id: id, data: encode(data) }); },
      delete: async function(){ await call(ep, { op: 'delete', col: col, id: id }); }
    };
  };

  window.igServerTimestamp = function(){ return { __sv: true }; };
  /* admin: full read/write (server checks the admin login) */
  window.igAdminDb = { collection: function(c){ return new Collection(c, '/api/db/admin'); } };
  /* signed-in owner: read-only, own events only (server enforces) */
  window.igOwnerDb = { collection: function(c){ return new Collection(c, '/api/db/owner'); } };
})();
