(function(){
  'use strict';
  window.RO = window.RO || {};
  RO.UI = RO.UI || {};

  /* ── Helpers ──────────────────────────────────────────────── */

  RO.UI.getProjectStatusLabel = function(status){
    var labels = { active: 'active', notStarted: '未开始', onHold: 'onHold', finished: 'finished', archived: 'archived' };
    return labels[status || 'active'] || (status || 'active');
  };

  // Within the same status, most-recently-worked-on project sorts first.
  // This replaces a manually-maintained "stage" label with a signal that's
  // always accurate: a project nobody has touched in weeks naturally sinks down.
  RO.UI.sortProjectsByStatus = function(projects){
    var order = { active: 0, notStarted: 1, onHold: 2, finished: 3, archived: 4 };
    return (projects || []).slice().sort(function(a, b){
      var aIsOthers = (a.name || '').toLowerCase() === 'others';
      var bIsOthers = (b.name || '').toLowerCase() === 'others';
      if(aIsOthers !== bIsOthers) return aIsOthers ? 1 : -1;
      var aRank = typeof order[a.status || 'active'] === 'number' ? order[a.status || 'active'] : 99;
      var bRank = typeof order[b.status || 'active'] === 'number' ? order[b.status || 'active'] : 99;
      if(aRank !== bRank) return aRank - bRank;
      var aTime = RO.Data.getLastTaskTime(a.id);
      var bTime = RO.Data.getLastTaskTime(b.id);
      if(aTime !== bTime) return bTime - aTime;
      return (a.name || '').localeCompare(b.name || '');
    });
  };

  RO.UI.sortProjectsForCategorySummary = function(projects){
    var order = { finished: 0, active: 1, notStarted: 2, onHold: 3, archived: 4 };
    return (projects || []).slice().sort(function(a, b){
      var aRank = typeof order[a.status || 'active'] === 'number' ? order[a.status || 'active'] : 99;
      var bRank = typeof order[b.status || 'active'] === 'number' ? order[b.status || 'active'] : 99;
      if(aRank !== bRank) return aRank - bRank;
      if((a.status || 'active') === 'finished' && (b.status || 'active') === 'finished'){
        var aTime = a.finishedAt || Number.MAX_SAFE_INTEGER;
        var bTime = b.finishedAt || Number.MAX_SAFE_INTEGER;
        if(aTime !== bTime) return aTime - bTime;
      }
      return (a.name || '').localeCompare(b.name || '');
    });
  };

  RO.UI.getProjectDuration = function(project){
    if(!project.startDate) return '';
    var end = project.dueDate || (project.status === 'finished' ? RO.UI.formatProjectDate(project.finishedAt) : RO.DateUtils.todayISO());
    if(!end) return '';
    var startDate = new Date(project.startDate + 'T00:00:00');
    var endDate   = new Date(end + 'T00:00:00');
    if(isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return '';
    return Math.max(0, Math.round((endDate - startDate) / 86400000)) + 'd';
  };

  /* ── Page navigation ──────────────────────────────────────── */

  // Under file:// (opening index.html directly instead of via a local server),
  // Chrome/Safari refuse history.replaceState with a SecurityError. That's just
  // cosmetic URL bookkeeping, so failing silently here must never block the
  // actual page switch below it.
  function safeReplaceHash(hash){
    if(window.location.hash === hash) return;
    try { window.history.replaceState(null, '', hash); }
    catch(e){ /* file:// origin restriction — ignore, navigation still works */ }
  }

  RO.UI.openProjectsPage = function(projectId){
    safeReplaceHash(projectId ? ('#projects/' + encodeURIComponent(projectId)) : '#projects');
    var main = document.querySelector('main.container');
    if(main){ main.classList.add('hidden'); main.style.display = 'none'; }
    var reviewPage = document.getElementById('reviewPage');
    if(reviewPage){ reviewPage.classList.add('hidden'); reviewPage.style.display = 'none'; }
    var page = document.getElementById('projectsPage'); if(!page) return;
    page.classList.remove('hidden'); page.style.display = 'flex';
    RO.UI.renderProjectsPage(projectId);
  };

  RO.UI.closeProjectsPage = function(){
    safeReplaceHash('#today');
    var page = document.getElementById('projectsPage');
    if(page){ page.classList.add('hidden'); page.style.display = 'none'; }
    var reviewPage = document.getElementById('reviewPage');
    if(reviewPage){ reviewPage.classList.add('hidden'); reviewPage.style.display = 'none'; }
    var main = document.querySelector('main.container');
    if(main){ main.classList.remove('hidden'); main.style.display = 'flex'; }
    RO.UI.renderAll();
  };

  RO.UI.openReviewPage = function(){
    safeReplaceHash('#review');
    var main = document.querySelector('main.container');
    if(main){ main.classList.add('hidden'); main.style.display = 'none'; }
    var projectsPage = document.getElementById('projectsPage');
    if(projectsPage){ projectsPage.classList.add('hidden'); projectsPage.style.display = 'none'; }
    var reviewPage = document.getElementById('reviewPage'); if(!reviewPage) return;
    reviewPage.classList.remove('hidden'); reviewPage.style.display = 'block';
    RO.UI.renderWeeklyReview();
  };

  /* ── Settings modal (Manage Projects) ─────────────────────── */

  RO.UI.openSettings = function(){
    var modal = document.getElementById('settingsModal'); if(!modal) return;
    modal.classList.remove('hidden');
    RO.UI.renderCategories();
  };

  RO.UI.closeSettings = function(){
    var modal = document.getElementById('settingsModal');
    if(modal) modal.classList.add('hidden');
  };

  /* ── Projects page ────────────────────────────────────────── */

  RO.UI.renderProjectsPage = function(selectedProjectId){
    var sidebar = document.getElementById('projectsSidebarCategories'); if(!sidebar) return;
    sidebar.innerHTML = '';

    var cats = RO.Data.getActiveCategories();
    var orderedProjects = [];

    cats.forEach(function(cat){
      var catDiv = document.createElement('div'); catDiv.className = 'pm-category';

      // colour dot (inline colour picker)
      var colorDot = document.createElement('label');
      colorDot.className = 'pm-color-dot pm-color-picker';
      colorDot.style.background = RO.getCategoryColor(null, cat.id);
      colorDot.title = 'Change category color';
      var colorInput = document.createElement('input'); colorInput.type = 'color'; colorInput.value = cat.color || '#f0f0f0';
      colorInput.onchange = function(e){
        e.stopPropagation();
        RO.Data.updateCategory(cat.id, { color: colorInput.value });
        RO.UI.renderAll();
        RO.UI.renderProjectsPage(selectedProjectId);
      };
      colorDot.appendChild(colorInput);

      var head = document.createElement('div'); head.className = 'pm-category-header';
      var title = document.createElement('span'); title.className = 'pm-cat-name';
      title.textContent = cat.name + ' (' + RO.Data.getProjectsByCategory(cat.id, false).length + ')';
      head.appendChild(colorDot); head.appendChild(title);
      head.onclick = function(e){
        if(e.target && e.target.closest('.pm-color-picker')) return;
        RO.UI.showCategorySummary(cat.id);
      };
      head.oncontextmenu = function(e){
        e.preventDefault();
        if(e.target && e.target.closest('.pm-color-picker')) return;
        RO.UI.showCategoryMenu(cat.id, e);
      };
      catDiv.appendChild(head);

      var projList = document.createElement('div'); projList.className = 'pm-project-section';
      var sortedProjects = RO.UI.sortProjectsByStatus(
        RO.Data.getProjectsByCategory(cat.id, true).filter(function(p){ return (p.status || 'active') !== 'finished'; })
      );
      orderedProjects = orderedProjects.concat(sortedProjects);

      sortedProjects.forEach(function(proj){
        var p = document.createElement('div'); p.className = 'project-list-item';
        var name = document.createElement('span'); name.className = 'project-list-name'; name.textContent = proj.name;
        var status = document.createElement('span'); status.className = 'project-list-status pm-status-' + (proj.status || 'active');
        var dot  = document.createElement('span'); dot.className = 'project-list-status-dot';
        var txt  = document.createElement('span'); txt.textContent = RO.UI.getProjectStatusLabel(proj.status);
        status.appendChild(dot); status.appendChild(txt);
        p.appendChild(name); p.appendChild(status);
        p.dataset.projId = proj.id;
        p.onclick = function(){ RO.UI.showProjectDetails(proj.id); };
        p.oncontextmenu = function(e){ e.preventDefault(); e.stopPropagation(); RO.UI.showProjectMenu(proj.id, e); };
        projList.appendChild(p);
      });

      var addBtn = document.createElement('button'); addBtn.className = 'pm-add-project'; addBtn.textContent = '+ Add Project';
      addBtn.onclick = function(){
        RO.UI.addProjectUnderCategory(cat.id, function(newProject){
          RO.UI.renderProjectsPage(newProject ? newProject.id : undefined);
        });
      };
      projList.appendChild(addBtn);
      catDiv.appendChild(projList);
      sidebar.appendChild(catDiv);
    });

    // add category button
    var addCatBtn = document.createElement('button'); addCatBtn.className = 'pm-add-category'; addCatBtn.textContent = '+ Add Category';
    addCatBtn.onclick = function(){
      RO.UI.showInputModal({
        title: 'Add Category',
        fields: [{ id: 'name', label: 'Name', value: '', type: 'text' }],
        onSave: function(vals){
          var name = (vals.name || '').trim();
          if(!name) return;
          var newCat = RO.Data.createCategory(name);
          if(!newCat){
            RO.UI.showConfirmModal({ message: 'A category with that name already exists.', confirmOnly: true });
            return;
          }
          RO.UI.renderProjectsPage();
          RO.UI.showCategorySummary(newCat.id);
        }
      });
    };
    sidebar.appendChild(addCatBtn);

    // auto-select first project if none given
    var activeCatIds = RO.Data.getActiveCategories().map(function(c){ return c.id; });
    var selectedProj = selectedProjectId
      ? (RO.Data.projects || []).find(function(p){ return p.id === selectedProjectId && !p.archived && p.status !== 'archived' && activeCatIds.indexOf(p.categoryId) >= 0; })
      : null;
    var firstProj = selectedProj || orderedProjects[0];
    if(firstProj) RO.UI.showProjectDetails(firstProj.id);
    else {
      var details = document.getElementById('projectDetails');
      if(details) details.textContent = 'Select a project from the left.';
    }
  };

  /* ── Category summary ─────────────────────────────────────── */

  RO.UI.showCategorySummary = function(categoryId){
    var details = document.getElementById('projectDetails'); if(!details) return;
    var cat = (RO.Data.categories || []).find(function(c){ return c.id === categoryId; });
    if(!cat){ details.textContent = 'Category not found'; return; }
    details.innerHTML = '';

    var title = document.createElement('h3'); title.textContent = cat.name + ' Projects';
    details.appendChild(title);

    // derivations section
    if(!Array.isArray(cat.derivations)) cat.derivations = [];
    var notesSection = document.createElement('section'); notesSection.className = 'category-notes-section';
    var notesHeader  = document.createElement('div');     notesHeader.className  = 'category-notes-header';
    var notesTitle   = document.createElement('h4');      notesTitle.textContent = 'Derivations / Notes (' + cat.derivations.length + ')';
    var addNoteBtn   = document.createElement('button');
    addNoteBtn.type = 'button'; addNoteBtn.textContent = '+ Add';
    addNoteBtn.onclick = function(){
      var entry = RO.Data.addCategoryDerivation(categoryId, { title: 'Untitled derivation', body: '' });
      if(entry) RO.UI.showCategoryDerivationEditor(categoryId, entry.id);
    };
    notesHeader.appendChild(notesTitle); notesHeader.appendChild(addNoteBtn);
    notesSection.appendChild(notesHeader);

    var notesList = document.createElement('div'); notesList.className = 'category-derivation-list';
    if(cat.derivations.length){
      cat.derivations.slice().sort(function(a, b){ return (b.updatedAt||0) - (a.updatedAt||0); }).forEach(function(entry){
        var item = document.createElement('div'); item.className = 'category-derivation-item';
        var main = document.createElement('button'); main.type = 'button'; main.className = 'category-derivation-open';
        main.onclick = function(){ RO.UI.showCategoryDerivationEditor(categoryId, entry.id); };
        var entryTitle = document.createElement('div'); entryTitle.className = 'category-derivation-title'; entryTitle.textContent = entry.title || 'Untitled derivation';
        var meta = document.createElement('div'); meta.className = 'category-derivation-meta'; meta.textContent = 'Updated ' + RO.UI.formatProjectDate(entry.updatedAt || entry.createdAt);
        main.appendChild(entryTitle); main.appendChild(meta);
        var del = document.createElement('button'); del.type = 'button'; del.className = 'category-derivation-delete'; del.textContent = 'Delete';
        del.onclick = function(){
          RO.UI.showConfirmModal({
            message: 'Delete derivation "' + (entry.title || 'Untitled derivation') + '"?',
            confirmText: 'Delete', danger: true,
            onConfirm: function(){
              var deleted = RO.Data.deleteCategoryDerivation(categoryId, entry.id);
              RO.UI.deleteDerivationFigureImages(deleted);
              RO.UI.showCategorySummary(categoryId);
            }
          });
        };
        item.appendChild(main); item.appendChild(del);
        notesList.appendChild(item);
      });
    } else {
      var emptyNotes = document.createElement('div'); emptyNotes.className = 'category-derivation-empty'; emptyNotes.textContent = 'No derivations yet.';
      notesList.appendChild(emptyNotes);
    }
    notesSection.appendChild(notesList);
    details.appendChild(notesSection);

    // projects table
    var table = document.createElement('table'); table.className = 'category-summary-table';
    var thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Name</th><th>Status</th><th>Start</th><th>Due</th><th>Duration</th><th>Description</th><th>Summary</th></tr>';
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    RO.UI.sortProjectsForCategorySummary(RO.Data.getProjectsByCategory(categoryId, false)).forEach(function(project){
      var tr = document.createElement('tr');
      tr.innerHTML = '<td></td><td></td><td></td><td></td><td></td><td></td><td></td>';
      tr.children[0].textContent = project.name || '';

      var statusSelect = document.createElement('select');
      statusSelect.className = 'category-summary-status pm-status-' + (project.status || 'active');
      ['finished','active','notStarted','onHold','archived'].forEach(function(s){
        var opt = document.createElement('option'); opt.value = s; opt.textContent = RO.UI.getProjectStatusLabel(s);
        if((project.status || 'active') === s) opt.selected = true;
        statusSelect.appendChild(opt);
      });
      statusSelect.onchange = function(){
        RO.Data.updateProject(project.id, { status: statusSelect.value, archived: statusSelect.value === 'archived' });
        RO.UI.renderProjectsPage();
        RO.UI.showCategorySummary(categoryId);
      };
      tr.children[1].appendChild(statusSelect);
      tr.children[2].textContent = project.startDate   || '';
      tr.children[3].textContent = project.dueDate     || '';
      tr.children[4].textContent = RO.UI.getProjectDuration(project);
      tr.children[5].textContent = project.description || '';
      tr.children[6].textContent = project.summary     || '';
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    details.appendChild(table);
  };

  /* ── Project detail view ──────────────────────────────────── */

  RO.UI.showProjectDetails = function(projId){
    var details = document.getElementById('projectDetails'); if(!details) return;
    var proj = RO.Data.projects.find(function(p){ return p.id === projId; });
    if(!proj){ details.textContent = 'Project not found'; return; }
    details.innerHTML = '';
    // Keep the URL in sync with whichever project is actually on screen, so a
    // refresh reopens this same project instead of falling back to the first
    // one in list order (see RO.UI.openProjectsPage / app.js boot).
    safeReplaceHash('#projects/' + encodeURIComponent(projId));

    function formatTaskDate(ts){
      if(!ts) return '';
      var d = new Date(ts);
      return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    }

    var header = document.createElement('div'); header.className = 'project-header';
    var titleInput = document.createElement('input'); titleInput.value = proj.name; titleInput.className = 'project-title';
    header.appendChild(titleInput);

    var statusSel = document.createElement('select'); statusSel.className = 'project-status';
    ['active','notStarted','onHold','finished','archived'].forEach(function(s){
      var o = document.createElement('option'); o.value = s; o.textContent = RO.UI.getProjectStatusLabel(s);
      if(proj.status === s) o.selected = true;
      statusSel.appendChild(o);
    });
    header.appendChild(statusSel);

    var deleteBtn = document.createElement('button'); deleteBtn.type = 'button'; deleteBtn.className = 'project-delete'; deleteBtn.textContent = 'Delete';
    deleteBtn.onclick = function(){
      RO.UI.showConfirmModal({
        message: 'Delete project "' + proj.name + '"? Historical tasks will be preserved.',
        confirmText: 'Delete', danger: true,
        onConfirm: function(){
          RO.Data.deleteProject(projId);
          RO.UI.renderAll();
          RO.UI.renderProjectsPage();
        }
      });
    };
    header.appendChild(deleteBtn);

    // Goal ("目标描述"): sticky so it's always visible while scrolling this
    // project's tasks, editable in place, with an append-only change history
    // and a live list of what each still-open task's latest conclusion is.
    var goalWrap = document.createElement('div'); goalWrap.className = 'project-goal-sticky';

    var goalInput = document.createElement('textarea');
    goalInput.className = 'project-goal-input auto-height';
    goalInput.value = proj.description || '';
    goalInput.rows = 1;
    goalInput.placeholder = '目标：这个 part 要解决什么问题？';

    var goalHistory = (proj.descriptionHistory || []);
    var historyToggle = document.createElement('button');
    historyToggle.type = 'button'; historyToggle.className = 'project-goal-history-toggle';
    historyToggle.textContent = '历史 (' + goalHistory.length + ')';

    var historyList = document.createElement('div'); historyList.className = 'project-goal-history hidden';
    goalHistory.slice().reverse().forEach(function(h){
      var item = document.createElement('div'); item.className = 'project-goal-history-item';
      var date = document.createElement('div'); date.className = 'project-goal-history-date';
      date.textContent = RO.UI.formatProjectDate(h.changedAt);
      var val = document.createElement('div'); val.textContent = h.value || '(空)';
      item.appendChild(date); item.appendChild(val);
      historyList.appendChild(item);
    });
    historyToggle.onclick = function(){ historyList.classList.toggle('hidden'); };

    goalInput.addEventListener('input', function(){ RO.UI.fitTextarea(goalInput); });
    goalInput.addEventListener('blur', function(){
      RO.Data.updateProjectDescription(projId, goalInput.value);
      RO.UI.showProjectDetails(projId); // refresh history list / active-task conclusions
    });

    var conclusionsWrap = document.createElement('div'); conclusionsWrap.className = 'project-goal-conclusions';
    RO.Data.getActiveTaskConclusions(projId).forEach(function(row){
      var line = document.createElement('div'); line.className = 'project-goal-conclusion-line';
      var titleSpan = document.createElement('span'); titleSpan.className = 'project-goal-conclusion-title';
      titleSpan.textContent = (row.title || '(未命名)') + '：';
      var concSpan = document.createElement('span');
      if(row.conclusion) RO.UI.appendTextWithHashHighlight(concSpan, row.conclusion);
      else concSpan.textContent = '暂无结论';
      line.appendChild(titleSpan); line.appendChild(concSpan);
      conclusionsWrap.appendChild(line);
    });

    goalWrap.appendChild(goalInput);
    goalWrap.appendChild(historyToggle);
    goalWrap.appendChild(historyList);
    goalWrap.appendChild(conclusionsWrap);
    details.appendChild(goalWrap);

    var datesDiv  = document.createElement('div'); datesDiv.className = 'project-dates';
    var startLabel = document.createElement('label'); startLabel.textContent = 'Start date';
    var startInput = document.createElement('input'); startInput.type = 'date'; startInput.value = proj.startDate || '';
    var dueLabel   = document.createElement('label'); dueLabel.textContent = 'Due date';
    var dueInput   = document.createElement('input'); dueInput.type = 'date'; dueInput.value = proj.dueDate || '';
    datesDiv.appendChild(startLabel); datesDiv.appendChild(startInput); datesDiv.appendChild(dueLabel); datesDiv.appendChild(dueInput);
    details.appendChild(datesDiv);

    var sumLabel = document.createElement('label'); sumLabel.textContent = 'Summary / Conclusions';
    var sum = document.createElement('textarea'); sum.value = proj.summary || ''; sum.rows = 4; sum.className = 'auto-height';
    sum.addEventListener('input', function(){ RO.UI.fitTextarea(sum); });
    details.appendChild(sumLabel); details.appendChild(sum);

    setTimeout(function(){ RO.UI.fitTextarea(goalInput); RO.UI.fitTextarea(sum); }, 0);

    // Note: the goal ("description") is saved separately via updateProjectDescription
    // (see goalInput's blur handler above) so every change is recorded in history,
    // instead of being folded into this generic patch.
    function saveProjectDetails(renderAfterSave){
      RO.Data.updateProject(projId, {
        name: titleInput.value, status: statusSel.value,
        archived: statusSel.value === 'archived',
        startDate: startInput.value,
        dueDate: dueInput.value, summary: sum.value
      });
      if(renderAfterSave) RO.UI.renderProjectsPage();
    }

    var autoSaveTimer = null;
    function scheduleProjectSave(){ clearTimeout(autoSaveTimer); autoSaveTimer = setTimeout(function(){ saveProjectDetails(false); }, 300); }

    function updateSidebarProjectName(){
      var item = document.querySelector('.project-list-item[data-proj-id="' + projId + '"] .project-list-name');
      if(item) item.textContent = titleInput.value;
    }
    function updateSidebarProjectStatus(){
      var item = document.querySelector('.project-list-item[data-proj-id="' + projId + '"] .project-list-status');
      if(!item) return;
      item.className = 'project-list-status pm-status-' + (statusSel.value || 'active');
      var txt = item.querySelector('span:last-child');
      if(txt) txt.textContent = RO.UI.getProjectStatusLabel(statusSel.value);
    }

    titleInput.addEventListener('input', function(){ updateSidebarProjectName(); scheduleProjectSave(); });
    sum.addEventListener('input',  scheduleProjectSave);
    titleInput.addEventListener('blur', function(){ saveProjectDetails(false); });
    sum.addEventListener('blur',  function(){ saveProjectDetails(false); });
    startInput.addEventListener('change', function(){ saveProjectDetails(false); });
    dueInput.addEventListener('change',   function(){ saveProjectDetails(false); });
    statusSel.addEventListener('change', function(){ updateSidebarProjectStatus(); saveProjectDetails(statusSel.value === 'archived'); });

    details.insertBefore(header, goalWrap);

    // Important Results section
    function renderProjectResultsSection(){
      if(!Array.isArray(proj.results)) proj.results = [];
      var sectionHeader = document.createElement('div'); sectionHeader.className = 'project-section-header';
      var h = document.createElement('h4'); h.textContent = 'Important Results (' + proj.results.length + ')';
      var addResultBtn = document.createElement('button'); addResultBtn.type = 'button'; addResultBtn.textContent = '+ Add Result';
      addResultBtn.onclick = function(){ RO.UI.openResultModal(projId, null); };
      sectionHeader.appendChild(h); sectionHeader.appendChild(addResultBtn);
      details.appendChild(sectionHeader);

      if(!proj.results.length){
        var empty = document.createElement('div'); empty.className = 'project-task-empty'; empty.textContent = 'No important results';
        details.appendChild(empty); return;
      }

      var table = document.createElement('table'); table.className = 'project-results-table';
      var thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>Title</th><th>Description</th><th>Image</th><th>Actions</th></tr>';
      table.appendChild(thead);
      var tbody = document.createElement('tbody');
      proj.results.slice().sort(function(a, b){ return (b.createdAt||0) - (a.createdAt||0); }).forEach(function(result){
        var tr = document.createElement('tr');
        var titleTd = document.createElement('td'); titleTd.textContent = result.title || '';
        var descTd  = document.createElement('td'); descTd.textContent  = result.description || '';
        var imageTd = document.createElement('td');
        if(result.imageId || result.imageDataUrl){
          var imageLink = document.createElement('button'); imageLink.type = 'button'; imageLink.className = 'text-link'; imageLink.textContent = 'View image';
          imageLink.onclick = function(){ RO.UI.openResultImagePreview(result); };
          imageTd.appendChild(imageLink);
        }
        var actionsTd = document.createElement('td');
        var editBtn   = document.createElement('button'); editBtn.type = 'button'; editBtn.textContent = 'Edit';
        editBtn.onclick = function(){ RO.UI.openResultModal(projId, result.id); };
        var deleteResultBtn = document.createElement('button'); deleteResultBtn.type = 'button'; deleteResultBtn.textContent = 'Delete';
        deleteResultBtn.onclick = function(){
          RO.UI.showConfirmModal({
            message: 'Delete result "' + (result.title || '') + '"?',
            confirmText: 'Delete', danger: true,
            onConfirm: function(){
              var deleted = RO.Data.deleteProjectResult(projId, result.id);
              if(deleted && deleted.imageId && RO.ImageStore) RO.ImageStore.deleteImage(deleted.imageId);
              RO.UI.showProjectDetails(projId);
            }
          });
        };
        actionsTd.appendChild(editBtn); actionsTd.appendChild(deleteResultBtn);
        tr.appendChild(titleTd); tr.appendChild(descTd); tr.appendChild(imageTd); tr.appendChild(actionsTd);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody); details.appendChild(table);
    }

    function createProjectTaskRow(t){
      var tr = document.createElement('div'); tr.className = 'task-row';
      if(t.completed) tr.classList.add('task-row-completed');
      var chk = document.createElement('input'); chk.type = 'checkbox'; chk.checked = t.completed;
      chk.onchange = function(){ RO.Data.toggleComplete(t.id); RO.UI.renderAll(); RO.UI.showProjectDetails(projId); };
      var main = document.createElement('div'); main.className = 'project-task-main';
      var taskTitle = document.createElement('div'); taskTitle.className = 'project-task-title'; taskTitle.textContent = t.title || '';
      var metaEl    = document.createElement('div'); metaEl.className    = 'project-task-meta';
      var metaParts = [t.date ? t.date : 'Inbox'];
      if(t.createdAt) metaParts.push('Created ' + formatTaskDate(t.createdAt));
      if(t.completed && t.completedAt) metaParts.push('Completed ' + formatTaskDate(t.completedAt));
      metaEl.textContent = metaParts.join(' · ');
      main.appendChild(taskTitle); main.appendChild(metaEl);
      var progressEl = document.createElement('div'); progressEl.className = 'project-task-progress';
      if(t.log) RO.UI.appendTextWithHashHighlight(progressEl, t.log);
      tr.appendChild(chk); tr.appendChild(main); tr.appendChild(progressEl);
      return tr;
    }

    function renderProjectTaskSection(titleText, tasks, emptyText){
      var h = document.createElement('h4'); h.textContent = titleText + ' (' + tasks.length + ')';
      details.appendChild(h);
      var list = document.createElement('div'); list.className = 'project-tasks';
      if(tasks.length){
        tasks.forEach(function(t){ list.appendChild(createProjectTaskRow(t)); });
      } else {
        var empty = document.createElement('div'); empty.className = 'project-task-empty'; empty.textContent = emptyText;
        list.appendChild(empty);
      }
      details.appendChild(list);
    }

    renderProjectResultsSection();
    renderProjectTaskSection('Open tasks',      RO.Data.getOpenTasksByProject(projId),      'No open tasks');
    renderProjectTaskSection('Completed tasks', RO.Data.getCompletedTasksByProject(projId), 'No completed tasks');
  };

  /* ── Weekly Review ────────────────────────────────────────── */

  RO.UI.getCurrentWeekRange = function(){
    var now   = new Date();
    var start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var day   = start.getDay();
    start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
    var end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
    return { start: start, end: end };
  };

  RO.UI.renderWeeklyReview = function(){
    var meta = document.getElementById('weeklyReviewMeta');
    var list = document.getElementById('weeklyReviewList');
    if(!meta || !list) return;

    var range = RO.UI.getCurrentWeekRange();
    meta.textContent = RO.UI.formatProjectDate(range.start.getTime()) + ' ~ ' + RO.UI.formatProjectDate(range.end.getTime());
    list.innerHTML = '';

    var completedTasks = (RO.Data.tasks || []).filter(function(t){
      return t.completed && t.completedAt && t.completedAt >= range.start.getTime() && t.completedAt <= range.end.getTime();
    });

    if(!completedTasks.length){
      var empty = document.createElement('div'); empty.className = 'review-empty'; empty.textContent = 'No completed tasks this week.';
      list.appendChild(empty); return;
    }

    (RO.Data.categories || []).forEach(function(category){
      var categoryTasks = completedTasks.filter(function(t){
        var p = (RO.Data.projects || []).find(function(p){ return p.id === t.projectId; });
        return p && p.categoryId === category.id;
      });
      if(!categoryTasks.length) return;

      var catSection = document.createElement('section'); catSection.className = 'review-category';
      var catTitle = document.createElement('h4'); catTitle.textContent = category.name;
      catSection.appendChild(catTitle);

      RO.UI.sortProjectsByStatus(RO.Data.getProjectsByCategory(category.id, false)).forEach(function(project){
        var projectTasks = categoryTasks.filter(function(t){ return t.projectId === project.id; })
          .sort(function(a, b){ return (a.completedAt||0) - (b.completedAt||0); });
        if(!projectTasks.length) return;

        var projectBlock = document.createElement('div'); projectBlock.className = 'review-project';
        var projectTitle = document.createElement('div'); projectTitle.className = 'review-project-title'; projectTitle.textContent = project.name;
        projectBlock.appendChild(projectTitle);

        var ul = document.createElement('ul'); ul.className = 'review-task-list';
        projectTasks.forEach(function(t){
          var li = document.createElement('li');
          var main = document.createElement('div'); main.className = 'review-task-main';
          var dateEl = document.createElement('div'); dateEl.className = 'review-task-date'; dateEl.textContent = RO.UI.formatProjectDate(t.completedAt);
          var titleEl = document.createElement('div'); titleEl.className = 'review-task-title'; titleEl.textContent = t.title || '';
          main.appendChild(dateEl); main.appendChild(titleEl);
          li.appendChild(main);
          if(t.log){
            var detail = document.createElement('div'); detail.className = 'review-task-detail';
            RO.UI.appendTextWithHashHighlight(detail, t.log);
            li.appendChild(detail);
          }
          ul.appendChild(li);
        });
        projectBlock.appendChild(ul);
        catSection.appendChild(projectBlock);
      });
      list.appendChild(catSection);
    });
  };

  /* ── Settings modal – categories tree ────────────────────── */

  RO.UI.renderCategories = function(){
    var cont = document.getElementById('categoriesList'); if(!cont) return;
    cont.innerHTML = '';
    RO.Data.getActiveCategories().forEach(function(cat){
      var catDiv  = document.createElement('div'); catDiv.className = 'pm-category';
      var isExpanded = RO.Data.isCategoryExpanded(cat.id);

      var catHead = document.createElement('div'); catHead.className = 'pm-category-header'; catHead.style.cursor = 'pointer';
      var toggleBtn = document.createElement('span'); toggleBtn.className = 'pm-toggle'; toggleBtn.textContent = isExpanded ? '▼' : '▶';
      var colorDot  = document.createElement('span'); colorDot.className  = 'pm-color-dot'; colorDot.style.background = RO.getCategoryColor(null, cat.id);
      var catName   = document.createElement('span'); catName.className   = 'pm-cat-name'; catName.textContent = cat.name;
      var countSpan = document.createElement('span'); countSpan.className = 'pm-count'; countSpan.textContent = '(' + RO.Data.getProjectsByCategory(cat.id, false).length + ')';
      var catActions = document.createElement('div'); catActions.className = 'pm-cat-actions';
      var catMenuBtn = document.createElement('button'); catMenuBtn.className = 'pm-menu-btn'; catMenuBtn.textContent = '...';
      catMenuBtn.onclick = function(e){ e.stopPropagation(); RO.UI.showCategoryMenu(cat.id, catMenuBtn); };
      catActions.appendChild(catMenuBtn);

      catHead.appendChild(toggleBtn); catHead.appendChild(colorDot); catHead.appendChild(catName); catHead.appendChild(countSpan); catHead.appendChild(catActions);
      catHead.onclick = function(){ RO.Data.toggleCategoryExpanded(cat.id); RO.UI.renderCategories(); };
      catDiv.appendChild(catHead);

      if(isExpanded){
        var projSection = document.createElement('div'); projSection.className = 'pm-project-section';
        RO.UI.sortProjectsByStatus(RO.Data.getProjectsByCategory(cat.id, false)).forEach(function(proj){
          projSection.appendChild(RO.UI.renderProjectRow(proj));
        });
        var addBtn = document.createElement('button'); addBtn.className = 'pm-add-project'; addBtn.textContent = '+ Add Project';
        addBtn.onclick = function(){
          RO.UI.addProjectUnderCategory(cat.id, function(){ RO.UI.renderCategories(); });
        };
        projSection.appendChild(addBtn);
        catDiv.appendChild(projSection);
      }
      cont.appendChild(catDiv);
    });

    var addCatBtn = document.createElement('button'); addCatBtn.className = 'pm-add-category'; addCatBtn.textContent = '+ Add Category';
    addCatBtn.onclick = function(){ RO.UI.addCategory(); };
    cont.appendChild(addCatBtn);
  };

  RO.UI.renderProjectRow = function(proj){
    var row = document.createElement('div'); row.className = 'pm-project-row'; row.dataset.projId = proj.id;
    var nameAndStatus = document.createElement('div'); nameAndStatus.className = 'pm-proj-name-status';
    var name   = document.createElement('span'); name.className   = 'pm-proj-name'; name.textContent = proj.name;
    var status = document.createElement('span'); status.className = 'pm-proj-status pm-status-' + (proj.status || 'active');
    var statusTexts = { active: '●', notStarted: '○', onHold: '⏸', finished: '✓', archived: '📦' };
    status.textContent = (statusTexts[proj.status] || '●') + ' ' + RO.UI.getProjectStatusLabel(proj.status);
    nameAndStatus.appendChild(name); nameAndStatus.appendChild(status);
    row.appendChild(nameAndStatus);
    var menuBtn = document.createElement('button'); menuBtn.className = 'pm-menu-btn'; menuBtn.textContent = '⋯';
    menuBtn.onclick = function(e){ e.stopPropagation(); RO.UI.showProjectMenu(proj.id, menuBtn); };
    row.appendChild(menuBtn);
    return row;
  };

  RO.UI.refreshProjectViews = function(selectedProjectId){
    RO.UI.renderAll();
    var projectsPage = document.getElementById('projectsPage');
    if(projectsPage && !projectsPage.classList.contains('hidden') && projectsPage.style.display !== 'none'){
      RO.UI.renderProjectsPage(selectedProjectId);
    }
    RO.UI.renderCategories();
  };

  /* ── Context menus ────────────────────────────────────────── */

  RO.UI.positionMenu = function(menu, trigger){
    document.body.appendChild(menu);
    menu.style.position = 'fixed';
    var top, left;
    if(trigger && typeof trigger.clientX === 'number'){
      top = trigger.clientY; left = trigger.clientX;
    } else if(trigger && trigger.getBoundingClientRect){
      var rect = trigger.getBoundingClientRect();
      top = rect.bottom + 4; left = rect.right - 100;
    } else { top = 0; left = 0; }
    menu.style.top  = Math.max(4, Math.min(top,  window.innerHeight - menu.offsetHeight - 4)) + 'px';
    menu.style.left = Math.max(4, Math.min(left, window.innerWidth  - menu.offsetWidth  - 4)) + 'px';
    setTimeout(function(){
      function closeMenu(e){ if(!menu.contains(e.target)){ menu.remove(); document.removeEventListener('click', closeMenu); document.removeEventListener('contextmenu', closeMenu); } }
      document.addEventListener('click', closeMenu);
      document.addEventListener('contextmenu', closeMenu);
    }, 0);
  };

  RO.UI.showProjectMenu = function(projId, triggerBtn){
    var existing = document.querySelector('.pm-menu'); if(existing) existing.remove();
    var proj = RO.Data.projects.find(function(p){ return p.id === projId; }); if(!proj) return;
    var menu = document.createElement('div'); menu.className = 'pm-menu';

    function menuItem(text, danger, fn){
      var item = document.createElement('div'); item.className = 'pm-menu-item' + (danger ? ' pm-menu-item-danger' : '');
      item.textContent = text;
      item.onclick = function(){ menu.remove(); fn(); };
      menu.appendChild(item);
    }

    menuItem('Rename',          false, function(){ RO.UI.editProject(projId); });
    menuItem('Change Status',   false, function(){ RO.UI.changeProjectStatus(projId); });
    menuItem('Change Category', false, function(){ RO.UI.changeProjectCategory(projId); });
    menuItem('Delete',          true,  function(){
      RO.UI.showConfirmModal({
        message: 'Delete project "' + proj.name + '"? Historical tasks will be preserved.',
        confirmText: 'Delete', danger: true,
        onConfirm: function(){ RO.Data.deleteProject(projId); RO.UI.refreshProjectViews(); }
      });
    });

    RO.UI.positionMenu(menu, triggerBtn);
  };

  RO.UI.showCategoryMenu = function(catId, triggerBtn){
    var existing = document.querySelector('.pm-menu'); if(existing) existing.remove();
    var cat = RO.Data.categories.find(function(c){ return c.id === catId; }); if(!cat) return;
    var menu = document.createElement('div'); menu.className = 'pm-menu';

    function menuItem(text, danger, fn){
      var item = document.createElement('div'); item.className = 'pm-menu-item' + (danger ? ' pm-menu-item-danger' : '');
      item.textContent = text;
      item.onclick = function(){ menu.remove(); fn(); };
      menu.appendChild(item);
    }

    menuItem('Rename',     false, function(){ RO.UI.editCategory(catId); });
    menuItem('Edit Color', false, function(){ RO.UI.editCategoryColor(catId); });
    menuItem('Delete',     true,  function(){ RO.UI.archiveCategory(catId); });

    RO.UI.positionMenu(menu, triggerBtn);
  };

  /* ── Category CRUD (use showInputModal / showConfirmModal) ── */

  RO.UI.editCategory = function(catId){
    var cat = RO.Data.categories.find(function(c){ return c.id === catId; }); if(!cat) return;
    RO.UI.showInputModal({
      title: 'Rename Category',
      fields: [{ id: 'name', label: 'Name', value: cat.name, type: 'text' }],
      onSave: function(vals){
        var name = (vals.name || '').trim();
        if(name){ RO.Data.updateCategory(catId, { name: name }); RO.UI.refreshProjectViews(); }
      }
    });
  };

  RO.UI.editCategoryColor = function(catId){
    var cat = RO.Data.categories.find(function(c){ return c.id === catId; }); if(!cat) return;
    RO.UI.showInputModal({
      title: 'Category Color',
      fields: [{ id: 'color', label: 'Color', value: cat.color || '#f0f0f0', type: 'color' }],
      onSave: function(vals){
        if(vals.color){ RO.Data.updateCategory(catId, { color: vals.color }); RO.UI.refreshProjectViews(); }
      }
    });
  };

  RO.UI.archiveCategory = function(catId){
    var cat = RO.Data.categories.find(function(c){ return c.id === catId; }); if(!cat) return;
    RO.UI.showConfirmModal({
      message: 'Archive category "' + cat.name + '"? Historical tasks will be preserved.',
      confirmText: 'Archive', danger: true,
      onConfirm: function(){ RO.Data.deleteCategory(catId); RO.UI.refreshProjectViews(); }
    });
  };

  RO.UI.addCategory = function(){
    RO.UI.showInputModal({
      title: 'Add Category',
      fields: [{ id: 'name', label: 'Name', value: '', type: 'text' }],
      onSave: function(vals){
        var name = (vals.name || '').trim();
        if(name){ RO.Data.createCategory(name); RO.UI.renderCategories(); }
      }
    });
  };

  /* ── Project CRUD (use showInputModal / showConfirmModal) ─── */

  RO.UI.editProject = function(projId){
    var proj = RO.Data.projects.find(function(p){ return p.id === projId; }); if(!proj) return;
    RO.UI.showInputModal({
      title: 'Rename Project',
      fields: [{ id: 'name', label: 'Name', value: proj.name, type: 'text' }],
      onSave: function(vals){
        var name = (vals.name || '').trim();
        if(name){ RO.Data.updateProject(projId, { name: name }); RO.UI.refreshProjectViews(projId); }
      }
    });
  };

  RO.UI.changeProjectStatus = function(projId){
    var proj = RO.Data.projects.find(function(p){ return p.id === projId; }); if(!proj) return;
    var statuses = ['active','notStarted','onHold','finished','archived'];
    var labels   = { active:'Active', notStarted:'未开始', onHold:'On Hold', finished:'Finished', archived:'Archived' };
    RO.UI.showInputModal({
      title: 'Change Status',
      fields: [{
        id: 'status', label: 'Status', value: proj.status || 'active', type: 'select',
        options: statuses.map(function(s){ return { value: s, label: labels[s] || s }; })
      }],
      saveLabel: 'Apply',
      onSave: function(vals){
        var newStatus = vals.status;
        if(newStatus){
          RO.Data.updateProject(projId, { status: newStatus, archived: newStatus === 'archived' });
          RO.UI.refreshProjectViews(newStatus === 'archived' || newStatus === 'finished' ? undefined : projId);
        }
      }
    });
  };

  RO.UI.changeProjectCategory = function(projId){
    var proj = RO.Data.projects.find(function(p){ return p.id === projId; }); if(!proj) return;
    var cats = RO.Data.getActiveCategories();
    RO.UI.showInputModal({
      title: 'Change Category',
      fields: [{
        id: 'catId', label: 'Category', value: proj.categoryId || '', type: 'select',
        options: cats.map(function(c){ return { value: c.id, label: c.name }; })
      }],
      saveLabel: 'Apply',
      onSave: function(vals){
        if(vals.catId){ RO.Data.updateProject(projId, { categoryId: vals.catId }); RO.UI.refreshProjectViews(projId); }
      }
    });
  };

  RO.UI.addProjectUnderCategory = function(catId, onDone){
    RO.UI.showInputModal({
      title: 'New Project',
      fields: [{ id: 'name', label: 'Project Name', value: '', type: 'text' }],
      onSave: function(vals){
        var name = (vals.name || '').trim();
        if(!name) return;
        var project = RO.Data.createProject(name, catId);
        if(typeof onDone === 'function') onDone(project);
        else RO.UI.renderCategories();
      }
    });
  };

})();
