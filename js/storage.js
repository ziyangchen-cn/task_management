(function(){
  window.RO = window.RO || {};

  RO.Storage = {
    db: null,
    available: false,
    dbName: 'research_os_data',
    storeName: 'keyval',

    /* ── Open / upgrade ─────────────────────────────────────── */
    init: function(){
      if(RO.Storage.db) return Promise.resolve(true);
      return new Promise(function(resolve){
        if(!window.indexedDB){
          RO.Storage.available = false;
          resolve(false);
          return;
        }
        var req = indexedDB.open(RO.Storage.dbName, 1);
        req.onupgradeneeded = function(e){
          var db = e.target.result;
          if(!db.objectStoreNames.contains(RO.Storage.storeName)){
            db.createObjectStore(RO.Storage.storeName, { keyPath: 'key' });
          }
        };
        req.onsuccess = function(e){
          RO.Storage.db = e.target.result;
          RO.Storage.available = true;
          resolve(true);
        };
        req.onerror = function(){
          console.error('[Storage] init failed', req.error);
          RO.Storage.available = false;
          resolve(false);
        };
      });
    },

    /* ── Low-level store wrapper ─────────────────────────────── */
    _withStore: function(mode, fn){
      return new Promise(function(resolve, reject){
        if(!RO.Storage.available || !RO.Storage.db){
          reject(new Error('Storage DB not available'));
          return;
        }
        var tx = RO.Storage.db.transaction(RO.Storage.storeName, mode);
        var store = tx.objectStore(RO.Storage.storeName);
        var request;
        try{ request = fn(store); }catch(e){ reject(e); return; }
        if(!request){
          tx.oncomplete = function(){ resolve(); };
          tx.onerror   = function(){ reject(tx.error); };
          return;
        }
        request.onsuccess = function(){ resolve(request.result); };
        request.onerror   = function(){ reject(request.error); };
      });
    },

    /* ── Public async API ────────────────────────────────────── */

    /** Returns Promise<value> */
    load: function(key, defaultVal){
      if(!RO.Storage.available){
        try{
          var raw = localStorage.getItem(key);
          return Promise.resolve(raw ? JSON.parse(raw) : defaultVal);
        }catch(e){ return Promise.resolve(defaultVal); }
      }
      return RO.Storage._withStore('readonly', function(store){ return store.get(key); })
        .then(function(record){
          return (record && typeof record.value !== 'undefined') ? record.value : defaultVal;
        })
        .catch(function(){ return defaultVal; });
    },

    /** Returns Promise (fire-and-forget safe) */
    save: function(key, value){
      if(!RO.Storage.available){
        try{ localStorage.setItem(key, JSON.stringify(value)); }
        catch(e){ console.error('[Storage] save (ls fallback)', key, e); }
        return Promise.resolve();
      }
      return RO.Storage._withStore('readwrite', function(store){
        return store.put({ key: key, value: value });
      }).catch(function(e){ console.error('[Storage] save', key, e); });
    },

    /** Returns Promise<{tasks, categories, projects, appState}> */
    loadAll: function(){
      var keys = RO.Constants.STORAGE_KEYS;
      var defaultAppState = { currentDate: RO.DateUtils.todayISO(), lastMigration: null };
      return Promise.all([
        RO.Storage.load(keys.TASKS,      []),
        RO.Storage.load(keys.CATEGORIES, (RO.Constants.DEFAULT_CATEGORIES || []).slice()),
        RO.Storage.load(keys.PROJECTS,   []),
        RO.Storage.load(keys.APP_STATE,  defaultAppState)
      ]).then(function(results){
        return {
          tasks:      results[0],
          categories: results[1],
          projects:   results[2],
          appState:   results[3]
        };
      });
    },

    // Local-only bookkeeping key: records when THIS device last wrote each of
    // the 4 sync keys. Never pushed to Supabase itself -- used only to decide,
    // on the next boot, whether Supabase has a newer copy than what's on disk
    // here (see syncFromRemote below).
    metaKey: 'research_os.syncMeta',

    /** ts must be the exact same timestamp that was just written to Supabase
     *  for these keys (see RO.Sync.pushAll) -- using a separately-taken local
     *  clock reading here would let clock skew of even 1ms make an already
     *  up-to-date device look "stale" on its own data during the next boot's
     *  freshness check. */
    _touchLocalMeta: function(keys, ts){
      return RO.Storage.load(RO.Storage.metaKey, {}).then(function(meta){
        keys.forEach(function(k){ meta[k] = ts; });
        return RO.Storage.save(RO.Storage.metaKey, meta);
      });
    },

    /** Returns Promise (fire-and-forget safe) */
    saveAll: function(state){
      var jobs = [];
      var touchedKeys = [];
      if(state.tasks){      jobs.push(RO.Storage.save(RO.Constants.STORAGE_KEYS.TASKS,      state.tasks));      touchedKeys.push(RO.Constants.STORAGE_KEYS.TASKS); }
      if(state.categories){ jobs.push(RO.Storage.save(RO.Constants.STORAGE_KEYS.CATEGORIES, state.categories)); touchedKeys.push(RO.Constants.STORAGE_KEYS.CATEGORIES); }
      if(state.projects){   jobs.push(RO.Storage.save(RO.Constants.STORAGE_KEYS.PROJECTS,   state.projects));   touchedKeys.push(RO.Constants.STORAGE_KEYS.PROJECTS); }
      if(state.appState){   jobs.push(RO.Storage.save(RO.Constants.STORAGE_KEYS.APP_STATE,  state.appState));   touchedKeys.push(RO.Constants.STORAGE_KEYS.APP_STATE); }
      // Cloud backup, no-op until Supabase is configured (see js/supabase-sync.js).
      // Local meta is only touched once the push confirms the server timestamp,
      // so it never runs (and never matters) when sync isn't configured.
      if(RO.Sync && RO.Sync.available){
        RO.Sync.pushAll(state).then(function(result){
          if(result && result.ok) RO.Storage._touchLocalMeta(touchedKeys, result.updatedAt);
        });
      }
      return Promise.all(jobs);
    },

    /* ── One-time migration from localStorage → IndexedDB ────── */
    /**
     * Called once during init. Checks if data is already in IDB (tasks key
     * present). If not, copies all four keys from localStorage and clears them.
     * Returns Promise<boolean> (true = migration happened).
     */
    migrateFromLocalStorage: function(){
      if(!RO.Storage.available) return Promise.resolve(false);
      var keys = RO.Constants.STORAGE_KEYS;
      // If TASKS record already exists in IDB, migration already happened
      return RO.Storage._withStore('readonly', function(store){ return store.get(keys.TASKS); })
        .then(function(record){
          if(record) return false; // already in IDB, skip

          // Check if localStorage has anything worth migrating
          var lsKeys = [keys.TASKS, keys.CATEGORIES, keys.PROJECTS, keys.APP_STATE];
          var anyData = false;
          var jobs = [];
          lsKeys.forEach(function(lsKey){
            var raw = localStorage.getItem(lsKey);
            if(!raw) return;
            try{
              var value = JSON.parse(raw);
              anyData = true;
              jobs.push(RO.Storage.save(lsKey, value));
            }catch(e){ console.warn('[Storage] migrate parse error', lsKey, e); }
          });

          if(!anyData) return false;

          return Promise.all(jobs).then(function(){
            lsKeys.forEach(function(lsKey){ localStorage.removeItem(lsKey); });
            console.log('[Storage] Migrated data from localStorage → IndexedDB');
            return true;
          });
        })
        .catch(function(e){
          console.error('[Storage] migrateFromLocalStorage failed', e);
          return false;
        });
    },

    /* ── Pull-if-newer from Supabase, on every boot ──────────────────── */
    /**
     * Runs on every boot (not just for brand-new devices): for each of the 4
     * sync keys, compares Supabase's updated_at against this device's own
     * "_touchLocalMeta" timestamp for that key, and pulls the remote copy in
     * only if it's actually newer. This is what makes edits made from one
     * origin (e.g. GitHub Pages) show up when you later open another origin
     * (e.g. localhost) -- the old "only pull if local is totally empty" rule
     * only ever helped the very first boot on a brand-new device.
     * Returns Promise<boolean> (true = at least one key was updated).
     */
    syncFromRemote: function(){
      if(!RO.Storage.available || !RO.Sync || !RO.Sync.available) return Promise.resolve(false);
      var keys = RO.Constants.STORAGE_KEYS;
      return RO.Storage.load(RO.Storage.metaKey, {})
        .then(function(localMeta){
          return RO.Sync.pullAll().then(function(remote){
            var jobs = [];
            var changed = false;
            Object.keys(keys).forEach(function(name){
              var key = keys[name];
              var entry = remote[key];
              if(!entry || typeof entry.value === 'undefined') return;
              var remoteTime = entry.updatedAt || 0;
              var localTime  = localMeta[key] || 0;
              if(remoteTime > localTime){
                jobs.push(RO.Storage.save(key, entry.value));
                localMeta[key] = remoteTime;
                changed = true;
              }
            });
            if(!changed) return false;
            jobs.push(RO.Storage.save(RO.Storage.metaKey, localMeta));
            return Promise.all(jobs).then(function(){
              console.log('[Storage] Pulled newer data from Supabase → IndexedDB');
              return true;
            });
          });
        })
        .catch(function(e){
          console.error('[Storage] syncFromRemote failed', e);
          return false;
        });
    }
  };
})();
