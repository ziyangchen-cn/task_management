(function(){
  window.RO = window.RO || {};

  // Fill these in after creating the Supabase project:
  // Dashboard -> Project Settings -> API -> Project URL / anon public key.
  // The anon key is meant to be public in client code -- access is enforced
  // by the RLS policies in supabase/schema.sql, not by hiding this key.
  RO.SUPABASE_URL = '';
  RO.SUPABASE_ANON_KEY = '';
})();
