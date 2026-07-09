(function(){
  'use strict';
  window.RO = window.RO || {};
  RO.Handlers = RO.Handlers || {};

  /* ── Named handler functions ──────────────────────────────── */

  RO.Handlers.handleSaveEdit = function(){
    var modal = document.getElementById('editModal'); if(!modal) return;
    var id    = modal.dataset.taskId;
    var title = document.getElementById('taskTitle').value.trim();
    var cat   = document.getElementById('taskCategory').value  || null;
    var proj  = document.getElementById('taskProject').value   || null;
    var date  = document.getElementById('taskDate').value      || null;

    if(!title){
      RO.UI.showConfirmModal({ message: 'Title is required.', confirmOnly: true });
      return;
    }

    if(id){
      RO.Data.updateTask(id, { title: title, categoryId: cat, projectId: proj, date: date || null });
    } else {
      RO.Data.createTask({ title: title, categoryId: cat, projectId: proj, date: date || null });
    }
    RO.UI.closeModal();
    RO.UI.renderAll();
  };

  RO.Handlers.handleTaskClick = function(e){
    var target = e.target;
    var row    = target.closest('tr[data-id]') || target.closest('.task');
    if(!row) return;
    var id     = row.dataset.id;
    var action = target.dataset.action;

    if(action === 'toggle'){
      RO.Data.toggleComplete(id);
      RO.UI.renderAll();

    } else if(action === 'star'){
      RO.Data.toggleStar(id);
      RO.UI.renderAll();

    } else if(action === 'edit'){
      var t = RO.Data.tasks.find(function(x){ return x.id === id; });
      RO.UI.openModal(t);

    } else if(action === 'move'){
      var moveDate = RO.Data.appState.currentDate;
      if(moveDate < RO.DateUtils.todayISO()){
        RO.UI.showConfirmModal({ message: 'Cannot move an inbox task to a date before today.', confirmOnly: true });
        return;
      }
      RO.Data.moveToDate(id, moveDate);
      RO.UI.renderAll();

    } else if(action === 'unassign'){
      RO.Data.moveToDate(id, null);
      RO.UI.renderAll();

    } else if(action === 'reborn'){
      var oldTask = RO.Data.tasks.find(function(x){ return x.id === id; });
      RO.UI.showInputModal({
        title: 'Reborn task',
        fields: [{ id: 'title', label: 'New title', value: oldTask ? oldTask.title : '', type: 'text' }],
        saveLabel: 'Reborn',
        onSave: function(vals){
          var newTitle = (vals.title || '').trim();
          if(!newTitle) return;
          RO.Data.rebornTask(id, newTitle);
          RO.UI.renderAll();
        }
      });

    } else if(action === 'someday-toggle'){
      RO.Data.toggleSomeday(id);
      RO.UI.renderInbox();

    } else if(action === 'delete'){
      RO.UI.showConfirmModal({
        message: 'Delete task?',
        confirmText: 'Delete', danger: true,
        onConfirm: function(){ RO.Data.deleteTask(id); RO.UI.renderAll(); }
      });
    }
  };

  /* ── Attach all event listeners ──────────────────────────── */

  RO.Handlers.attachHandlers = function(){
    var prev = document.getElementById('prevDay');
    if(prev) prev.addEventListener('click', function(){
      RO.Data.appState.currentDate = RO.DateUtils.addDaysISO(RO.Data.appState.currentDate, -1);
      RO.Data.save(); RO.UI.renderAll();
    });

    var next = document.getElementById('nextDay');
    if(next) next.addEventListener('click', function(){
      RO.Data.appState.currentDate = RO.DateUtils.addDaysISO(RO.Data.appState.currentDate, 1);
      RO.Data.save(); RO.UI.renderAll();
    });

    var todayBtn = document.getElementById('todayBtn');
    if(todayBtn) todayBtn.addEventListener('click', function(){
      RO.Data.appState.currentDate = RO.DateUtils.todayISO();
      RO.Data.save(); RO.UI.renderAll();
    });

    var dateDisplay = document.getElementById('dateDisplay');
    if(dateDisplay) dateDisplay.addEventListener('click', function(){
      var dp = document.getElementById('datePicker'); if(dp) dp.focus();
    });

    var datePicker = document.getElementById('datePicker');
    if(datePicker) datePicker.addEventListener('change', function(e){
      RO.Data.appState.currentDate = e.target.value;
      RO.Data.save(); RO.UI.renderAll();
    });

    var addInboxBtn = document.getElementById('addInboxBtn');
    if(addInboxBtn) addInboxBtn.addEventListener('click', function(){ RO.UI.openModal(null); });

    var topTodayBtn = document.getElementById('topTodayBtn');
    if(topTodayBtn) topTodayBtn.addEventListener('click', function(){ RO.UI.closeProjectsPage(); });

    var projectsBtn = document.getElementById('projectsBtn');
    if(projectsBtn) projectsBtn.addEventListener('click', function(){ RO.UI.openProjectsPage(); });

    var reviewBtn = document.getElementById('reviewBtn');
    if(reviewBtn) reviewBtn.addEventListener('click', function(){ RO.UI.openReviewPage(); });

    // Backup: replace prompt with choice modal
    var backupBtn   = document.getElementById('backupBtn');
    var backupInput = document.getElementById('backupImportInput');
    if(backupBtn) backupBtn.addEventListener('click', function(){
      RO.UI.showConfirmModal({
        title: 'Backup',
        message: 'Choose an action:',
        actions: [
          { label: 'Export JSON', handler: function(){ RO.Backup.exportJSON(); } },
          { label: 'Import JSON', handler: function(){ if(backupInput) backupInput.click(); } }
        ]
      });
    });
    if(backupInput) backupInput.addEventListener('change', function(){
      var file = backupInput.files && backupInput.files[0];
      RO.Backup.importFile(file);
      backupInput.value = '';
    });

    var closeSettingsBtn = document.getElementById('closeSettings');
    if(closeSettingsBtn) closeSettingsBtn.addEventListener('click', function(){ RO.UI.closeSettings(); });

    var closeImagePreviewBtn = document.getElementById('closeImagePreview');
    if(closeImagePreviewBtn) closeImagePreviewBtn.addEventListener('click', function(){ RO.UI.closeImagePreview(); });

    var cancelEditBtn = document.getElementById('cancelEdit');
    if(cancelEditBtn) cancelEditBtn.addEventListener('click', function(){ RO.UI.closeModal(); });

    var saveEditBtn = document.getElementById('saveEdit');
    if(saveEditBtn) saveEditBtn.addEventListener('click', RO.Handlers.handleSaveEdit);

    // Task clicks (Today + Inbox)
    var todayList = document.getElementById('todayList');
    if(todayList) todayList.addEventListener('click', RO.Handlers.handleTaskClick);
    var inboxList = document.getElementById('inboxList');
    if(inboxList) inboxList.addEventListener('click', RO.Handlers.handleTaskClick);

    // Drag and drop
    document.addEventListener('dragstart', function(e){
      if(e.target.closest('input,select,textarea,button')){ e.preventDefault(); return; }
      var row = e.target.closest('tr[data-id]') || e.target.closest('.task'); if(!row) return;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', row.dataset.id);
      // Flag today-task drags so the within-today reorder handler can identify them
      var todayListEl = document.getElementById('todayList');
      if(todayListEl && todayListEl.contains(row)){
        e.dataTransfer.setData('application/ro-task-reorder', '1');
      }
      row.classList.add('dragging');
    });

    document.addEventListener('dragend', function(e){
      var row = e.target.closest('tr[data-id]') || e.target.closest('.task');
      if(row) row.classList.remove('dragging');
      document.querySelectorAll('.drop-target').forEach(function(el){ el.classList.remove('drop-target'); });
    });

    function attachDropZone(section, target){
      if(!section) return;
      section.addEventListener('dragover', function(e){
        if(!e.dataTransfer.types || Array.prototype.indexOf.call(e.dataTransfer.types, 'text/plain') < 0) return;
        e.preventDefault(); section.classList.add('drop-target');
      });
      section.addEventListener('dragleave', function(e){
        if(!section.contains(e.relatedTarget)) section.classList.remove('drop-target');
      });
      section.addEventListener('drop', function(e){
        e.preventDefault(); section.classList.remove('drop-target');
        var id = e.dataTransfer.getData('text/plain'); if(!id) return;
        if(target === 'today'){
          var moveDate = RO.Data.appState.currentDate;
          if(moveDate < RO.DateUtils.todayISO()){
            RO.UI.showConfirmModal({ message: 'Cannot move an inbox task to a date before today.', confirmOnly: true });
            return;
          }
          RO.Data.moveToDate(id, moveDate);
        } else {
          RO.Data.moveToDate(id, null);
        }
        RO.UI.renderAll();
      });
    }

    attachDropZone(document.querySelector('.column.today'), 'today');
    attachDropZone(document.querySelector('.column.inbox'), 'inbox');

    // ── Within-Today reorder ──────────────────────────────────
    (function(){
      var list = document.getElementById('todayList'); if(!list) return;

      var dropLine = document.createElement('div');
      dropLine.className = 'today-drop-line';
      var insertBeforeEl = null;

      function hasReorderType(e){
        return e.dataTransfer && e.dataTransfer.types &&
          Array.prototype.indexOf.call(e.dataTransfer.types, 'application/ro-task-reorder') >= 0;
      }
      function nonCompletedTasks(){
        return Array.from(list.querySelectorAll('.task:not(.completed)'));
      }

      list.addEventListener('dragover', function(e){
        if(!hasReorderType(e)) return;
        e.preventDefault();
        e.stopPropagation(); // don't bubble to column.today drop zone

        var tasks = nonCompletedTasks();
        insertBeforeEl = null;
        for(var i = 0; i < tasks.length; i++){
          var r = tasks[i].getBoundingClientRect();
          if(e.clientY < r.top + r.height * 0.5){ insertBeforeEl = tasks[i]; break; }
        }

        if(dropLine.parentNode) dropLine.parentNode.removeChild(dropLine);
        if(insertBeforeEl){
          list.insertBefore(dropLine, insertBeforeEl);
        } else {
          var last = tasks[tasks.length - 1];
          if(last) list.insertBefore(dropLine, last.nextSibling || null);
          else list.appendChild(dropLine);
        }
      });

      list.addEventListener('dragleave', function(e){
        if(!list.contains(e.relatedTarget)){
          if(dropLine.parentNode) dropLine.parentNode.removeChild(dropLine);
          insertBeforeEl = null;
        }
      });

      list.addEventListener('drop', function(e){
        if(!hasReorderType(e)) return;
        e.preventDefault();
        e.stopPropagation();
        if(dropLine.parentNode) dropLine.parentNode.removeChild(dropLine);

        var taskId = e.dataTransfer.getData('text/plain'); if(!taskId) return;

        // Build new order from visible non-completed tasks, excluding the dragged one
        var ids = nonCompletedTasks()
          .filter(function(el){ return el.dataset.id && el.dataset.id !== taskId; })
          .map(function(el){ return el.dataset.id; });

        // Insert dragged task at the recorded position
        if(insertBeforeEl && insertBeforeEl.dataset.id && insertBeforeEl.dataset.id !== taskId){
          var idx = ids.indexOf(insertBeforeEl.dataset.id);
          if(idx >= 0) ids.splice(idx, 0, taskId); else ids.push(taskId);
        } else {
          ids.push(taskId);
        }
        insertBeforeEl = null;

        RO.Data.setTodayOrder(RO.Data.appState.currentDate, ids);
        RO.UI.renderToday();
      });
    })();

    window.addEventListener('hashchange', function(){
      if(window.location.hash === '#projects')            RO.UI.openProjectsPage();
      else if(window.location.hash === '#review')         RO.UI.openReviewPage();
      else if(window.location.hash === '#today' || !window.location.hash) RO.UI.closeProjectsPage();
    });
  };

})();
