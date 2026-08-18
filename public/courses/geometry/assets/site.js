
(function(){
  // In embed mode, carry ?embed=1 across internal links so clicking through to a
  // chapter inside the Canvas iframe doesn't suddenly show the site chrome.
  if(document.documentElement.classList.contains('embed')){
    document.querySelectorAll('a[href]').forEach(function(a){
      var h=a.getAttribute('href');
      if(!h||/^(https?:|mailto:|#)/.test(h)||a.target==='_blank')return;
      a.setAttribute('href',h+(h.indexOf('?')>-1?'&':'?')+'embed=1');
    });
  }

  // ---- week view (only present on week.html) ----
  var el=document.getElementById('sched');
  if(el){
    var S=JSON.parse(el.textContent);
    var KINDS={lesson:'',review:'Review',quiz:'Quiz',test:'Test',activity:'Activity','no-class':'No class'};
    var iso=function(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
    var parse=function(s){var p=s.split('-');return new Date(+p[0],+p[1]-1,+p[2]);};
    var mondayOf=function(d){var x=new Date(d);x.setDate(x.getDate()-((x.getDay()+6)%7));return x;};
    var addD=function(d,n){var x=new Date(d);x.setDate(x.getDate()+n);return x;};
    var fmt=function(d){return d.toLocaleDateString(undefined,{month:'short',day:'numeric'});};
    var esc=function(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});};
    var today=new Date(), todayISO=iso(today);
    var start=mondayOf(today);
    if(S.first&&today<parse(S.first)) start=mondayOf(parse(S.first));
    if(S.last&&today>parse(S.last)) start=mondayOf(parse(S.last));

    var nx=S.entries.filter(function(e){
      return (e.kind==='test'||e.kind==='quiz')&&e.date>=todayISO;})[0];
    document.getElementById('nextup').innerHTML = nx
      ? '<div class="nextup"><b>'+esc(nx.kind==='test'?'Next test':'Next quiz')+'</b>'+
        '<span>'+esc(nx.title)+' &middot; '+
        parse(nx.date).toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'})+
        '</span></div>' : '';

    var draw=function(){
      var g=document.getElementById('week'); g.innerHTML='';
      var days=[0,1,2,3,4].map(function(i){return addD(start,i);});
      document.getElementById('range').textContent=fmt(days[0])+' – '+fmt(days[4])+', '+days[4].getFullYear();
      days.forEach(function(d){
        var ds=iso(d), off=S.closures[ds];
        var items=S.entries.filter(function(e){return e.date===ds;});
        var box=document.createElement('div');
        box.className='wday'+(off?' off':'')+(ds===todayISO?' today':'');
        var h='<h4>'+d.toLocaleDateString(undefined,{weekday:'long'})+'</h4><div class="dt">'+fmt(d)+'</div>';
        if(off) h+='<div class="off-label">'+esc(off)+'</div>';
        items.forEach(function(e){
          var k=KINDS[e.kind]?'<span class="badge k-'+e.kind+'">'+KINDS[e.kind]+'</span> ':'';
          h+='<div class="witem"><div class="wt">'+k+esc(e.title)+'</div>'+
             (e.homework?'<div class="wd">'+esc(e.homework)+'</div>':'')+
             (e.due?'<div class="wdue">Due '+esc(e.due)+'</div>':'')+'</div>';
        });
        if(!off&&!items.length) h+='<div class="empty">Nothing scheduled</div>';
        box.innerHTML=h; g.appendChild(box);
      });
    };
    document.getElementById('prev').addEventListener('click',function(){start=addD(start,-7);draw();});
    document.getElementById('next').addEventListener('click',function(){start=addD(start,7);draw();});
    document.getElementById('today').addEventListener('click',function(){start=mondayOf(new Date());draw();});
    draw();
  }

  var KEY='algebra1.progress.v1';
  function load(){ try{return JSON.parse(localStorage.getItem(KEY))||{};}catch(e){return {};} }
  function save(s){ try{localStorage.setItem(KEY,JSON.stringify(s));}catch(e){} }
  var state=load();

  // totals per chapter come from the home grid or the chapter page itself
  var totals={};
  document.querySelectorAll('[data-total]').forEach(function(el){
    totals[el.dataset.chapter]=parseInt(el.dataset.total,10)||0;
  });

  function counts(){
    var per={},all=0;
    Object.keys(state).forEach(function(k){
      if(!state[k]) return;
      var ch=k.split('-')[0];
      per[ch]=(per[ch]||0)+1; all++;
    });
    return {per:per,all:all};
  }

  function paint(){
    var c=counts();
    var grand=Object.keys(totals).reduce(function(a,k){return a+totals[k];},0);
    document.querySelectorAll('[data-fill]').forEach(function(el){
      var k=el.dataset.fill;
      var done=k==='all'?c.all:(c.per[k]||0);
      var tot=k==='all'?grand:(totals[k]||0);
      el.style.width=(tot?Math.min(100,done/tot*100):0)+'%';
    });
    document.querySelectorAll('[data-prog]').forEach(function(el){
      var k=el.dataset.prog;
      var done=k==='all'?c.all:(c.per[k]||0);
      var tot=k==='all'?grand:(totals[k]||0);
      el.textContent=!done?'Not started'
        :(done>=tot&&tot?'Complete \u2713':done+' of '+tot+' done');
    });
  }

  document.querySelectorAll('input[data-done]').forEach(function(box){
    var id=box.dataset.done;
    box.checked=!!state[id];
    box.closest('.lesson').classList.toggle('done',box.checked);
    box.addEventListener('change',function(){
      state[id]=box.checked;
      if(!box.checked) delete state[id];
      save(state);
      box.closest('.lesson').classList.toggle('done',box.checked);
      paint();
    });
  });

  var reset=document.getElementById('resetProgress');
  if(reset) reset.addEventListener('click',function(){
    if(!confirm('Clear every check mark on this device?')) return;
    state={}; save(state);
    document.querySelectorAll('input[data-done]').forEach(function(b){
      b.checked=false; b.closest('.lesson').classList.remove('done');
    });
    paint();
  });

  // one video at a time
  document.querySelectorAll('video').forEach(function(v){
    v.addEventListener('play',function(){
      document.querySelectorAll('video').forEach(function(o){ if(o!==v) o.pause(); });
    });
  });

  paint();
})();
