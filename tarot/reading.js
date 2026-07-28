(() => {
  const deck=window.PawsArcanaDeck || [];
  const spread=document.querySelector('#readingSpread');
  const prompt=document.querySelector('#readingPrompt');
  const result=document.querySelector('#readingResult');
  const summary=document.querySelector('#readingSummary');
  const restart=document.querySelector('#restartReading');
  const positions=['Past','Present','Future'];
  const positionKo=['과거','현재','미래'];
  let picked=[];
  const randomCard=()=>{const remaining=deck.filter(card=>!picked.some(item=>item.id===card.id));return remaining[Math.floor(Math.random()*remaining.length)]};
  function render(){spread.innerHTML=positions.map((position,index)=>{const card=picked[index];return `<button class="reading-slot" type="button" data-slot="${index}" ${card?'disabled':''}><span class="slot-label">${positionKo[index]} / ${position}</span>${card?`<span class="card"><img src="${card.src}" alt="${card.title}"></span><strong class="slot-title">${card.title}</strong><span class="slot-hint">${card.meaning}</span>`:'<span class="card-back">✦</span>'}</button>`}).join('');prompt.textContent=picked.length===0?'첫 번째 카드부터 직접 선택하세요.':picked.length<3?`${positionKo[picked.length]} 카드를 선택하세요.`:'세 장이 모두 나왔습니다. 아래에서 흐름을 읽어보세요.';if(picked.length===3){summary.innerHTML=`<strong>과거 · ${picked[0].title}</strong><br>${picked[0].meaning}<br><br><strong>현재 · ${picked[1].title}</strong><br>${picked[1].meaning}<br><br><strong>미래 · ${picked[2].title}</strong><br>${picked[2].advice}`;result.classList.add('show')}else result.classList.remove('show')}
  spread.addEventListener('click',event=>{const button=event.target.closest('[data-slot]');if(!button||picked.length>=3)return;const slot=Number(button.dataset.slot);if(slot!==picked.length)return;picked.push(randomCard());render()});
  restart.addEventListener('click',()=>{picked=[];render();window.scrollTo({top:0,behavior:'smooth'})});
  render();
})();