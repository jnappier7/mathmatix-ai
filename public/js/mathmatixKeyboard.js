/**
 * MATHMATIX CUSTOM KEYBOARD
 *
 * Full custom keyboard for mobile that replaces the native keyboard.
 * Three pages — just like iOS:
 *   ABC → letters (QWERTY)  → types into the contenteditable
 *   123 → numbers, operators → types into the contenteditable
 *   EQ  → math constructions → inserts inline equation boxes (MathLive)
 *
 * The student always sees what they're typing in the same full-width
 * "Ask a math question..." input. No mode switch, no separate field.
 *
 * @module mathmatixKeyboard
 */
(function () {
  'use strict';

  // ─── STATE ──────────────────────────────────────────────────────────
  let textInput = null;       // The contenteditable #user-input
  let keyboardEl = null;      // The keyboard container DOM element
  let currentPage = 'abc';    // 'abc' | '123' | 'eq' | 'symbols'
  let shifted = false;        // Shift state for ABC page
  let capsLock = false;       // Caps lock state
  let sendCallback = null;    // Function to call on send
  let initialized = false;

  // ─── SWIPE STATE ────────────────────────────────────────────────────
  let swiping = false;            // True while a swipe gesture is active
  let swipePath = [];             // Array of key letters touched during swipe
  let swipePoints = [];           // Array of {x, y} touch coordinates for trail
  let swipeStartTime = 0;        // Timestamp when touch started
  let swipeStartKey = null;       // First key element touched
  let lastSwipeKey = null;        // Last key element highlighted
  let swipeTrailEl = null;        // SVG element for swipe trail
  let suggestionBarEl = null;     // Suggestion bar element

  // ─── KEYBOARD LAYOUTS ───────────────────────────────────────────────

  const LAYOUTS = {
    abc: {
      rows: [
        ['q','w','e','r','t','y','u','i','o','p'],
        ['a','s','d','f','g','h','j','k','l'],
        ['⇧','z','x','c','v','b','n','m','⌫'],
        ['123','EQ','space','.',',','↵']
      ]
    },
    '123': {
      rows: [
        ['1','2','3','4','5','6','7','8','9','0'],
        ['-','/',':',';','(',')','$','&','@','"'],
        ['#+=' , '.', ',', '?', '!', "'", '⌫'],
        ['ABC','EQ','space','.',',','↵']
      ]
    },
    symbols: {
      rows: [
        ['[',']','{','}','#','%','^','*','+','='],
        ['_','\\','|','~','<','>','€','£','¥','•'],
        ['123','.',',','?','!','"','⌫'],
        ['ABC','EQ','space','.',',','↵']
      ]
    },
    eq: {
      rows: [
        [
          { label: '<span class="k-frac">⁄</span>', latex: '\\frac{#0}{#1}', hint: 'Frac', wide: false },
          { label: 'x<sup>n</sup>', latex: '#0^{#1}', hint: 'Pow' },
          { label: 'x<sub>n</sub>', latex: '#0_{#1}', hint: 'Sub' },
          { label: '√', latex: '\\sqrt{#0}', hint: 'Root' },
          { label: '<sup>n</sup>√', latex: '\\sqrt[#1]{#0}', hint: 'nRoot' },
          { label: '|x|', latex: '|#0|', hint: 'Abs' },
          { label: 'log', latex: '\\log_{#0}', hint: 'Log' },
          { label: 'ln', latex: '\\ln(', hint: 'Ln' },
        ],
        [
          { label: 'π', latex: '\\pi' },
          { label: 'θ', latex: '\\theta' },
          { label: '∞', latex: '\\infty' },
          { label: '±', latex: '\\pm' },
          { label: '≤', latex: '\\leq' },
          { label: '≥', latex: '\\geq' },
          { label: '≠', latex: '\\neq' },
          { label: '≈', latex: '\\approx' },
          { label: '°', latex: '\\degree' },
          { label: '⌫', action: 'delete' },
        ],
        [
          { label: 'α', latex: '\\alpha' },
          { label: 'β', latex: '\\beta' },
          { label: 'Δ', latex: '\\Delta' },
          { label: 'λ', latex: '\\lambda' },
          { label: 'σ', latex: '\\sigma' },
          { label: 'Σ', latex: '\\sum_{#0}^{#1}' },
          { label: '∫', latex: '\\int_{#0}^{#1}' },
          { label: 'lim', latex: '\\lim_{#0 \\to #1}', wide: true },
        ],
        [
          { label: 'sin', latex: '\\sin(', wide: true },
          { label: 'cos', latex: '\\cos(', wide: true },
          { label: 'tan', latex: '\\tan(', wide: true },
          { label: 'ABC', action: 'abc' },
          { label: '123', action: '123' },
          { label: '↵', action: 'enter', wide: true },
        ]
      ]
    }
  };

  // ─── SWIPE DICTIONARY ────────────────────────────────────────────────
  // Compact word list for swipe matching: common English + math terms.
  // Words are grouped by length for faster lookup.
  const SWIPE_WORDS = (function () {
    const raw = (
      'a,i,am,an,as,at,be,by,do,go,he,if,in,is,it,me,my,no,of,on,or,so,to,up,us,we,' +
      'abs,add,all,and,any,are,ask,bad,big,bit,box,but,buy,can,cos,cut,day,did,end,far,' +
      'few,for,get,got,had,has,her,him,his,hot,how,its,job,just,key,let,log,lot,man,may,' +
      'met,mix,new,nor,not,now,odd,off,old,one,our,out,own,per,put,ran,run,sat,saw,say,' +
      'set,she,sin,sit,six,sum,tan,ten,the,too,top,try,two,use,via,was,way,who,why,win,' +
      'yes,yet,you,zero,' +
      'able,also,area,axis,back,base,been,best,body,book,both,call,came,case,come,data,' +
      'days,deal,diff,does,done,down,draw,each,easy,else,even,ever,exam,fact,feel,find,' +
      'five,form,four,free,from,full,gave,give,goes,gone,good,grew,grow,half,hand,hard,' +
      'have,head,help,here,high,hold,home,hope,idea,into,just,keen,keep,kind,knew,know,' +
      'last,late,lead,left,less,life,like,line,list,live,long,look,lose,loss,lots,love,' +
      'made,main,make,many,math,mean,mind,mode,more,most,move,much,must,name,near,need,' +
      'next,nine,none,note,odds,once,only,open,over,page,part,past,path,pick,plan,play,' +
      'plot,plus,post,pull,push,quiz,rate,read,real,rest,rich,rise,role,root,rule,runs,' +
      'safe,said,same,save,seen,self,send,show,shut,side,sign,size,slim,slow,some,soon,' +
      'sort,sqrt,step,stop,such,sure,take,talk,tell,term,test,text,than,that,them,then,' +
      'they,this,thus,time,told,took,true,turn,type,unit,upon,used,user,vary,very,view,' +
      'want,ways,week,well,went,were,what,when,whom,wide,will,wish,with,word,work,year,' +
      'above,about,added,after,again,along,angle,apply,asked,basic,began,being,below,' +
      'black,board,bonus,bound,break,bring,built,carry,cause,chain,check,class,clean,' +
      'clear,close,comes,could,count,cover,cross,curve,deals,depth,doing,doubt,draft,' +
      'drawn,drive,early,eight,enter,equal,error,essay,euler,every,exact,extra,facts,' +
      'false,field,final,first,fixed,float,focus,force,found,front,fully,given,going,' +
      'grade,graph,great,green,group,guess,hence,holds,ideas,image,index,input,inner,' +
      'issue,known,large,later,layer,learn,least,leave,level,light,limit,lines,local,' +
      'logic,looks,lower,major,makes,match,maybe,means,media,might,minus,model,money,' +
      'month,moved,names,never,newer,notes,often,omega,order,other,outer,paint,parts,' +
      'phase,phone,piece,place,plain,plane,plays,point,power,press,price,prime,print,' +
      'proof,prove,query,queue,quick,quite,raise,range,ratio,reach,reads,ready,refer,' +
      'reply,right,round,route,rules,saved,scale,score,sense,serve,seven,shall,shape,' +
      'share,shift,short,sigma,since,sixth,slash,sleep,slide,slope,small,solve,sorry,' +
      'space,speed,spend,split,stack,staff,stage,start,state,steps,still,store,study,' +
      'stuff,style,super,sweet,table,taken,tasks,terms,thank,their,theme,there,these,' +
      'theta,thing,think,third,those,three,throw,times,title,today,token,total,touch,' +
      'trace,track,train,treat,trend,tried,truly,truth,twice,under,union,unity,until,' +
      'upper,usage,using,usual,valid,value,watch,wheel,where,which,while,white,whole,' +
      'width,world,worst,worth,would,write,wrong,wrote,years,young,' +
      'across,action,adding,almost,always,amount,answer,assign,begins,bigger,binary,' +
      'called,cancel,cannot,center,change,choose,circle,column,coming,common,cosine,' +
      'create,decide,define,degree,delete,derive,design,detail,divide,domain,double,' +
      'during,easily,effect,eighth,eleven,ending,enough,entire,equals,escape,events,' +
      'except,expand,expect,factor,figure,finite,follow,format,formed,fourth,giving,' +
      'global,gotten,growth,handle,having,height,higher,indeed,inside,itself,lambda,' +
      'larger,latest,launch,layout,length,letter,likely,limits,linear,little,looked,' +
      'making,manage,manual,margin,marked,master,matter,matrix,median,medium,memory,' +
      'method,middle,minute,mobile,modern,moment,mostly,moving,needed,normal,notice,' +
      'number,obtain,online,option,origin,output,people,period,placed,please,points,' +
      'powers,proper,radius,raised,random,rather,reason,record,reduce,region,relate,' +
      'remove,render,repeat,report,result,return,review,rotate,saying,scalar,second,' +
      'select,series,server,should,signed,simple,single,skills,solved,source,square,' +
      'starts,stated,string,strong,submit,subset,switch,symbol,system,taking,target,' +
      'thanks,thirty,though,toward,travel,triple,turned,twelve,unique,update,useful,' +
      'values,vector,verify,versus,weight,within,' +
      'algebra,already,angular,average,balance,because,becomes,believe,between,biggest,' +
      'boolean,capable,capture,central,certain,chapter,classic,clearly,combine,command,' +
      'compare,complex,compute,concept,confirm,connect,contain,convert,correct,counter,' +
      'current,decimal,default,defined,denoted,density,derived,display,divided,drawing,' +
      'element,entered,entropy,epsilon,equally,exactly,examine,example,exclude,express,' +
      'extends,extract,extreme,failure,finally,formula,forward,fourier,further,general,' +
      'getting,graphic,greatly,growing,happens,heading,helpful,history,however,hundred,' +
      'imagine,implies,improve,include,indexed,initial,integer,inverse,isolate,keeping,' +
      'largest,leading,learned,leaving,lessons,limited,looking,mapping,maximum,meaning,' +
      'measure,million,minimum,missing,mixture,modular,monitor,monthly,natural,neither,' +
      'nothing,noticed,obvious,offered,operate,options,ordered,origins,outside,overall,' +
      'partial,pattern,percent,perform,perhaps,placing,polygon,popular,portion,predict,' +
      'present,primary,problem,process,produce,product,program,project,provide,purpose,' +
      'quickly,radical,reading,rebuild,receive,reflect,regular,related,release,remains,' +
      'removal,removed,replace,require,resolve,results,returns,reverse,revised,running,' +
      'satisfy,section,segment,similar,smaller,solving,special,squared,started,subject,' +
      'suggest,support,surface,symbols,tangent,teacher,testing,theorem,through,tonight,' +
      'towards,turning,twelfth,upgrade,upsilon,variable,version,viewing,virtual,visible,' +
      'without,working,written,' +
      'absolute,abstract,accuracy,actually,addition,advanced,although,analysis,anything,' +
      'approach,applying,assigned,assuming,attempts,automate,balanced,behavior,building,' +
      'business,calculus,category,centered,changing,chapters,circular,combined,commonly,' +
      'compared,complete,computed,conclude,consider,constant,contains,continue,contrast,' +
      'converge,counting,coverage,creating,critical,crossing,database,decrease,defaults,' +
      'defining,definite,delivery,denominator,depending,describe,designed,detailed,diagonal,' +
      'directly,discrete,distance,distinct,division,document,elements,emission,entirely,' +
      'equality,equation,estimate,evaluate,eventual,evidence,examples,exercise,expected,' +
      'explicit,exponent,extended,exterior,extremes,factored,features,feedback,finally,' +
      'finished,floating,followed,fraction,function,generate,geometry,gradient,graphing,' +
      'greatest,handling,homework,identify,imagined,improper,increase,indicate,infinite,' +
      'inflated,informed,initially,inserted,instance,integral,intended,interest,interior,' +
      'interval,isolated,iterated,keyboard,language,learning,limiting,location,matching,' +
      'material,maximize,measured,minimize,modified,multiply,negative,normally,notation,' +
      'obtained,occurred,operates,opposite,ordering,organize,original,outlined,overview,' +
      'parabola,parallel,patterns,performs,periodic,permuted,physical,planning,platform,' +
      'plotting,pointing,position,positive,possible,practice,presence,previous,probably,' +
      'problems,produced,products,programs,progress,properly,property,provided,purposes,' +
      'quadrant,quantity,question,rational,received,recorded,reducing,referred,reflects,' +
      'relation,relative,released,remember,removing,rendered,repeated,replaced,required,' +
      'research,resolved,response,restated,restrict,reversed,rotation,rounding,sampling,' +
      'selected,sentence,separate,sequence,services,settings,shortest,simplify,simulate,' +
      'singular,smallest,software,solution,specific,standard,starting,straight,strategy,' +
      'stronger,students,subtract,succeeds,suggests,suitable,supposed,surprise,tangible,' +
      'teaching,terminal,thinking,thousand,together,tracking,transfer,triangle,uncommon,' +
      'undefined,uniquely,universe,unknowns,unlikely,updating,validate,variable,vertical,' +
      'whenever,yourself,' +
      'algorithm,alongside,alternate,amplitude,asymptote,basically,beginning,breakdown,' +
      'calculate,certainly,challenge,clipboard,collected,combining,comparing,computing,' +
      'condition,connected,considers,construct,contained,continued,converted,correctly,' +
      'currently,decreases,depending,described,determine,developed,different,dimension,' +
      'direction,discussed,efficient,elaborate,encounter,estimated,evaluates,evolution,' +
      'examining,exception,excluding,exercises,expansion,expensive,expressed,extending,' +
      'extension,extremely,factoring,formatted,frequency,functions,generated,geometric,' +
      'graphical,guarantee,happening,histogram,homeplace,hopefully,identical,imaginary,' +
      'important,improving,including,increased,indicates,induction,initially,inputting,' +
      'inserting,intention,intercept,intuition,inversely,iteration,knowledge,logarithm,' +
      'magnitude,manhattan,mechanism,mentioned,midpoints,negatives,normalize,numerical,' +
      'occurring,operating,operation,organized,otherwise,parabolic,parameter,partially,' +
      'partition,piecewise,placement,possesses,potential,precisely,presented,preserved,' +
      'principal,principle,processor,producing,projected,published,quadratic,questions,' +
      'reasoning,recognize,recommend,reference,reflected,regarding,remainder,rendering,' +
      'repeating,replacing,represent,requested,resulting,satisfies,searching,selecting,' +
      'selection,separated,sequences,similarly,situation,solutions,sometimes,somewhere,' +
      'specified,statement,structure,submitted,substance,succeeded,suggested,supported,' +
      'symmetric,technique,temporary,therefore,transform,transpose,typically,undefined,' +
      'underline,universal,utilizing,validated,variables,variation,wondering,' +
      'absolutely,arithmetic,assumption,boundaries,calculator,cancelling,classifying,' +
      'collecting,comparison,completing,conclusion,conditions,connecting,consistent,' +
      'constraint,continuous,convention,coordinate,correcting,decreasing,definition,' +
      'definitely,derivative,describing,determined,difference,difficulty,dimensions,' +
      'discussing,distribute,eigenvalue,elementary,equivalent,eventually,everything,' +
      'explicitly,expression,generating,horizontal,hypothesis,illustrate,impossible,' +
      'increasing,inequality,initialize,instructed,integrable,interested,introduced,' +
      'logarithms,meaningful,measurable,multiplied,nonnegative,occurrence,operations,' +
      'organizing,orthogonal,percentage,performing,perpendicular,polynomial,population,' +
      'practicing,predicting,previously,procedures,processing,properties,proportion,' +
      'reasonable,recognized,references,reflecting,remarkably,repeatedly,represents,' +
      'simplified,simplifies,situations,statistics,structured,subscripts,substitute,' +
      'subtracted,successful,tangential,technology,themselves,throughout,triangular,' +
      'understand,university,vertically,whichever,worksheets'
    );
    const map = {};
    raw.split(',').forEach(w => {
      const len = w.length;
      if (!map[len]) map[len] = [];
      map[len].push(w);
    });
    return map;
  })();

  /**
   * Match a swipe path (array of letters) to the best dictionary word.
   * Strategy: for each word length bucket, score words by how well
   * the swipe path matches the letter sequence in order.
   */
  function matchSwipeWord(path) {
    if (!path || path.length < 2) return null;

    // Deduplicate consecutive letters
    const deduped = [path[0]];
    for (let i = 1; i < path.length; i++) {
      if (path[i] !== path[i - 1]) deduped.push(path[i]);
    }
    const pathStr = deduped.join('').toLowerCase();
    const first = pathStr[0];
    const last = pathStr[pathStr.length - 1];

    let bestWord = null;
    let bestScore = -Infinity;

    // Check words from length 2 up to pathStr length + 2
    const minLen = 2;
    const maxLen = Math.min(pathStr.length + 3, 12);

    for (let len = minLen; len <= maxLen; len++) {
      const bucket = SWIPE_WORDS[len];
      if (!bucket) continue;

      for (let w = 0; w < bucket.length; w++) {
        const word = bucket[w];

        // Quick filter: first and last letter must match
        if (word[0] !== first || word[word.length - 1] !== last) continue;

        // Score: check how many letters of the word appear in order in the path
        let pi = 0;
        let matched = 0;
        for (let wi = 0; wi < word.length; wi++) {
          while (pi < pathStr.length && pathStr[pi] !== word[wi]) pi++;
          if (pi < pathStr.length) {
            matched++;
            pi++;
          } else {
            break;
          }
        }

        if (matched < word.length) continue; // not all letters found in order

        // Score based on: length match, common word bias
        let score = matched * 10;
        // Prefer words whose length is close to the deduped path length
        score -= Math.abs(word.length - pathStr.length) * 3;
        // Slight bias toward longer words (more meaningful)
        score += word.length;

        if (score > bestScore) {
          bestScore = score;
          bestWord = word;
        }
      }
    }

    return bestWord;
  }

  /** Find up to N candidate words for a swipe path */
  function matchSwipeCandidates(path, maxResults) {
    if (!path || path.length < 2) return [];
    maxResults = maxResults || 3;

    const deduped = [path[0]];
    for (let i = 1; i < path.length; i++) {
      if (path[i] !== path[i - 1]) deduped.push(path[i]);
    }
    const pathStr = deduped.join('').toLowerCase();
    const first = pathStr[0];
    const last = pathStr[pathStr.length - 1];

    const scored = [];
    const minLen = 2;
    const maxLen = Math.min(pathStr.length + 3, 12);

    for (let len = minLen; len <= maxLen; len++) {
      const bucket = SWIPE_WORDS[len];
      if (!bucket) continue;

      for (let w = 0; w < bucket.length; w++) {
        const word = bucket[w];
        if (word[0] !== first || word[word.length - 1] !== last) continue;

        let pi = 0;
        let matched = 0;
        for (let wi = 0; wi < word.length; wi++) {
          while (pi < pathStr.length && pathStr[pi] !== word[wi]) pi++;
          if (pi < pathStr.length) { matched++; pi++; } else break;
        }
        if (matched < word.length) continue;

        let score = matched * 10 - Math.abs(word.length - pathStr.length) * 3 + word.length;
        scored.push({ word, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults).map(s => s.word);
  }

  // ─── INITIALIZATION ─────────────────────────────────────────────────

  /**
   * Initialize the custom keyboard.
   * @param {Object} opts
   * @param {HTMLElement} opts.textInput - The contenteditable #user-input
   * @param {HTMLElement} opts.container - Where to mount the keyboard
   * @param {Function} opts.onSend - Callback when enter/send pressed
   */
  function init(opts) {
    if (initialized) return;
    if (window.innerWidth > 768) return;

    textInput = opts.textInput;
    sendCallback = opts.onSend;

    if (!textInput) return;

    // ─── PERSISTENT MODE CLASS ──────────────────────────────────────
    document.body.classList.add('mx-keyboard-mode');

    // Build the keyboard DOM
    keyboardEl = buildKeyboard();
    opts.container.appendChild(keyboardEl);

    // ─── NATIVE KEYBOARD SUPPRESSION ────────────────────────────────
    suppressNativeKeyboard();

    // Show keyboard when contenteditable gets focus
    textInput.addEventListener('focus', () => {
      suppressNativeKeyboard();
      show();
    });

    // Also show keyboard when contenteditable is tapped (even if already focused)
    textInput.addEventListener('touchstart', () => {
      suppressNativeKeyboard();
      show();
    });

    // Show keyboard when ANY math-field inside the contenteditable gets focus
    // (inline equation boxes create math-fields that steal focus from textInput)
    textInput.addEventListener('focusin', (e) => {
      if (e.target.tagName === 'MATH-FIELD' || e.target.closest('math-field')) {
        suppressNativeKeyboard();
        // Also suppress on the math-field itself
        const mf = e.target.tagName === 'MATH-FIELD' ? e.target : e.target.closest('math-field');
        if (mf) {
          mf.setAttribute('inputmode', 'none');
          mf.mathVirtualKeyboardPolicy = 'manual';
          try {
            const shadow = mf.shadowRoot;
            if (shadow) {
              const ta = shadow.querySelector('textarea');
              if (ta) ta.setAttribute('inputmode', 'none');
            }
          } catch (_) {}
        }
        show();
      }
    });

    // Show keyboard when the entire compose bar is tapped
    const composeBar = textInput.closest('.imessage-compose-bar') || textInput.closest('.imessage-input-row');
    if (composeBar) {
      composeBar.addEventListener('touchstart', (e) => {
        // Don't intercept button taps (send, mic, etc.)
        if (e.target.closest('button') && !e.target.closest('#user-input')) return;
        show();
      });
    }

    // Re-suppress after orientation change or app-switch-back
    window.addEventListener('orientationchange', () => {
      setTimeout(suppressNativeKeyboard, 300);
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && isVisible()) {
        suppressNativeKeyboard();
      }
    });

    // ─── KEYBOARD HEIGHT → CSS VARIABLE ─────────────────────────────
    requestAnimationFrame(() => {
      updateKeyboardHeightVar();
    });

    switchPage('abc');
    initialized = true;

    console.log('[MathmatixKeyboard] Initialized on mobile');
  }

  /** Suppress native keyboard on the contenteditable */
  function suppressNativeKeyboard() {
    if (!textInput) return;
    textInput.setAttribute('inputmode', 'none');
    // Prevent any MathLive virtual keyboard from popping up
    if (window.mathVirtualKeyboard) {
      try { window.mathVirtualKeyboard.visible = false; } catch (_) {}
    }
  }

  /** Measure keyboard and set --mx-kb-height on <body> */
  function updateKeyboardHeightVar() {
    if (!keyboardEl) return;
    const h = keyboardEl.offsetHeight;
    if (h > 0) {
      document.body.style.setProperty('--mx-kb-height', h + 'px');
    }
  }

  // ─── CONTENTEDITABLE TEXT INSERTION ──────────────────────────────────

  /** Ensure the contenteditable has focus and cursor is at end if needed */
  function ensureFocus() {
    if (!textInput) return;
    if (document.activeElement !== textInput) {
      textInput.focus();
    }
    // If there's no selection inside textInput, place cursor at end
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !textInput.contains(sel.anchorNode)) {
      placeCursorAtEnd();
    }
  }

  /** Place cursor at end of contenteditable */
  function placeCursorAtEnd() {
    const range = document.createRange();
    range.selectNodeContents(textInput);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /** Insert a character at the current cursor position in contenteditable */
  function insertChar(char) {
    ensureFocus();
    // execCommand('insertText') is the most reliable way to insert
    // into contenteditable, respecting cursor position and undo stack.
    document.execCommand('insertText', false, char);
  }

  /** Delete one character backward in contenteditable */
  function deleteBackward() {
    ensureFocus();

    // If there's an active inline equation box, delete from it
    const activeEqField = getActiveEquationMathField();
    if (activeEqField) {
      const val = (activeEqField.value || '').trim();
      if (val === '') {
        // Equation box is empty — remove the entire box
        const box = activeEqField.closest('.inline-eq-box');
        if (box) {
          box.remove();
          ensureFocus();
        }
      } else {
        activeEqField.executeCommand('deleteBackward');
      }
      return;
    }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);

    if (!range.collapsed) {
      // Selection exists — delete it
      document.execCommand('delete', false);
      return;
    }

    // Check if cursor is right after an inline equation box
    const node = range.startContainer;
    const offset = range.startOffset;

    if (node.nodeType === Node.ELEMENT_NODE && offset > 0) {
      const prev = node.childNodes[offset - 1];
      if (prev && prev.classList && prev.classList.contains('inline-eq-box')) {
        prev.remove();
        return;
      }
    } else if (node.nodeType === Node.TEXT_NODE && offset === 0) {
      const prev = node.previousSibling;
      if (prev && prev.classList && prev.classList.contains('inline-eq-box')) {
        prev.remove();
        return;
      }
    }

    // Normal backspace
    document.execCommand('delete', false);
  }

  // ─── EQUATION BOX HELPERS ───────────────────────────────────────────

  /** Get the currently active inline equation box's math-field (if any) */
  function getActiveEquationMathField() {
    if (window.InlineEquationBox) {
      return window.InlineEquationBox.getActiveMathField();
    }
    return null;
  }

  /**
   * Insert an inline equation box at cursor, optionally pre-filled
   * with LaTeX. Uses the InlineEquationBox module.
   */
  function insertEquationWithLatex(latex) {
    if (!window.InlineEquationBox) return;

    // Insert a fresh equation box at cursor
    window.InlineEquationBox.insertEquationBoxAtCursor();

    // If we have LaTeX to pre-fill, wait for the math-field to initialize
    // then insert the LaTeX
    if (latex) {
      setTimeout(() => {
        const mf = window.InlineEquationBox.getActiveMathField();
        if (mf) {
          mf.executeCommand(['insert', latex]);
          mf.focus();
          // Suppress native keyboard on this math-field too
          mf.setAttribute('inputmode', 'none');
          if (mf.shadowRoot) {
            const ta = mf.shadowRoot.querySelector('textarea');
            if (ta) ta.setAttribute('inputmode', 'none');
          }
        }
      }, 80);
    }
  }

  // ─── KEYBOARD CONSTRUCTION ──────────────────────────────────────────

  function buildKeyboard() {
    const kb = document.createElement('div');
    kb.id = 'mx-keyboard';
    kb.className = 'mx-keyboard';

    // Suggestion bar (above keys, for swipe candidates)
    suggestionBarEl = document.createElement('div');
    suggestionBarEl.className = 'mx-swipe-bar';
    suggestionBarEl.style.display = 'none';
    kb.appendChild(suggestionBarEl);

    kb.appendChild(buildPage('abc'));
    kb.appendChild(buildPage('123'));
    kb.appendChild(buildPage('symbols'));
    kb.appendChild(buildPage('eq'));

    // Swipe trail SVG overlay
    swipeTrailEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    swipeTrailEl.classList.add('mx-swipe-trail');
    kb.appendChild(swipeTrailEl);

    // Event delegation — touch events for tap and swipe
    kb.addEventListener('touchstart', onTouchStart, { passive: false });
    kb.addEventListener('touchmove', onTouchMove, { passive: false });
    kb.addEventListener('touchend', onTouchEnd, { passive: false });
    kb.addEventListener('mousedown', handleKeyMouse);

    return kb;
  }

  function buildPage(pageName) {
    const page = document.createElement('div');
    page.className = 'mx-kb-page';
    page.dataset.page = pageName;
    page.style.display = 'none';

    const layout = LAYOUTS[pageName];

    layout.rows.forEach((row, rowIdx) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'mx-kb-row';

      if (rowIdx === layout.rows.length - 1) {
        rowEl.classList.add('mx-kb-row-bottom');
      }

      row.forEach(keyDef => {
        const key = buildKey(keyDef, pageName);
        rowEl.appendChild(key);
      });

      page.appendChild(rowEl);
    });

    return page;
  }

  function buildKey(keyDef, pageName) {
    const btn = document.createElement('button');
    btn.className = 'mx-key';
    // Prevent button from stealing focus from contenteditable
    btn.setAttribute('tabindex', '-1');

    // EQ page has object definitions
    if (typeof keyDef === 'object') {
      btn.innerHTML = keyDef.label;
      if (keyDef.hint) {
        btn.innerHTML += `<span class="mx-key-hint">${keyDef.hint}</span>`;
      }
      if (keyDef.latex) {
        btn.dataset.latex = keyDef.latex;
      }
      if (keyDef.action) {
        btn.dataset.action = keyDef.action;
      }
      if (keyDef.wide) {
        btn.classList.add('mx-key-wide');
      }
      btn.classList.add('mx-key-eq');
      return btn;
    }

    // String definitions (ABC, 123 pages)
    const label = keyDef;
    btn.dataset.key = label;

    switch (label) {
      case 'space':
        btn.textContent = '';
        btn.classList.add('mx-key-space');
        btn.dataset.action = 'space';
        break;
      case '⇧':
        btn.innerHTML = '<i class="fas fa-arrow-up"></i>';
        btn.classList.add('mx-key-shift');
        btn.dataset.action = 'shift';
        break;
      case '⌫':
        btn.innerHTML = '<i class="fas fa-delete-left"></i>';
        btn.classList.add('mx-key-delete');
        btn.dataset.action = 'delete';
        break;
      case '↵':
        btn.innerHTML = '<i class="fas fa-arrow-turn-down fa-flip-horizontal"></i>';
        btn.classList.add('mx-key-enter');
        btn.dataset.action = 'enter';
        break;
      case 'ABC':
        btn.textContent = 'ABC';
        btn.classList.add('mx-key-mode');
        btn.dataset.action = 'abc';
        break;
      case '123':
        btn.textContent = '123';
        btn.classList.add('mx-key-mode');
        btn.dataset.action = '123';
        break;
      case 'EQ':
        btn.textContent = 'EQ';
        btn.classList.add('mx-key-mode', 'mx-key-eq-switch');
        btn.dataset.action = 'eq';
        break;
      case '#+=':
        btn.textContent = '#+=';
        btn.classList.add('mx-key-mode');
        btn.dataset.action = 'symbols';
        break;
      default:
        btn.textContent = label;
        btn.dataset.insert = label;
        break;
    }

    return btn;
  }

  // ─── KEY HANDLING ───────────────────────────────────────────────────

  /** Trigger haptic feedback (short vibration pulse) */
  function haptic(ms) {
    if (navigator.vibrate) navigator.vibrate(ms || 8);
  }

  // ─── iOS-STYLE KEY PREVIEW BUBBLE ──────────────────────────────────
  let activeBubble = null;

  function showKeyBubble(key) {
    removeKeyBubble();
    // Only show bubble for character keys (not action/mode keys)
    if (key.dataset.action || key.classList.contains('mx-key-mode') ||
        key.classList.contains('mx-key-eq-switch') || key.classList.contains('mx-key-space')) return;

    const rect = key.getBoundingClientRect();
    const kbRect = keyboardEl.getBoundingClientRect();

    const bubble = document.createElement('div');
    bubble.className = 'mx-key-bubble';
    bubble.textContent = key.textContent;

    // Position above the key
    bubble.style.left = (rect.left - kbRect.left + rect.width / 2) + 'px';
    bubble.style.top = (rect.top - kbRect.top) + 'px';

    keyboardEl.appendChild(bubble);
    activeBubble = bubble;
  }

  function removeKeyBubble() {
    if (activeBubble) {
      activeBubble.remove();
      activeBubble = null;
    }
  }

  // ─── SWIPE-AWARE TOUCH HANDLERS ────────────────────────────────────

  const SWIPE_MOVE_THRESHOLD = 15; // Pixels of movement before swipe activates

  function onTouchStart(e) {
    const touch = e.touches[0];
    const key = document.elementFromPoint(touch.clientX, touch.clientY);
    const keyEl = key ? key.closest('.mx-key') : null;
    if (!keyEl) return;
    e.preventDefault();

    swipeStartTime = Date.now();
    swipeStartKey = keyEl;
    swiping = false;
    swipePath = [];
    swipePoints = [];
    lastSwipeKey = null;

    // Record start position
    swipePoints.push({ x: touch.clientX, y: touch.clientY });

    // Immediate visual + haptic feedback
    haptic(8);
    keyEl.classList.add('mx-key-pressed');
    showKeyBubble(keyEl);

    // Only track letters on ABC page for swipe
    if (currentPage === 'abc' && keyEl.dataset.insert) {
      const letter = (shifted || capsLock) ? keyEl.dataset.insert.toUpperCase() : keyEl.dataset.insert;
      swipePath.push(letter.toLowerCase());
      lastSwipeKey = keyEl;
    }
  }

  function onTouchMove(e) {
    if (!swipeStartKey) return;
    const touch = e.touches[0];
    e.preventDefault();

    swipePoints.push({ x: touch.clientX, y: touch.clientY });

    // Check if we've moved enough to be swiping (only on ABC page)
    if (!swiping && currentPage === 'abc') {
      const dx = touch.clientX - swipePoints[0].x;
      const dy = touch.clientY - swipePoints[0].y;
      if (Math.sqrt(dx * dx + dy * dy) > SWIPE_MOVE_THRESHOLD) {
        swiping = true;
        swipeStartKey.classList.remove('mx-key-pressed');
        removeKeyBubble();
        clearSwipeHighlights();
        if (lastSwipeKey) lastSwipeKey.classList.add('mx-swipe-hover');
        drawSwipeTrail();
      }
    }

    if (!swiping) return;

    // Detect which key the finger is over
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const keyEl = el ? el.closest('.mx-key') : null;

    if (keyEl && keyEl !== lastSwipeKey && keyEl.dataset.insert) {
      // Haptic tick as finger enters new key
      haptic(5);

      // Highlight the new key
      if (lastSwipeKey) lastSwipeKey.classList.remove('mx-swipe-hover');
      keyEl.classList.add('mx-swipe-hover');
      lastSwipeKey = keyEl;

      const letter = keyEl.dataset.insert.toLowerCase();
      swipePath.push(letter);
    }

    // Update trail
    drawSwipeTrail();
  }

  function onTouchEnd(e) {
    if (!swipeStartKey) return;
    e.preventDefault();

    removeKeyBubble();

    if (swiping && swipePath.length >= 2) {
      // ── Swipe complete: match word ──
      clearSwipeHighlights();
      clearSwipeTrail();

      const candidates = matchSwipeCandidates(swipePath, 3);
      if (candidates.length > 0) {
        showSuggestionBar(candidates);
      } else {
        // Fallback: insert the raw path deduplicated
        const raw = [swipePath[0]];
        for (let i = 1; i < swipePath.length; i++) {
          if (swipePath[i] !== swipePath[i - 1]) raw.push(swipePath[i]);
        }
        insertSwipeWord(raw.join(''));
      }
    } else {
      // ── Normal tap ──
      clearSwipeTrail();
      const key = swipeStartKey;
      key.classList.remove('mx-key-pressed');
      setTimeout(() => key.classList.remove('mx-key-pressed'), 80);
      processKey(key);
    }

    // Reset state
    swiping = false;
    swipePath = [];
    swipePoints = [];
    swipeStartKey = null;
    lastSwipeKey = null;
  }

  function handleKeyMouse(e) {
    const key = e.target.closest('.mx-key');
    if (!key) return;
    e.preventDefault();

    haptic(8);
    key.classList.add('mx-key-pressed');
    showKeyBubble(key);
    setTimeout(() => {
      key.classList.remove('mx-key-pressed');
      removeKeyBubble();
    }, 120);

    processKey(key);
  }

  // ─── SWIPE VISUALS ─────────────────────────────────────────────────

  function clearSwipeHighlights() {
    if (!keyboardEl) return;
    keyboardEl.querySelectorAll('.mx-swipe-hover').forEach(k => k.classList.remove('mx-swipe-hover'));
  }

  function drawSwipeTrail() {
    if (!swipeTrailEl || swipePoints.length < 2) return;
    const kbRect = keyboardEl.getBoundingClientRect();

    // Build SVG path
    let d = '';
    for (let i = 0; i < swipePoints.length; i++) {
      const x = swipePoints[i].x - kbRect.left;
      const y = swipePoints[i].y - kbRect.top;
      d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
    }

    swipeTrailEl.innerHTML = '<path d="' + d + '" />';
    swipeTrailEl.style.display = '';
  }

  function clearSwipeTrail() {
    if (!swipeTrailEl) return;
    swipeTrailEl.innerHTML = '';
    swipeTrailEl.style.display = 'none';
  }

  // ─── SUGGESTION BAR ────────────────────────────────────────────────

  function showSuggestionBar(words) {
    if (!suggestionBarEl) return;
    suggestionBarEl.innerHTML = '';
    words.forEach((word, i) => {
      const btn = document.createElement('button');
      btn.className = 'mx-swipe-suggestion' + (i === 0 ? ' mx-swipe-suggestion-primary' : '');
      btn.textContent = word;
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        haptic(8);
        insertSwipeWord(word);
        hideSuggestionBar();
      }, { passive: false });
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        insertSwipeWord(word);
        hideSuggestionBar();
      });
      suggestionBarEl.appendChild(btn);

      // Add divider between suggestions
      if (i < words.length - 1) {
        const div = document.createElement('span');
        div.className = 'mx-swipe-divider';
        suggestionBarEl.appendChild(div);
      }
    });
    suggestionBarEl.style.display = '';

    // Auto-insert primary after timeout
    clearTimeout(suggestionBarEl._timer);
    suggestionBarEl._timer = setTimeout(() => {
      if (suggestionBarEl.style.display !== 'none' && words[0]) {
        insertSwipeWord(words[0]);
        hideSuggestionBar();
      }
    }, 4000);
  }

  function hideSuggestionBar() {
    if (!suggestionBarEl) return;
    clearTimeout(suggestionBarEl._timer);
    suggestionBarEl.innerHTML = '';
    suggestionBarEl.style.display = 'none';
  }

  function insertSwipeWord(word) {
    if (!word) return;
    let text = (shifted || capsLock) ? word.charAt(0).toUpperCase() + word.slice(1) : word;
    ensureFocus();
    document.execCommand('insertText', false, text + ' ');
    // Auto-unshift
    if (shifted && !capsLock) {
      shifted = false;
      updateShiftDisplay();
    }
  }

  function processKey(key) {
    if (!textInput) return;

    const action = key.dataset.action;
    const latex = key.dataset.latex;
    const insert = key.dataset.insert;

    // ─── ACTION KEYS ────────────────────────────────────────────────
    if (action) {
      switch (action) {
        case 'abc':
          switchPage('abc');
          break;
        case '123':
          switchPage('123');
          break;
        case 'eq':
          switchPage('eq');
          break;
        case 'symbols':
          switchPage('symbols');
          break;
        case 'shift':
          toggleShift();
          break;
        case 'delete':
          deleteBackward();
          break;
        case 'space': {
          // If inside an inline equation box, insert space there
          const eqField = getActiveEquationMathField();
          if (eqField) {
            eqField.executeCommand(['insert', ' ']);
          } else {
            insertChar(' ');
          }
          break;
        }
        case 'enter':
          if (sendCallback) sendCallback();
          break;
      }
      return;
    }

    // ─── LATEX INSERTION (EQ page) ──────────────────────────────────
    if (latex) {
      // Check if there's an active inline equation box — insert there
      const activeField = getActiveEquationMathField();
      if (activeField) {
        activeField.executeCommand(['insert', latex]);
        activeField.focus();
      } else {
        // No active equation box — create one with this LaTeX
        insertEquationWithLatex(latex);
      }
      return;
    }

    // ─── CHARACTER INSERTION (ABC / 123 pages) ──────────────────────
    if (insert) {
      let char = insert;
      if (shifted || capsLock) {
        char = char.toUpperCase();
      }

      // If inside an active equation box, type there
      const eqField = getActiveEquationMathField();
      if (eqField) {
        eqField.executeCommand(['typedText', char]);
      } else {
        // Type into the contenteditable
        insertChar(char);
      }

      // Auto-unshift after one character (unless caps lock)
      if (shifted && !capsLock) {
        shifted = false;
        updateShiftDisplay();
      }
    }
  }

  // ─── PAGE SWITCHING ─────────────────────────────────────────────────

  function switchPage(pageName) {
    currentPage = pageName;
    if (!keyboardEl) return;

    keyboardEl.querySelectorAll('.mx-kb-page').forEach(p => {
      p.style.display = p.dataset.page === pageName ? '' : 'none';
    });

    keyboardEl.querySelectorAll('.mx-key-mode, .mx-key-eq-switch').forEach(k => {
      k.classList.toggle('mx-key-active', k.dataset.action === pageName);
    });

    // Re-measure height (EQ page may be taller)
    setTimeout(updateKeyboardHeightVar, 50);
  }

  // ─── SHIFT ──────────────────────────────────────────────────────────

  function toggleShift() {
    if (!shifted) {
      shifted = true;
      capsLock = false;
    } else if (shifted && !capsLock) {
      capsLock = true;
    } else {
      shifted = false;
      capsLock = false;
    }
    updateShiftDisplay();
  }

  function updateShiftDisplay() {
    if (!keyboardEl) return;

    const shiftKeys = keyboardEl.querySelectorAll('[data-action="shift"]');
    shiftKeys.forEach(k => {
      k.classList.toggle('mx-key-shift-active', shifted);
      k.classList.toggle('mx-key-caps-lock', capsLock);
    });

    const abcPage = keyboardEl.querySelector('[data-page="abc"]');
    if (abcPage) {
      abcPage.querySelectorAll('[data-insert]').forEach(k => {
        const base = k.dataset.insert;
        if (base.length === 1 && base.match(/[a-z]/)) {
          k.textContent = (shifted || capsLock) ? base.toUpperCase() : base;
        }
      });
    }
  }

  // ─── SHOW / HIDE ───────────────────────────────────────────────────

  function show() {
    if (!keyboardEl) {
      console.warn('[MathmatixKeyboard] show() called but keyboardEl is null');
      return;
    }
    const wasVisible = keyboardEl.classList.contains('mx-keyboard-visible');
    keyboardEl.classList.add('mx-keyboard-visible');
    document.body.classList.add('mx-keyboard-active');
    suppressNativeKeyboard();
    if (!wasVisible) {
      // Only measure and scroll on first show, not every focus
      setTimeout(updateKeyboardHeightVar, 280);
      const chat = document.getElementById('chat-messages-container');
      if (chat) {
        requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; });
      }
    }
  }

  function hide() {
    if (!keyboardEl) return;
    keyboardEl.classList.remove('mx-keyboard-visible');
    document.body.classList.remove('mx-keyboard-active');
  }

  function isVisible() {
    return keyboardEl && keyboardEl.classList.contains('mx-keyboard-visible');
  }

  // ─── PUBLIC API ─────────────────────────────────────────────────────

  window.MathmatixKeyboard = {
    init,
    show,
    hide,
    isVisible,
    switchPage,
    getInput: () => textInput,
  };
})();
