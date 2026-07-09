(function(){
  window.RO = window.RO || {};
  RO.Migration = {
    run: function(){
      var today = RO.DateUtils.todayISO();
      var prev = RO.Data.appState.currentDate || today;
      if(prev < today){
        RO.Data.carryForwardOpenTasks();
        RO.Data.appState.currentDate = today;
        RO.Data.appState.lastMigration = Date.now();
        RO.Data.save();
      } else {
        RO.Data.appState.currentDate = today;
        RO.Data.save();
      }
    }
  };
})();
