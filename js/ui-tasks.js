(function(){
  'use strict';
  window.RO = window.RO || {};
  RO.UI = RO.UI || {};

  /* ── Task element ─────────────────────────────────────────── */

  RO.UI.createTaskElement = function(task){
    var el = document.createElement('div');
    el.className = 'task';
    if(task.completed) el.classList.add('completed');
    if(task.starred)   el.classList.add('starred');
    el.dataset.id = task.id;
    el.draggable = true;

    var row = document.createElement('div'); row.className = 'row';

    // drag handle
    var handle = document.createElement('div');
    handle.className = 'task-drag-handle';
    handle.textContent = '⠿';
    handle.title = 'Drag to reorder';
    row.appendChild(handle);

    // checkbox
    var cb = document.createElement('input');
    cb.type = 'checkbox'; cb.dataset.action = 'toggle';
    if(task.completed) cb.checked = true;
    row.appendChild(cb);

    // star button
    var star = document.createElement('button');
    star.type = 'button';
    star.className = 'task-star' + (task.starred ? ' active' : '');
    star.dataset.action = 'star';
    star.title = task.starred ? 'Unstar task' : 'Star task';
    star.textContent = task.starred ? '★' : '☆';
    row.appendChild(star);

    // task main (meta + description)
    var taskMain = document.createElement('div'); taskMain.className = 'task-main';

    var proj = (RO.Data.projects || []).find(function(p){ return p.id === task.projectId; }) || null;
    var catName = '', projName = '';
    if(proj){
      projName = proj.name || '';
      var cat = (RO.Data.categories || []).find(function(c){ return c.id === proj.categoryId; });
      if(cat) catName = cat.name || '';
    }
    var displayParts = [];
    if(catName)  displayParts.push('[' + catName + ']');
    if(projName) displayParts.push(projName);

    var meta = document.createElement('span'); meta.className = 'meta';
    if(proj){
      var projectLink = document.createElement('button');
      projectLink.type = 'button';
      projectLink.className = 'project-link';
      projectLink.textContent = displayParts.join(' · ');
      // Hover reminder of this project's goal, without cluttering the Today list.
      // Custom-styled tooltip (see RO.UI.attachCustomTooltip) instead of the
      // native `title` attribute, which can't be restyled.
      if(proj.description) RO.UI.attachCustomTooltip(projectLink, '目标：' + proj.description);
      projectLink.onclick = function(e){
        e.stopPropagation();
        RO.UI.openProjectsPage(proj.id);
      };
      meta.appendChild(projectLink);
    } else {
      meta.textContent = displayParts.join(' · ');
    }
    taskMain.appendChild(meta);

    var desc = document.createElement('div'); desc.className = 'description';
    desc.textContent = task.title || '';
    taskMain.appendChild(desc);
    row.appendChild(taskMain);

    // log: append-only record for this task. Click the latest entry to see the
    // full history and add a new one (做了什么 plain / #进展 / !坑 / *结论).
    var logWrap = document.createElement('div'); logWrap.className = 'task-log';

    var logDisplay = document.createElement('div');
    logDisplay.className = 'task-log-display';
    logDisplay.dataset.ignoreTaskAction = 'true';

    var logHistory = document.createElement('div');
    logHistory.className = 'task-log-history hidden';
    logHistory.dataset.ignoreTaskAction = 'true';

    var logInput = document.createElement('textarea');
    logInput.className = 'task-log-input auto-height hidden';
    logInput.rows = 1;
    logInput.placeholder = '新记录：做了什么 / #进展 / !坑 / *结论 / [ ]子任务';
    logInput.dataset.ignoreTaskAction = 'true';

    function latestLogEntry(){
      var log = task.log || [];
      return log.length ? log[log.length - 1] : null;
    }

    function renderLogDisplay(){
      var latest = latestLogEntry();
      logDisplay.innerHTML = '';
      logDisplay.classList.toggle('empty', !latest);
      if(latest) RO.UI.appendTextWithHashHighlight(logDisplay, latest.text);
      else logDisplay.textContent = '点击记录进展 / 坑 / 结论';
    }

    // Each past entry is its own small textarea, editable in place and saved
    // on blur -- log entries are no longer read-only once written. No date
    // label; entries just sit together as one running, freely-editable log.
    function makeLogEntryRow(entry){
      var item = document.createElement('div'); item.className = 'task-log-entry';
      var edit = document.createElement('textarea');
      edit.className = 'task-log-entry-input auto-height';
      edit.rows = 1;
      edit.value = entry.text;
      edit.addEventListener('click', function(e){ e.stopPropagation(); });
      edit.addEventListener('input', function(){ RO.UI.fitTextarea(edit); });
      edit.addEventListener('blur', function(){
        if(edit.value !== entry.text && edit.value.trim()){
          RO.Data.updateLogEntry(task.id, entry.id, edit.value);
          entry.text = edit.value;
        }
      });
      item.appendChild(edit);
      setTimeout(function(){ RO.UI.fitTextarea(edit); }, 0);
      return item;
    }

    function renderLogHistory(){
      logHistory.innerHTML = '';
      // Shows every entry, including the latest -- it used to be excluded here
      // (staying only in logDisplay, which gets hidden while editing), which
      // made the most recent entry silently vanish from view once expanded.
      (task.log || []).forEach(function(entry){
        logHistory.appendChild(makeLogEntryRow(entry));
      });
    }

    // Editor stays open while you click between entries / the new-entry box;
    // it only collapses back to the compact display when you click elsewhere
    // on the page (same outside-click pattern as RO.UI.positionMenu's menus).
    var outsideClickHandler = null;
    function attachOutsideClick(){
      outsideClickHandler = function(e){
        if(logWrap.contains(e.target)) return;
        showLogDisplayMode();
      };
      document.addEventListener('click', outsideClickHandler);
    }
    function detachOutsideClick(){
      if(outsideClickHandler){ document.removeEventListener('click', outsideClickHandler); outsideClickHandler = null; }
    }

    function showLogEditor(){
      renderLogHistory();
      logDisplay.classList.add('hidden');
      logHistory.classList.remove('hidden');
      logInput.classList.remove('hidden');
      logInput.value = '';
      RO.UI.fitTextarea(logInput);
      logInput.focus();
      setTimeout(attachOutsideClick, 0); // deferred so this same click doesn't immediately close it
    }
    function showLogDisplayMode(){
      renderLogDisplay();
      logHistory.classList.add('hidden');
      logInput.classList.add('hidden');
      logDisplay.classList.remove('hidden');
      detachOutsideClick();
    }

    logDisplay.addEventListener('click', function(e){ e.stopPropagation(); showLogEditor(); });
    logHistory.addEventListener('click', function(e){ e.stopPropagation(); });
    logInput.addEventListener('click', function(e){ e.stopPropagation(); });
    logInput.addEventListener('input', function(){ RO.UI.fitTextarea(logInput); });
    logInput.addEventListener('keydown', function(e){
      if(e.key !== 'Tab') return;
      e.preventDefault();
      var start = logInput.selectionStart;
      var end   = logInput.selectionEnd;
      logInput.value = logInput.value.slice(0, start) + '\t' + logInput.value.slice(end);
      logInput.selectionStart = logInput.selectionEnd = start + 1;
      RO.UI.fitTextarea(logInput);
    });
    logInput.addEventListener('blur', function(){
      if(logInput.value.trim()){
        RO.Data.addLogEntry(task.id, logInput.value);
        logInput.value = '';
        RO.UI.fitTextarea(logInput);
        renderLogHistory(); // show the new entry immediately, editor stays open
      }
    });

    renderLogDisplay();
    logWrap.appendChild(logDisplay);
    logWrap.appendChild(logHistory);
    logWrap.appendChild(logInput);
    row.appendChild(logWrap);

    // action buttons
    var right = document.createElement('div');
    var rebornBtn = '<button data-action="reborn" title="目的变了？关掉这个 task，接着开一个新的">Reborn</button>';
    if(task.date){
      right.innerHTML = '<button data-action="edit">Edit</button> ' + rebornBtn + ' <button data-action="unassign">To Inbox</button> <button data-action="delete">Delete</button>';
    } else {
      right.innerHTML = '<button data-action="edit">Edit</button> ' + rebornBtn + ' <button data-action="move">Move</button> <button data-action="delete">Delete</button>';
    }
    row.appendChild(right);

    el.appendChild(row);

    var bgColor = RO.getCategoryColor(task.projectId);
    el.style.background = task.completed ? RO.UI._blendWithWhite(bgColor, 0.60) : bgColor;
    return el;
  };

  /* ── Today column ─────────────────────────────────────────── */

  RO.UI.renderToday = function(){
    var container = document.getElementById('todayList'); if(!container) return;
    container.innerHTML = '';
    var date  = RO.Data.appState.currentDate;
    var tasks = RO.Data.getTasksByDate(date) || [];
    RO.UI.renderTodayStatus(tasks, date);
    RO.UI.renderTodaySummary(date);

    var todayOrder = (RO.Data.appState.todayOrders || {})[date] || [];
    tasks = tasks.slice().sort(function(a, b){
      // Group: completed=0 (top), regular active=1, starred=2 (bottom — highest priority)
      function groupRank(t){ if(t.completed) return 0; if(t.starred) return 2; return 1; }
      var ga = groupRank(a), gb = groupRank(b);
      if(ga !== gb) return ga - gb;
      // Within completed group: most-recently-completed first
      if(a.completed) return (b.completedAt || b.createdAt || 0) - (a.completedAt || a.createdAt || 0);
      // Within non-completed group: use manual todayOrder when available
      var ia = todayOrder.indexOf(a.id), ib = todayOrder.indexOf(b.id);
      if(ia >= 0 && ib >= 0) return ia - ib;
      if(ia >= 0) return -1; // ordered task before unordered
      if(ib >= 0) return 1;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
    var spacer = document.createElement('div');
    spacer.className = 'today-list-spacer';
    container.appendChild(spacer);
    tasks.forEach(function(t){ container.appendChild(RO.UI.createTaskElement(t)); });
  };

  RO.UI.renderTodayStatus = function(todayTasks, date){
    var container = document.getElementById('todayStatus'); if(!container) return;
    var total   = todayTasks.length;
    var done    = todayTasks.filter(function(t){ return t.completed; }).length;
    var open    = total - done;
    var starred = todayTasks.filter(function(t){ return !t.completed && t.starred; }).length;
    var allInbox = RO.Data.getInboxTasks();
    var inbox   = allInbox.filter(function(t){ return !t.someday; }).length;
    var someday = allInbox.filter(function(t){ return t.someday; }).length;
    var carried = todayTasks.filter(function(t){ return t.carriedForwardAt === date; }).length;
    var pct     = total ? Math.round((done / total) * 100) : 0;

    container.innerHTML = '';

    var counts = document.createElement('div'); counts.className = 'today-status-counts';
    counts.textContent = 'Open ' + open + '    Starred ' + starred + '    Done ' + done + '    Inbox ' + inbox + '    Someday ' + someday + '    Carry-forward ' + carried;

    var progress = document.createElement('div'); progress.className = 'today-progress';
    var fill = document.createElement('div'); fill.className = 'today-progress-fill'; fill.style.width = pct + '%';
    progress.appendChild(fill);

    var label = document.createElement('span'); label.className = 'today-progress-label'; label.textContent = pct + '%';

    var row = document.createElement('div'); row.className = 'today-progress-row';
    row.appendChild(progress); row.appendChild(label);

    container.appendChild(counts); container.appendChild(row);
  };

  RO.UI.renderTodaySummary = function(date){
    var container = document.getElementById('todaySummary'); if(!container) return;
    container.innerHTML = '';

    var textarea = document.createElement('textarea');
    textarea.className = 'today-summary-input auto-height';
    textarea.rows = 1;
    textarea.placeholder = 'Today summary...';
    textarea.value = (RO.Data.getDailySummary(date).text || '');
    textarea.addEventListener('input', function(){
      RO.UI.fitTextarea(textarea);
      clearTimeout(textarea._saveTimer);
      textarea._saveTimer = setTimeout(function(){ RO.Data.updateDailySummary(date, textarea.value); }, 300);
    });
    textarea.addEventListener('blur', function(){
      clearTimeout(textarea._saveTimer);
      RO.Data.updateDailySummary(date, textarea.value);
    });

    container.appendChild(textarea);
    setTimeout(function(){ RO.UI.fitTextarea(textarea); }, 0);
  };

  /* ── Inbox column ─────────────────────────────────────────── */

  RO.UI._somedayExpanded = RO.UI._somedayExpanded || false;

  RO.UI.renderInbox = function(){
    var container = document.getElementById('inboxList'); if(!container) return;
    container.innerHTML = '';
    var allTasks = RO.Data.getInboxTasks() || [];

    // Split active vs someday
    var activeTasks  = allTasks.filter(function(t){ return !t.someday; });
    var somedayTasks = allTasks.filter(function(t){ return  t.someday; });

    // Sort helper: category array pos → project array pos → createdAt
    function sortByCategory(arr){
      return arr.slice().sort(function(a, b){
        function key(task){
          var catIdx = 9999, projIdx = 9999;
          if(task.projectId){
            for(var j = 0; j < RO.Data.projects.length; j++){
              if(RO.Data.projects[j].id === task.projectId){
                projIdx = j;
                for(var i = 0; i < RO.Data.categories.length; i++){
                  if(RO.Data.categories[i].id === RO.Data.projects[j].categoryId){ catIdx = i; break; }
                }
                break;
              }
            }
          }
          return [catIdx, projIdx, task.createdAt || 0];
        }
        var ka = key(a), kb = key(b);
        return ka[0] !== kb[0] ? ka[0]-kb[0] : ka[1] !== kb[1] ? ka[1]-kb[1] : ka[2]-kb[2];
      });
    }

    activeTasks  = sortByCategory(activeTasks);
    somedayTasks = sortByCategory(somedayTasks);

    var table = document.createElement('table');
    table.id = 'inboxTable'; table.className = 'inbox-table';
    var thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Category</th><th>Project</th><th>Description</th><th></th><th>Actions</th></tr>';
    table.appendChild(thead);

    var tbody = document.createElement('tbody');

    // Active tasks + new-task row
    activeTasks.forEach(function(t){ tbody.appendChild(RO.UI.createInboxRow(t)); });
    tbody.appendChild(RO.UI.createInboxRow(null));

    // Someday section
    if(somedayTasks.length > 0){
      var expanded = !!RO.UI._somedayExpanded;

      var dividerRow = document.createElement('tr');
      dividerRow.className = 'someday-divider';
      var dividerTd = document.createElement('td');
      dividerTd.colSpan = 5;
      dividerTd.innerHTML =
        '<span class="someday-divider-label">Someday (' + somedayTasks.length + ')</span>' +
        '<span class="someday-divider-arrow">' + (expanded ? '▲' : '▼') + '</span>';
      dividerRow.appendChild(dividerTd);
      dividerRow.addEventListener('click', function(){
        RO.UI._somedayExpanded = !RO.UI._somedayExpanded;
        RO.UI.renderInbox();
      });
      tbody.appendChild(dividerRow);

      somedayTasks.forEach(function(t){
        var row = RO.UI.createInboxRow(t);
        if(!expanded) row.classList.add('hidden');
        tbody.appendChild(row);
      });
    }

    table.appendChild(tbody);
    container.appendChild(table);

    // Enter to save row
    table.addEventListener('keydown', function(e){
      if(e.key === 'Enter' && !e.isComposing && e.keyCode !== 229){
        var el = e.target;
        if(el.tagName && (el.tagName.toLowerCase() === 'input' || el.tagName.toLowerCase() === 'select')){
          e.preventDefault();
          var tr = el.closest('tr'); if(!tr) return;
          RO.UI.saveInboxRow(tr);
          RO.UI.renderInbox();
          setTimeout(function(){ RO.UI.focusLastInboxRow(); }, 50);
        }
      }
    });
    table.addEventListener('change', function(e){ var tr = e.target.closest('tr'); if(tr) RO.UI.saveInboxRow(tr); });
    table.addEventListener('blur', function(e){ var tr = e.target.closest('tr'); if(tr) RO.UI.saveInboxRow(tr); }, true);

    // click outside to exit edit mode
    function clickOutside(e){
      if(!table.contains(e.target)){ RO.UI.saveAllInboxRows(); document.removeEventListener('click', clickOutside); }
    }
    document.addEventListener('click', clickOutside);
  };

  RO.UI.saveAllInboxRows = function(){
    var table = document.getElementById('inboxTable'); if(!table) return;
    table.querySelectorAll('tbody tr').forEach(function(tr){ RO.UI.saveInboxRow(tr); });
  };

  RO.UI.createInboxRow = function(task){
    var tr = document.createElement('tr');
    if(task && task.id){ tr.dataset.id = task.id; tr.draggable = true; }
    var isSomeday = !!(task && task.someday);
    tr.className = (task && task.id) ? (isSomeday ? 'someday-row' : '') : 'new-row';

    // Age only for active (non-someday) rows
    var daysOld = (!isSomeday && task && task.id && task.createdAt)
      ? Math.floor((Date.now() - task.createdAt) / 86400000) : -1;

    // category select
    var tdCat = document.createElement('td');
    var selCat = document.createElement('select'); selCat.className = 'inbox-cat';
    var optEmpty = document.createElement('option'); optEmpty.value = ''; optEmpty.textContent = ''; selCat.appendChild(optEmpty);
    RO.Data.getActiveCategories().forEach(function(c){
      var o = document.createElement('option'); o.value = c.id; o.textContent = c.name;
      if(task){
        var p = RO.Data.projects.find(function(p){ return p.id === task.projectId; });
        if(p && p.categoryId === c.id) o.selected = true;
      }
      selCat.appendChild(o);
    });
    tdCat.appendChild(selCat); tr.appendChild(tdCat);

    // project select
    var tdProj = document.createElement('td');
    var selProj = document.createElement('select'); selProj.className = 'inbox-proj';
    var optPEmpty = document.createElement('option'); optPEmpty.value = ''; optPEmpty.textContent = ''; selProj.appendChild(optPEmpty);
    if(selCat.value){
      RO.Data.getProjectsByCategory(selCat.value, true).forEach(function(p){
        var o = document.createElement('option'); o.value = p.id; o.textContent = p.name;
        if(task && task.projectId === p.id) o.selected = true;
        selProj.appendChild(o);
      });
      var optAdd = document.createElement('option'); optAdd.value = '__add__'; optAdd.textContent = '+ 增加'; selProj.appendChild(optAdd);
    }
    tdProj.appendChild(selProj); tr.appendChild(tdProj);

    // description input
    var tdDesc = document.createElement('td');
    var inp = document.createElement('input'); inp.type = 'text'; inp.className = 'inbox-desc'; inp.value = task ? (task.title||'') : '';
    tdDesc.appendChild(inp); tr.appendChild(tdDesc);

    // age cell — empty for someday rows
    var tdAge = document.createElement('td');
    tdAge.className = 'inbox-age-cell';
    if(!isSomeday && daysOld > 0){
      var ageEl = document.createElement('span');
      ageEl.className = 'inbox-age' + (daysOld >= 14 ? ' danger' : daysOld >= 7 ? ' warn' : '');
      ageEl.textContent = daysOld + 'd';
      tdAge.appendChild(ageEl);
    }
    tr.appendChild(tdAge);

    // actions
    var tdAct = document.createElement('td');
    if(task && task.id){
      var parkBtn = isSomeday
        ? '<button data-action="someday-toggle" class="btn-activate">Activate</button>'
        : '<button data-action="someday-toggle" class="btn-park">Park</button>';
      tdAct.innerHTML = '<button data-action="move">Move</button> ' + parkBtn + ' <button data-action="delete">Delete</button>';
    }
    tr.appendChild(tdAct);

    if(task && task.projectId) tr.style.background = RO.getCategoryColor(task.projectId);
    // Age-based row tinting only for active rows
    if(!isSomeday){
      if(daysOld >= 14)     tr.classList.add('inbox-row-danger');
      else if(daysOld >= 7) tr.classList.add('inbox-row-warn');
    }

    selCat.addEventListener('change', function(){ RO.UI.filterProjectsForRow(tr); RO.UI.updateInboxRowColor(tr); });
    selProj.addEventListener('change', function(){
      if(selProj.value === '__add__') RO.UI.addProjectInline(tr, selCat.value);
      else RO.UI.updateInboxRowColor(tr);
    });
    return tr;
  };

  RO.UI.updateInboxRowColor = function(tr){
    var projId = tr.querySelector('.inbox-proj').value;
    if(projId && projId !== '__add__') tr.style.background = RO.getCategoryColor(projId);
    else tr.style.background = '';
  };

  RO.UI.filterProjectsForRow = function(tr){
    var cat     = tr.querySelector('.inbox-cat').value;
    var selProj = tr.querySelector('.inbox-proj');
    selProj.innerHTML = '<option value=""></option>';
    if(!cat) return;
    RO.Data.getProjectsByCategory(cat, true).forEach(function(p){
      var o = document.createElement('option'); o.value = p.id; o.textContent = p.name; selProj.appendChild(o);
    });
    var optAdd = document.createElement('option'); optAdd.value = '__add__'; optAdd.textContent = '+ 增加'; selProj.appendChild(optAdd);
  };

  RO.UI.addProjectInline = function(tr, catId){
    // Reset select immediately so __add__ isn't stuck while modal is open
    var selProj = tr.querySelector('.inbox-proj');
    if(selProj) selProj.value = '';

    RO.UI.showInputModal({
      title: 'New Project',
      fields: [{ id: 'name', label: 'Project Name', value: '', type: 'text' }],
      onSave: function(vals){
        var name = (vals.name || '').trim();
        if(!name){ return; }
        var newProj = RO.Data.createProject(name, catId);
        RO.UI.filterProjectsForRow(tr);
        var sel = tr.querySelector('.inbox-proj');
        if(newProj && sel) sel.value = newProj.id;
      }
    });
  };

  RO.UI.saveInboxRow = function(tr){
    var id   = tr.dataset.id;
    var proj = (tr.querySelector('.inbox-proj') && tr.querySelector('.inbox-proj').value) || null;
    var desc = (tr.querySelector('.inbox-desc') && tr.querySelector('.inbox-desc').value.trim()) || '';
    if(!id){
      if(!desc) return;
      var t = RO.Data.createTask({ title: desc, projectId: proj, date: null });
      tr.dataset.id = t.id;
      tr.classList.remove('new-row');
    } else {
      if(!desc) RO.Data.deleteTask(id);
      else RO.Data.updateTask(id, { title: desc, projectId: proj, date: null });
    }
  };

  RO.UI.focusLastInboxRow = function(){
    var table = document.getElementById('inboxTable'); if(!table) return;
    var rows = table.querySelectorAll('tbody tr'); if(!rows.length) return;
    var inp = rows[rows.length-1].querySelector('.inbox-desc'); if(inp) inp.focus();
  };

  /* ── Task edit modal ──────────────────────────────────────── */

  RO.UI.populateModalOptions = function(){
    var catSel  = document.getElementById('taskCategory');
    var projSel = document.getElementById('taskProject');
    if(!catSel || !projSel) return;
    catSel.innerHTML  = '';
    projSel.innerHTML = '<option value="">--</option>';
    RO.Data.getActiveCategories().forEach(function(c){
      var o = document.createElement('option'); o.value = c.id; o.textContent = c.name; catSel.appendChild(o);
    });
    (RO.Data.projects || []).filter(function(p){ return !p.archived && p.status !== 'archived'; }).forEach(function(p){
      var o = document.createElement('option'); o.value = p.id; o.textContent = p.name; projSel.appendChild(o);
    });
  };

  RO.UI.openModal = function(task){
    var modal = document.getElementById('editModal'); if(!modal) return;
    modal.classList.remove('hidden');
    RO.UI.populateModalOptions();
    if(!task){
      document.getElementById('modalTitle').textContent       = 'New Task';
      document.getElementById('taskTitle').value               = '';
      document.getElementById('taskCategory').value           = '';
      document.getElementById('taskProject').value            = '';
      document.getElementById('taskDate').value               = '';
      modal.dataset.taskId = '';
    } else {
      document.getElementById('modalTitle').textContent       = 'Edit Task';
      document.getElementById('taskTitle').value               = task.title || '';
      document.getElementById('taskCategory').value           = task.categoryId  || '';
      document.getElementById('taskProject').value            = task.projectId   || '';
      document.getElementById('taskDate').value               = task.date        || '';
      modal.dataset.taskId = task.id;
    }
  };

  RO.UI.closeModal = function(){
    var modal = document.getElementById('editModal');
    if(modal){ modal.classList.add('hidden'); modal.dataset.taskId = ''; }
  };

})();
