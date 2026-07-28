const majorCards = [
  ['00_the_fool', 'The Fool'], ['01_the_magician', 'The Magician'], ['02_the_high_priestess', 'The High Priestess'], ['03_the_empress', 'The Empress'], ['04_the_emperor', 'The Emperor'], ['05_the_hierophant', 'The Hierophant'], ['06_the_lovers', 'The Lovers'], ['07_the_chariot', 'The Chariot'], ['08_strength', 'Strength'], ['09_the_hermit', 'The Hermit'], ['10_wheel_of_fortune', 'Wheel of Fortune'], ['11_justice', 'Justice'], ['12_the_hanged_man', 'The Hanged Man'], ['13_death', 'Death'], ['14_temperance', 'Temperance'], ['15_the_devil', 'The Devil'], ['16_the_tower', 'The Tower'], ['17_the_star', 'The Star'], ['18_the_moon', 'The Moon'], ['19_the_sun', 'The Sun'], ['20_judgement', 'Judgement'], ['21_the_world', 'The World']
];
const ranks = [['01_ace', 'Ace'], ['02_two', 'Two'], ['03_three', 'Three'], ['04_four', 'Four'], ['05_five', 'Five'], ['06_six', 'Six'], ['07_seven', 'Seven'], ['08_eight', 'Eight'], ['09_nine', 'Nine'], ['10_ten', 'Ten'], ['page', 'Page'], ['knight', 'Knight'], ['queen', 'Queen'], ['king', 'King']];
const suits = [['cups', 'Cups'], ['pentacles', 'Pentacles'], ['swords', 'Swords'], ['wands', 'Wands']];
const allCards = [
  ...majorCards.map(([id, title]) => ({ id: `major_${id}`, title, suit: 'major', suitLabel: 'Major Arcana', src: `assets/cards/major_${id}.jpg` })),
  ...suits.flatMap(([suit, suitLabel]) => ranks.map(([id, rank]) => ({ id: `${suit}_${id}`, title: `${rank} of ${suitLabel}`, suit, suitLabel, src: `assets/cards/${suit}_${id}.jpg` })))
];
const gallery = document.querySelector('#cardGallery');
const dialog = document.querySelector('#cardDialog');
const dialogImage = document.querySelector('#dialogImage');
const dialogTitle = document.querySelector('#dialogTitle');
const dialogSuit = document.querySelector('#dialogSuit');
const dialogDescription = document.querySelector('#dialogDescription');
const description = card => `${card.title} — Paws Arcana의 ${card.suitLabel} 카드입니다. 카드 원화를 크게 보고, 리딩의 출발점으로 사용해보세요.`;
function renderGallery(filter = 'all') {
  const visible = filter === 'all' ? allCards : allCards.filter(card => card.suit === filter);
  gallery.innerHTML = visible.map(card => `<button class="gallery-card" type="button" data-card-id="${card.id}"><span class="card"><img loading="lazy" src="${card.src}" alt="${card.title}"></span><h3>${card.title}</h3><p>${card.suitLabel}</p></button>`).join('');
}
function openCard(id) {
  const card = allCards.find(item => item.id === id);
  if (!card) return;
  dialogImage.src = card.src;
  dialogImage.alt = card.title;
  dialogSuit.textContent = card.suitLabel;
  dialogTitle.textContent = card.title;
  dialogDescription.textContent = description(card);
  if (typeof dialog.showModal === 'function') dialog.showModal();
}
document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.filter').forEach(item => item.classList.toggle('active', item === button));
  renderGallery(button.dataset.filter);
}));
gallery.addEventListener('click', event => {
  const target = event.target.closest('[data-card-id]');
  if (target) openCard(target.dataset.cardId);
});
document.querySelectorAll('[data-open-card]').forEach(button => button.addEventListener('click', () => openCard(button.dataset.openCard)));
document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
renderGallery();