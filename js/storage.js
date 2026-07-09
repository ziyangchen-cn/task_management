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

    /** Returns Promise (fire-and-forget safe) */
    saveAll: function(state){
      var jobs = [];
      if(state.tasks)      jobs.push(RO.Storage.save(RO.Constants.STORAGE_KEYS.TASKS,      state.tasks));
      if(state.categories) jobs.push(RO.Storage.save(RO.Constants.STORAGE_KEYS.CATEGORIES, state.categories));
      if(state.projects)   jobs.push(RO.Storage.save(RO.Constants.STORAGE_KEYS.PROJECTS,   state.projects));
      if(state.appState)   jobs.push(RO.Storage.save(RO.Constants.STORAGE_KEYS.APP_STATE,  state.appState));
      // Cloud backup, no-op until Supabase is configured (see js/supabase-sync.js).
      // Runs alongside the local save, never blocks or fails the local write.
      if(RO.Sync && RO.Sync.available) RO.Sync.pushAll(state);
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

    /* ── One-time pull from Supabase on a brand-new device/browser ──── */
    /**
     * If this device's IndexedDB has no data yet, and Supabase is configured
     * (RO.Sync.available), pull the last-synced copy down and seed IndexedDB
     * with it. Same "only if local is empty" rule as migrateFromLocalStorage,
     * so an existing device with real local data is never overwritten by a
     * stale remote copy. Returns Promise<boolean> (true = data was pulled).
     */
    migrateFromRemote: function(){
      if(!RO.Storage.available || !RO.Sync || !RO.Sync.available) return Promise.resolve(false);
      var keys = RO.Constants.STORAGE_KEYS;
      return RO.Storage._withStore('readonly', function(store){ return store.get(keys.TASKS); })
        .then(function(record){
          if(record) return false; // local already has data, skip

          return RO.Sync.pullAll().then(function(remote){
            if(!remote.tasks && !remote.categories && !remote.projects && !remote.appState) return false;

            var jobs = [];
            if(remote.tasks)      jobs.push(RO.Storage.save(keys.TASKS,      remote.tasks));
            if(remote.categories) jobs.push(RO.Storage.save(keys.CATEGORIES, remote.categories));
            if(remote.projects)   jobs.push(RO.Storage.save(keys.PROJECTS,   remote.projects));
            if(remote.appState)   jobs.push(RO.Storage.save(keys.APP_STATE,  remote.appState));
            return Promise.all(jobs).then(function(){
              console.log('[Storage] Pulled data from Supabase → IndexedDB');
              return true;
            });
          });
        })
        .catch(function(e){
          console.error('[Storage] migrateFromRemote failed', e);
          return false;
        });
    }
  };
})();
