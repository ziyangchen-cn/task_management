(function(){
  'use strict';
  window.RO = window.RO || {};
  RO.UI = RO.UI || {};

  /* ── Derivation editor ────────────────────────────────────── */

  RO.UI.showCategoryDerivationEditor = function(categoryId, derivationId){
    var details = document.getElementById('projectDetails'); if(!details) return;
    var cat = (RO.Data.categories || []).find(function(c){ return c.id === categoryId; });
    if(!cat || !Array.isArray(cat.derivations)){ details.textContent = 'Derivation not found'; return; }
    var entry = cat.derivations.find(function(d){ return d.id === derivationId; });
    if(!entry){ details.textContent = 'Derivation not found'; return; }
    details.innerHTML = '';

    // header row
    var header = document.createElement('div'); header.className = 'derivation-editor-header';
    var back = document.createElement('button'); back.type = 'button'; back.textContent = '< Back to ' + cat.name;
    back.onclick = function(){ RO.UI.showCategorySummary(categoryId); };
    var del = document.createElement('button'); del.type = 'button'; del.className = 'project-delete'; del.textContent = 'Delete';
    del.onclick = function(){
      RO.UI.showConfirmModal({
        message: 'Delete derivation "' + (entry.title || 'Untitled derivation') + '"?',
        confirmText: 'Delete', danger: true,
        onConfirm: function(){
          var deleted = RO.Data.deleteCategoryDerivation(categoryId, derivationId);
          RO.UI.deleteDerivationFigureImages(deleted);
          RO.UI.showCategorySummary(categoryId);
        }
      });
    };
    header.appendChild(back); header.appendChild(del);
    details.appendChild(header);

    // title
    var titleLabel = document.createElement('label'); titleLabel.textContent = 'Title';
    var titleInput = document.createElement('input'); titleInput.className = 'derivation-title-input'; titleInput.value = entry.title || '';
    titleLabel.appendChild(titleInput);

    // body
    var bodyLabel = document.createElement('label'); bodyLabel.textContent = 'Body';
    var body = document.createElement('textarea');
    body.className = 'derivation-body-input auto-height'; body.rows = 14;
    body.placeholder = 'Markdown notes. Use $inline math$, $$display math$$, and {{fig:figure_id}}.';
    body.value = entry.bodyMarkdown || entry.body || '';

    // figures section
    var figuresSection = document.createElement('section'); figuresSection.className = 'derivation-figures-section';
    var figuresHeader  = document.createElement('div');     figuresHeader.className  = 'derivation-figures-header';
    var figuresTitle   = document.createElement('h4');      figuresTitle.textContent = 'Figures';
    var addFigureBtn   = document.createElement('button');  addFigureBtn.type = 'button'; addFigureBtn.textContent = '+ Add Figure';
    var figureFileInput = document.createElement('input');  figureFileInput.type = 'file'; figureFileInput.accept = 'image/*'; figureFileInput.className = 'hidden';
    figuresHeader.appendChild(figuresTitle); figuresHeader.appendChild(addFigureBtn); figuresHeader.appendChild(figureFileInput);
    var figuresList = document.createElement('div'); figuresList.className = 'derivation-figures-list';
    figuresSection.appendChild(figuresHeader); figuresSection.appendChild(figuresList);

    // preview
    var previewLabel = document.createElement('h4'); previewLabel.className = 'derivation-preview-title'; previewLabel.textContent = 'Preview';
    var preview = document.createElement('div'); preview.className = 'derivation-preview markdown-body';

    /* helpers */
    function saveEntry(){
      RO.Data.updateCategoryDerivation(categoryId, derivationId, {
        title: titleInput.value.trim() || 'Untitled derivation',
        body: body.value, bodyMarkdown: body.value
      });
    }

    function insertAtCursor(textarea, text){
      var start = textarea.selectionStart || 0;
      var end   = textarea.selectionEnd   || 0;
      textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
      textarea.selectionStart = textarea.selectionEnd = start + text.length;
    }

    function renderPreview(){
      RO.UI.renderMarkdownWithFigures(preview, body.value, entry.figures || []);
    }

    function scheduleSave(){
      clearTimeout(body._saveTimer);
      body._saveTimer = setTimeout(function(){ saveEntry(); renderPreview(); }, 300);
    }

    function renderFiguresList(){
      figuresList.innerHTML = '';
      if(!Array.isArray(entry.figures)) entry.figures = [];
      if(!entry.figures.length){
        var empty = document.createElement('div'); empty.className = 'category-derivation-empty'; empty.textContent = 'No figures yet.';
        figuresList.appendChild(empty); return;
      }
      entry.figures.forEach(function(fig){
        var row  = document.createElement('div'); row.className  = 'derivation-figure-row';
        var main = document.createElement('div'); main.className = 'derivation-figure-main';
        var id   = document.createElement('code'); id.textContent = '{{fig:' + fig.id + '}}';
        var caption = document.createElement('div'); caption.className = 'derivation-figure-caption'; caption.textContent = fig.caption || '';
        main.appendChild(id); main.appendChild(caption);

        var insertBtn = document.createElement('button'); insertBtn.type = 'button'; insertBtn.textContent = 'Insert';
        insertBtn.onclick = function(){
          insertAtCursor(body, '\n{{fig:' + fig.id + '}}\n');
          saveEntry(); renderPreview(); body.focus();
        };
        var viewBtn = document.createElement('button'); viewBtn.type = 'button'; viewBtn.textContent = 'View';
        viewBtn.onclick = function(){ RO.UI.openFigurePreview(fig); };
        var delBtn = document.createElement('button'); delBtn.type = 'button'; delBtn.textContent = 'Delete';
        delBtn.onclick = function(){
          RO.UI.showConfirmModal({
            message: 'Delete figure "' + fig.id + '"?',
            confirmText: 'Delete', danger: true,
            onConfirm: function(){
              var deleted = RO.Data.deleteCategoryDerivationFigure(categoryId, derivationId, fig.id);
              if(deleted && deleted.imageId && RO.ImageStore) RO.ImageStore.deleteImage(deleted.imageId);
              entry = cat.derivations.find(function(d){ return d.id === derivationId; });
              renderFiguresList(); renderPreview();
            }
          });
        };
        row.appendChild(main); row.appendChild(insertBtn); row.appendChild(viewBtn); row.appendChild(delBtn);
        figuresList.appendChild(row);
      });
    }

    function addFigureFromDataUrl(dataUrl){
      RO.UI.showInputModal({
        title: 'Add Figure',
        fields: [
          { id: 'figId',   label: 'Figure ID', value: 'fig_' + ((entry.figures || []).length + 1), type: 'text' },
          { id: 'caption', label: 'Caption',   value: '', type: 'text' }
        ],
        onSave: function(vals){
          var figId   = (vals.figId   || '').trim().replace(/\s+/g, '_');
          var caption = vals.caption  || '';
          if(!figId) return;

          function addWithPatch(patch){
            var fig = RO.Data.addCategoryDerivationFigure(categoryId, derivationId, {
              id: figId, caption: caption,
              imageId: patch.imageId || '', imageDataUrl: patch.imageDataUrl || ''
            });
            entry = cat.derivations.find(function(d){ return d.id === derivationId; });
            renderFiguresList();
            if(fig){ insertAtCursor(body, '\n{{fig:' + fig.id + '}}\n'); saveEntry(); renderPreview(); }
          }

          if(RO.ImageStore && RO.ImageStore.available){
            RO.ImageStore.saveDataUrl(dataUrl)
              .then(function(imageId){ addWithPatch({ imageId: imageId, imageDataUrl: '' }); })
              .catch(function(){       addWithPatch({ imageId: '',      imageDataUrl: dataUrl }); });
          } else {
            addWithPatch({ imageId: '', imageDataUrl: dataUrl });
          }
        }
      });
    }

    addFigureBtn.onclick = function(){ figureFileInput.click(); };
    figureFileInput.onchange = function(){
      var file = figureFileInput.files && figureFileInput.files[0];
      figureFileInput.value = '';
      if(!file) return;
      RO.UI.readCompressedImage(file, addFigureFromDataUrl);
    };

    body.onpaste = function(e){
      var items = e.clipboardData && e.clipboardData.items;
      if(!items) return;
      for(var i = 0; i < items.length; i++){
        if(items[i].type && items[i].type.indexOf('image/') === 0){
          var file = items[i].getAsFile(); if(!file) return;
          e.preventDefault();
          RO.UI.readCompressedImage(file, addFigureFromDataUrl);
          return;
        }
      }
    };

    titleInput.addEventListener('input', scheduleSave);
    titleInput.addEventListener('blur',  function(){ clearTimeout(body._saveTimer); saveEntry(); });
    body.addEventListener('input', function(){ RO.UI.fitTextarea(body); scheduleSave(); });
    body.addEventListener('blur',  function(){ clearTimeout(body._saveTimer); saveEntry(); });

    details.appendChild(titleLabel);
    details.appendChild(bodyLabel);
    details.appendChild(body);
    details.appendChild(figuresSection);
    details.appendChild(previewLabel);
    details.appendChild(preview);

    renderFiguresList();
    renderPreview();
    setTimeout(function(){ RO.UI.fitTextarea(body); }, 0);
  };

  /* ── Markdown + KaTeX + figure rendering ─────────────────── */

  RO.UI.renderMarkdownWithFigures = function(container, markdown, figures){
    var figMap = {};
    (figures || []).forEach(function(fig){ figMap[fig.id] = fig; });

    var mathPlaceholders = [];
    var figPlaceholders  = [];

    function replaceToken(html, token, replacement){
      return html.split('<p>' + token + '</p>').join(replacement).split(token).join(replacement);
    }

    var prepared = String(markdown || '')
      .replace(/\$\$([\s\S]+?)\$\$/g, function(match, body){
        var key = 'MATHBLOCKTOKEN' + mathPlaceholders.length + 'END';
        mathPlaceholders.push({ key: key, body: body, display: true });
        return '\n\n' + key + '\n\n';
      })
      .replace(/\$([^$\n]+?)\$/g, function(match, body){
        var key = 'MATHINLINETOKEN' + mathPlaceholders.length + 'END';
        mathPlaceholders.push({ key: key, body: body, display: false });
        return key;
      })
      .replace(/\{\{fig:([^}]+)\}\}/g, function(match, id){
        var key = 'FIGTOKEN' + figPlaceholders.length + 'END';
        figPlaceholders.push({ key: key, fig: figMap[id.trim()] || null, id: id.trim() });
        return '\n\n' + key + '\n\n';
      });

    var html = window.marked && window.marked.parse ? window.marked.parse(prepared) : prepared;

    mathPlaceholders.forEach(function(item){
      var mathHtml;
      try {
        if(window.katex){
          mathHtml = window.katex.renderToString(item.body, { displayMode: item.display, throwOnError: false });
        } else {
          mathHtml = item.display
            ? '<div class="math-fallback">'  + RO.UI.escapeHTML(item.body) + '</div>'
            : '<span class="math-fallback">' + RO.UI.escapeHTML(item.body) + '</span>';
        }
      } catch(e) {
        console.error('KaTeX render failed', e);
        mathHtml = RO.UI.escapeHTML(item.body);
      }
      html = replaceToken(html, item.key, mathHtml);
    });

    figPlaceholders.forEach(function(item){
      var figHtml = '<figure class="derivation-figure-preview" data-fig-id="' + item.id + '">';
      if(item.fig){
        figHtml += '<div class="figure-image-slot">Loading figure...</div>';
        if(item.fig.caption) figHtml += '<figcaption>' + RO.UI.escapeHTML(item.fig.caption) + '</figcaption>';
      } else {
        figHtml += '<div class="missing-figure">Missing figure: ' + RO.UI.escapeHTML(item.id) + '</div>';
      }
      figHtml += '</figure>';
      html = replaceToken(html, item.key, figHtml);
    });

    container.innerHTML = html;

    figPlaceholders.forEach(function(item){
      if(!item.fig) return;
      var figure = container.querySelector('figure[data-fig-id="' + item.id + '"]');
      var slot   = figure && figure.querySelector('.figure-image-slot');
      if(!slot) return;
      function setImage(dataUrl){
        if(!dataUrl){ slot.textContent = 'Image missing.'; return; }
        var img = document.createElement('img');
        img.src = dataUrl; img.alt = item.fig.caption || item.fig.id;
        slot.innerHTML = ''; slot.appendChild(img);
      }
      if(item.fig.imageDataUrl)                         setImage(item.fig.imageDataUrl);
      else if(item.fig.imageId && RO.ImageStore)        RO.ImageStore.getDataUrl(item.fig.imageId).then(setImage);
      else                                              slot.textContent = 'Image missing.';
    });
  };

  RO.UI.deleteDerivationFigureImages = function(entry){
    if(!entry || !Array.isArray(entry.figures) || !RO.ImageStore) return;
    entry.figures.forEach(function(fig){ if(fig.imageId) RO.ImageStore.deleteImage(fig.imageId); });
  };

  RO.UI.openFigurePreview = function(fig){
    if(!fig) return;
    if(fig.imageDataUrl){ RO.UI.openImagePreview(fig.caption || fig.id, fig.imageDataUrl); return; }
    if(fig.imageId && RO.ImageStore){
      RO.UI.openImagePreview(fig.caption || fig.id, '');
      RO.ImageStore.getDataUrl(fig.imageId).then(function(dataUrl){
        if(dataUrl) document.getElementById('imagePreviewImg').src = dataUrl;
        else RO.UI.showConfirmModal({ message: 'Image missing.', confirmOnly: true });
      });
    }
  };

  /* ── Result modal ─────────────────────────────────────────── */

  RO.UI.openResultModal = function(projectId, resultId){
    var modal = document.getElementById('resultModal'); if(!modal) return;
    var project = RO.Data.projects.find(function(p){ return p.id === projectId; }); if(!project) return;
    if(!Array.isArray(project.results)) project.results = [];
    var result = resultId ? project.results.find(function(r){ return r.id === resultId; }) : null;

    document.getElementById('resultModalTitle').textContent = result ? 'Edit Result' : 'Add Result';
    document.getElementById('resultTitle').value       = result ? (result.title       || '') : '';
    document.getElementById('resultDescription').value = result ? (result.description || '') : '';
    document.getElementById('resultImage').value       = '';
    modal._pastedImage = '';

    var status = document.getElementById('resultImageStatus');
    status.textContent = result && (result.imageId || result.imageDataUrl)
      ? 'Existing image saved. You can paste a new image here.'
      : 'No image saved. You can paste an image here.';

    var cancelBtn = document.getElementById('cancelResultEdit');
    var saveBtn   = document.getElementById('saveResultEdit');
    if(cancelBtn){ cancelBtn.type = 'button'; cancelBtn.disabled = false; cancelBtn.onclick = function(e){ e.preventDefault(); RO.UI.closeResultModal(); }; }
    if(saveBtn)  { saveBtn.type   = 'button'; saveBtn.disabled   = false; saveBtn.onclick   = function(e){ e.preventDefault(); RO.UI.saveResultModal(); }; }

    var removeWrap  = document.getElementById('removeResultImageWrap');
    var removeInput = document.getElementById('removeResultImage');
    removeInput.checked = false;
    if(result && (result.imageId || result.imageDataUrl)) removeWrap.classList.remove('hidden');
    else removeWrap.classList.add('hidden');

    modal.onpaste = function(e){
      var items = e.clipboardData && e.clipboardData.items; if(!items) return;
      for(var i = 0; i < items.length; i++){
        if(items[i].type && items[i].type.indexOf('image/') === 0){
          var file = items[i].getAsFile(); if(!file) return;
          e.preventDefault();
          status.textContent = 'Reading pasted image...';
          RO.UI.readCompressedImage(file, function(dataUrl){
            modal._pastedImage = dataUrl;
            document.getElementById('resultImage').value = '';
            document.getElementById('removeResultImage').checked = false;
            status.textContent = 'Pasted image ready.';
          });
          return;
        }
      }
    };

    modal.dataset.projectId = projectId;
    modal.dataset.resultId  = resultId || '';
    modal.classList.remove('hidden');
  };

  RO.UI.closeResultModal = function(){
    var modal = document.getElementById('resultModal');
    if(modal){ modal.classList.add('hidden'); modal.dataset.projectId = ''; modal.dataset.resultId = ''; modal._pastedImage = ''; modal.onpaste = null; }
  };

  RO.UI.saveResultModal = function(){
    var modal = document.getElementById('resultModal'); if(!modal) return;
    var projectId   = modal.dataset.projectId;
    var resultId    = modal.dataset.resultId || '';
    var title       = document.getElementById('resultTitle').value.trim();
    var description = document.getElementById('resultDescription').value;
    var fileInput   = document.getElementById('resultImage');
    var removeImage = document.getElementById('removeResultImage').checked;
    var pastedImage = modal._pastedImage || '';
    var status      = document.getElementById('resultImageStatus');
    var saveBtn     = document.getElementById('saveResultEdit');

    if(!title){
      RO.UI.showConfirmModal({ message: 'Title is required.', confirmOnly: true });
      return;
    }

    function setSaving(v){ if(saveBtn) saveBtn.disabled = v; if(status && v) status.textContent = 'Saving...'; }

    function handleSaveError(e){
      console.error('Result save failed', e);
      if(saveBtn) saveBtn.disabled = false;
      if(status) status.textContent = 'Save failed. Please try again.';
      RO.UI.showConfirmModal({ message: 'Save failed. The image may be too large or browser storage may be unavailable.', confirmOnly: true });
    }

    function finish(imagePatch){
      var patch = { title: title, description: description };
      if(imagePatch){
        if(typeof imagePatch.imageId     !== 'undefined') patch.imageId     = imagePatch.imageId;
        if(typeof imagePatch.imageDataUrl !== 'undefined') patch.imageDataUrl = imagePatch.imageDataUrl;
      }
      if(resultId) RO.Data.updateProjectResult(projectId, resultId, patch);
      else         RO.Data.addProjectResult(projectId, Object.assign({ imageId: '', imageDataUrl: '' }, patch));
      if(imagePatch && imagePatch.oldImageId && imagePatch.oldImageId !== imagePatch.imageId && RO.ImageStore){
        RO.ImageStore.deleteImage(imagePatch.oldImageId);
      }
      RO.UI.closeResultModal();
      RO.UI.showProjectDetails(projectId);
    }

    var file = fileInput.files && fileInput.files[0];
    try {
      setSaving(true);
      if(pastedImage){
        RO.UI.saveResultImagePatch(projectId, resultId, pastedImage).then(finish).catch(handleSaveError);
      } else if(file){
        RO.UI.readCompressedImage(file, function(dataUrl){
          RO.UI.saveResultImagePatch(projectId, resultId, dataUrl).then(finish).catch(handleSaveError);
        });
      } else if(removeImage){
        finish(RO.UI.getRemoveResultImagePatch(projectId, resultId));
      } else {
        finish(null);
      }
    } catch(e){ handleSaveError(e); }
  };

  RO.UI.saveResultImagePatch = function(projectId, resultId, imageDataUrl){
    var project = RO.Data.projects.find(function(p){ return p.id === projectId; });
    var result  = project && resultId ? (project.results || []).find(function(r){ return r.id === resultId; }) : null;
    var oldImageId = result ? result.imageId : '';
    if(RO.ImageStore && RO.ImageStore.available){
      return RO.ImageStore.saveDataUrl(imageDataUrl).then(function(imageId){
        return { imageId: imageId, imageDataUrl: '', oldImageId: oldImageId };
      }).catch(function(e){
        console.error('IndexedDB image save failed; falling back to localStorage imageDataUrl', e);
        return { imageId: '', imageDataUrl: imageDataUrl, oldImageId: oldImageId };
      });
    }
    return Promise.resolve({ imageId: '', imageDataUrl: imageDataUrl, oldImageId: oldImageId });
  };

  RO.UI.getRemoveResultImagePatch = function(projectId, resultId){
    var project = RO.Data.projects.find(function(p){ return p.id === projectId; });
    var result  = project && resultId ? (project.results || []).find(function(r){ return r.id === resultId; }) : null;
    return { imageId: '', imageDataUrl: '', oldImageId: result ? result.imageId : '' };
  };

  RO.UI.openResultImagePreview = function(result){
    if(!result) return;
    if(result.imageDataUrl){ RO.UI.openImagePreview(result.title || 'Image', result.imageDataUrl); return; }
    if(result.imageId && RO.ImageStore && RO.ImageStore.available){
      RO.UI.openImagePreview(result.title || 'Image', '');
      RO.ImageStore.getDataUrl(result.imageId).then(function(dataUrl){
        if(dataUrl) document.getElementById('imagePreviewImg').src = dataUrl;
        else RO.UI.showConfirmModal({ message: 'Image missing. It may have been removed or not imported.', confirmOnly: true });
      }).catch(function(){
        RO.UI.showConfirmModal({ message: 'Image missing. It may have been removed or not imported.', confirmOnly: true });
      });
      return;
    }
    RO.UI.showConfirmModal({ message: 'Image store is not available.', confirmOnly: true });
  };

})();
