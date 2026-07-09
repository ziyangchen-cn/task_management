(function(){
  'use strict';
  window.RO = window.RO || {};

  RO.Backup = {

    createPayload: function(){
      var imagesPromise  = RO.ImageStore && RO.ImageStore.available ? RO.ImageStore.exportRecords()      : Promise.resolve([]);
      var missingPromise = RO.ImageStore && RO.ImageStore.available ? RO.ImageStore.verifyUsedImages()   : Promise.resolve([]);
      return Promise.all([imagesPromise, missingPromise]).then(function(results){
        return {
          version: 2,
          imageStorage: RO.ImageStore && RO.ImageStore.available ? 'indexedDB' : 'localStorageFallback',
          exportedAt: new Date().toISOString(),
          data: {
            tasks:      RO.Data.tasks      || [],
            categories: RO.Data.categories || [],
            projects:   RO.Data.projects   || [],
            appState:   RO.Data.appState   || {},
            images:     results[0]         || []
          },
          warnings: { missingImageIds: results[1] || [] }
        };
      });
    },

    exportJSON: function(){
      RO.Backup.createPayload().then(function(payload){
        if(payload.warnings && payload.warnings.missingImageIds && payload.warnings.missingImageIds.length){
          RO.UI.showConfirmModal({
            message: 'Backup warning: some referenced images are missing and cannot be exported.',
            confirmOnly: true
          });
        }
        var blob  = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        var url   = URL.createObjectURL(blob);
        var a     = document.createElement('a');
        a.href     = url;
        a.download = 'research-os-backup-' + RO.DateUtils.todayISO() + '.json';
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      }).catch(function(e){
        console.error('Backup export failed', e);
        RO.UI.showConfirmModal({ message: 'Backup export failed.', confirmOnly: true });
      });
    },

    /** Auto-backup: once per day, after noon, silently export a JSON snapshot
     *  (same file the browser's downloads use) without needing the user to
     *  click the Backup button. This is a safety net independent of browser
     *  storage — if IndexedDB/localStorage ever gets cleared, there's still a
     *  recent file on disk to restore from. Call this once on every boot;
     *  it no-ops if today's backup already ran or it isn't noon yet. */
    autoBackupIfDue: function(){
      var today = RO.DateUtils.todayISO();
      if(RO.Data.appState.lastAutoBackupDate === today) return;
      if(new Date().getHours() < 12) return;

      RO.Backup.createPayload().then(function(payload){
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        var url  = URL.createObjectURL(blob);
        var a    = document.createElement('a');
        a.href     = url;
        a.download = 'research-os-autobackup-' + today + '.json';
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);

        RO.Data.appState.lastAutoBackupDate = today;
        RO.Data.save();
        console.log('[Backup] Auto backup completed for', today);
      }).catch(function(e){
        console.error('[Backup] Auto backup failed', e);
      });
    },

    validate: function(payload){
      if(!payload || typeof payload !== 'object') return false;
      if(!payload.data || typeof payload.data !== 'object') return false;
      if(!Array.isArray(payload.data.tasks))       return false;
      if(!Array.isArray(payload.data.categories))  return false;
      if(!Array.isArray(payload.data.projects))    return false;
      if(!payload.data.appState || typeof payload.data.appState !== 'object') return false;
      return true;
    },

    importJSONText: function(text){
      var payload;
      try {
        payload = JSON.parse(text);
      } catch(e) {
        RO.UI.showConfirmModal({ message: 'Invalid backup file: JSON parse failed.', confirmOnly: true });
        return;
      }
      if(!RO.Backup.validate(payload)){
        RO.UI.showConfirmModal({ message: 'Invalid backup file: missing Research OS data.', confirmOnly: true });
        return;
      }
      RO.UI.showConfirmModal({
        message: 'Import will replace current Research OS data. Continue?',
        confirmText: 'Import', danger: true,
        onConfirm: function(){ RO.Backup._doImport(payload); }
      });
    },

    _doImport: function(payload){
      var images     = Array.isArray(payload.data.images) ? payload.data.images : [];
      var imageImport = Promise.resolve();

      if(RO.ImageStore && RO.ImageStore.available && images.length){
        imageImport = RO.ImageStore.importRecords(images);
      } else if(images.length){
        // fallback: inline dataUrls into localStorage objects
        var imageMap = {};
        images.forEach(function(img){ if(img && img.id && img.dataUrl) imageMap[img.id] = img.dataUrl; });
        (payload.data.projects || []).forEach(function(project){
          (project.results || []).forEach(function(result){
            if(result.imageId && imageMap[result.imageId]){ result.imageDataUrl = imageMap[result.imageId]; result.imageId = ''; }
          });
        });
        (payload.data.categories || []).forEach(function(category){
          (category.derivations || []).forEach(function(entry){
            (entry.figures || []).forEach(function(fig){
              if(fig.imageId && imageMap[fig.imageId]){ fig.imageDataUrl = imageMap[fig.imageId]; fig.imageId = ''; }
            });
          });
        });
      }

      imageImport
        .then(function(){
          return RO.Storage.saveAll({
            tasks:      payload.data.tasks,
            categories: payload.data.categories,
            projects:   payload.data.projects,
            appState:   payload.data.appState
          });
        })
        .then(function(){
          return RO.Data.init();
        })
        .then(function(){
          if(RO.ImageStore && RO.ImageStore.available){
            return RO.ImageStore.migrateProjectResultImages()
              .then(function(){ return RO.ImageStore.migrateCategoryDerivationImages(); })
              .then(function(){ return RO.ImageStore.cleanupOrphans(); });
          }
        })
        .then(function(){
          RO.Migration.run();
          RO.UI.renderAll();
          if(window.location.hash === '#projects')    RO.UI.openProjectsPage();
          else if(window.location.hash === '#review') RO.UI.openReviewPage();
          RO.UI.showConfirmModal({ message: 'Backup imported successfully.', confirmOnly: true });
        })
        .catch(function(e){
          console.error('Backup import failed', e);
          RO.UI.showConfirmModal({ message: 'Backup import failed before replacing current data.', confirmOnly: true });
        });
    },

    importFile: function(file){
      if(!file) return;
      var reader = new FileReader();
      reader.onload = function(){ RO.Backup.importJSONText(String(reader.result || '')); };
      reader.readAsText(file);
    }

  };
})();
