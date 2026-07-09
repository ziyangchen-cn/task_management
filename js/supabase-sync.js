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

    /** Returns Promise<boolean> -- true if this key's upsert succeeded. */
    push: function(key, value){
      if(!client) return Promise.resolve(true);
      return client.from('kv_store')
        .upsert({ key: key, value: value, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' })
        .then(function(res){
          if(res.error){ console.error('[Sync] push failed', key, res.error); return false; }
          return true;
        })
        .catch(function(e){ console.error('[Sync] push error', key, e); return false; });
    },

    pushAll: function(state){
      if(!client) return Promise.resolve();
      var keys = RO.Constants.STORAGE_KEYS;
      return Promise.all([
        RO.Sync.push(keys.TASKS,      state.tasks),
        RO.Sync.push(keys.CATEGORIES, state.categories),
        RO.Sync.push(keys.PROJECTS,   state.projects),
        RO.Sync.push(keys.APP_STATE,  state.appState)
      ]).then(function(results){
        RO.Sync.lastSyncAt = Date.now();
        RO.Sync.lastSyncOk = results.every(function(ok){ return ok; });
        if(RO.UI && RO.UI.renderSyncStatus) RO.UI.renderSyncStatus();
      });
    },

    pull: function(key){
      if(!client) return Promise.resolve(null);
      return client.from('kv_store').select('value').eq('key', key).maybeSingle()
        .then(function(res){
          if(res.error){ console.error('[Sync] pull failed', key, res.error); return null; }
          return res.data ? res.data.value : null;
        })
        .catch(function(e){ console.error('[Sync] pull error', key, e); return null; });
    },

    /** Pull all 4 keys. Values are null for anything missing / unavailable. */
    pullAll: function(){
      if(!client){
        return Promise.resolve({ tasks: null, categories: null, projects: null, appState: null });
      }
      var keys = RO.Constants.STORAGE_KEYS;
      return Promise.all([
        RO.Sync.pull(keys.TASKS),
        RO.Sync.pull(keys.CATEGORIES),
        RO.Sync.pull(keys.PROJECTS),
        RO.Sync.pull(keys.APP_STATE)
      ]).then(function(r){
        return { tasks: r[0], categories: r[1], projects: r[2], appState: r[3] };
      });
    }
  };
})();
