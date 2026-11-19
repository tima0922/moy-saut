import { loadCareer, saveCareer } from './career.js?v=08';
import { loadPit, savePit } from './pit-save.js?v=037';
import { DRIVING_ACTIONS, allowedKey, keyLabel, loadBindings } from './drive-bindings.js';

export let storage;
try { storage = window.localStorage; } catch { /* The game can play without saving. */ }
export const career = loadCareer(storage);
export const pit = loadPit(storage, career.driftBest);

const graphicsModes = new Set(['auto','ultra','balanced','integrated','performance','minimum']);
export const graphicsPreference = () => graphicsModes.has(career.graphics)
  ? career.graphics
  : career.high === false ? 'performance' : 'auto';

const $ = selector => document.querySelector(selector);
const notify = name => document.dispatchEvent(new CustomEvent('garage-setting', { detail:name }));
const bindingPrompt = 'Выбери действие и нажми новую клавишу.';

export function setupSettings() {
  const settings = $('#settings-panel'), bindings = $('#bindings-panel');
  const graphics = $('#graphics'), assist = $('#assist-level'), audio = $('#audio');
  const grid = $('#bindings-grid'), status = $('#bindings-status');
  let target;
  function drawAudio() {
    audio.textContent = career.muted ? 'Выключен' : 'Включён';
    audio.setAttribute('aria-pressed', String(!career.muted));
  }
  function drawBindings() {
    grid.innerHTML = pit.keys.map((keys,index) => `<section><h3>Игрок ${index+1}</h3>${Object.entries(DRIVING_ACTIONS).map(([action,label]) =>
      `<div class="pit-row"><span>${label}</span><button type="button" data-player="${index}" data-action="${action}" aria-label="Игрок ${index+1}, ${label}"></button></div>`).join('')}</section>`).join('');
    for (const button of grid.querySelectorAll('button')) {
      button.textContent = keyLabel(pit.keys[Number(button.dataset.player)][button.dataset.action]);
    }
  }

  graphics.value = graphicsPreference();
  assist.value = pit.assist;
  drawAudio();
  drawBindings();
  $('#settings-open').addEventListener('click', () => {
    notify('open');
    settings.showModal();
  });
  $('#bindings-open').addEventListener('click', () => {
    status.textContent = bindingPrompt;
    bindings.showModal();
  });
  bindings.addEventListener('close', () => {
    target = undefined;
  });
  graphics.addEventListener('change', () => {
    if (!graphicsModes.has(graphics.value)) return;
    career.graphics = graphics.value;
    career.high = ['auto','ultra'].includes(graphics.value);
    saveCareer(storage, career);
    notify('graphics');
  });
  assist.addEventListener('change', () => {
    pit.assist = assist.value;
    savePit(storage, pit);
    notify('assist');
  });
  audio.addEventListener('click', () => {
    career.muted = !career.muted;
    drawAudio();
    saveCareer(storage, career);
    notify('audio');
  });
  grid.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    target = { index:Number(button.dataset.player), action:button.dataset.action };
    status.textContent = DRIVING_ACTIONS[target.action] + ' · нажми новую клавишу или Esc.';
  });
  $('#bindings-reset').addEventListener('click', () => {
    pit.keys = loadBindings();
    target = undefined;
    drawBindings();
    savePit(storage, pit);
    notify('keys');
    status.textContent = 'Восстановлены исходные клавиши.';
  });
  document.addEventListener('keydown', event => {
    if (!bindings.open || !target || event.ctrlKey || event.metaKey || event.altKey || event.code === 'Tab') return;
    event.preventDefault();
    if (event.repeat) return;
    const { index, action } = target;
    if (event.code === 'Escape') {
      target = undefined;
      status.textContent = bindingPrompt;
    } else if (!allowedKey(event.code)) {
      status.textContent = 'Эта клавиша зарезервирована. Нажми другую.';
    } else if (pit.keys.some((keys,i) => Object.entries(keys).some(([name,code]) => code === event.code && (i !== index || name !== action)))) {
      status.textContent = 'Клавиша уже занята. Выбери другую.';
    } else {
      pit.keys[index][action] = event.code;
      target = undefined;
      drawBindings();
      grid.querySelector(`button[data-player="${index}"][data-action="${action}"]`).focus();
      savePit(storage, pit);
      notify('keys');
      status.textContent = 'Управление сохранено.';
    }
  });
}
