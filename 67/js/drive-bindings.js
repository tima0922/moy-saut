export const DRIVING_ACTIONS = { gas:'Газ', brake:'Тормоз / назад', left:'Влево', right:'Вправо', handbrake:'Ручник', recover:'Вернуться на трассу' };

export const DEFAULT_KEYS = [
  { gas:'KeyW',brake:'KeyS',left:'KeyA',right:'KeyD',handbrake:'Space',recover:'KeyQ' },
  { gas:'ArrowUp',brake:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',handbrake:'ShiftRight',recover:'Backspace' },
];

const reserved = new Set(['KeyC','KeyT']);
export const allowedKey = code => !reserved.has(code) && /^(?:Key[A-Z]|Digit\d|Numpad\d|Arrow(?:Up|Down|Left|Right)|Shift(?:Left|Right)|Space|Backspace|Bracket(?:Left|Right)|Semicolon|Quote|Comma|Period|Slash|Backslash|Minus|Equal)$/.test(code);

export function loadBindings(saved) {
  const actions = Object.keys(DRIVING_ACTIONS);
  const codes = DEFAULT_KEYS.flatMap((_,i) => actions.map(action => saved?.[i]?.[action]));
  return codes.every(allowedKey) && new Set(codes).size === codes.length
    ? DEFAULT_KEYS.map((_,i) => Object.fromEntries(actions.map(action => [action,saved[i][action]])))
    : DEFAULT_KEYS.map(keys => ({ ...keys }));
}

export function keyLabel(code) {
  const labels = { ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',Space:'Пробел',ShiftRight:'Правый Shift',ShiftLeft:'Левый Shift',BracketLeft:'[',BracketRight:']',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/',Backslash:'\\',Minus:'-',Equal:'=' };
  return labels[code] ?? code.replace(/^(Key|Digit)/,'').replace(/^Numpad/,'Num ');
}
