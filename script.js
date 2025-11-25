(function(){
  const $ = (id)=>document.getElementById(id);
  const strategyEl = $('strategy');
  const preloadEl = $('preload');
  const fontUrl1El = $('fontUrl1');
  const fontName1El = $('fontName1');
  const fontUrl2El = $('fontUrl2');
  const fontName2El = $('fontName2');
  const samplePrimary = $('samplePrimary');
  const sampleSecondary = $('sampleSecondary');
  const logEl = $('log');
  const metricsEl = $('metrics');
  const runBtn = $('run');
  const resetBtn = $('reset');
  const exportBtn = $('export');
  const sampleText = $('sampleText');
  const subsetEl = $('subset');
  const variableEl = $('variable');
  const minW = $('minW');
  const maxW = $('maxW');
  const weightRange = $('weightRange');
  const heatmap = $('heatmap');
  const timeline = $('timeline');
  const presets = document.querySelectorAll('.chip');
  const insertSelfHost = $('insertSelfHost');

  samplePrimary.textContent = sampleText.value;
  sampleSecondary.textContent = sampleText.value;

  function log(msg){
    const t = new Date().toISOString();
    logEl.innerHTML = `<div>[${t}] ${msg}</div>` + logEl.innerHTML;
  }

  function clearInjected(){
    const l = document.querySelectorAll('[data-fontlab]');
    l.forEach(n=>n.remove());
    const s = document.getElementById('fontlab-style'); if(s) s.remove();
    document.documentElement.style.removeProperty('--font-primary');
  }

  function injectCSSSnippet(generated){
    let s = document.getElementById('fontlab-style');
    if(!s){ s = document.createElement('style'); s.id='fontlab-style'; s.setAttribute('data-fontlab','1'); document.head.appendChild(s);} 
    s.textContent = generated;
  }

  function createLink(url, rel='stylesheet', as=null, swapOnload=false){
    const link = document.createElement('link');
    link.setAttribute('data-fontlab','1');
    if(rel) link.rel = rel;
    if(as) link.as = as;
    link.href = url;
    if(swapOnload){ link.onload = ()=>{ try{ link.rel='stylesheet'; log('preload -> stylesheet swapped'); }catch(e){ log('swap failed'); } } }
    document.head.appendChild(link);
    return link;
  }

  // Preset clicks
  presets.forEach(p=>p.addEventListener('click', ()=>{
    fontUrl1El.value = p.dataset.url;
    fontName1El.value = p.dataset.name;
    log('preset: ' + p.dataset.name);
  }));

  sampleText.addEventListener('input', ()=>{ samplePrimary.textContent = sampleText.value; sampleSecondary.textContent = sampleText.value; });
  minW.addEventListener('input', ()=> weightRange.textContent = `${minW.value} - ${maxW.value}`);
  maxW.addEventListener('input', ()=> weightRange.textContent = `${minW.value} - ${maxW.value}`);

  resetBtn.addEventListener('click', ()=>{ clearInjected(); metricsEl.textContent='No measurements yet.'; logEl.innerHTML=''; heatmap.innerHTML=''; log('reset'); timeline.textContent='Timeline: —'; });

  insertSelfHost.addEventListener('click', ()=>{
    const sample = `@font-face {
  font-family: 'MyInter';
  src: url('/fonts/Inter-Variable.woff2') format('woff2');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}

<link rel=\"preload\" href=\"/fonts/Inter-Variable.woff2\" as=\"font\" type=\"font/woff2\" crossorigin>`;
    navigator.clipboard?.writeText(sample).then(()=> log('self-host sample copied to clipboard'));
  });

  function formatMs(v){ return typeof v === 'number' ? v.toFixed(1)+'ms' : v }

  // Layout Shift observer for accurate CLS
  let cls = 0.0;
  let layoutObserver;
  function startLayoutObserver(){
    cls = 0.0;
    if(window.PerformanceObserver){
      try{
        layoutObserver = new PerformanceObserver((list)=>{
          for(const entry of list.getEntries()){
            if(!entry.hadRecentInput){ cls += entry.value; }
          }
          document.getElementById('metrics').dataset.cls = cls.toFixed(4);
        });
        layoutObserver.observe({type:'layout-shift', buffered:true});
      }catch(e){ log('Layout Shift observer not supported'); }
    }
  }

  function stopLayoutObserver(){ if(layoutObserver){ layoutObserver.disconnect(); layoutObserver=null; } }

  async function measureRenderingCost(weights, applyFont){
    // For each weight, apply the CSS style and measure paint durations via RAF + performance.now
    const results = [];
    for(const w of weights){
      const start = performance.now();
      // apply weight
      applyFont(w);
      // wait next paint
      await new Promise(r=>requestAnimationFrame(()=>r()));
      await new Promise(r=>requestAnimationFrame(()=>r()));
      const dur = performance.now() - start;
      results.push({w,dur});
      log(`weight ${w} paint time ${dur.toFixed(1)}ms`);
    }
    return results;
  }

  async function runTest(){
    clearInjected(); heatmap.innerHTML='';
    metricsEl.textContent = 'Running test...';
    log('test started');
    timeline.textContent = 'Timeline: test started';

    // Performance marks
    performance.clearMarks(); performance.clearMeasures();
    performance.mark('fontlab-start');

    startLayoutObserver();

    // generated CSS var
    const generatedCSS = `:root{--font-primary:'${fontName1El.value}', system-ui, -apple-system, 'Segoe UI', Roboto, Arial;} .lab-sample{font-family:var(--font-primary);}`;
    injectCSSSnippet(generatedCSS);

    const fallback = 'Arial, Helvetica, sans-serif';
    samplePrimary.style.fontFamily = fallback;
    sampleSecondary.style.fontFamily = fallback;
    await new Promise(r=>requestAnimationFrame(r));
    const baseline1 = samplePrimary.getBoundingClientRect().width;
    const baseline2 = sampleSecondary.getBoundingClientRect().width;
    log(`baseline widths: ${baseline1.toFixed(1)}, ${baseline2.toFixed(1)}`);

    // Load strategy handling
    const strat = strategyEl.value;
    if(strat === 'blocking'){
      createLink(fontUrl1El.value,'stylesheet');
      if(preloadEl.checked) log('(blocking) provider stylesheet; browser manages fetching');
    } else if(strat === 'async'){
      if(preloadEl.checked){
        // rel=preload with as=style isn't standard; this simulates preload+swap trick
        const l = createLink(fontUrl1El.value,'preload','style',true);
        l.onload = function(){ try{ this.rel='stylesheet'; log('preload->stylesheet swapped'); }catch(e){ log('swap failed'); } };
      } else {
        const l = document.createElement('link'); l.rel='stylesheet'; l.href=fontUrl1El.value; l.media='print'; l.onload=function(){this.media='all'; log('async stylesheet loaded & enabled');}; l.setAttribute('data-fontlab','1'); document.head.appendChild(l);
      }
    } else {
      createLink(fontUrl1El.value,'stylesheet');
    }

    // also load second font non-blocking
    createLink(fontUrl2El.value,'stylesheet');

    // timeline update: navigationStart -> FCP (paint) -> fonts applied
    const navStart = performance.timing ? performance.timing.navigationStart : Date.now() - performance.now();
    timeline.textContent = `Timeline: navigationStart=${new Date(navStart).toISOString()}`;

    // try to detect FCP using PerformancePaintTiming
    let fcp = null;
    if(window.performance && performance.getEntriesByType){
      const paints = performance.getEntriesByType('paint');
      for(const p of paints){ if(p.name==='first-contentful-paint'){ fcp = p.startTime; break; } }
    }
    if(fcp) timeline.textContent += ` → FCP=${formatMs(fcp)}`;

    // wait for fonts to be ready
    log('waiting for document.fonts.ready...');
    const fonts = document.fonts;
    const beforeReady = performance.now();
    try{
      await fonts.ready;
      const afterReady = performance.now();
      log(`document.fonts.ready resolved after ${(afterReady-beforeReady).toFixed(1)}ms`);
      performance.mark('fonts-ready');
    }catch(e){ log('fonts.ready failed: '+e); }

    // apply the loaded font
    document.documentElement.style.setProperty('--font-primary', `'${fontName1El.value}', ${fallback}`);
    samplePrimary.style.fontFamily = `var(--font-primary)`;
    sampleSecondary.style.fontFamily = `var(--font-primary)`;

    // poll for width change to detect application
    const timeout = 3000; let appliedAt=null; const pollInterval=50; const start = performance.now();
    for(let t=0;t<timeout;t+=pollInterval){
      await new Promise(r=>setTimeout(r,pollInterval));
      const w1 = samplePrimary.getBoundingClientRect().width;
      const w2 = sampleSecondary.getBoundingClientRect().width;
      if(Math.abs(w1 - baseline1) > 0.5 || Math.abs(w2 - baseline2) > 0.5){ appliedAt = performance.now(); log(`font applied at ${(appliedAt-start).toFixed(1)}ms`); break; }
    }
    if(!appliedAt) log(`font not detected within ${timeout}ms — fallback likely used (FOUT)`);

    // measure final CLS from observer
    await new Promise(r=>setTimeout(r,120)); // wait a short moment for layout shifts to settle
    stopLayoutObserver();
    const observedCLS = metricsEl.dataset.cls || '0.0000';

    // crude CLS estimate by width diff
    const preRect = {w: baseline1};
    const postRectW = samplePrimary.getBoundingClientRect().width;
    const clsCrude = Math.abs(postRectW - preRect.w) / window.innerWidth;

    // measure rendering cost per weight for a subset of weights
    const min = parseInt(minW.value,10), max = parseInt(maxW.value,10);
    const steps = 6;
    const stepVal = Math.max(100, Math.floor((max-min)/Math.max(1,steps-1)));
    const weights = [];
    for(let w=min; w<=max; w+=stepVal) weights.push(w);
    if(weights[weights.length-1] !== max) weights.push(max);

    const paintResults = await measureRenderingCost(weights, (w)=>{ samplePrimary.style.fontVariationSettings = `'wght' ${w}`; samplePrimary.style.fontWeight = w; });

    // draw heatmap
    heatmap.innerHTML = '';
    const maxDur = Math.max(...paintResults.map(r=>r.dur));
    for(const r of paintResults){
      const h = Math.max(6, (r.dur / maxDur) * 80);
      const bar = document.createElement('div'); bar.className='bar'; bar.style.height = h+'px'; bar.title = `${r.w}: ${r.dur.toFixed(1)}ms`; bar.textContent = r.w; heatmap.appendChild(bar);
    }

    const measures = {
      timeSinceStart: (performance.now() - start).toFixed(1) + 'ms',
      foitMs: appliedAt ? (appliedAt - start).toFixed(1)+'ms' : '—',
      observedCLS: observedCLS,
      crudeCLS: clsCrude.toFixed(5),
      baselineWidths: [baseline1.toFixed(1), baseline2.toFixed(1)],
      postWidths: [postRectW.toFixed(1), sampleSecondary.getBoundingClientRect().width.toFixed(1)],
      weightPaints: paintResults.map(r=>({w:r.w,dur:r.dur.toFixed(1)}))
    };

    metricsEl.textContent = JSON.stringify(measures, null, 2);

    // timeline final
    const fcpEntry = (performance.getEntriesByType('paint')||[]).find(p=>p.name==='first-contentful-paint');
    const fcpMs = fcpEntry ? fcpEntry.startTime.toFixed(1) + 'ms' : 'n/a';
    const fontApplyMs = appliedAt ? (appliedAt - start).toFixed(1)+'ms' : 'n/a';
    timeline.textContent = `Timeline: navStart=${new Date(navStart).toISOString()} → FCP=${fcpMs} → fontsApplied=${fontApplyMs}`;

    log('test finished');
  }

  // measureRenderingCost uses two RAFs to let paint happen — defined earlier
  async function measureRenderingCost(weights, applyFont){
    const results = [];
    for(const w of weights){
      const before = performance.now();
      applyFont(w);
      await new Promise(r=>requestAnimationFrame(()=>r()));
      await new Promise(r=>requestAnimationFrame(()=>r()));
      const dur = performance.now() - before;
      results.push({w,dur});
    }
    return results;
  }

  function exportCSS(){
    // produce full export with self-host example if user clicked insert
    const display = strategyEl.value === 'swap' ? 'swap' : 'auto';
    const unicode = subsetEl.value ? `/* unicode-range: ${subsetEl.value}; (simulate) */
` : '';
    const variableHint = variableEl.checked ? `/* variable font recommended; weight range ${minW.value}-${maxW.value} */
` : '';
    const provider = `@import url('${fontUrl1El.value}');`;

    const selfHostExample = `/* Self-hosting example (change paths and filenames) */
@font-face {
  font-family: 'MyFont-Variable';
  src: url('/fonts/MyFont-VF.woff2') format('woff2');
  font-weight: 100 900;
  font-style: normal;
  font-display: ${display};
}
<link rel=\"preload\" href=\"/fonts/MyFont-VF.woff2\" as=\"font\" type=\"font/woff2\" crossorigin>`;

    const css = `/* Recommended CSS (generated) */
${unicode}${variableHint}${provider}
:root{--font-primary:'${fontName1El.value}', system-ui, -apple-system, 'Segoe UI', Roboto, Arial;}
body{font-family:var(--font-primary);font-variation-settings:'wght' 400;}

/* ${selfHostExample} */`;

    const blob = new Blob([css],{type:'text/plain'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'fontlab-advanced.css'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
    log('exported advanced CSS + self-host example');
  }

  exportBtn.addEventListener('click', exportCSS);
  runBtn.addEventListener('click', runTest);

})();