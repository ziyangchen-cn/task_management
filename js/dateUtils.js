(function(){
  window.RO = window.RO || {};
  RO.DateUtils = {
    todayISO: function(){
      var d = new Date();
      var y = d.getFullYear();
      var m = String(d.getMonth()+1).padStart(2,'0');
      var day = String(d.getDate()).padStart(2,'0');
      return y + '-' + m + '-' + day;
    },
    addDaysISO: function(dateISO, n){
      var d = new Date(dateISO + 'T00:00:00');
      d.setDate(d.getDate() + n);
      var y = d.getFullYear();
      var m = String(d.getMonth()+1).padStart(2,'0');
      var day = String(d.getDate()).padStart(2,'0');
      return y + '-' + m + '-' + day;
    },
    isBefore: function(a,b){ return a < b; }
  };
})();