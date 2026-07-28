(() => {
  const API_URL='https://paws.1mintrim.com/api/reading';
  const deck=window.PawsArcanaDeck || [];
  const form=document.querySelector('#questionForm');
  const questionInput=document.querySelector('#readingQuestion');
  const questionError=document.querySelector('#questionError');
  const spread=document.querySelector('#readingSpread');
  const prompt=document.querySelector('#readingPrompt');
  const result=document.querySelector('#readingResult');
  const echo=document.querySelector('#questionEcho');
  const summary=document.querySelector('#readingSummary');
  const restart=document.querySelector('#restartReading');
  const positions=['Past','Present','Future'];
  const positionKo=['과거','현재','미래'];
  let picked=[];
  let activeQuestion='';
  let requestVersion=0;
  const escapeHtml=value=>String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const formatText=value=>escapeHtml(value).replace(/\n/g,'<br>');
  const apiCardId=id=>{
    const major=id.match(/^(major_\d{2})_/); if(major)return major[1];
    const minor=id.match(/^([a-z]+)_\d{2}_(.+)$/); if(minor)return `${minor[1]}_${minor[2]}`;
    return id;
  };
  const randomCard=()=>{const remaining=deck.filter(card=>!picked.some(item=>item.id===card.id));return remaining[Math.floor(Math.random()*remaining.length)]};
  function renderCards(){
    spread.innerHTML=positions.map((position,index)=>{const card=picked[index];return `<button class="reading-slot" type="button" data-slot="${index}" ${card?'disabled':''}><span class="slot-label">${positionKo[index]} / ${position}</span>${card?`<span class="card"><img src="${card.src}" alt="${card.title}"></span><strong class="slot-title">${card.title}</strong><span class="slot-hint">${index===2?'세 장의 흐름을 바탕으로 조언을 준비하고 있어요.':'이 카드는 종합 해석 안에서 앞뒤 카드와 함께 읽습니다.'}</span>`:'<span class="card-back">✦</span>'}</button>`}).join('');
  }
  function setPending(){
    echo.innerHTML=`<strong>질문</strong><br>“${escapeHtml(activeQuestion)}”`;
    summary.innerHTML='<div class="codex-loading">카드 세 장과 질문을 함께 읽고 있어요<span class="dots">...</span></div>';
    result.classList.add('show');
  }
  function showInterpretation(sections){
    const order=['총평','과거','현재','미래','조언'];
    summary.innerHTML=order.filter(key=>sections&&sections[key]).map(key=>`<section class="detail-block"><h3>${key}</h3><p>${formatText(sections[key])}</p></section>`).join('');
  }
  async function requestInterpretation(){
    const version=++requestVersion;
    setPending();
    try{
      const response=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:activeQuestion,cards:picked.map((card,index)=>({id:apiCardId(card.id),reversed:false,position:positionKo[index]}))})});
      const data=await response.json();
      if(!response.ok||!data.ok)throw new Error(data.error||'해석 요청에 실패했습니다.');
      if(version!==requestVersion)return;
      if(data.interpretationError)throw new Error(data.interpretationError);
      showInterpretation(data.sections);
    }catch(error){
      if(version!==requestVersion)return;
      summary.innerHTML=`<div class="reading-api-error"><strong>종합 해석을 불러오지 못했어요.</strong><br>${escapeHtml(error.message||'잠시 후 다시 시도해 주세요.')}</div>`;
    }
  }
  function render(){
    renderCards();
    prompt.textContent=picked.length===0?'첫 번째 카드부터 직접 선택하세요.':picked.length<3?`${positionKo[picked.length]} 카드를 선택하세요.`:'세 장이 모두 나왔습니다. 질문과 함께 종합 해석을 준비합니다.';
    if(picked.length===3)requestInterpretation();else result.classList.remove('show');
  }
  form.addEventListener('submit',event=>{event.preventDefault();const question=questionInput.value.trim();if(!question){questionError.classList.add('show');questionInput.focus();return;}activeQuestion=question;questionError.classList.remove('show');picked=[];requestVersion++;spread.hidden=false;render();spread.scrollIntoView({behavior:'smooth',block:'center'});});
  questionInput.addEventListener('input',()=>questionError.classList.remove('show'));
  spread.addEventListener('click',event=>{const button=event.target.closest('[data-slot]');if(!button||picked.length>=3)return;const slot=Number(button.dataset.slot);if(slot!==picked.length)return;const card=randomCard();if(!card)return;picked.push(card);render();});
  restart.addEventListener('click',()=>{requestVersion++;picked=[];activeQuestion='';questionInput.value='';spread.hidden=true;result.classList.remove('show');prompt.textContent='질문을 적고 시작해 주세요.';questionInput.focus();window.scrollTo({top:0,behavior:'smooth'});});
})();