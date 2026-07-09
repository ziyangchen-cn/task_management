(function(){
  'use strict';
  window.RO = window.RO || {};

  // Gates app boot behind a signed-in Supabase session, but only when
  // Supabase is actually configured (RO.Sync.available). With no config,
  // RO.Auth.ready() resolves immediately and the app behaves exactly as
  // before -- local-only, no login screen ever shown.
  RO.Auth = {
    required: !!(RO.Sync && RO.Sync.available),

    ready: function(){
      if(!RO.Auth.required) return Promise.resolve();
      var client = RO.Sync.client;
      return client.auth.getSession().then(function(res){
        var session = res && res.data && res.data.session;
        if(session) return;
        return RO.Auth._showLoginGate(client);
      });
    },

    _showLoginGate: function(client){
      return new Promise(function(resolve){
        var overlay  = document.getElementById('authGate');
        var form     = document.getElementById('authGateForm');
        var emailEl  = document.getElementById('authGateEmail');
        var passEl   = document.getElementById('authGatePassword');
        var errorEl  = document.getElementById('authGateError');
        var submitEl = document.getElementById('authGateSubmit');

        overlay.classList.remove('hidden');

        form.onsubmit = function(e){
          e.preventDefault();
          errorEl.textContent = '';
          submitEl.disabled = true;
          client.auth.signInWithPassword({
            email: emailEl.value.trim(),
            password: passEl.value
          }).then(function(res){
            submitEl.disabled = false;
            if(res.error){ errorEl.textContent = res.error.message; return; }
            overlay.classList.add('hidden');
            resolve();
          }).catch(function(e){
            submitEl.disabled = false;
            errorEl.textContent = 'Sign-in failed: ' + (e && e.message ? e.message : e);
          });
        };
      });
    }
  };
})();
