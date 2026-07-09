(function(){
  'use strict';
  window.RO = window.RO || {};

  // Cloud sync layer, kept separate from js/storage.js on purpose: it mirrors
  // the exact same 4-key JSON-blob shape (see supabase/schema.sql), so no
  // other file in the app needs to know sync exists. When RO.SUPABASE_URL /
  // RO.SUPABASE_ANON_KEY are empty (not configured yet), everything below is
  // a no-op and the app behaves exactly as before -- local IndexedDB only.
  var url    = window.RO.SUPABASE_URL || '';
  var anon   = window.RO.SUPABASE_ANON_KEY || '';
  var client = (url && anon && window.supabase) ? window.supabase.createClient(url, anon) : null;

  RO.Sync = {
    available: !!client,
    client: client, // shared client instance, reused by js/supabase-auth.js

    // Last push result, shown in the topbar by RO.UI.renderSyncStatus (see
    // ui-core.js) so you can visually confirm a save actually reached
    // Supabase, instead of having to open the dashboard every time.
    lastSyncAt: null,
    lastSyncOk: null,

    /** Returns Promise<boolean> -- true if this key's upsert succeeded.
     *  ts (ISO string) is shared across a whole pushAll call so every key
     *  lands with the exact same server timestamp -- see pushAll. */
    push: function(key, value, ts){
      if(!client) return Promise.resolve(true);
      return client.from('kv_store')
        .upsert({ key: key, value: value, updated_at: ts }, { onConflict: 'user_id,key' })
        .then(function(res){
          if(res.error){ console.error('[Sync] push failed', key, res.error); return false; }
          return true;
        })
        .catch(function(e){ console.error('[Sync] push error', key, e); return false; });
    },

    /** Returns Promise<{ok, updatedAt}>. All 4 keys are pushed with the same
     *  timestamp on purpose: storage.js records this exact value as "what
     *  Supabase now has" (see RO.Storage._touchLocalMeta), so the next boot's
     *  freshness check compares against the real server timestamp instead of
     *  a separately-taken local clock reading -- two clock reads a millisecond
     *  apart previously made an up-to-date device look "stale" on its own data. */
    pushAll: function(state){
      if(!client) return Promise.resolve({ ok: true, updatedAt: Date.now() });
      var keys = RO.Constants.STORAGE_KEYS;
      var ts = new Date().toISOString();
      return Promise.all([
        RO.Sync.push(keys.TASKS,      state.tasks,      ts),
        RO.Sync.push(keys.CATEGORIES, state.categories, ts),
        RO.Sync.push(keys.PROJECTS,   state.projects,   ts),
        RO.Sync.push(keys.APP_STATE,  state.appState,   ts)
      ]).then(function(results){
        var ok = results.every(function(r){ return r; });
        RO.Sync.lastSyncAt = Date.now();
        RO.Sync.lastSyncOk = ok;
        if(RO.UI && RO.UI.renderSyncStatus) RO.UI.renderSyncStatus();
        return { ok: ok, updatedAt: new Date(ts).getTime() };
      });
    },

    /** Returns Promise<{value, updatedAt}|null> -- updatedAt is a plain ms
     *  timestamp (from Supabase's updated_at column), used by storage.js to
     *  decide whether the remote copy is newer than what's stored locally. */
    pull: function(key){
      if(!client) return Promise.resolve(null);
      return client.from('kv_store').select('value, updated_at').eq('key', key).maybeSingle()
        .then(function(res){
          if(res.error){ console.error('[Sync] pull failed', key, res.error); return null; }
          if(!res.data) return null;
          return { value: res.data.value, updatedAt: new Date(res.data.updated_at).getTime() };
        })
        .catch(function(e){ console.error('[Sync] pull error', key, e); return null; });
    },

    /** Pull all 4 keys, keyed by the actual storage key string (e.g.
     *  "research_os.tasks") so storage.js can loop over RO.Constants.STORAGE_KEYS
     *  directly. Each entry is {value, updatedAt} or null if missing/unavailable. */
    pullAll: function(){
      var keys = RO.Constants.STORAGE_KEYS;
      var list = [keys.TASKS, keys.CATEGORIES, keys.PROJECTS, keys.APP_STATE];
      return Promise.all(list.map(RO.Sync.pull)).then(function(results){
        var out = {};
        list.forEach(function(key, i){ out[key] = results[i]; });
        return out;
      });
    }
  };
})();
