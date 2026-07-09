(function(){
  window.RO = window.RO || {};

  RO.ImageStore = {
    db: null,
    available: false,
    dbName: 'research_os_images',
    storeName: 'images',

    init: function(){
      return new Promise(function(resolve){
        if(!window.indexedDB){
          RO.ImageStore.available = false;
          resolve(false);
          return;
        }

        var req = indexedDB.open(RO.ImageStore.dbName, 1);
        req.onupgradeneeded = function(e){
          var db = e.target.result;
          if(!db.objectStoreNames.contains(RO.ImageStore.storeName)){
            db.createObjectStore(RO.ImageStore.storeName, { keyPath: 'id' });
          }
        };
        req.onsuccess = function(e){
          RO.ImageStore.db = e.target.result;
          RO.ImageStore.available = true;
          resolve(true);
        };
        req.onerror = function(){
          console.error('ImageStore init failed', req.error);
          RO.ImageStore.available = false;
          resolve(false);
        };
      });
    },

    withStore: function(mode, fn){
      return new Promise(function(resolve, reject){
        if(!RO.ImageStore.available || !RO.ImageStore.db){
          reject(new Error('IndexedDB image store is not available'));
          return;
        }
        var tx = RO.ImageStore.db.transaction(RO.ImageStore.storeName, mode);
        var store = tx.objectStore(RO.ImageStore.storeName);
        var request;
        try{
          request = fn(store);
        }catch(e){
          reject(e);
          return;
        }
        if(!request){
          tx.oncomplete = function(){ resolve(); };
          tx.onerror = function(){ reject(tx.error); };
          return;
        }
        request.onsuccess = function(){ resolve(request.result); };
        request.onerror = function(){ reject(request.error); };
      });
    },

    dataUrlToBlob: function(dataUrl){
      var parts = String(dataUrl || '').split(',');
      var meta = parts[0] || '';
      var base64 = parts[1] || '';
      var match = meta.match(/data:([^;]+);base64/);
      var type = match ? match[1] : 'image/jpeg';
      var binary = atob(base64);
      var len = binary.length;
      var bytes = new Uint8Array(len);
      for(var i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: type });
    },

    blobToDataUrl: function(blob){
      return new Promise(function(resolve, reject){
        var reader = new FileReader();
        reader.onload = function(){ resolve(String(reader.result || '')); };
        reader.onerror = function(){ reject(reader.error); };
        reader.readAsDataURL(blob);
      });
    },

    makeImageId: function(){
      return 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    },

    saveDataUrl: function(dataUrl, existingId){
      if(!dataUrl) return Promise.resolve('');
      if(!RO.ImageStore.available){
        return Promise.reject(new Error('IndexedDB image store is not available'));
      }
      var blob;
      try{
        blob = RO.ImageStore.dataUrlToBlob(dataUrl);
      }catch(e){
        return Promise.reject(e);
      }
      var record = {
        id: existingId || RO.ImageStore.makeImageId(),
        blob: blob,
        type: blob.type || 'image/jpeg',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      return RO.ImageStore.withStore('readwrite', function(store){ return store.put(record); }).then(function(){
        return record.id;
      });
    },

    getRecord: function(imageId){
      if(!imageId) return Promise.resolve(null);
      return RO.ImageStore.withStore('readonly', function(store){ return store.get(imageId); }).catch(function(e){
        console.error('ImageStore getRecord failed', e);
        return null;
      });
    },

    getDataUrl: function(imageId){
      return RO.ImageStore.getRecord(imageId).then(function(record){
        if(!record || !record.blob) return '';
        return RO.ImageStore.blobToDataUrl(record.blob);
      });
    },

    deleteImage: function(imageId){
      if(!imageId || !RO.ImageStore.available) return Promise.resolve();
      return RO.ImageStore.withStore('readwrite', function(store){ return store.delete(imageId); }).catch(function(e){
        console.warn('ImageStore delete failed', e);
      });
    },

    getAllRecords: function(){
      if(!RO.ImageStore.available) return Promise.resolve([]);
      return RO.ImageStore.withStore('readonly', function(store){ return store.getAll(); }).catch(function(e){
        console.error('ImageStore getAll failed', e);
        return [];
      });
    },

    clear: function(){
      if(!RO.ImageStore.available) return Promise.resolve();
      return RO.ImageStore.withStore('readwrite', function(store){ return store.clear(); });
    },

    getUsedImageIds: function(){
      var ids = [];
      (RO.Data.projects || []).forEach(function(project){
        (project.results || []).forEach(function(result){
          if(result.imageId && ids.indexOf(result.imageId) < 0) ids.push(result.imageId);
        });
      });
      (RO.Data.categories || []).forEach(function(category){
        (category.derivations || []).forEach(function(entry){
          (entry.figures || []).forEach(function(fig){
            if(fig.imageId && ids.indexOf(fig.imageId) < 0) ids.push(fig.imageId);
          });
        });
      });
      return ids;
    },

    cleanupOrphans: function(){
      if(!RO.ImageStore.available) return Promise.resolve();
      var used = RO.ImageStore.getUsedImageIds();
      return RO.ImageStore.getAllRecords().then(function(records){
        var deletions = records.filter(function(record){
          return record && record.id && used.indexOf(record.id) < 0;
        }).map(function(record){
          return RO.ImageStore.deleteImage(record.id);
        });
        return Promise.all(deletions);
      });
    },

    migrateProjectResultImages: function(){
      if(!RO.ImageStore.available) return Promise.resolve();
      var changed = false;
      var jobs = [];
      (RO.Data.projects || []).forEach(function(project){
        (project.results || []).forEach(function(result){
          if(result.imageDataUrl && !result.imageId){
            jobs.push(RO.ImageStore.saveDataUrl(result.imageDataUrl).then(function(imageId){
              result.imageId = imageId;
              result.imageDataUrl = '';
              result.updatedAt = Date.now();
              changed = true;
            }));
          }
        });
      });
      return Promise.all(jobs).then(function(){
        if(changed) RO.Data.save();
      });
    },

    migrateCategoryDerivationImages: function(){
      if(!RO.ImageStore.available) return Promise.resolve();
      var changed = false;
      var jobs = [];
      (RO.Data.categories || []).forEach(function(category){
        (category.derivations || []).forEach(function(entry){
          (entry.figures || []).forEach(function(fig){
            if(fig.imageDataUrl && !fig.imageId){
              jobs.push(RO.ImageStore.saveDataUrl(fig.imageDataUrl).then(function(imageId){
                fig.imageId = imageId;
                fig.imageDataUrl = '';
                fig.updatedAt = Date.now();
                changed = true;
              }));
            }
          });
        });
      });
      return Promise.all(jobs).then(function(){
        if(changed) RO.Data.save();
      });
    },

    verifyUsedImages: function(){
      var used = RO.ImageStore.getUsedImageIds();
      if(!used.length || !RO.ImageStore.available) return Promise.resolve([]);
      return Promise.all(used.map(function(id){
        return RO.ImageStore.getRecord(id).then(function(record){
          return record ? null : id;
        });
      })).then(function(results){
        return results.filter(Boolean);
      });
    },

    exportRecords: function(){
      return RO.ImageStore.getAllRecords().then(function(records){
        return Promise.all(records.map(function(record){
          return RO.ImageStore.blobToDataUrl(record.blob).then(function(dataUrl){
            return {
              id: record.id,
              type: record.type || 'image/jpeg',
              createdAt: record.createdAt || null,
              updatedAt: record.updatedAt || null,
              dataUrl: dataUrl
            };
          });
        }));
      });
    },

    importRecords: function(records){
      if(!RO.ImageStore.available || !Array.isArray(records)) return Promise.resolve();
      var jobs = records.map(function(record){
        if(!record || !record.id || !record.dataUrl) return Promise.resolve();
        return RO.ImageStore.saveDataUrl(record.dataUrl, record.id);
      });
      return Promise.all(jobs);
    }
  };
})();
