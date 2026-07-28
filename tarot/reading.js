(() => {
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
  const escapeHtml=value=>value.replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  function lensFor(question,card,index){
    if(/연애|사랑|관계|상대|마음|이별|썸/.test(question)) return index===2?card.advice:card.love;
    if(/일|직장|커리어|사업|프로젝트|창업|진로|공부|시험/.test(question)) return index===2?card.advice:card.work;
    if(/돈|금전|재정|투자|수입|지출/.test(question)) return index===2?card.advice:card.work;
    return index===2?card.advice:card.meaning;
  }
  const randomCard=()=>{const remaining=deck.filter(card=>!picked.some(item=>item.id===card.id));return remaining[Math.floor(Math.random()*remaining.length)]};
  function render(){
    spread.innerHTML=positions.map((position,index)=>{const card=picked[index];return `<button class="reading-slot" type="button" data-slot="${index}" ${card?'disabled':''}><span class="slot-label">${positionKo[index]} / ${position}</span>${card?`<span class="card"><img src="${card.src}" alt="${card.title}"></span><strong class="slot-title">${card.title}</strong><span class="slot-hint">${lensFor(activeQuestion,card,index)}</span>`:'<span class="card-back">✦</span>'}</button>`}).join('');
    prompt.textContent=picked.length===0?'첫 번째 카드부터 직접 선택하세요.':picked.length<3?`${positionKo[picked.length]} 카드를 선택하세요.`:'세 장이 모두 나왔습니다. 아래에서 질문의 흐름을 읽어보세요.';
    if(picked.length===3){
      echo.innerHTML=`<strong>질문</strong><br>“${escapeHtml(activeQuestion)}”`;
      summary.innerHTML=picked.map((card,index)=>`<section class="detail-block"><h3>${positionKo[index]} · ${card.title}</h3><p>${lensFor(activeQuestion,card,index)}</p></section>`).join('');
      result.classList.add('show');
    } else result.classList.remove('show');
  }
  form.addEventListener('submit',event=>{event.preventDefault();const question=questionInput.value.trim();if(!question){questionError.classList.add('show');questionInput.focus();return;}activeQuestion=question;questionError.classList.remove('show');picked=[];spread.hidden=false;render();spread.scrollIntoView({behavior:'smooth',block:'center'});});
  questionInput.addEventListener('input',()=>questionError.classList.remove('show'));
  spread.addEventListener('click',event=>{const button=event.target.closest('[data-slot]');if(!button||picked.length>=3)return;const slot=Number(button.dataset.slot);if(slot!==picked.length)return;const card=randomCard();if(!card)return;picked.push(card);render();});
  restart.addEventListener('click',()=>{picked=[];activeQuestion='';questionInput.value='';spread.hidden=true;result.classList.remove('show');prompt.textContent='질문을 적고 시작해 주세요.';questionInput.focus();window.scrollTo({top:0,behavior:'smooth'});});
})();