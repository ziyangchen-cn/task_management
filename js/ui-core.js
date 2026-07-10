(function(){
  'use strict';
  window.RO = window.RO || {};
  RO.UI = RO.UI || {};

  /* ── Utilities ─────────────────────────────────────────────── */

  // Marker -> CSS class for inline log highlighting.
  //   * conclusion (purple bold), # progress (green), ! bug/blocker (red bold),
  //   [ ] subtask (blue bold)
  // A marker colors text from its own position up to the next marker (or end of
  // line). Markers do NOT carry over across lines — each line is independent,
  // so a multi-line bug/conclusion needs the marker repeated on every line.
  // Sorted longest-first so a multi-character marker like "[ ]" is matched
  // before any of its individual characters could be mistaken for something else.
  var LOG_MARKERS = [
    { marker: '[ ]', className: 'log-subtask-highlight' },
    { marker: '*',   className: 'log-conclusion-highlight' },
    { marker: '#',   className: 'log-progress-highlight' },
    { marker: '!',   className: 'log-bug-highlight' }
  ].sort(function(a, b){ return b.marker.length - a.marker.length; });

  function findMarkerAt(line, i){
    for(var m = 0; m < LOG_MARKERS.length; m++){
      var entry = LOG_MARKERS[m];
      if(line.substr(i, entry.marker.length) === entry.marker) return entry;
    }
    return null;
  }

  function appendLineWithMarkers(el, line){
    var matches = []; // { pos, className }
    var i = 0;
    while(i < line.length){
      var found = findMarkerAt(line, i);
      if(found){ matches.push({ pos: i, className: found.className }); i += found.marker.length; }
      else{ i++; }
    }
    if(matches.length === 0){
      el.appendChild(document.createTextNode(line));
      return;
    }
    if(matches[0].pos > 0) el.appendChild(document.createTextNode(line.slice(0, matches[0].pos)));
    matches.forEach(function(match, idx){
      var end = (idx + 1 < matches.length) ? matches[idx + 1].pos : line.length;
      var span = document.createElement('span');
      span.className = match.className;
      span.textContent = line.slice(match.pos, end);
      el.appendChild(span);
    });
  }

  RO.UI.appendTextWithHashHighlight = function(el, text){
    text = text || '';
    el.innerHTML = '';
    var lines = text.split('\n');
    lines.forEach(function(line, lineIdx){
      if(lineIdx > 0) el.appendChild(document.createElement('br'));
      appendLineWithMarkers(el, line);
    });
  };

  /** Mix a 6-digit hex color with white. fraction=0→original, fraction=1→white */
  RO.UI._blendWithWhite = function(hex, fraction){
    hex = String(hex || '#f5f5f5');
    if(hex.length !== 7 || hex[0] !== '#') return hex;
    var r = parseInt(hex.slice(1,3),16);
    var g = parseInt(hex.slice(3,5),16);
    var b = parseInt(hex.slice(5,7),16);
    function toHex(n){ var h = Math.round(n + (255-n)*fraction).toString(16); return h.length===1?'0'+h:h; }
    return '#' + toHex(r) + toHex(g) + toHex(b);
  };

  RO.UI.fitTextarea = function(ta){
    if(!ta) return;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  };

  RO.UI.escapeHTML = function(text){
    return String(text == null ? '' : text)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  };

  RO.UI.formatProjectDate = function(value){
    if(!value) return '';
    if(typeof value === 'string') return value;
    var d = new Date(value);
    return d.getFullYear() + '-' +
      String(d.getMonth()+1).padStart(2,'0') + '-' +
      String(d.getDate()).padStart(2,'0');
  };

  RO.UI.readCompressedImage = function(file, callback){
    var reader = new FileReader();
    reader.onload = function(){
      var img = new Image();
      img.onload = function(){
        var maxWidth = 900;
        var scale = Math.min(1, maxWidth / img.width);
        var canvas = document.createElement('canvas');
        canvas.width  = Math.max(1, Math.round(img.width  * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        callback(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = function(){
        RO.UI.showConfirmModal({ message: 'Could not read image.', confirmOnly: true });
      };
      img.src = String(reader.result || '');
    };
    reader.onerror = function(){
      RO.UI.showConfirmModal({ message: 'Could not read image file.', confirmOnly: true });
    };
    reader.readAsDataURL(file);
  };

  RO.UI.renderDate = function(){
    var dd = document.getElementById('dateDisplay');
    if(dd) dd.textContent = RO.Data.appState.currentDate;
    var dp = document.getElementById('datePicker');
    if(dp) dp.value = RO.Data.appState.currentDate;
  };

  /** Custom-styled hover tooltip (see .custom-tooltip in main.css), used
   *  instead of the native `title` attribute -- the browser's built-in
   *  tooltip can't be restyled at all (no color/font/size control). getText
   *  can be a string or a function, so the text stays current even if the
   *  underlying data changes between hovers. */
  RO.UI.attachCustomTooltip = function(el, getText){
    var tip = null;
    el.addEventListener('mouseenter', function(){
      var text = typeof getText === 'function' ? getText() : getText;
      if(!text) return;
      tip = document.createElement('div');
      tip.className = 'custom-tooltip';
      tip.textContent = text;
      document.body.appendChild(tip);
      var rect = el.getBoundingClientRect();
      tip.style.left = rect.left + 'px';
      tip.style.top  = (rect.bottom + 6) + 'px';
    });
    el.addEventListener('mouseleave', function(){
      if(tip){ tip.remove(); tip = null; }
    });
  };

  /** Small topbar indicator so you can see, at a glance, whether the last
   *  save actually reached Supabase -- no need to open the dashboard. Blank
   *  when cloud sync isn't configured (pure local mode, unchanged from before). */
  RO.UI.renderSyncStatus = function(){
    var el = document.getElementById('syncStatus');
    if(!el) return;
    if(!RO.Sync || !RO.Sync.available){ el.textContent = ''; return; }
    if(!RO.Sync.lastSyncAt){ el.textContent = '☁️ 等待同步'; return; }
    var time = new Date(RO.Sync.lastSyncAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    el.textContent = (RO.Sync.lastSyncOk ? '☁️ 已同步 ' : '⚠️ 同步失败 ') + time;
  };

  RO.UI.openImagePreview = function(title, imageDataUrl){
    var modal = document.getElementById('imagePreviewModal'); if(!modal) return;
    document.getElementById('imagePreviewTitle').textContent = title || 'Image';
    document.getElementById('imagePreviewImg').src = imageDataUrl || '';
    modal.classList.remove('hidden');
  };

  RO.UI.closeImagePreview = function(){
    var modal = document.getElementById('imagePreviewModal');
    if(modal){
      modal.classList.add('hidden');
      document.getElementById('imagePreviewImg').src = '';
    }
  };

  RO.UI.renderAll = function(){
    RO.UI.renderDate();
    RO.UI.renderToday();
    RO.UI.renderInbox();
  };

  /* ── Generic Input Modal ────────────────────────────────────
   *
   * opts: {
   *   title:       string
   *   fields:      Array of {
   *                  id:          string
   *                  label:       string
   *                  value:       string
   *                  type:        'text' | 'color' | 'select'  (default 'text')
   *                  options:     [{value, label}]              (for 'select')
   *                  placeholder: string
   *                }
   *   saveLabel:   string   (default 'Save')
   *   cancelLabel: string   (default 'Cancel')
   *   onSave:      function(values)   values = { fieldId: stringValue, … }
   * }
   * ─────────────────────────────────────────────────────────── */
  RO.UI.showInputModal = function(opts){
    var modal = document.getElementById('genericInputModal'); if(!modal) return;
    document.getElementById('genericInputTitle').textContent   = opts.title       || '';
    document.getElementById('genericInputSave').textContent    = opts.saveLabel   || 'Save';
    document.getElementById('genericInputCancel').textContent  = opts.cancelLabel || 'Cancel';

    var container = document.getElementById('genericInputFields');
    container.innerHTML = '';

    (opts.fields || []).forEach(function(f){
      var wrap = document.createElement('label');
      wrap.style.display = 'block';
      wrap.textContent = f.label || '';

      var input;
      if(f.type === 'select'){
        input = document.createElement('select');
        (f.options || []).forEach(function(o){
          var opt = document.createElement('option');
          opt.value = o.value; opt.textContent = o.label;
          if(String(o.value) === String(f.value != null ? f.value : '')) opt.selected = true;
          input.appendChild(opt);
        });
      } else {
        input = document.createElement('input');
        input.type = f.type || 'text';
        input.value = f.value != null ? f.value : '';
        if(f.placeholder) input.placeholder = f.placeholder;
      }
      input.id = 'gi_' + f.id;
      wrap.appendChild(input);
      container.appendChild(wrap);
    });

    // focus + select first input
    setTimeout(function(){
      var first = container.querySelector('input,select');
      if(first){ first.focus(); if(first.select && first.type !== 'color') first.select(); }
    }, 30);

    // Enter submits (except inside a <select>)
    container.onkeydown = function(e){
      if(e.key === 'Enter' && e.target.tagName.toLowerCase() !== 'select'){
        e.preventDefault();
        RO.UI._doInputSave();
      }
    };

    modal._fields = opts.fields || [];
    modal._onSave = opts.onSave  || null;
    modal.classList.remove('hidden');
  };

  RO.UI._doInputSave = function(){
    var modal = document.getElementById('genericInputModal'); if(!modal) return;
    var vals = {};
    (modal._fields || []).forEach(function(f){
      var el = document.getElementById('gi_' + f.id);
      if(el) vals[f.id] = el.value;
    });
    modal.classList.add('hidden');
    var cb = modal._onSave;
    modal._onSave = null;
    if(typeof cb === 'function') cb(vals);
  };

  RO.UI._closeInputModal = function(){
    var modal = document.getElementById('genericInputModal');
    if(modal){ modal.classList.add('hidden'); modal._onSave = null; }
  };

  /* ── Generic Confirm / Alert Modal ─────────────────────────
   *
   * opts: {
   *   title:       string                   (optional)
   *   message:     string
   *   confirmText: string                   (default 'OK')
   *   danger:      bool                     (red confirm button)
   *   confirmOnly: bool                     (no Cancel — replaces alert())
   *   onConfirm:   function                 (optional)
   *   actions:     [{label, danger, handler}]  (replaces default buttons)
   * }
   * ─────────────────────────────────────────────────────────── */
  RO.UI.showConfirmModal = function(opts){
    var modal = document.getElementById('genericConfirmModal'); if(!modal) return;

    var titleEl = document.getElementById('genericConfirmTitle');
    if(titleEl) titleEl.textContent = opts.title || '';
    document.getElementById('genericConfirmMessage').textContent = opts.message || '';

    var actionsEl = document.getElementById('genericConfirmActions');
    actionsEl.innerHTML = '';

    if(Array.isArray(opts.actions)){
      // multi-button mode (e.g. backup export / import choice)
      var cancelBtnA = document.createElement('button');
      cancelBtnA.type = 'button'; cancelBtnA.textContent = 'Cancel';
      cancelBtnA.onclick = function(){ modal.classList.add('hidden'); };
      actionsEl.appendChild(cancelBtnA);

      opts.actions.forEach(function(a){
        var btn = document.createElement('button');
        btn.type = 'button'; btn.textContent = a.label || 'OK';
        if(a.danger) btn.className = 'btn-danger';
        btn.onclick = function(){
          modal.classList.add('hidden');
          if(typeof a.handler === 'function') a.handler();
        };
        actionsEl.appendChild(btn);
      });

    } else {
      // single confirm / alert mode
      if(!opts.confirmOnly){
        var cancelBtnB = document.createElement('button');
        cancelBtnB.type = 'button';
        cancelBtnB.textContent = opts.cancelText || 'Cancel';
        cancelBtnB.onclick = function(){ modal.classList.add('hidden'); };
        actionsEl.appendChild(cancelBtnB);
      }

      var okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.textContent = opts.confirmText || 'OK';
      if(opts.danger) okBtn.className = 'btn-danger';
      okBtn.onclick = function(){
        modal.classList.add('hidden');
        if(typeof opts.onConfirm === 'function') opts.onConfirm();
      };
      actionsEl.appendChild(okBtn);
    }

    modal.classList.remove('hidden');
  };

  /* ── Wire up persistent input modal buttons (call once on boot) ── */
  RO.UI.initGenericModals = function(){
    var saveBtn   = document.getElementById('genericInputSave');
    var cancelBtn = document.getElementById('genericInputCancel');
    if(saveBtn)   saveBtn.addEventListener('click',  RO.UI._doInputSave);
    if(cancelBtn) cancelBtn.addEventListener('click', RO.UI._closeInputModal);
  };

})();
