(function(){
  'use strict';
  window.RO = window.RO || {};

  // Sync is gated by WHERE the app is running, not by a checkbox or a URL
  // flag you have to remember to set. Opening it locally (localhost / 127.0.0.1
  // / file://, i.e. via "Research OS.command") always means local-only, no
  // Supabase writes or reads, no exceptions. Only the published GitHub Pages
  // URL (https://ziyangchen-cn.github.io/task_management/) talks to Supabase.
  //
  // This replaced two earlier, weaker mechanisms in order: a checkbox (could
  // be left unchecked by mistake -- that's exactly how test data once got
  // pushed to the real Supabase data) and a "?test=1" URL flag (still an
  // extra step that could be forgotten). An origin check has no such step to
  // forget: there's nothing to remember, the environment itself decides.
  RO.LOCAL_MODE = (window.location.protocol === 'file:') ||
                   (window.location.hostname === 'localhost') ||
                   (window.location.hostname === '127.0.0.1');
})();
