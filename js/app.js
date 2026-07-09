(function(){
  window.RO = window.RO || {};
  document.addEventListener('DOMContentLoaded', function(){

    function bootUI(){
      RO.Migration.run();
      if(RO.UI && RO.Handlers){
        RO.UI.renderAll = RO.UI.renderAll || function(){ RO.UI.renderDate(); RO.UI.renderToday(); RO.UI.renderInbox(); };
        RO.UI.initGenericModals();
        RO.UI.renderAll();
        RO.Handlers.attachHandlers();
        // #projects alone opens the page with no project selected (falls back
        // to the first one). #projects/<id> reopens the exact project that
        // was on screen before the refresh (see ui-projects.js safeReplaceHash calls).
        var hash = window.location.hash;
        if(hash.indexOf('#projects') === 0){
          var projectId = hash.indexOf('#projects/') === 0 ? decodeURIComponent(hash.slice('#projects/'.length)) : undefined;
          RO.UI.openProjectsPage(projectId);
        } else if(hash === '#review'){
          RO.UI.openReviewPage();
        }
      }
      // Safety net independent of browser storage: once per day, after noon,
      // silently drop a JSON snapshot into Downloads. No-ops if already done today.
      if(RO.Backup) RO.Backup.autoBackupIfDue();
    }

    // If Supabase is configured, wait for a signed-in session first (shows a
    // login form if needed) so the cloud sync layer's RLS policies work.
    // With no Supabase config, RO.Auth.ready() resolves immediately.
    (RO.Auth ? RO.Auth.ready() : Promise.resolve())
      .then(function(){
        // RO.Data.init() opens IndexedDB, migrates localStorage data if needed,
        // loads all data into memory, then we start the ImageStore chain.
        return RO.Data.init();
      })
      .then(function(){
        if(RO.ImageStore) return RO.ImageStore.init();
      })
      .then(function(){
        if(RO.ImageStore && RO.ImageStore.available) return RO.ImageStore.migrateProjectResultImages();
      })
      .then(function(){
        if(RO.ImageStore && RO.ImageStore.available) return RO.ImageStore.migrateCategoryDerivationImages();
      })
      .then(function(){
        if(RO.ImageStore && RO.ImageStore.available) return RO.ImageStore.cleanupOrphans();
      })
      .then(bootUI)
      .catch(function(e){
        console.error('Boot failed', e);
        bootUI();
      });

  });
})();
