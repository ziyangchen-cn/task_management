(function(){
  window.RO = window.RO || {};
  RO.Constants = {
    STORAGE_KEYS: {
      TASKS: 'research_os.tasks',
      CATEGORIES: 'research_os.categories',
      PROJECTS: 'research_os.projects',
      APP_STATE: 'research_os.appState'
    },
    DEFAULT_CATEGORIES: [
      { id: 'CFC', name: 'CFC', color: '#cfe8ff', archived: false },
      { id: 'ISO', name: 'ISO', color: '#d7f8d8', archived: false },
      { id: 'Paper', name: 'Paper', color: '#ecd7ff', archived: false }
    ]
  };

  RO.getCategoryColor = function(projId, catId){
    // can be called with projId (for tasks) or catId (for category display)
    if(catId){
      var cat = (RO.Data && RO.Data.categories || []).find(function(c){ return c.id === catId; });
      return cat ? cat.color : '#f5f5f5';
    }
    var proj = (RO.Data && RO.Data.projects || []).find(function(p){ return p.id === projId; });
    if(!proj) return '#f5f5f5';
    var cat = (RO.Data && RO.Data.categories || []).find(function(c){ return c.id === proj.categoryId; });
    return cat ? cat.color : '#f5f5f5';
  };
})();