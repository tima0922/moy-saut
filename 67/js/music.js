const musicToggle = document.querySelector('#music-toggle');
const musicPanel = document.querySelector('#music-panel');
const musicVideo = document.querySelector('#music-video');
const musicEmbed = document.querySelector('#music-embed');

function setMusicOpen(open) {
  musicPanel.hidden = !open;
  const label = (open ? 'Остановить' : 'Включить') + ' ЦУЕФА — Я тебя могну';
  musicToggle.setAttribute('aria-expanded', String(open));
  musicToggle.setAttribute('aria-label', label);
  musicToggle.title = label;
  if (open) {
    musicVideo.append(musicEmbed.content.cloneNode(true));
  } else {
    musicVideo.replaceChildren();
  }
}

musicToggle.addEventListener('click', () => setMusicOpen(musicPanel.hidden));
musicToggle.closest('.music').addEventListener('keydown', event => {
  if (event.key === 'Escape' && !musicPanel.hidden) {
    setMusicOpen(false);
    musicToggle.focus();
  }
});
