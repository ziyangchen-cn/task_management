(function(){
  window.RO = window.RO || {};
  RO.Data = {
    tasks: [],
    categories: [],
    projects: [],
    appState: {},

    /**
     * Async init: opens storage, migrates from localStorage if needed,
     * loads all data, applies field-defaults, persists normalizations.
     * Returns a Promise that resolves when in-memory state is ready.
     */
    init: function(){
      return RO.Storage.init()
        .then(function(){
          return RO.Storage.migrateFromLocalStorage();
        })
        .then(function(){
          return RO.Storage.syncFromRemote();
        })
        .then(function(){
          return RO.Storage.loadAll();
        })
        .then(function(s){
          RO.Data.tasks      = s.tasks      || [];
          RO.Data.categories = s.categories || (RO.Constants.DEFAULT_CATEGORIES || []).slice();
          RO.Data.projects   = s.projects   || [];
          RO.Data.appState   = s.appState   || {
            currentDate: RO.DateUtils.todayISO(),
            lastMigration: null,
            projectManagementUI: { expandedCategories: [] }
          };

          // Snapshot before running the migration loops below, so we can tell
          // whether any of them actually changed anything. Every boot used to
          // unconditionally re-save (and, with cloud sync, re-push) even when
          // nothing needed migrating -- harmless on its own, but it meant a
          // plain "open the app" raced against real edits made from another
          // device and could win the "which copy is newer" comparison.
          var beforeMigration = JSON.stringify({ tasks: RO.Data.tasks, categories: RO.Data.categories, projects: RO.Data.projects, appState: RO.Data.appState });

          if(!RO.Data.appState.dailySummaries) RO.Data.appState.dailySummaries = {};
          if(!RO.Data.appState.todayOrders)   RO.Data.appState.todayOrders   = {};
          if(typeof RO.Data.appState.lastAutoBackupDate === 'undefined') RO.Data.appState.lastAutoBackupDate = null;

          RO.Data.categories.forEach(function(c){
            if(typeof c.derivationNotes === 'undefined') c.derivationNotes = '';
            if(!Array.isArray(c.derivations)) c.derivations = [];
            if(c.derivationNotes && c.derivationNotes.trim() && !c.derivations.length){
              c.derivations.push({
                id: 'd_' + Date.now(),
                title: 'Imported notes',
                body: c.derivationNotes,
                bodyMarkdown: c.derivationNotes,
                figures: [],
                createdAt: Date.now(),
                updatedAt: Date.now()
              });
              c.derivationNotes = '';
            }
            c.derivations.forEach(function(d){
              if(typeof d.bodyMarkdown === 'undefined') d.bodyMarkdown = d.body || '';
              if(!Array.isArray(d.figures)) d.figures = [];
              d.figures.forEach(function(f){
                if(typeof f.imageDataUrl === 'undefined') f.imageDataUrl = '';
              });
            });
          });

          // migration: add defaults to existing projects
          RO.Data.projects.forEach(function(p){
            if(!p.status) p.status = 'active';
            if(p.status === 'archived') p.archived = true;
            if(typeof p.archived === 'undefined') p.archived = false;
            if(typeof p.description === 'undefined') p.description = '';
            if(!Array.isArray(p.descriptionHistory)) p.descriptionHistory = [];
            if(typeof p.startDate === 'undefined') p.startDate = '';
            if(typeof p.dueDate === 'undefined') p.dueDate = '';
            if(typeof p.summary === 'undefined') p.summary = '';
            if(typeof p.finishedAt === 'undefined') p.finishedAt = p.status === 'finished' ? Date.now() : null;
            if(!Array.isArray(p.results)) p.results = [];
            p.results.forEach(function(r){
              if(typeof r.imageId === 'undefined') r.imageId = '';
              if(typeof r.imageDataUrl === 'undefined') r.imageDataUrl = '';
            });
          });

          // one-time migration: description/note/progress -> title + log[]
          // (old "description" was really a title; old "note"/"progress" become
          // the first log entry, with old progress text marked as a `#` progress line)
          RO.Data.tasks.forEach(function(t){
            if(typeof t.title === 'undefined'){
              t.title = t.description || '';
              var seedLines = [];
              if(t.note) seedLines.push(t.note);
              if(t.progress) seedLines.push('#' + t.progress);
              t.log = seedLines.length
                ? [{ id: 'log_' + (t.createdAt || Date.now()), text: seedLines.join('\n'), createdAt: t.createdAt || Date.now() }]
                : [];
              delete t.description;
              delete t.note;
              delete t.progress;
            }
            if(!Array.isArray(t.log)) t.log = [];
            if(typeof t.completedReason === 'undefined') t.completedReason = t.completed ? 'done' : null;
            if(typeof t.continuesFrom === 'undefined') t.continuesFrom = null;
            if(typeof t.rebornInto === 'undefined') t.rebornInto = null;
            if(typeof t.createdAt === 'undefined') t.createdAt = t.updatedAt || Date.now();
            if(typeof t.completedAt === 'undefined') t.completedAt = t.completed ? (t.updatedAt || t.createdAt || Date.now()) : null;
            if(typeof t.carriedForwardAt === 'undefined') t.carriedForwardAt = null;
            if(typeof t.starred === 'undefined') t.starred = false;
            if(typeof t.someday === 'undefined') t.someday = false;
          });

          var afterMigration = JSON.stringify({ tasks: RO.Data.tasks, categories: RO.Data.categories, projects: RO.Data.projects, appState: RO.Data.appState });
          if(afterMigration !== beforeMigration) RO.Data.save(); // persist normalizations only if something actually changed (fire-and-forget)
        });
    },

    /**
     * Fire-and-forget save. Callers do NOT need to await this.
     * The in-memory RO.Data.* arrays are always the source of truth.
     */
    save: function(){
      RO.Data.carryForwardOpenTasks();
      RO.Storage.saveAll({
        tasks:      RO.Data.tasks,
        categories: RO.Data.categories,
        projects:   RO.Data.projects,
        appState:   RO.Data.appState
      }).catch(function(e){ console.error('[Data] save failed', e); });
    },

    carryForwardOpenTasks: function(){
      var today = RO.DateUtils.todayISO();
      (RO.Data.tasks || []).forEach(function(t){
        if(!t.completed && t.date && t.date < today){
          t.date = today;
          t.updatedAt = Date.now();
          t.carriedForwardAt = today;
        }
      });
    },

    createTask: function(opt){
      opt = opt || {};
      var id = 't_' + Date.now();
      var task = {
        id: id,
        title: opt.title || '',
        projectId: opt.projectId || null,
        date: opt.date || null,
        completed: false,
        completedReason: null,           // 'done' | 'reborn' | null
        continuesFrom: opt.continuesFrom || null,
        rebornInto: null,
        log: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        completedAt: null,
        carriedForwardAt: null,
        starred: !!opt.starred,
        someday: !!opt.someday
      };
      RO.Data.tasks.push(task);
      RO.Data.save();
      return task;
    },

    /** Append one log entry to a task. text may use *()conclusion / #(progress) / !(bug)
     *  inline markers — see ui-core.js appendTextWithHashHighlight for rendering. */
    addLogEntry: function(taskId, text){
      if(!text || !text.trim()) return null;
      var t = RO.Data.tasks.find(function(x){ return x.id === taskId; });
      if(!t) return null;
      if(!Array.isArray(t.log)) t.log = [];
      var entry = { id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), text: text, createdAt: Date.now() };
      t.log.push(entry);
      t.updatedAt = Date.now();
      RO.Data.save();
      return entry;
    },

    /** Find the most recent conclusion (a `*`-marked line) across a task's log,
     *  newest entry first. Returns '' if the task has no conclusion yet. */
    getLatestConclusion: function(task){
      var log = (task && task.log) || [];
      for(var i = log.length - 1; i >= 0; i--){
        var lines = (log[i].text || '').split('\n');
        for(var j = lines.length - 1; j >= 0; j--){
          if(lines[j].trim().charAt(0) === '*') return lines[j].trim();
        }
      }
      return '';
    },

    /** For a project's header: one row per still-open task, with its latest conclusion. */
    getActiveTaskConclusions: function(projectId){
      return RO.Data.getOpenTasksByProject(projectId).map(function(t){
        return { id: t.id, title: t.title || '', conclusion: RO.Data.getLatestConclusion(t) };
      });
    },

    /** "Reborn" a task whose purpose has drifted: close the old one (marked
     *  completedReason:'reborn', distinct from a real 'done'), and start a fresh
     *  task in the same project with a new title and an empty log. The two stay
     *  linked via continuesFrom/rebornInto so history can show them as one chain. */
    rebornTask: function(taskId, newTitle){
      var old = RO.Data.tasks.find(function(x){ return x.id === taskId; });
      if(!old) return null;
      old.completed = true;
      old.completedReason = 'reborn';
      old.completedAt = Date.now();
      old.updatedAt = Date.now();
      var next = RO.Data.createTask({
        title: newTitle || old.title,
        projectId: old.projectId,
        date: old.date,
        continuesFrom: old.id
      });
      old.rebornInto = next.id;
      RO.Data.save();
      return next;
    },

    updateTask: function(id, patch){
      var t = RO.Data.tasks.find(function(x){ return x.id === id; });
      if(t){ Object.assign(t, patch); t.updatedAt = Date.now(); RO.Data.save(); }
      return t;
    },

    deleteTask: function(id){
      RO.Data.tasks = RO.Data.tasks.filter(function(x){ return x.id !== id; });
      RO.Data.save();
    },

    getTasksByDate: function(date){
      return RO.Data.tasks.filter(function(t){ return t.date === date; });
    },

    getInboxTasks: function(){
      return RO.Data.tasks.filter(function(t){ return !t.date; });
    },

    getDailySummary: function(date){
      if(!RO.Data.appState.dailySummaries) RO.Data.appState.dailySummaries = {};
      return RO.Data.appState.dailySummaries[date] || { text: '', updatedAt: null };
    },

    updateDailySummary: function(date, text){
      if(!RO.Data.appState.dailySummaries) RO.Data.appState.dailySummaries = {};
      if(text && text.trim()){
        RO.Data.appState.dailySummaries[date] = { text: text, updatedAt: Date.now() };
      } else {
        delete RO.Data.appState.dailySummaries[date];
      }
      RO.Data.save();
    },

    toggleComplete: function(id){
      var t = RO.Data.tasks.find(function(x){ return x.id === id; });
      if(t){
        t.completed = !t.completed;
        t.updatedAt = Date.now();
        t.completedAt = t.completed ? t.updatedAt : null;
        t.completedReason = t.completed ? 'done' : null;
        RO.Data.save();
      }
      return t;
    },

    toggleStar: function(id){
      var t = RO.Data.tasks.find(function(x){ return x.id === id; });
      if(t){
        t.starred = !t.starred;
        t.updatedAt = Date.now();
        RO.Data.save();
      }
      return t;
    },

    toggleSomeday: function(id){
      var t = RO.Data.tasks.find(function(x){ return x.id === id; });
      if(t){
        t.someday = !t.someday;
        t.updatedAt = Date.now();
        RO.Data.save();
      }
      return t;
    },

    moveToDate: function(id, date){
      var t = RO.Data.tasks.find(function(x){ return x.id === id; });
      if(t){ t.date = date; t.updatedAt = Date.now(); RO.Data.save(); }
      return t;
    },

    createCategory: function(name){
      var id = name.toUpperCase().replace(/\s+/g, '');
      if(RO.Data.categories.find(function(c){ return c.id === id; })) return null;
      var cat = { id: id, name: name, color: '#f0f0f0', archived: false, derivationNotes: '', derivations: [] };
      RO.Data.categories.push(cat);
      RO.Data.save();
      return cat;
    },

    updateCategory: function(id, patch){
      var c = RO.Data.categories.find(function(x){ return x.id === id; });
      if(c){ Object.assign(c, patch); RO.Data.save(); }
      return c;
    },

    deleteCategory: function(id){
      var c = RO.Data.categories.find(function(x){ return x.id === id; });
      if(c){ c.archived = true; RO.Data.save(); }
    },

    addCategoryDerivation: function(categoryId, opt){
      var c = RO.Data.categories.find(function(x){ return x.id === categoryId; });
      if(!c) return null;
      if(!Array.isArray(c.derivations)) c.derivations = [];
      var now = Date.now();
      var entry = {
        id: 'd_' + now + '_' + Math.random().toString(36).slice(2, 7),
        title: opt && opt.title ? opt.title : 'Untitled derivation',
        body: opt && opt.body ? opt.body : '',
        bodyMarkdown: opt && opt.bodyMarkdown ? opt.bodyMarkdown : (opt && opt.body ? opt.body : ''),
        figures: [],
        createdAt: now,
        updatedAt: now
      };
      c.derivations.push(entry);
      RO.Data.save();
      return entry;
    },

    addCategoryDerivationFigure: function(categoryId, derivationId, opt){
      var entry = RO.Data.updateCategoryDerivation(categoryId, derivationId, {});
      if(!entry) return null;
      if(!Array.isArray(entry.figures)) entry.figures = [];
      var baseId = (opt && opt.id ? opt.id : 'fig_' + (entry.figures.length + 1)).trim().replace(/\s+/g, '_');
      var id = baseId || ('fig_' + Date.now());
      var suffix = 2;
      while(entry.figures.find(function(f){ return f.id === id; })){
        id = baseId + '_' + suffix;
        suffix++;
      }
      var fig = {
        id: id,
        caption: opt && opt.caption ? opt.caption : '',
        imageId: opt && opt.imageId ? opt.imageId : '',
        imageDataUrl: opt && opt.imageDataUrl ? opt.imageDataUrl : '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      entry.figures.push(fig);
      entry.updatedAt = Date.now();
      RO.Data.save();
      return fig;
    },

    deleteCategoryDerivationFigure: function(categoryId, derivationId, figureId){
      var c = RO.Data.categories.find(function(x){ return x.id === categoryId; });
      if(!c || !Array.isArray(c.derivations)) return null;
      var entry = c.derivations.find(function(x){ return x.id === derivationId; });
      if(!entry || !Array.isArray(entry.figures)) return null;
      var fig = entry.figures.find(function(x){ return x.id === figureId; }) || null;
      entry.figures = entry.figures.filter(function(x){ return x.id !== figureId; });
      entry.updatedAt = Date.now();
      RO.Data.save();
      return fig;
    },

    updateCategoryDerivation: function(categoryId, derivationId, patch){
      var c = RO.Data.categories.find(function(x){ return x.id === categoryId; });
      if(!c || !Array.isArray(c.derivations)) return null;
      var entry = c.derivations.find(function(x){ return x.id === derivationId; });
      if(!entry) return null;
      Object.assign(entry, patch);
      entry.updatedAt = Date.now();
      RO.Data.save();
      return entry;
    },

    deleteCategoryDerivation: function(categoryId, derivationId){
      var c = RO.Data.categories.find(function(x){ return x.id === categoryId; });
      if(!c || !Array.isArray(c.derivations)) return null;
      var entry = c.derivations.find(function(x){ return x.id === derivationId; }) || null;
      c.derivations = c.derivations.filter(function(x){ return x.id !== derivationId; });
      RO.Data.save();
      return entry;
    },

    createProject: function(name, categoryId){
      var baseId = name.toLowerCase().trim().replace(/\s+/g, '-') || 'project';
      var id = baseId;
      var suffix = 2;
      while(RO.Data.projects.find(function(p){ return p.id === id; })){
        id = baseId + '-' + suffix;
        suffix++;
      }
      var proj = { id: id, name: name, categoryId: categoryId, status: 'active', archived: false, description: '', descriptionHistory: [], startDate: '', dueDate: '', summary: '', finishedAt: null, results: [] };
      RO.Data.projects.push(proj);
      RO.Data.save();
      return proj;
    },

    /** Update a project's one-line purpose ("目标描述"). The previous value is
     *  kept (with a timestamp) in descriptionHistory rather than overwritten,
     *  so you can see how your understanding of this part evolved. */
    updateProjectDescription: function(id, newDescription){
      var p = RO.Data.projects.find(function(x){ return x.id === id; });
      if(!p) return null;
      if(!Array.isArray(p.descriptionHistory)) p.descriptionHistory = [];
      var next = newDescription || '';
      if((p.description || '') !== next){
        p.descriptionHistory.push({ value: p.description || '', changedAt: Date.now() });
        p.description = next;
        RO.Data.save();
      }
      return p;
    },

    updateProject: function(id, patch){
      var p = RO.Data.projects.find(function(x){ return x.id === id; });
      if(p){
        var prevStatus = p.status || 'active';
        Object.assign(p, patch);
        if(prevStatus !== 'finished' && p.status === 'finished') p.finishedAt = Date.now();
        if(prevStatus === 'finished' && p.status !== 'finished') p.finishedAt = null;
        if(p.status === 'archived') p.archived = true;
        if(p.status && p.status !== 'archived' && patch.archived === false) p.archived = false;
        RO.Data.save();
      }
      return p;
    },

    deleteProject: function(id){
      var p = RO.Data.projects.find(function(x){ return x.id === id; });
      if(p){ p.archived = true; p.status = 'archived'; RO.Data.save(); }
    },

    getActiveCategories: function(){
      return (RO.Data.categories || []).filter(function(c){ return !c.archived; });
    },

    getProjectsByCategory: function(categoryId, onlyActive){
      var projects = (RO.Data.projects || []).filter(function(p){ return p.categoryId === categoryId; });
      if(onlyActive) projects = projects.filter(function(p){ return !p.archived && p.status !== 'archived'; });
      return projects;
    },

    getTasksByProject: function(projectId){
      return (RO.Data.tasks || []).filter(function(t){ return t.projectId === projectId; });
    },

    getOpenTasksByProject: function(projectId){
      return RO.Data.getTasksByProject(projectId).filter(function(t){ return !t.completed; });
    },

    getCompletedTasksByProject: function(projectId){
      return RO.Data.getTasksByProject(projectId).filter(function(t){ return t.completed; }).sort(function(a,b){
        return (b.completedAt || 0) - (a.completedAt || 0);
      });
    },

    /** Most recent activity timestamp for a project (any task, done or not).
     *  Used to sort projects by how recently they were actually worked on,
     *  instead of a manually-maintained "stage" label. Returns 0 if no tasks yet. */
    getLastTaskTime: function(projectId){
      var tasks = RO.Data.getTasksByProject(projectId);
      var latest = 0;
      tasks.forEach(function(t){
        var t2 = t.updatedAt || t.createdAt || 0;
        if(t2 > latest) latest = t2;
      });
      return latest;
    },

    addProjectResult: function(projectId, opt){
      var p = RO.Data.projects.find(function(x){ return x.id === projectId; });
      if(!p) return null;
      if(!Array.isArray(p.results)) p.results = [];
      var now = Date.now();
      var result = {
        id: 'r_' + now,
        title: opt.title || '',
        description: opt.description || '',
        imageId: opt.imageId || '',
        imageDataUrl: opt.imageDataUrl || '',
        createdAt: now,
        updatedAt: now
      };
      p.results.push(result);
      RO.Data.save();
      return result;
    },

    updateProjectResult: function(projectId, resultId, patch){
      var p = RO.Data.projects.find(function(x){ return x.id === projectId; });
      if(!p || !Array.isArray(p.results)) return null;
      var result = p.results.find(function(x){ return x.id === resultId; });
      if(!result) return null;
      Object.assign(result, patch);
      result.updatedAt = Date.now();
      RO.Data.save();
      return result;
    },

    deleteProjectResult: function(projectId, resultId){
      var p = RO.Data.projects.find(function(x){ return x.id === projectId; });
      if(!p || !Array.isArray(p.results)) return null;
      var result = p.results.find(function(x){ return x.id === resultId; }) || null;
      p.results = p.results.filter(function(x){ return x.id !== resultId; });
      RO.Data.save();
      return result;
    },

    toggleCategoryExpanded: function(categoryId){
      if(!RO.Data.appState.projectManagementUI) RO.Data.appState.projectManagementUI = { expandedCategories: [] };
      var arr = RO.Data.appState.projectManagementUI.expandedCategories || [];
      var idx = arr.indexOf(categoryId);
      if(idx >= 0) arr.splice(idx, 1); else arr.push(categoryId);
      RO.Data.save();
    },

    setTodayOrder: function(date, ids){
      if(!RO.Data.appState.todayOrders) RO.Data.appState.todayOrders = {};
      RO.Data.appState.todayOrders[date] = ids;
      RO.Data.save();
    },

    isCategoryExpanded: function(categoryId){
      if(!RO.Data.appState.projectManagementUI) return false;
      return (RO.Data.appState.projectManagementUI.expandedCategories || []).indexOf(categoryId) >= 0;
    }

  };
})();
