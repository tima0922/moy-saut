'use strict';
/* ==========================================================================
   NETLAB 3D — ВИРТУАЛЬНАЯ ЛАБОРАТОРИЯ КОМПЬЮТЕРНЫХ СЕТЕЙ (V2.0)
   3D-Анатомия, Обжим RJ-45, L1/L2 Хаб vs Свитч, PDU Инспектор, Traceroute, BGP, CIDR
   ========================================================================== */

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],V3=(...a)=>new THREE.Vector3(...a);

/* ---------- ЗВУКОВОЙ ДВИЖОК И АМБИЕНТ ЦОД (Web Audio API) ---------- */
let AC,mute=false,ambientNode=null;
function tone(f,d=.1,ty='sine',v=.08,s=0){
  if(mute)return;
  AC=AC||new(window.AudioContext||window.webkitAudioContext)();
  const t=AC.currentTime+s,o=AC.createOscillator(),g=AC.createGain();
  o.type=ty;o.frequency.value=f;g.gain.setValueAtTime(v,t);
  g.gain.exponentialRampToValueAtTime(.001,t+d);
  o.connect(g);g.connect(AC.destination);o.start(t);o.stop(t+d);
}
const sfx={
  click:()=>tone(1000,.04,'square',.025),
  crimp:()=>{tone(110,.18,'sawtooth',.14);tone(55,.25,'square',.12,.06)},
  ok:()=>[660,880,1320].forEach((f,i)=>tone(f,.15,'sine',.08,i*.09)),
  err:()=>{tone(160,.28,'sawtooth',.1);tone(110,.3,'sawtooth',.1,.14)},
  ping:()=>tone(1400,.08,'triangle',.06),
  collision:()=>{
    tone(180,.4,'sawtooth',.2);tone(90,.5,'square',.18);
    setTimeout(()=>tone(140,.35,'sawtooth',.18),120);
  }
};
document.addEventListener('click',e=>{if(e.target.closest('button'))sfx.click()});
$('#snd').onclick=e=>{mute=!mute;e.currentTarget.textContent=mute?'🔇':'🔊'};

/* Амбиент серверной */
$('#amb-btn').onclick=e=>{
  AC=AC||new(window.AudioContext||window.webkitAudioContext)();
  if(ambientNode){
    ambientNode.stop();ambientNode.disconnect();ambientNode=null;
    e.currentTarget.classList.remove('act');
    return;
  }
  const osc1=AC.createOscillator(),osc2=AC.createOscillator(),gain=AC.createGain(),filter=AC.createBiquadFilter();
  osc1.type='sawtooth';osc1.frequency.value=52;
  osc2.type='sine';osc2.frequency.value=104;
  filter.type='lowpass';filter.frequency.value=220;
  gain.gain.value=0.035;
  osc1.connect(filter);osc2.connect(filter);filter.connect(gain);gain.connect(AC.destination);
  osc1.start();osc2.start();
  ambientNode={stop:()=>{osc1.stop();osc2.stop()}};
  e.currentTarget.classList.add('act');
};

/* ---------- ПОМОЩНИКИ THREE.JS И ПРОЦЕДУРНЫЕ ТЕКСТУРЫ ---------- */
const bx=(w,h,d)=>new THREE.BoxGeometry(w,h,d),cy=(r,h,s=16)=>new THREE.CylinderGeometry(r,r,h,s);
const DS=THREE.DoubleSide;
const M=(c,o={})=>new THREE.MeshStandardMaterial(Object.assign({color:c,metalness:.1,roughness:.5,emissive:0x00e5ff,emissiveIntensity:0},o));
const MT=(c=0xb8c0cc,o={})=>M(c,Object.assign({metalness:.85,roughness:.32},o));
const MP=(c,o={})=>new THREE.MeshPhysicalMaterial(Object.assign({color:c,metalness:.15,roughness:.3,clearcoat:.6,clearcoatRoughness:.25},o));

function tex(w,h,fn,rx=1,ry=1){
  const c=document.createElement('canvas');c.width=w;c.height=h;
  fn(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rx,ry);t.anisotropy=4;
  return t;
}

function rbox(w,d,h,r=.1){
  const s=new THREE.Shape(),x=-w/2,y=-d/2;
  s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);
  s.lineTo(x+w,y+d-r);s.quadraticCurveTo(x+w,y+d,x+w-r,y+d);
  s.lineTo(x+r,y+d);s.quadraticCurveTo(x,y+d,x,y+d-r);
  s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);
  const b=Math.min(.03,h*.12),g=new THREE.ExtrudeGeometry(s,{depth:h-2*b,bevelEnabled:true,bevelThickness:b,bevelSize:b,bevelSegments:2,curveSegments:8});
  g.translate(0,0,-(h-2*b)/2);g.rotateX(-Math.PI/2);
  return g;
}

const ventT=tex(128,128,(x,w,h)=>{x.fillStyle='rgba(2,4,8,.92)';for(let i=0;i<8;i++)x.fillRect(10,i*16+5,108,6)});
const perfT=tex(64,64,(x,w,h)=>{x.fillStyle='#181e26';x.fillRect(0,0,w,h);x.fillStyle='#000';for(let i=0;i<4;i++)for(let j=0;j<4;j++){x.beginPath();x.arc(8+i*16,8+j*16,4,0,7);x.fill()}},20,3);
const braidT=tex(64,64,(x,w,h)=>{
  x.fillStyle='#7b848e';x.fillRect(0,0,w,h);x.strokeStyle='#dce2e8';x.lineWidth=4;
  for(let i=-64;i<128;i+=16){x.beginPath();x.moveTo(i,0);x.lineTo(i+64,64);x.stroke();x.beginPath();x.moveTo(i+64,0);x.lineTo(i,64);x.stroke()}
},10,8);
const label=(t)=>tex(512,64,(x,w,h)=>{x.fillStyle='#10161f';x.fillRect(0,0,w,h);x.fillStyle='#7dd3fc';x.font='bold 28px sans-serif';x.fillText(t,16,42)});

/* ================= СЦЕНА THREE.JS ================= */
const R=new THREE.WebGLRenderer({canvas:$('#c'),antialias:true});
R.setPixelRatio(Math.min(devicePixelRatio,innerWidth<768?1.5:2));
const S=new THREE.Scene();S.background=new THREE.Color(0x05070d);S.fog=new THREE.Fog(0x05070d,18,55);

const cam=new THREE.PerspectiveCamera(50,innerWidth/innerHeight,.1,120);
const ctl=new THREE.OrbitControls(cam,R.domElement);
ctl.enableDamping=true;ctl.minDistance=1.2;ctl.maxDistance=35;cam.position.set(0,1.8,7.5);

S.add(new THREE.AmbientLight(0x8fa3bf,.9));
const dl=new THREE.DirectionalLight(0xffffff,1.15);dl.position.set(5,10,7);S.add(dl);
const pl1=new THREE.PointLight(0x00e5ff,1.3,45);pl1.position.set(-6,5,5);S.add(pl1);
const pl2=new THREE.PointLight(0xd946ef,.85,45);pl2.position.set(6,3,-4);S.add(pl2);
const gr=new THREE.GridHelper(60,60,0x00e5ff,0x0c2a3a);gr.position.y=-2.3;S.add(gr);

/* Окружение для отражений */
{
  const pm=new THREE.PMREMGenerator(R),es=new THREE.Scene();
  es.add(new THREE.Mesh(new THREE.SphereGeometry(20,32,16),new THREE.MeshBasicMaterial({
    side:THREE.BackSide,
    map:tex(4,128,(x,w,h)=>{
      const g=x.createLinearGradient(0,0,0,h);
      g.addColorStop(0,'#d0e6fd');g.addColorStop(.5,'#283d54');g.addColorStop(1,'#04060a');
      x.fillStyle=g;x.fillRect(0,0,w,h);
    })
  })));
  [[12,14,6],[-14,6,-8]].forEach(p=>{
    const m=new THREE.Mesh(new THREE.PlaneGeometry(10,6),new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide}));
    m.position.set(...p);m.lookAt(0,0,0);es.add(m);
  });
  S.environment=pm.fromScene(es).texture;
}

/* ================= БАЗА ЗНАНИЙ ================= */
const INFO={
  jacket:['Внешняя оболочка Cat.6','Поливинилхлорид (PVC) / LSZH','Гибкая, самозатухающая, Ø ≈6,2 мм','Механическая защита всех внутренних элементов','Влаги, истирания, перегибов, химии'],
  foil:['Фольгированный экран (F/UTP)','Алюминиевая фольга на лавсане + дренажная жила','Толщина ≈0,02 мм, 100% сплошное покрытие','Создаёт клетку Фарадея вокруг всех 4 пар','Электромагнитных помех (EMI), радиопомех (RFI)'],
  cord:['Разрывная капроновая нить','Полиамид (Ripcord)','Высокая прочность на растяжение','Вскрытие оболочки вдоль кабеля без повреждения жил','— (монтажный элемент)'],
  ins:['Изоляция проводника','Вспененный полиэтилен (HDPE)','Цветовая маркировка T568B/A, толщина ≈0,2 мм','Диэлектрическая изоляция и геометрия витой пары','Короткого замыкания жил и межкабельных наводок'],
  cu:['Медная моножила','Электротехническая медь 23 AWG (Ø ≈0,57 мм)','Низкое сопротивление (≈9,3 Ом / 100 м)','Передача высокочастотного электрического сигнала','Скрутка жил компенсирует взаимные наводки (NEXT/FEXT)'],
  ujacket:['Оболочка Cat.5e (UTP)','Эластичный серый PVC','Ø ≈5,1 мм, компактный и гибкий','Защита витых пар; кабель тоньше и дешевле экранированных','Пыли, истирания и лёгких механических нагрузок'],
  sjacket:['Оболочка Cat.7 (S/FTP)','Малодымный полимер без галогенов (LSZH)','Не выделяет едких газов при горении, Ø ≈7,8 мм','Пожаробезопасная внешняя защита для ЦОД и стоек','Огня, термических и механических повреждений'],
  braid:['Общий экран-оплётка','Лужёная медная проволока (плотность 65–80%)','Высокая электропроводность, заземляется через коннектор','Отражает низкочастотные электромагнитные наводки','Тяжёлых промышленных помех и наводок соседних кабелей'],
  pfoil:['Индивидуальный экран пары (PiMF)','Алюминиевая фольга на полиэстере','Оборачивает каждую пару отдельно','Полная изоляция пар друг от друга внутри кабеля','Перекрёстных помех (NEXT); обеспечивает полосу 600 МГц и 10G'],
  cjacket:['Оболочка коаксиала RG-6','PVC со светостабилизатором','Стойкая к ультрафиолету и морозу, Ø ≈6,9 мм','Внешняя защита кабеля для улицы и помещений','Ультрафиолета, влаги, истирания'],
  cbraid:['Внешний проводник-оплётка','Алюминиевые или лужёные медные нити','Плотность плетения 60–90%, 75 Ом','Роль общего обратного провода и экрана','Внешних радиочастотных помех и паразитного излучения'],
  cfoil:['Экранирующая фольга','Алюминиевая лента','Сплошной экран под оплёткой','Перекрывает микрощели между проволоками оплётки на СВЧ','Высокочастотных наводок (Wi-Fi, 4G/LTE, ТВ-вышки)'],
  diel:['Диэлектрик коаксиала','Физически вспененный полиэтилен (FPE)','Низкие диэлектрические потери, строгая геометрия','Фиксирует центральную жилу строго по центру для импеданса 75 Ом','Смещения жилы, потерь сигнала и фазовых искажений'],
  ccore:['Центральная жила RG-6','Омеднённая сталь (CCS) или чистая медь Ø ≈1,02 мм','Высокая механическая прочность на изгиб','Передача радиочастотного сигнала (спутниковое ТВ, DOCSIS)','Скин-эффект: высокочастотный ток течёт по тонкому внешнему слою меди'],
  fjacket:['Оболочка волокна (FTTH)','LSZH полимер жёлтого цвета (SMF OS2)','Стойкий к изгибу и растяжению','Обозначение типа волокна (жёлтый — одномод 9/125 мкм)','Механических воздействий и излома'],
  kevlar:['Силовой элемент из кевлара','Арамидные нити Kevlar®','Прочность на разрыв в 5 раз выше стали при малом весе','Принимает растягивающие усилия при протяжке кабеля в трубы','Разрыва и растяжения хрупкого стеклянного волокна'],
  buffer:['Плотный буфер (Tight Buffer)','Акрилатный полимер, Ø 900 мкм','Эластичный защитный слой','Буферизация стекла, удобство оконцевания оптическими коннекторами','Микроизгибов и точечного давления'],
  clad:['Оптическая оболочка (Cladding)','Кварцевое стекло повышенной чистоты, Ø 125 мкм','Показатель преломления n₂ строго ниже показателя сердцевины n₁','Создаёт эффект полного внутреннего отражения на границе сред','Утечки световых квантов наружу'],
  core:['Сердцевина волокна (Core)','Легированный кварц (SiO₂), Ø всего 9 мкм','Затухание света всего ≈0,2 дБ/км на 1550 нм','Сверхскоростная передача модулированных лазерных вспышек','Полная невосприимчивость к любым электромагнитным помехам'],
  pe:['Внешняя бронеоболочка','Полиэтилен высокой плотности (HDPE)','У берега Ø до 50 мм, в глубоком океане ≈20–25 мм','Защита подводного кабеля от морской воды и истирания о дно','Морской воды, течений, камней, укусов акул'],
  steel:['Стальная канатно-проволочная броня','Оцинкованные витые стальные канаты','Держит вес кабеля при опускании на глубину до 8 000 метров','Принимает колоссальное натяжение при монтаже со дна океана','Якорей судов, рыболовных тралов, подводных оползней'],
  alb:['Алюминиевый водно-водородный барьер','Сплошная герметичная сварная алюминиевая трубка','Абсолютная герметичность под давлением до сотен атмосфер','Блокирует диффузию ионов воды и молекул водорода к оптике','Помутнения стекла от водородной коррозии'],
  pc:['Диэлектрический изолятор','Высоковольтный поликарбонат','Электрическая прочность в десятки киловольт','Изолирует медную питающую трубку под высоким напряжением','Электрического пробоя и утечки тока в морскую воду'],
  cutube:['Медная трубка электропитания','Медная цилиндрическая труба','Проводит постоянный ток до ≈10 000 В (сила тока ≈1–1,5 А)','Питает оптические усилители (EDFA), установленные через каждые 60–100 км','Затухания света на расстояниях в тысячи километров через океаны'],
  jelly:['Гидрофобный гель-заполнитель','Тиксотропный кремнийорганический петролатум','Не замерзает, не сохнет, вязкий','Амортизирует волокна и мгновенно блокирует воду при пробое','Продольного распространения влаги вдоль кабеля'],
  sfib:['Пучок оптических волокон','Кварцевые световоды (от 8 до 24 пар волокон)','Суммарная пропускная способность кабеля достигает 250+ Тбит/с','Трансконтинентальная передача терабитных потоков мирового интернета','Искажения сигнала (DWDM-мультиплексирование)'],

  /* Оборудование */
  rcase:['Корпус маршрутизатора','Матовый и глянцевый ABS-пластик','С вентиляционными прорезями','Защита электроники от внешних воздействий и пыли','Механических повреждений и статического электричества'],
  rfeet:['Антивибрационные ножки','Силиконовая резина высокой плотности','Нескользящие демпферы','Устойчивость роутера на столе и зазор для естественной конвекции','Скольжения и перегрева платы снизу'],
  rcpu:['Процессор роутера (SoC) с радиатором','Кремний 14–28 нм + ребристый радиатор из алюминия','2–4 ядра ARM/MIPS 0,8–1,8 ГГц','Маршрутизация IP-пакетов, NAT-трансляция, фаервол, WPA3','Перегрева кристалла при высокой сетевой нагрузке'],
  port:['Порт RJ-45 (Gigabit Ethernet)','Экранированный разъем, позолоченные контакты 50u"','1000BASE-T с автоопределением MDI/MDI-X','Подключение сетевых устройств по кабелю «витая пара»','Окисления контактов и потерь пакетов'],
  ant:['Антенна Wi-Fi (диполь)','Медный коаксиальный излучатель в шарнирном корпусе','Усиление 5 dBi, диапазоны 2,4 и 5 ГГц (MIMO 2×2 / 3×3)','Излучение и приём радиоволн Wi-Fi 5 / 6','Мёртвых зон радиопокрытия за счёт пространственной фильтрации'],
  pcb:['Печатная плата (PCB)','Многослойный стеклотекстолит FR-4 с медными трассами','Высокая плотность монтажа SMD-компонентов','Электрическое соединение процессора, памяти, портов и радиомодулей','Паразитных электромагнитных наводок между дорожками'],
  led:['Индикатор состояния (LED)','Полупроводниковый SMD-светодиод','Низкое энергопотребление, мгновенный отклик','Индикация питания, WAN/LAN линков и активности Wi-Fi','— (диагностический элемент)'],

  swcase:['Корпус коммутатора 1U','Оцинкованная листовая сталь, крепления в стойку 19″','Стандартная высота 1U (44,45 мм)','Несущий каркас коммутатора для серверных телеком-стоек','Электромагнитных помех соседнего оборудования и прогиба'],
  swport:['Порт коммутатора RJ-45','Металлическая обойма с защитой от ESD-разрядов','1 Гбит/с Full Duplex, собственный домен коллизий','Пересылка Ethernet-кадров напрямую адресату по MAC-таблице','Коллизий и перегрузки полосы пропускания'],
  sfp:['Оптический порт SFP+ (10G)','Металлическая корзина под SFP/SFP+ модули','10 Гбит/с, поддержка одномодовой и многомодовой оптики, DAC-кабелей','Магистральные аплинки (Uplink) к серверам или ядру сети','Узких мест пропускной способности при агрегации трафика'],
  swasic:['Матрица коммутации (ASIC) с радиатором','Специализированная микросхема (L2/L3 ASIC)','Неблокируемая коммутационная фабрика с пропускной способностью сотен Гбит/с','Аппаратная обработка кадров, хранение таблицы MAC-адресов','Задержек при передаче пакетов: кадры идут со скоростью линии wire-speed'],
  swpsu:['Импульсный блок питания','Промышленный преобразователь AC-DC','Вход 100–240 В, КПД > 88%','Формирование стабильного низковольтного питания чипсета и портов PoE','Скачков напряжения и пульсаций в электросети'],

  hubcase:['Корпус концентратора (Хаба)','Пластиковый корпус эпохи 10BASE-T / 100BASE-TX','8 портов, полудуплексный режим (Half-Duplex)','Устаревшее сетевое устройство физического уровня (L1)','Хаб не разделяет трафик: любой входящий бит транслируется на ВСЕ остальные порты'],
  hubic:['Микросхема многопортового повторителя (Repeater)','Кремниевый контроллер уровня L1','Восстанавливает форму импульсов и амплитуду сигнала','Копирует сигнал во все порты без анализа MAC-адресов','Затухания сигнала, но вызывает коллизии (требует протокол CSMA/CD)'],

  scase:['Серверное шасси 2U','Сталь 1,2 мм, направляющие для стойки 19″','Высота 2U (88,9 мм), перегородки для направленного продува','Размещение высокоплотных серверных компонентов в дата-центрах','Вибраций жестких дисков и повреждений при обслуживании'],
  sbez:['Перфорированная лицевая панель','Штампованная сталь с гексагональной сеткой','Проницаемость для воздуха > 65%','Защищает дисковую корзину при сохранении мощного воздухотока','Попадания посторонних предметов и помех'],
  bay:['Корзина накопителей Hot-Swap','Салазки с замком и разъёмами SAS/SATA/NVMe U.2','Горячая замена дисков без выключения сервера','Хранение массивов данных в отказоустойчивых RAID-конфигурациях','Потери данных при отказе одного или двух накопителей (RAID 5/6/10)'],
  mb:['Серверная материнская плата','Многослойный текстолит (10–12 слоёв)','Поддержка двух процессорных сокетов, шины PCIe Gen 4/5','Координация вычислений, сверхбыстрый обмен между CPU, RAM и контроллерами','— (основа архитектуры сервера)'],
  cpu:['Серверный процессор (CPU) с радиатором','Кремниевый чип (до 64–128 ядер) + радиатор с теплотрубками','Тепловыделение (TDP) от 180 до 350 Вт на сокет','Обработка запросов тысяч клиентов, виртуализация, СУБД, веб-сервисы','Троттлинга и аварийного отключения от перегрева'],
  ram:['Модуль памяти DDR5 ECC RDIMM','Печатная плата с чипами памяти и регистровым буфером RCD','Скорость до 4800–6400 МТ/с, коррекция ошибок ECC','Оперативное хранение выполняемых программ и кэша баз данных','Сбоев и аварийных остановок из-за случайных инверсий битов (Bit Flip)'],
  fan:['Серверный вентиляторный модуль','Двухроторный бесколлекторный вентилятор (до 15 000 об/мин)','Статическое давление до 500 Па, горячая замена на лету','Продувает весь 2U-корпус от передней панели через радиаторы к задней стенке','Перегрева компонентов сервера при круглосуточной работе 24/7'],
  psu:['Резервируемый блок питания (1+1 Redundant)','Стальной модуль 80 PLUS Titanium','Мощность 800–1600 Вт, горячая замена на лету','Бесперебойное питание: при отказе одного блока второй мгновенно берет нагрузку','Остановки сервера и простоя сервисов при авариях в электросети'],

  city:['Береговая станция кабелей (CLS)','Специализированное защищённое здание на побережье','Подземные колодцы выхода кабеля из моря, дизель-генераторы резервного питания','Точка стыка подводной океанской оптики с континентальными сетями операторов','Отказов питания: станции имеют автономность в недели работы'],
  w1:['Подводный кабель MAREA','8 пар оптических волокон, Meta, Microsoft и Telxius (2017)','Длина 6 600 км, рекордная ёмкость свыше 200 Тбит/с','Маршрут: Вирджиния-Бич (США) — Бильбао (Испания)','Один из самых современных трансатлантических магистральных кабелей'],
  w2:['Подводный кабель FASTER','6 пар волокон, консорциум Google (2016)','Длина 9 000 км через Тихий океан, пропускная способность 60 Тбит/с','Маршрут: Бандон (Орегон, США) — префектура Тиба (Япония)','Использует сверхчистые волокна с низкими потерями и 100-гигабитные DWDM каналы'],
  w3:['Подводный кабель Equiano','12 пар волокон технологии SDM (Spatial Diversity Multiplexing), Google (2022)','Длина 15 000 км вдоль Африки, ёмкость 144 Тбит/с','Маршрут: Лиссабон (Португалия) — Кейптаун (ЮАР)','Имеет подводные ветвители (Branching Units) для подключения стран Африки'],
  w4:['Подводный кабель Monet','6 пар волокон, партнёрство Google, Algar Telecom, Antel (2017)','Длина 10 550 км, пропускная способность 64 Тбит/с','Маршрут: Бока-Ратон (Флорида, США) — Форталеза (Бразилия)','Ключевая цифровая артерия обмена трафиком между Северной и Южной Америкой'],
  w5:['Магистраль SEA-ME-WE 3 (Европа — Индия)','Сверхдальний магистральный консорциумный кабель (39 000 км)','Марсель (Франция) — Суэцкий канал — Мумбаи (Индия)','Историческая супермагистраль связи Европы и Азии','Один из самых протяженных кабелей в истории телекоммуникаций'],
  w6:['Магистраль SEA-ME-WE 3 (Индия — Сингапур)','Восточный отрезок глобальной магистрали SEA-ME-WE 3','Маршрут: Мумбаи (Индия) — Сингапур','Сингапур — крупнейший в ЮВА телекоммуникационный узел обмена трафиком'],
  w7:['Подводный кабель Indigo','Двухпарная оптическая система Indigo West & Central (2019)','Длина 9 200 км, пропускная способность 36 Тбит/с','Маршрут: Сингапур — Джакарта — Перт — Сидней (Австралия)','Сократил задержки и связал Австралию с азиатскими облачными дата-центрами']
};

/* ================= СОЗДАНИЕ 3D-ОБЪЕКТОВ ================= */
const gCat6=new THREE.Group(),gUTP=new THREE.Group(),gS7=new THREE.Group(),gCoax=new THREE.Group(),
      gFiber=new THREE.Group(),gSub=new THREE.Group(),gRouter=new THREE.Group(),gSwitch=new THREE.Group(),
      gHub=new THREE.Group(),gServer=new THREE.Group(),gNet=new THREE.Group(),gWorld=new THREE.Group();

const ALL_GROUPS=[gCat6,gUTP,gS7,gCoax,gFiber,gSub,gRouter,gSwitch,gHub,gServer,gNet,gWorld];
ALL_GROUPS.forEach(g=>{S.add(g);g.pk=[]});

function add(g,geo,mat,id,o={}){
  const m=new THREE.Mesh(geo,mat);
  m.position.copy(o.p||V3());
  if(o.r)m.rotation.set(...o.r);
  m.userData={
    id,label:o.l||'',
    eb:mat.emissiveIntensity!==undefined?mat.emissiveIntensity:0,
    base:m.position.clone(),
    dir:o.d||V3(),
    z:o.z||2.2
  };
  g.add(m);g.pk.push(m);return m;
}

const tube=(r,y0,y1,slit)=>new THREE.CylinderGeometry(r,r,y1-y0,48,1,true,slit?Math.PI/4:0,slit?Math.PI*1.5:Math.PI*2);
const plat=(g,r)=>{
  const m1=new THREE.Mesh(cy(r,.12,64),MP(0x0f1724,{metalness:.8,roughness:.25}));m1.position.y=-.06;g.add(m1);
  const m2=new THREE.Mesh(new THREE.TorusGeometry(r,.025,8,64),M(0x00e5ff,{emissive:0x00e5ff,emissiveIntensity:1.3}));m2.rotation.x=Math.PI/2;g.add(m2);
};
function rj(g,id,x,y,z,l,dz,s=1,col=0x0a0f18){
  const f=(geo,m,yy)=>add(g,geo,m,id,{p:V3(x,yy,z),d:V3(0,0,dz),z:1.4,l});
  f(bx(.34*s,.26*s,.2),MT(0xaab4c0),y);
  f(bx(.27*s,.19*s,.202),M(col),y-.005);
  f(bx(.2*s,.02,.204),MT(0xe0b040,{roughness:.25}),y+.05*s);
}
function led(g,x,y,z,c,dx,dy,dz,st){
  const m=add(g,bx(.07,.035,.03),M(c,{emissive:c,emissiveIntensity:.8}),'led',{p:V3(x,y,z),d:V3(dx,dy,dz),z:1.2});
  m.userData.st=st;return m;
}
function fan(g,x,y,z,r,dx=0,dy=0,dz=0){
  add(g,new THREE.TorusGeometry(r,r*.14,8,24),M(0x20252d),'fan',{p:V3(x,y,z),d:V3(dx,dy,dz),z:1.5,l:'(диффузор)'});
  for(let k=0;k<3;k++){
    const m=add(g,bx(r*1.75,r*.3,.04),M(0x3b4450,{roughness:.4}),'fan',{p:V3(x,y,z),d:V3(dx,dy,dz),z:1.5,l:'(лопасти)',r:[0,0,k*Math.PI/3]});
    m.userData.fan=1;
  }
  add(g,cy(r*.28,.07,12),M(0x0d0f12),'fan',{p:V3(x,y,z),d:V3(dx,dy,dz),z:1.5,l:'(подшипник)',r:[Math.PI/2,0,0]});
}
function heat(g,id,x,y,z,w,dy,n=8){
  add(g,bx(w,.04,w),MT(0x9aa3ad),id,{p:V3(x,y,z),d:V3(0,dy,0),z:2,l:'(основание радиатора)'});
  for(let k=0;k<n;k++){
    add(g,bx(w-.04,.16,.025),MT(0xcdd5de,{roughness:.3}),id,{p:V3(x,y+.1,z-w/2+.06+k*(w-.12)/(n-1)),d:V3(0,dy,0),z:2,l:'(рёбра радиатора)'});
  }
}

const PC=[['#ff8a1f','оранжевая'],['#22c55e','зелёная'],['#2563eb','синяя'],['#7c4a21','коричневая']];
function wireMat(col,stripe){
  if(!stripe) return M(col,{roughness:.4});
  const c=document.createElement('canvas');c.width=c.height=64;
  const x=c.getContext('2d');x.fillStyle='#f4f4f4';x.fillRect(0,0,64,64);x.fillStyle=col;x.fillRect(0,0,32,64);
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(16,1);
  return M(0xffffff,{map:t,roughness:.4});
}
function helix(a,j,y0,y1,rw=.085,R1=.25){
  const p=[];
  for(let i=0;i<=120;i++){
    const t=i/120,y=y0+(y1-y0)*t,ph=j*Math.PI+(y-y0)*Math.PI*2*1.3;
    p.push(V3(R1*Math.cos(a)+rw*Math.cos(ph),y,R1*Math.sin(a)+rw*Math.sin(ph)));
  }
  return new THREE.CatmullRomCurve3(p);
}
function pairs(g,RR,rw,wr,y1=2.4,ex=.8){
  PC.forEach((c,p)=>{
    const a=p*Math.PI/2,d=V3(Math.cos(a)*ex,0,Math.sin(a)*ex);
    [0,1].forEach(j=>{
      const nm=j?c[1][0].toUpperCase()+c[1].slice(1):'Бело-'+c[1];
      add(g,new THREE.TubeGeometry(helix(a,j,-3,y1,rw,RR),240,wr,8),wireMat(c[0],!j),'ins',{l:nm,d,z:1.4});
      add(g,new THREE.TubeGeometry(helix(a,j,-3,3,rw,RR),240,wr*.55,6),MT(0xd9822b,{roughness:.25}),'cu',{l:'жила '+nm.toLowerCase(),d:d.clone().add(V3(0,.9,0)),z:1.2});
    });
  });
}

[gCat6, gUTP, gS7, gCoax, gFiber, gSub].forEach(g=>g.rotation.z=Math.PI/2);

/* 0. Cat.6 F/UTP */
add(gCat6,tube(.62,-3,.8,1),M(0x1668d8,{transparent:true,opacity:.9,side:DS,roughness:.35}),'jacket',{p:V3(0,-1.1,0),d:V3(0,-1.7,0),z:3.5});
add(gCat6,tube(.5,-3,1.5,1),MT(0xcfd8dc,{transparent:true,opacity:.92,side:DS,roughness:.25}),'foil',{p:V3(0,-.75,0),d:V3(0,-.9,0),z:3});
add(gCat6,cy(.04,5.2,12),M(0xffffff),'cord',{p:V3(0,-.4,0),d:V3(0,.5,0),z:1.5});
pairs(gCat6,.25,.085,.07);

/* 1. Cat.5e UTP */
add(gUTP,tube(.55,-3,.8,1),M(0x8f9ca6,{transparent:true,opacity:.92,side:DS,roughness:.4}),'ujacket',{p:V3(0,-1.1,0),d:V3(0,-1.7,0),z:3.3});
add(gUTP,cy(.035,5,10),M(0xffffff),'cord',{p:V3(0,-.5,0),d:V3(0,.5,0),z:1.4});
pairs(gUTP,.22,.08,.065);

/* 2. Cat.7 S/FTP */
add(gS7,tube(.7,-3,.6,1),M(0x15181d,{transparent:true,opacity:.93,side:DS,roughness:.5}),'sjacket',{p:V3(0,-1.2,0),d:V3(0,-1.9,0),z:3.6});
add(gS7,tube(.6,-3,1.2,1),M(0xffffff,{map:braidT,side:DS,metalness:.4,roughness:.4}),'braid',{p:V3(0,-.9,0),d:V3(0,-1.2,0),z:3});
pairs(gS7,.3,.085,.07,2.2,1);
PC.forEach((c,p)=>{
  const a=p*Math.PI/2;
  add(gS7,tube(.2,-3,1.5,1),MT(0xe8eef3,{transparent:true,opacity:.4,side:DS,roughness:.2}),'pfoil',{p:V3(.3*Math.cos(a),-.75,.3*Math.sin(a)),d:V3(Math.cos(a)*1.1,-.5,Math.sin(a)*1.1),z:2.2,l:'№'+(p+1)});
});

/* 3. Коаксиал RG-6 */
add(gCoax,tube(.55,-3,.8,1),M(0xf2f2f2,{transparent:true,opacity:.95,side:DS,roughness:.5}),'cjacket',{p:V3(0,-1.1,0),d:V3(0,-1.8,0),z:3.3});
add(gCoax,tube(.43,-3,1.4,1),M(0xffffff,{map:braidT,side:DS,metalness:.4,roughness:.4}),'cbraid',{p:V3(0,-.8,0),d:V3(0,-1.1,0),z:2.8});
add(gCoax,tube(.38,-3,1.9,1),MT(0xdfe6ec,{side:DS,roughness:.25}),'cfoil',{p:V3(0,-.55,0),d:V3(0,-.5,0),z:2.5});
add(gCoax,tube(.3,-3,2.5,1),M(0xfff6dd,{side:DS,roughness:.7}),'diel',{p:V3(0,-.25,0),d:V3(0,.3,0),z:2});
add(gCoax,cy(.075,6.2,16),MT(0xd9822b,{roughness:.25}),'ccore',{d:V3(0,1.2,0),z:1.2});

/* 4. Оптоволокно FTTH */
add(gFiber,tube(.5,-3,.6,1),M(0xffb020,{transparent:true,opacity:.92,side:DS}),'fjacket',{p:V3(0,-1.2,0),d:V3(0,-1.7,0),z:3});
for(let i=0;i<14;i++){
  const a=i/14*Math.PI*2;
  add(gFiber,cy(.025,4.4,6),M(0xffe34d),'kevlar',{p:V3(Math.sin(a)*.34,-.8,Math.cos(a)*.34),d:V3(Math.sin(a)*.7,-.9,Math.cos(a)*.7),z:1.6});
}
add(gFiber,tube(.26,-3,1.8,1),M(0xf2f2f2,{transparent:true,opacity:.55,side:DS}),'buffer',{p:V3(0,-.6,0),d:V3(0,-.3,0),z:2.2});
add(gFiber,cy(.13,6,24),M(0x9fe8ff,{transparent:true,opacity:.3,roughness:.1}),'clad',{d:V3(0,.5,0),z:1.5});
const fiberCore=add(gFiber,cy(.045,6.2,12),M(0x66f6ff,{emissive:0x00e5ff,emissiveIntensity:1.2}),'core',{d:V3(0,1.1,0),z:1.2});
const ph=new THREE.Mesh(new THREE.SphereGeometry(.075,12,12),new THREE.MeshBasicMaterial({color:0xffffff}));
gFiber.add(ph);

/* 5. Подводный кабель */
add(gSub,tube(.72,-3,.5,1),M(0x1a1e25,{transparent:true,opacity:.95,side:DS,roughness:.7}),'pe',{p:V3(0,-1.25,0),d:V3(0,-1.8,0),z:3.6});
for(let i=0;i<20;i++){
  const a=i/20*Math.PI*2;
  if(Math.min(a,2*Math.PI-a)<Math.PI/4)continue;
  add(gSub,cy(.05,4.4,8),MT(0x9aa4af,{roughness:.35}),'steel',{p:V3(.58*Math.sin(a),-.8,.58*Math.cos(a)),d:V3(Math.sin(a)*.7,-.9,Math.cos(a)*.7),z:2,l:'№'+(i+1)});
}
add(gSub,tube(.46,-3,1.2,1),MT(0xcfd6dd,{side:DS}),'alb',{p:V3(0,-.9,0),d:V3(0,-1,0),z:2.6});
add(gSub,tube(.4,-3,1.8,1),M(0xe9c46a,{transparent:true,opacity:.65,side:DS}),'pc',{p:V3(0,-.6,0),d:V3(0,-.5,0),z:2.4});
add(gSub,tube(.31,-3,2.4,1),MT(0xd9822b,{side:DS,roughness:.3}),'cutube',{p:V3(0,-.3,0),d:V3(0,.1,0),z:2});
add(gSub,cy(.22,6,24),M(0xffd27a,{transparent:true,opacity:.45,roughness:.2}),'jelly',{d:V3(0,.7,0),z:1.8});
for(let i=0;i<6;i++){
  const a=i/6*Math.PI*2;
  add(gSub,cy(.035,6.4,8),M(0x66f6ff,{emissive:0x00e5ff,emissiveIntensity:1.2}),'sfib',{p:V3(.09*Math.sin(a),0,.09*Math.cos(a)),d:V3(Math.sin(a)*.5,1.3,Math.cos(a)*.5),z:1.3,l:'№'+(i+1)});
}

/* 6. Роутер */
{
  const g=gRouter;plat(g,2.9);
  add(g,rbox(3.4,2.2,.3,.2),MP(0x14181f,{roughness:.35}),'rcase',{p:V3(0,.21,0),d:V3(0,-.2,0),z:3.2,l:'(основание)'});
  add(g,rbox(3.4,2.2,.22,.2),MP(0x1b2029,{roughness:.22}),'rcase',{p:V3(0,.47,0),d:V3(0,1.5,0),z:3.2,l:'(крышка)'});
  add(g,new THREE.PlaneGeometry(2.3,1.2),M(0xffffff,{map:ventT,transparent:true,roughness:.7}),'rcase',{p:V3(0,.585,-.25),d:V3(0,1.5,0),z:3,l:'(вентиляция)',r:[-Math.PI/2,0,0]});
  [[-1.4,-.85],[1.4,-.85],[-1.4,.85],[1.4,.85]].forEach(p=>add(g,cy(.1,.06,12),M(0x111214,{roughness:.9}),'rfeet',{p:V3(p[0],.03,p[1]),d:V3(0,-.5,0),z:1.6}));
  for(let i=0;i<4;i++) rj(g,'port',-.65+i*.45,.2,1.06,'LAN '+(i+1),.8);
  rj(g,'port',-1.25,.2,1.06,'WAN',.8,1,0x1e3a8a);
  add(g,bx(.3,.15,.2),MT(0xaab4c0),'port',{p:V3(1.05,.2,1.06),d:V3(0,0,.8),z:1.3,l:'USB 3.0'});
  add(g,cy(.1,.2,18),M(0x0a0a0a),'port',{p:V3(1.5,.2,1.06),d:V3(0,0,.8),z:1.3,l:'12 В',r:[Math.PI/2,0,0]});
  [0x22ff88,0x22ff88,0x22ff88,0x22ff88,0x38bdf8,0xffb020].forEach((c,i)=>led(g,-.6+i*.3,.6,.8,c,0,1.5,0,i<2));
  for(let i=0;i<3;i++){
    const x=-1.25+i*1.25,t=(i-1)*.22,dd=(i-1)*.9;
    add(g,cy(.09,.16,14),M(0x0d0f12),'ant',{p:V3(x,.64,.95),d:V3(dd,1.1,-.2),z:2.2,l:'(шарнир)',r:[0,0,Math.PI/2]});
    add(g,cy(.045,1.6,10),M(0x0d0f12,{roughness:.5}),'ant',{p:V3(x+Math.sin(t)*.8,.64+Math.cos(t)*.8,.95),d:V3(dd,1.1,-.2),z:2.2,l:'№'+(i+1),r:[-.2,0,-t]});
  }
  add(g,bx(3,.04,1.9),M(0x0b6b3a,{roughness:.55}),'pcb',{p:V3(0,.38,0),d:V3(0,.4,0),z:2.6});
  add(g,bx(.55,.07,.55),M(0x15171c),'rcpu',{p:V3(-.5,.43,-.2),d:V3(0,.8,0),z:1.6,l:'(SoC)'});
  heat(g,'rcpu',-.5,.47,-.2,.6,.8);
}

/* 7. Коммутатор */
{
  const g=gSwitch;plat(g,3.3);const st=MT(0x39424f,{roughness:.5});
  add(g,bx(4.4,.04,2),st,'swcase',{p:V3(0,.07,0),d:V3(0,-.4,0),z:4,l:'(дно)'});
  add(g,bx(4.4,.04,2),MT(0x4a5563,{roughness:.45}),'swcase',{p:V3(0,.71,0),d:V3(0,1.6,0),z:4,l:'(крышка)'});
  add(g,bx(4.4,.64,.05),MT(0x2b323c,{roughness:.55}),'swcase',{p:V3(0,.39,1),d:V3(0,0,.9),z:3.5,l:'(панель)'});
  for(let r=0;r<2;r++)for(let c=0;c<12;c++){
    const x=-2+c*.29,y=r?.22:.46,n=r*12+c+1;
    rj(g,'swport',x,y,1.03,'№'+n,.9,.78);
    led(g,x,r?.34:.62,1.03,c%3?0x22ff88:0xffb020,0,0,.9);
  }
  [[1.55,.22],[1.88,.22],[1.55,.46],[1.88,.46]].forEach((p,i)=>{
    add(g,bx(.27,.2,.3),MT(0xaab4c0),'sfp',{p:V3(p[0],p[1],1.05),d:V3(0,0,.9),z:1.4,l:'№'+(i+1)});
  });
  add(g,bx(4,.03,1.7),M(0x0b6b3a,{roughness:.55}),'pcb',{p:V3(0,.13,0),d:V3(0,.4,0),z:3});
  heat(g,'swasic',0,.22,0,.6,.9,7);
  add(g,bx(1,.4,.6),M(0x2b323c,{metalness:.6}),'swpsu',{p:V3(1.5,.33,-.5),d:V3(0,.9,0),z:2.2});
  [-1.5,-.8,-.1].forEach(x=>fan(g,x,.4,-.85,.17,0,.9,0));
}

/* 8. Концентратор (Хаб) */
{
  const g=gHub;plat(g,2.4);
  add(g,rbox(3,1.5,.32,.15),MP(0xc9ccd1,{roughness:.55}),'hubcase',{p:V3(0,.19,0),d:V3(0,-.2,0),z:3,l:'(основание)'});
  add(g,rbox(3,1.5,.2,.15),MP(0xd6d9de,{roughness:.5}),'hubcase',{p:V3(0,.45,0),d:V3(0,1.4,0),z:3,l:'(крышка)'});
  for(let i=0;i<8;i++){
    const x=-1.19+i*.34;
    rj(g,'port',x,.2,.78,'№'+(i+1),.8,.78);
    led(g,x,.45,.76,0x22ff88,0,1.4,.2);
  }
  const collLed=led(g,1.4,.45,.76,0xff3355,0,1.4,.2);
  collLed.userData.isColl=true;
  add(g,bx(2.8,.03,1.3),M(0x0b6b3a,{roughness:.55}),'pcb',{p:V3(0,.36,-.05),d:V3(0,.4,0),z:2.6});
  [-.5,.5].forEach(x=>add(g,bx(.4,.06,.4),M(0x15171c),'hubic',{p:V3(x,.4,0),d:V3(0,.8,0),z:1.6,l:'(L1)'}));
}

/* 9. Сервер */
{
  const g=gServer,Y=.95;plat(g,3.7);
  const st=MT(0xa9b3be,{roughness:.45});
  add(g,bx(4.4,.05,3),st,'scase',{p:V3(0,Y-.32,0),d:V3(0,-.4,0),z:4});
  add(g,bx(4.4,.04,3),MT(0xc2cad3,{roughness:.4}),'scase',{p:V3(0,Y+.33,0),d:V3(0,1.6,0),z:4});
  add(g,bx(4.4,.66,.05),M(0xffffff,{map:perfT,metalness:.6,roughness:.5}),'sbez',{p:V3(0,Y,1.5),d:V3(0,0,1.5),z:3.5});
  for(let r=0;r<2;r++)for(let c=0;c<4;c++){
    const x=-1.6+c*.75,y=Y+(r?-.15:.15),n=r*4+c+1;
    add(g,bx(.68,.27,.06),M(0x0b0e13,{metalness:.7,roughness:.4}),'bay',{p:V3(x,y,1.55),d:V3(0,0,1.8),z:2,l:'№'+n});
    led(g,x+.27,y-.05,1.585,0x22ff88,0,0,1.8);
  }
  add(g,bx(4,.03,2.6),M(0x0b6b3a,{roughness:.55}),'mb',{p:V3(0,Y-.27,-.1),d:V3(0,.45,0),z:3.2});
  [-.8,.8].forEach(x=>{add(g,bx(.6,.05,.6),M(0x15171c),'cpu',{p:V3(x,Y-.25,0),d:V3(0,.9,0),z:2});heat(g,'cpu',x,Y-.22,0,.72,.9)});
  [-1.5,-.5,.5,1.5].forEach(x=>fan(g,x,Y-.02,.88,.24,0,1,0));
}

/* ================= СЦЕНА ПК — ПК (OSI, ХАБ VS СВИТЧ) ================= */
function pcModel(x,s,id){
  const g=new THREE.Group();g.position.set(x,-2.3,0);
  const b=(w,h,d,c,px,py,pz,o)=>{const m=new THREE.Mesh(bx(w,h,d),M(c,o));m.position.set(px,py,pz);g.add(m);return m};
  b(1.8,.1,1.2,0x1c2636,0,.05,0);b(.2,.5,.2,0x1c2636,0,.35,-.3);
  b(2.2,1.4,.12,0x0d1420,0,1.2,-.3);
  b(2,1.2,.04,0x0a2a3a,0,1.2,-.23,{emissive:0x00e5ff,emissiveIntensity:.55});
  b(1.4,.05,.45,0x222c3d,0,.12,.3);
  b(.6,1.3,1,0x151c2a,s*1.45,.65,0,{metalness:.6});
  b(.1,.1,.1,0x00ff66,s*1.45-s*.1,.5,.52,{emissive:0x00ff66,emissiveIntensity:1});
  gNet.add(g);
}
pcModel(-5,1,'A');pcModel(5,-1,'B');

/* Центральное сетевое устройство (Свитч / Хаб) */
const netDevice=new THREE.Mesh(bx(1.6,.4,1),MT(0x2a3545,{roughness:.4}));
netDevice.position.set(0,-2.1,2);gNet.add(netDevice);
const netDevLed=new THREE.Mesh(bx(.1,.08,.05),M(0x22ff88,{emissive:0x22ff88,emissiveIntensity:1}));
netDevLed.position.set(0,-1.95,2.5);gNet.add(netDevLed);

const netCurve=new THREE.CatmullRomCurve3([V3(-3.55,-2,.52),V3(-2,-2.1,1.8),V3(0,-2.1,2),V3(2,-2.1,1.8),V3(3.55,-2,.52)]);
gNet.add(new THREE.Mesh(new THREE.TubeGeometry(netCurve,80,.055,10),M(0x2563eb,{roughness:.3,metalness:.3})));

const pulse=[...Array(6)].map((_,i)=>{
  const m=new THREE.Mesh(new THREE.SphereGeometry(.14-i*.016,12,12),new THREE.MeshBasicMaterial({color:i?0x00e5ff:0xffffff,transparent:true,opacity:1-i*.14}));
  m.visible=false;gNet.add(m);return m;
});
const pulse2=[...Array(6)].map((_,i)=>{
  const m=new THREE.Mesh(new THREE.SphereGeometry(.14-i*.016,12,12),new THREE.MeshBasicMaterial({color:i?0xff3355:0xffaa00,transparent:true,opacity:1-i*.14}));
  m.visible=false;gNet.add(m);return m;
});
let fw=true;
const placePulse=(t,arr=pulse,isFw=fw)=>arr.forEach((m,i)=>{
  m.position.copy(netCurve.getPointAt(THREE.MathUtils.clamp(t-(isFw?1:-1)*i*.025,0,1)));
  m.visible=true;
});

/* Вспышка коллизии */
const sparkMesh=new THREE.Mesh(new THREE.SphereGeometry(.5,16,16),new THREE.MeshBasicMaterial({color:0xff2244,transparent:true,opacity:0}));
sparkMesh.position.set(0,-2.1,2);gNet.add(sparkMesh);

/* ================= ГЛОБУС И МАГИСТРАЛИ ================= */
const ll=(lat,lon,r)=>{
  const a=(90-lat)*Math.PI/180,b=(lon+180)*Math.PI/180;
  return V3(-r*Math.sin(a)*Math.cos(b),r*Math.cos(a),r*Math.sin(a)*Math.sin(b));
};
const LAND=[
  [[-168,66],[-140,70],[-95,72],[-65,60],[-55,48],[-72,41],[-81,31],[-80,25],[-97,26],[-97,18],[-87,15],[-78,8],[-85,10],[-105,20],[-118,31],[-124,40],[-125,49],[-140,60],[-165,60]],
  [[-78,8],[-60,10],[-50,0],[-35,-6],[-40,-22],[-48,-28],[-58,-38],[-66,-48],[-70,-54],[-74,-45],[-72,-30],[-70,-18],[-80,-5]],
  [[-10,36],[-9,43],[-2,44],[-4,48],[2,51],[8,54],[10,58],[5,62],[15,69],[30,71],[60,70],[100,77],[140,72],[180,68],[170,60],[160,55],[142,52],[135,43],[127,35],[121,30],[122,40],[117,39],[121,31],[110,20],[105,10],[100,13],[103,1],[98,8],[93,19],[88,22],[80,15],[77,8],[72,20],[67,24],[57,25],[56,26],[50,30],[43,13],[34,28],[35,36],[27,37],[22,36],[18,40],[12,44],[3,43],[-5,36]],
  [[-17,21],[-10,32],[10,37],[32,31],[35,28],[43,12],[51,12],[40,-3],[40,-15],[35,-25],[27,-34],[18,-34],[12,-18],[9,-1],[8,4],[-8,4],[-17,14]],
  [[114,-22],[122,-18],[131,-12],[142,-11],[153,-26],[150,-37],[140,-38],[130,-32],[115,-34]],
  [[-55,60],[-45,60],[-20,70],[-20,82],[-60,82],[-70,76]],
  [[130,32],[135,34],[141,36],[142,44],[140,41],[135,36]],
  [[-5,50],[1,51],[-3,56],[-5,58],[-6,55]],
  [[95,5],[105,-6],[115,-8],[120,-9],[106,-3]],
  [[-180,-72],[180,-72],[180,-90],[-180,-90]]
];
const earthT=tex(2048,1024,(x,w,h)=>{
  const g=x.createLinearGradient(0,0,0,h);
  g.addColorStop(0,'#0b2a4a');g.addColorStop(.5,'#0a3558');g.addColorStop(1,'#071a30');
  x.fillStyle=g;x.fillRect(0,0,w,h);
  x.strokeStyle='rgba(77,225,255,.14)';x.lineWidth=1;
  for(let i=0;i<=12;i++){x.beginPath();x.moveTo(i*w/12,0);x.lineTo(i*w/12,h);x.stroke()}
  for(let i=0;i<=6;i++){x.beginPath();x.moveTo(0,i*h/6);x.lineTo(w,i*h/6);x.stroke()}
  x.fillStyle='#17707a';x.strokeStyle='#5ee7ff';x.lineWidth=2.5;
  LAND.forEach(p=>{
    x.beginPath();
    p.forEach(([lo,la],i)=>{
      const X=(lo+180)/360*w,Y=(90-la)/180*h;
      i?x.lineTo(X,Y):x.moveTo(X,Y);
    });
    x.closePath();x.fill();x.stroke();
  });
});
const earth=new THREE.Mesh(new THREE.SphereGeometry(3,64,48),new THREE.MeshStandardMaterial({map:earthT,roughness:.8,metalness:.05,emissive:0x0a2a44,emissiveIntensity:.45}));
gWorld.add(earth);
gWorld.add(new THREE.Mesh(new THREE.SphereGeometry(3.14,48,32),new THREE.MeshBasicMaterial({color:0x2db8ff,transparent:true,opacity:.13,side:THREE.BackSide})));

const CI={
  vb:['Вирджиния-Бич (США)',36.8,-76],
  bi:['Бильбао (Испания)',43.3,-2.9],
  bd:['Бандон (Орегон, США)',43.1,-124.4],
  ck:['Тикура (Япония)',35,140],
  li:['Лиссабон (Португалия)',38.7,-9.1],
  ct:['Кейптаун (ЮАР)',-33.9,18.4],
  bo:['Бока-Ратон (Флорида, США)',26.4,-80.1],
  fo:['Форталеза (Бразилия)',-3.7,-38.5],
  ma:['Марсель (Франция)',43.3,5.4],
  mu:['Мумбаи (Индия)',19.1,72.9],
  sg:['Сингапур',1.3,103.8],
  sy:['Сидней (Австралия)',-33.9,151.2]
};
Object.values(CI).forEach(c=>add(gWorld,new THREE.SphereGeometry(.055,12,12),M(0xffb020,{emissive:0xffb020,emissiveIntensity:.9}),'city',{p:ll(c[1],c[2],3.03),l:c[0],z:3}));

const WC=[
  ['w1','vb','bi','#22d3ee'], // MAREA
  ['w2','bd','ck','#f472b6'], // FASTER
  ['w3','li','ct','#facc15'], // Equiano
  ['w4','bo','fo','#a3e635'], // Monet
  ['w5','ma','mu','#fb923c'], // SEA-ME-WE 3
  ['w6','mu','sg','#fb923c'],
  ['w7','sg','sy','#c084fc']  // Indigo
];
const slerp=(A,B,t)=>{
  const w=A.angleTo(B),s=Math.sin(w);
  return A.clone().multiplyScalar(Math.sin((1-t)*w)/s).add(B.clone().multiplyScalar(Math.sin(t*w)/s));
};
gWorld.pu=[];gWorld.cv={};gWorld.cMeshes={};
WC.forEach((w,i)=>{
  const A=ll(CI[w[1]][1],CI[w[1]][2],1),B=ll(CI[w[2]][1],CI[w[2]][2],1),an=A.angleTo(B),pts=[];
  for(let k=0;k<=48;k++){
    const t=k/48;
    pts.push(slerp(A,B,t).setLength(3.04+Math.sin(Math.PI*t)*.16*an));
  }
  const curve=new THREE.CatmullRomCurve3(pts),col=new THREE.Color(w[3]);
  gWorld.cv[w[0]]=curve;
  const cMesh=add(gWorld,new THREE.TubeGeometry(curve,64,.022,6),M(col,{emissive:col,emissiveIntensity:.7}),w[0],{z:2.8});
  gWorld.cMeshes[w[0]]=cMesh;
  for(let k=0;k<2;k++){
    const m=new THREE.Mesh(new THREE.SphereGeometry(.045,8,8),new THREE.MeshBasicMaterial({color:0xffffff}));
    gWorld.add(m);
    gWorld.pu.push({m,c:curve,off:k*.5+i*.13,sp:.12+.02*(i%3),rev:k==1});
  }
});

const bigPacket=new THREE.Mesh(new THREE.SphereGeometry(.09,12,12),new THREE.MeshBasicMaterial({color:0xffffff}));
bigPacket.add(new THREE.Mesh(new THREE.SphereGeometry(.2,12,12),new THREE.MeshBasicMaterial({color:0x00e5ff,transparent:true,opacity:.4})));
bigPacket.visible=false;gWorld.add(bigPacket);

/* ================= УПРАВЛЕНИЕ РЕЖИМАМИ ================= */
let mode=0,obj=0;
const ANATOMY_GROUPS=[gCat6,gUTP,gS7,gCoax,gFiber,gSub,gRouter,gSwitch,gHub,gServer];
const cur=()=>mode===3?gWorld:ANATOMY_GROUPS[obj];

function view(){
  let p=[0,1.8,7.5],ty=0;
  if(mode===2){p=[0,3.5,12.5];ty=-1.2}
  else if(mode===3){p=[0,2,8.5];ty=0}
  else if(obj===6){p=[0,1.8,7.2];ty=.2}
  else if(obj===7){p=[0,1.9,7.5];ty=.4}
  else if(obj===8){p=[0,1.6,6.2];ty=.3}
  else if(obj===9){p=[0,2.4,9.2];ty=.95}
  gsap.to(cam.position,{x:p[0],y:p[1],z:p[2],duration:1.2,ease:'power2.inOut'});
  gsap.to(ctl.target,{x:0,y:ty,z:0,duration:1.2,ease:'power2.inOut'});
}

function closeCard(){gsap.to('#card',{x:'130%',duration:.35})}

function setMode(n){
  mode=n;setHov(null);closeCard();
  $$('.nav:not(#snd):not(#refb):not(#amb-btn):not(#cidr-btn)').forEach((b,i)=>b.classList.toggle('act',i===n));
  $$('.mod').forEach((s,i)=>s.classList.toggle('hid',i!==n));
  
  ANATOMY_GROUPS.forEach((g,i)=>g.visible=(n===0 && obj===i));
  gNet.visible=(n===2);
  gWorld.visible=(n===3);
  gr.visible=(n===0 || n===2);
  
  $('#c').style.visibility=(n===1 || n===4)?'hidden':'visible';
  view();
  if(n===1 && !ord.length) shuffle();
}
$$('.nav:not(#snd):not(#refb):not(#amb-btn):not(#cidr-btn)').forEach((b,i)=>b.onclick=()=>setMode(i));

$$('.ob').forEach(b=>{
  b.onclick=()=>{
    obj=+b.dataset.i;
    $$('.ob').forEach(x=>x.classList.toggle('act',x===b));
    $('#ex').value=0;explode(0);
    $('#section-info').classList.add('hid');
    setMode(0);
  };
});

function explode(e){
  $('#exv').textContent=Math.round(e*100);
  if(mode===0 && cur().pk) cur().pk.forEach(m=>m.position.copy(m.userData.base).addScaledVector(m.userData.dir,e));
}
$('#ex').oninput=e=>explode(e.target.value/100);
$('#exb').onclick=()=>{
  const o={v:+$('#ex').value},to=o.v<50?100:0;
  $('#exb').textContent=to?'Собрать':'Разобрать';
  gsap.to(o,{v:to,duration:1.4,ease:'power2.inOut',onUpdate:()=>{$('#ex').value=o.v;explode(o.v/100)}});
};
$('#rv').onclick=view;$('#cx').onclick=closeCard;

/* ================= 📐 ТОРЦЕВОЙ СРЕЗ (CROSS-SECTION) ================= */
const SEC_DATA=[
  '<b>Cat.6 F/UTP:</b> 4 витые пары 23 AWG (медь Ø 0,57 мм). Пластиковая крестовина (Spline) по центру разводит пары для подавления NEXT. Сплошной экран из Al-фольги + полиэтилен Ø 6,2 мм.',
  '<b>Cat.5e UTP:</b> 4 неэкранированные пары 24 AWG (медь Ø 0,51 мм). Шаг скрутки разный для каждой пары (15–22 мм). Внешняя оболочка PVC Ø 5,1 мм.',
  '<b>Cat.7 S/FTP:</b> Каждая пара индивидуально укутана в алюминиевую фольгу (PiMF), поверх — лужёная медная оплётка (80% покрытия). Полоса до 600 МГц, внешняя оболочка LSZH Ø 7,8 мм.',
  '<b>Коаксиал RG-6:</b> Центральная моножила Ø 1,02 мм (волновое $Z_0=75\\,\\Omega$). Вспененный диэлектрик FPE Ø 4,57 мм. Двойной экран: фольга + оплётка плотностью до 90%. Внешний PVC Ø 6,9 мм.',
  '<b>Оптоволокно FTTH (OS2):</b> Световодная сердцевина всего <b>Ø 9 мкм</b> (кварцевое стекло $n_1=1.468$). Оболочка Ø 125 мкм ($n_2=1.463$, условие полного отражения). Буфер 900 мкм, кевлар, LSZH 3,0 мм.',
  '<b>Подводный океанский кабель:</b> 12 пар волокон в гидрофобном геле внутри сварной медной трубки питания (10 000 В). Слой поликарбоната, сплошная Al-труба и 2 слоя стальных тросов брони.'
];

$('#btnSection').onclick=()=>{
  if(obj>5) return alert('Торцевой срез доступен для кабельных линий связи (0–5)!');
  gsap.to(cam.position,{x:4.2,y:0,z:0,duration:1.4,ease:'power2.inOut'});
  gsap.to(ctl.target,{x:0,y:0,z:0,duration:1.4});
  $('#section-desc').innerHTML=SEC_DATA[obj]||'';
  $('#section-info').classList.remove('hid');
  sfx.ping();
};
$('#close-sec').onclick=()=>$('#section-info').classList.add('hid');

let waveActive=true;
$('#btnWave').onclick=e=>{
  waveActive=!waveActive;
  e.currentTarget.textContent=`⚡ Сигнал: ${waveActive?'Вкл':'Выкл'}`;
};

/* ================= RAYCASTER ================= */
const rc=new THREE.Raycaster(),mp=new THREE.Vector2();
let hov=null,dx=0,dy=0;
const cast=e=>{
  if(mode!==0 && mode!==3) return null;
  mp.set((e.clientX/innerWidth)*2-1,-(e.clientY/innerHeight)*2+1);
  rc.setFromCamera(mp,cam);
  const targetGroup=mode===3?gWorld:cur();
  return rc.intersectObjects(targetGroup.pk,false)[0]||null;
};
const title=m=>{
  const I=INFO[m.userData.id];
  return (I?I[0]:'Деталь')+(m.userData.label?' '+m.userData.label:'');
};

function setHov(m){
  if(m===hov) return;
  if(hov && hov.material && hov.material.emissiveIntensity!==undefined){
    gsap.to(hov.material,{emissiveIntensity:hov.userData.eb,duration:.2});
  }
  hov=m;
  if(m && m.material && m.material.emissiveIntensity!==undefined){
    gsap.to(m.material,{emissiveIntensity:m.userData.eb+1.0,duration:.2});
  }
  $('#c').style.cursor=m?'pointer':'grab';
  if(!m)$('#tip').style.opacity=0;
}

R.domElement.addEventListener('pointermove',e=>{
  const h=cast(e);
  setHov(h?h.object:null);
  if(h){
    const t=$('#tip');
    t.textContent=title(h.object);
    t.style.left=e.clientX+'px';t.style.top=e.clientY+'px';
    t.style.opacity=1;
  }
});
R.domElement.addEventListener('pointerdown',e=>{dx=e.clientX;dy=e.clientY});
R.domElement.addEventListener('pointerup',e=>{
  if(Math.hypot(e.clientX-dx,e.clientY-dy)>5) return;
  const h=cast(e);if(!h) return;
  const m=h.object,I=INFO[m.userData.id];if(!I) return;
  sfx.ping();
  $('#ct').textContent=title(m);
  if(mode===3 || m.userData.id==='city' || m.userData.id.startsWith('w')){
    $('#cb').innerHTML=`<p><b>Тип:</b> ${I[1]}</p><p><b>Характеристики:</b> ${I[2]}</p><p><b>Маршрут / Роль:</b> ${I[3]}</p><p><b>Значение:</b> ${I[4]}</p>`;
  } else {
    $('#cb').innerHTML=`<p><b>Материал:</b> ${I[1]}</p><p><b>Свойства:</b> ${I[2]}</p><p><b>Назначение:</b> ${I[3]}</p><p><b>Защищает от:</b> ${I[4]}</p>`;
  }
  gsap.to('#card',{x:0,duration:.4,ease:'power3.out'});
});

/* ================= ИНТЕРАКТИВНЫЙ ОБЖИМ RJ-45 (T568B / T568A / CROSSOVER) ================= */
const STD_B=[
  ['Бело-оранжевый','#ff9a3c',1],['Оранжевый','#ff7a00'],
  ['Бело-зелёный','#2ecc71',1],['Синий','#1e66ff'],
  ['Бело-синий','#1e66ff',1],['Зелёный','#18a84a'],
  ['Бело-коричневый','#8b5a2b',1],['Коричневый','#6b3f1d']
];
const STD_A=[
  ['Бело-зелёный','#2ecc71',1],['Зелёный','#18a84a'],
  ['Бело-оранжевый','#ff9a3c',1],['Синий','#1e66ff'],
  ['Бело-синий','#1e66ff',1],['Оранжевый','#ff7a00'],
  ['Бело-коричневый','#8b5a2b',1],['Коричневый','#6b3f1d']
];

let activeStandard='T568B',currentEnd=1;
let plugA_ord=[],plugB_ord=[];
let ord=[],locked=false,sel=-1,drag=-1;

const curStdList=()=>activeStandard==='T568A'?STD_A:STD_B;
const wireStripe=c=>c[2]?`repeating-linear-gradient(180deg,#f8f8f8 0 9px,${c[1]} 9px 18px)`:c[1];

$('#tled').innerHTML='<i></i>'.repeat(8);

function updateHint(){
  const s=curStdList();
  $('#hint').innerHTML=s.map((c,i)=>`<div><b>${i+1}.</b> ${c[0]}</div>`).join('');
}
updateHint();

function drawLanes(){
  $('#lanes').innerHTML=ord.map((k,i)=>`
    <div class="lane" data-i="${i}">
      <span>${i+1}</span>
      <div class="wire${sel===i?' sel':''}" draggable="${!locked}" data-i="${i}" title="${STD_B[k][0]}" style="background:${wireStripe(STD_B[k])}"></div>
    </div>
  `).join('');
}

function swapWires(a,b){
  if(locked||a===b||a<0||b<0)return;
  [ord[a],ord[b]]=[ord[b],ord[a]];
  sel=-1;drawLanes();sfx.click();
}

function shuffle(){
  ord=STD_B.map((_,i)=>i).sort(()=>Math.random()-.5);
  locked=false;sel=-1;drawLanes();
  $('#conn').className='mx-auto';
  $$('#tled i').forEach(l=>l.className='');
  $('#speed-badge').innerHTML='';
  $('#tmsg').innerHTML='Расставьте проводники согласно выбранному стандарту и нажмите «Обжать коннектор».';
}

/* Переключатели стандартов */
$('#std-b').onclick=e=>{
  activeStandard='T568B';$('#end-sel').classList.add('hid');
  $$('.std-btn').forEach(b=>b.className='std-btn px-2.5 py-1 bg-slate-800 text-slate-300');
  e.currentTarget.className='std-btn px-2.5 py-1 bg-cyan-500/30 text-white font-medium';
  updateHint();shuffle();
};
$('#std-a').onclick=e=>{
  activeStandard='T568A';$('#end-sel').classList.add('hid');
  $$('.std-btn').forEach(b=>b.className='std-btn px-2.5 py-1 bg-slate-800 text-slate-300');
  e.currentTarget.className='std-btn px-2.5 py-1 bg-cyan-500/30 text-white font-medium';
  updateHint();shuffle();
};
$('#std-x').onclick=e=>{
  activeStandard='CROSS';$('#end-sel').classList.remove('hid');
  $$('.std-btn').forEach(b=>b.className='std-btn px-2.5 py-1 bg-slate-800 text-slate-300');
  e.currentTarget.className='std-btn px-2.5 py-1 bg-cyan-500/30 text-white font-medium';
  $('#crimp-inst').innerHTML='<b>Кроссовер-кабель:</b> Штекер 1 обжимается по <b>T568A</b>, а Штекер 2 — по <b>T568B</b>.';
  updateHint();shuffle();
};

const L=$('#lanes');
L.addEventListener('dragstart',e=>{const w=e.target.closest('.wire');if(!w||locked)return e.preventDefault();drag=+w.dataset.i;e.dataTransfer.setData('text/plain',drag)});
L.addEventListener('dragover',e=>e.preventDefault());
L.addEventListener('drop',e=>{e.preventDefault();const l=e.target.closest('.lane');if(l)swapWires(drag,+l.dataset.i);drag=-1});
L.addEventListener('click',e=>{
  const l=e.target.closest('.lane');if(!l||locked)return;
  const i=+l.dataset.i;
  if(sel<0){sel=i;drawLanes()}else if(sel===i){sel=-1;drawLanes()}else swapWires(sel,i);
});
$('#bsh').onclick=shuffle;
$('#bhi').onclick=()=>$('#hint').classList.toggle('hid');

/* Симуляция обрыва пар 4,5,7,8 (100 Мбит) */
$('#b100m').onclick=()=>{
  ord=activeStandard==='T568A' ? [2,5,0,7,6,1,4,3] : [0,1,2,7,6,5,4,3];
  drawLanes();
  $('#tmsg').innerHTML='Смоделирован дефект: пары 1,2 и 3,6 собраны верно, а пары 4,5 и 7,8 перепутаны/оборваны. Нажмите «Обжать коннектор»!';
  sfx.click();
};

/* Обжим и кабельный тестер */
$('#bcr').onclick=async()=>{
  if(locked)return;
  locked=true;sel=-1;drawLanes();
  await new Promise(r=>gsap.timeline({onComplete:r})
    .to('#crimper',{y:58,duration:.3,ease:'power3.in',onComplete:sfx.crimp})
    .to('#crimper',{y:0,duration:.4})
  );
  gsap.fromTo('#conn',{scale:.97},{scale:1,duration:.35,ease:'back.out(2)'});
  
  const leds=$$('#tled i'),sl=ms=>new Promise(r=>setTimeout(r,ms));
  $('#tmsg').textContent='Кабельный тестер Fluke сканирует пары проводников…';
  
  // Ожидаемый эталон
  let expTarget = activeStandard==='T568A' ? [2,5,0,3,4,1,6,7] : [0,1,2,3,4,5,6,7];
  let bad=[];

  for(let i=0;i<8;i++){
    leds[i].className='scan';tone(520+i*60,.08,'square',.05);
    await sl(260);
    const ok = (ord[i] === expTarget[i]);
    leds[i].className=ok?'ok':'bad';
    if(!ok) bad.push(i+1);
  }

  const p100_ok = (ord[0]===expTarget[0] && ord[1]===expTarget[1] && ord[2]===expTarget[2] && ord[5]===expTarget[5]);

  if(!bad.length){
    $('#conn').className='mx-auto done';sfx.ok();
    $('#speed-badge').innerHTML='<span class="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/50 text-xs font-bold">1000BASE-T (1 Гбит/с) FULL DUPLEX ✅</span>';
    $('#tmsg').innerHTML=`✅ <b>Идеально!</b> Все 8 жил соответствуют стандарту <b>${activeStandard}</b>. Линия сертифицирована на категорию Cat.6 (1 Гбит/с до 100 м).`;
    window.confetti&&confetti({particleCount:160,spread:80,origin:{y:.65}});
  } else if(p100_ok){
    $('#conn').className='mx-auto warn';sfx.ok();
    $('#speed-badge').innerHTML='<span class="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-500/50 text-xs font-bold">100BASE-TX (100 Мбит/с) HALF/FULL ⚠️</span>';
    $('#tmsg').innerHTML='⚠️ <b>Внимание:</b> Передающие пары 1,2 и 3,6 обжаты верно! Сеть <b>Fast Ethernet (100 Мбит/с)</b> будет работать, но <b>Gigabit (1000BASE-T)</b> не запустится, так как пары 4,5 и 7,8 повреждены.';
  } else {
    $('#conn').className='mx-auto';sfx.err();
    $('#speed-badge').innerHTML='<span class="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-500/50 text-xs font-bold">NO LINK / CABLE FAULT ❌</span>';
    $('#tmsg').innerHTML=`❌ Ошибка на пинах: <b>${bad.join(', ')}</b>. Неправильная распиновка или расщепленная пара (Split Pair). Переставьте проводники и обожмите заново.`;
    locked=false;drawLanes();
  }
};

/* ================= СИМУЛЯЦИЯ СЕТИ ПК-ПК (L1 ХАБ VS L2 СВИТЧ + КОЛЛИЗИИ) ================= */
let netBusy=false,isHubMode=false;
const sl=ms=>new Promise(r=>setTimeout(r,ms));

$('#mode-sw').onclick=()=>{
  isHubMode=false;
  $('#mode-sw').className='flex-1 py-1 bg-cyan-500/30 text-white font-medium';
  $('#mode-hub').className='flex-1 py-1 bg-slate-800 text-slate-300';
  $('#net-legend').innerHTML='ПК-A [192.168.1.10] ⟷ <b>Коммутатор 1G (Full Duplex)</b> ⟷ ПК-B [192.168.1.20]';
  netDevice.material.color.set(0x2a3545);
  sfx.click();
};

$('#mode-hub').onclick=()=>{
  isHubMode=true;
  $('#mode-hub').className='flex-1 py-1 bg-amber-500/30 text-white font-medium';
  $('#mode-sw').className='flex-1 py-1 bg-slate-800 text-slate-300';
  $('#net-legend').innerHTML='ПК-A [192.168.1.10] ⟷ <b>Концентратор L1 (Общий домен коллизий)</b> ⟷ ПК-B [192.168.1.20]';
  netDevice.material.color.set(0x4a3b2b);
  sfx.click();
};

/* Обычный Ping */
$('#bp').onclick=async()=>{
  if(netBusy) return;
  netBusy=true;
  const say=(h,l)=>{$('#stepTxt').innerHTML=h;$$('#osi li').forEach(li=>li.classList.toggle('on',l.includes(+li.dataset.l)));sfx.ping()};
  const fly=(a,b)=>new Promise(r=>{
    fw=b>a;const o={t:a};
    gsap.to(o,{t:b,duration:1.6,ease:'power1.inOut',onUpdate:()=>placePulse(o.t),onComplete:()=>{pulse.forEach(m=>m.visible=false);r()}});
  });
  
  say('<b>1. Прикладной / Сетевой уровень.</b> ПК-A формирует пакет ICMP Echo Request.',[7,4,3]);
  await sl(2600);
  say('<b>2. Кадр Ethernet (L2).</b> Сетевая карта упаковывает пакет в кадр с MAC-адресами ПК-A → ПК-B.',[2]);
  await sl(2400);
  say(isHubMode
    ? '<b>3. Физический уровень (Хаб).</b> Концентратор L1 слепо дублирует биты во все порты без анализа MAC!'
    : '<b>4. Коммутация L2 (Свитч).</b> Коммутатор сверяет MAC-таблицу в ASIC и пересылает кадр строго на порт ПК-B.',[1,2]);
  await fly(0,1);
  say('<b>5. Обработка получателем.</b> ПК-B проверяет контрольную сумму FCS и формирует ответ ICMP Echo Reply.',[2,3]);
  await sl(2400);
  await fly(1,0);
  say('<b>6. Успех!</b> RTT = 0.8 мс, TTL=64, потери 0%. Связь подтверждена! ✅',[]);
  sfx.ok();netBusy=false;
};

/* Симуляция коллизии CSMA/CD в Хабе */
$('#bcoll').onclick=async()=>{
  if(netBusy) return;
  netBusy=true;
  const say=h=>{$('#stepTxt').innerHTML=h};
  say('<b>Коллизия CSMA/CD:</b> ПК-A и ПК-B начали передачу одновременно навстречу друг другу!');
  
  const o1={t:0},o2={t:1};
  gsap.to(o1,{t:0.5,duration:1.1,ease:'power1.in',onUpdate:()=>placePulse(o1.t,pulse,true)});
  gsap.to(o2,{t:0.5,duration:1.1,ease:'power1.in',onUpdate:()=>placePulse(o2.t,pulse2,false)});
  await sl(1100);

  pulse.forEach(m=>m.visible=false);
  pulse2.forEach(m=>m.visible=false);

  if(isHubMode){
    // В хабе — коллизия!
    sfx.collision();
    sparkMesh.material.opacity=0.9;
    gsap.to(sparkMesh.material,{opacity:0,duration:0.6,ease:'power2.out'});
    netDevLed.material.color.set(0xff0033);
    say('💥 <b>КОЛЛИЗИЯ В ХАБЕ!</b> Электрические сигналы наложились друг на друга. Амплитуда превысила норму. Концентратор шлёт <b>Jam-сигнал (32 бита)</b>!');
    await sl(2800);
    say('⏳ <b>Алгоритм Backoff:</b> Устройства запускают таймер случайной паузы (Exponential Backoff) перед повторной попыткой.');
    await sl(2400);
    netDevLed.material.color.set(0x22ff88);
    say('Передача успешно повторена после отката коллизии.');
  } else {
    // В свитче — коллизий нет благодаря буферу!
    sfx.ok();
    say('🛡️ <b>Коммутатор предотвратил коллизию!</b> В отличие от хаба, коммутатор имеет буфер памяти в микросхеме ASIC и полнодуплексный режим (Full Duplex). Коллизии невозможны!');
  }
  netBusy=false;
};

/* Открытие инспектора PDU */
$('#bpdu').onclick=()=>$('#pdu-modal').classList.remove('hid');
$('#pdu-x').onclick=()=>$('#pdu-modal').classList.add('hid');

/* ================= TRACEROUTE И СИМУЛЯЦИЯ BGP РАЗРЫВА КАБЕЛЯ ================= */
const TRACE_ROUTES={
  us:{
    title:'США (Орегон — Google Cloud DC)',
    rtt:'98.4 ms',
    hops:[
      '1  192.168.1.1 (Home-Gateway) — 1.2 ms',
      '2  10.140.0.1 (ISP-Broadband-Node) — 4.8 ms',
      '3  195.208.112.1 (MSK-IX Peering) — 12.3 ms',
      '4  80.81.192.1 (DE-CIX Frankfurt) — 38.6 ms',
      '5  62.115.120.1 (Telia Carrier Transatlantic) — 78.4 ms',
      '6  Кабель MAREA (Вирджиния-Бич, Атлантика) — 86.2 ms',
      '7  142.250.180.1 (Google Edge Cache Oregon) — 98.4 ms'
    ],
    cam:[35,-40,8]
  },
  sg:{
    title:'Сингапур (Equinix SG1)',
    rtt:'114.2 ms',
    hops:[
      '1  192.168.1.1 (Home-Gateway) — 1.1 ms',
      '2  10.140.0.1 (ISP Core) — 3.9 ms',
      '3  213.248.80.1 (Frankfurt Transit) — 34.1 ms',
      '4  SEA-ME-WE 3 (Марсель — Суэц) — 65.4 ms',
      '5  Мумбаи CLS (Индийский океан) — 89.2 ms',
      '6  Сингапур IXP (Equinix SG1) — 114.2 ms'
    ],
    cam:[1.3,103.8,7.5]
  },
  au:{
    title:'Австралия (Сидней CLS)',
    rtt:'248.6 ms',
    hops:[
      '1  192.168.1.1 (Home-Gateway) — 1.2 ms',
      '2  Франкфурт DE-CIX — 36.8 ms',
      '3  Сингапур Узел — 118.4 ms',
      '4  Кабель Indigo (Перт, Индийский океан) — 188.1 ms',
      '5  Сидней Дата-центр — 248.6 ms'
    ],
    cam:[-33.9,151.2,7.5]
  },
  br:{
    title:'Бразилия (Форталеза)',
    rtt:'146.8 ms',
    hops:[
      '1  192.168.1.1 (Home-Gateway) — 1.1 ms',
      '2  Лондон LINX — 28.4 ms',
      '3  Майами NAP of the Americas — 98.2 ms',
      '4  Кабель Monet (Атлантика) — 132.5 ms',
      '5  Форталеза Дата-центр — 146.8 ms'
    ],
    cam:[-3.7,-38.5,7.8]
  }
};

$('#run-trace').onclick=()=>{
  const dest=$('#trace-dest').value,route=TRACE_ROUTES[dest];
  if(!route)return;
  $('#trace-rtt').textContent=`RTT: ${route.rtt}`;
  $('#trace-hops').innerHTML=route.hops.map(h=>`<div class="text-cyan-300/90">${h}</div>`).join('');
  const p=ll(route.cam[0],route.cam[1],route.cam[2]);
  gsap.to(cam.position,{x:p.x,y:p.y,z:p.z,duration:1.5,ease:'power2.inOut'});
  gsap.to(ctl.target,{x:0,y:0,z:0,duration:1.5});
  sfx.ping();
};

/* Авария трансатлантического кабеля MAREA и BGP */
let cableCut=false;
$('#cable-cut-btn').onclick=()=>{
  cableCut=!cableCut;
  const m=gWorld.cMeshes.w1;
  if(cableCut){
    m.material.color.set(0xff1133);m.material.emissive.set(0xff0022);
    $('#cable-cut-btn').textContent='🚢 Восстановить кабель';
    $('#cable-cut-btn').className='btn text-[11px] px-2 py-0.5 text-emerald-300 border-emerald-500/50';
    sfx.collision();
    alert('💥 ВНИМАНИЕ: Авария на кабеле MAREA (якорь судна повредил волокно в Бискайском заливе)!\n\nПротокол динамической маршрутизации BGP зафиксировал обрыв (BGP Keepalive Timeout). Автономные системы AS15169 и AS8075 перестраивают таблицы маршрутизации. Трафик пущен в обход через Великобританию и Южную Атлантику. Задержка (пинг) выросла с 68 мс до 210 мс!');
  } else {
    m.material.color.set(0x22d3ee);m.material.emissive.set(0x22d3ee);
    $('#cable-cut-btn').textContent='💥 Авария кабеля';
    $('#cable-cut-btn').className='btn text-[11px] px-2 py-0.5 text-rose-300 border-rose-500/50';
    sfx.ok();
    alert('🚢 Кабельное судно-ремонтник восстановило оптическую муфту на океанском дне. BGP конвергенция завершена: кратчайший трансатлантический маршрут восстановлен.');
  }
};

/* ================= ЭКСКУРСИЯ «КАК РАБОТАЕТ ИНТЕРНЕТ» ================= */
const ST=[
  ['1. Ваше устройство и NAT','Телефон или ноутбук формирует запрос и отправляет пакеты на <b>Wi-Fi роутер</b>. Роутер выполняет <b>NAT (Network Address Translation)</b>: заменяет локальный серый IP (например, 192.168.1.15) на публичный IP провайдера.',[35,-40,8]],
  ['2. Провайдер («последняя миля»)','Через витую пару, оптический кабель <b>GPON</b> или 4G/5G вышку сигнал поступает на узел связи провайдера (ISP). Там трафик тысяч пользователей агрегируется на мощных маршрутизаторах ядра.',[45,-15,7.5]],
  ['3. DNS — телефонная книга','Запрос идёт к <b>DNS-резолверу</b>. Если IP нет в кэше, он опрашивает корневые серверы (Root DNS), серверы зоны (.com, .ru) и авторитативный сервер владельца сайта.',[35,15,8]],
  ['4. Маршрутизация BGP и точки IXP','Интернет — это «сеть сетей» (> 100 000 автономных систем AS). Маршрутизаторы обмениваются путями по <b>BGP</b>. На точках <b>IXP</b> операторы передают терабиты данных напрямую.',[48,10,6.8]],
  ['5. Подводные кабели (95%+ трафика)','Основной межконтинентальный трафик течёт по оптоволокну на океанском дне: > 600 кабелей общей длиной 1,4 млн км. Каждые 60–100 км стоят усилители EDFA, запитанные током 10 000 В по медной трубке.',[38,-42,6.5]],
  ['6. Дата-центр и CDN-кэш','Кабель выходит на береговой станции (CLS) и уходит в ЦОД — залы со стойками 19″, где тысячи серверов круглосуточно обрабатывают запросы. Сервисы <b>CDN</b> кэшируют контент близко к пользователю.',[37,-76,6.2]],
  ['7. Ответ: TCP, TLS и доставка','Сервер выполняет трёхстороннее рукопожатие <b>TCP SYN-ACK</b>, согласует шифрование <b>TLS 1.3 (HTTPS)</b> и отправляет ответ сотнями пакетов.',[32,-20,8]]
];

const flyTo=(lat,lon,d=7.5)=>{
  const p=ll(lat,lon,d);
  gsap.to(cam.position,{x:p.x,y:p.y,z:p.z,duration:1.6,ease:'power2.inOut'});
  gsap.to(ctl.target,{x:0,y:0,z:0,duration:1.6});
};

$('#wst').innerHTML=ST.map((s,i)=>`<button class="btn tl" data-i="${i}">${s[0]}</button>`).join('');
$('#wtxt').innerHTML='Выберите этап пути запроса слева — от клика мышью на ноутбуке до океанского кабеля и дата-центра.';
$('#wst').onclick=e=>{
  const b=e.target.closest('button');if(!b)return;
  const i=+b.dataset.i,s=ST[i];ctl.autoRotate=false;
  $$('#wst button').forEach((x,k)=>x.classList.toggle('act',k===i));
  $('#wtxt').innerHTML=s[1];
  flyTo(...s[2]);
  if(i===4){
    const o={t:0},c=gWorld.cv.w1;
    setTimeout(()=>{
      bigPacket.visible=true;
      gsap.to(o,{t:1,duration:3.2,ease:'power1.inOut',onUpdate:()=>bigPacket.position.copy(c.getPointAt(o.t)),onComplete:()=>{bigPacket.visible=false;sfx.ok()}});
    },1600);
  }
};

/* ================= 🧮 КАЛЬКУЛЯТОР ПОДСЕТЕЙ IPV4 / CIDR ================= */
function ip2int(ip){return ip.split('.').reduce((acc,oct)=>(acc<<8)+parseInt(oct,10),0)>>>0}
function int2ip(int){return [(int>>>24)&255,(int>>>16)&255,(int>>>8)&255,int&255].join('.')}

function updateCidr(){
  const ipStr=$('#c-ip').value.trim()||'192.168.1.1';
  const prefix=parseInt($('#c-prefix').value,10);
  $('#c-prefix-val').textContent=`/${prefix}`;
  
  const ip=ip2int(ipStr);
  const mask = prefix===0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const wild = (~mask) >>> 0;
  const net = (ip & mask) >>> 0;
  const bcast = (net | wild) >>> 0;
  
  let hostsCount=0,rangeStr='—';
  if(prefix===32){hostsCount=1;rangeStr=int2ip(net)}
  else if(prefix===31){hostsCount=2;rangeStr=`${int2ip(net)} – ${int2ip(bcast)} (RFC 3021 Point-to-Point)`}
  else {
    hostsCount=Math.pow(2,32-prefix)-2;
    rangeStr=`${int2ip(net+1)} – ${int2ip(bcast-1)}`;
  }

  $('#res-mask').textContent=int2ip(mask);
  $('#res-wild').textContent=int2ip(wild);
  $('#res-net').textContent=int2ip(net);
  $('#res-bcast').textContent=int2ip(bcast);
  $('#res-range').textContent=rangeStr;
  $('#res-hosts').textContent=hostsCount.toLocaleString('ru-RU');

  // Отрисовка 32 бит
  let bitsHtml='';
  for(let i=0;i<32;i++){
    const isNet = i < prefix;
    bitsHtml+=`<span class="bit-box ${isNet?'bit-net':'bit-host'}">${isNet?'1':'0'}</span>`;
    if(i%8===7 && i!==31) bitsHtml+='<span class="text-slate-500 mx-0.5">•</span>';
  }
  $('#bit-grid').innerHTML=bitsHtml;
}

$('#c-ip').oninput=updateCidr;
$('#c-prefix').oninput=updateCidr;
$('#cidr-btn').onclick=()=>{updateCidr();$('#cidr-modal').classList.remove('hid')};
$('#cidr-x').onclick=()=>$('#cidr-modal').classList.add('hid');

/* ================= ТЕСТ И СЕРТИФИКАТ ================= */
const Q=[
  ['Сколько медных жил содержит стандартный кабель витой пары Cat.6?',['4 жилы','6 жил','8 жил','12 жил'],2,'В кабеле 4 пары, то есть ровно 8 медных проводников.'],
  ['Почему жилы в витой паре скручиваются с разным шагом скрутки?',['Для гибкости кабеля','Для подавления перекрёстных наводок (NEXT)','Для увеличения емкости','Для удобства монтажа'],1,'Разный шаг скрутки исключает синфазное электромагнитное взаимовлияние соседних пар.'],
  ['С какого цвета начинается стандарт T568B?',['Бело-зелёный','Бело-оранжевый','Синий','Коричневый'],1,'Стандарт T568B начинается с пары 1: Бело-оранжевый, 2: Оранжевый.'],
  ['Будет ли работать 100 Мбит/с Fast Ethernet при обрыве синей и коричневой пар (пины 4,5,7,8)?',['Нет, линк упадет полностью','Да, так как Fast Ethernet задействует только пины 1,2,3,6','Будет работать только на отправку','Сгорит порт свитча'],1,'Стандарту 100BASE-TX требуются только две пары: 1,2 (Tx) и 3,6 (Rx). Оставшиеся 4 жилы нужны только для гигабита (1000BASE-T).'],
  ['Чем принципиально коммутатор (L2) отличается от концентратора (Хаба, L1)?',['Хаб быстрее','Коммутатор пересылает кадр строго адресату по MAC-таблице и исключает коллизии','Коммутатор работает только с оптикой','Ничем'],1,'Коммутатор помнит MAC-адреса и изолирует домены коллизий на каждом порту.'],
  ['Зачем в трансокеанском оптическом кабеле медная трубка?',['Защита от акул','Для телефонных звонков','Для подачи электропитания постоянного тока (до 10 кВ) на лазерные усилители EDFA','Для заземления'],2,'Свет затухает через каждые 60–100 км, поэтому на дне стоят ретрансляторы EDFA, требующие питания со станции CLS.'],
  ['Что происходит при коллизии в полудуплексном сегменте Ethernet (CSMA/CD)?',['Устройство отправляет Jam-сигнал 32 бита и ждет случайную паузу Backoff','Компьютер перезагружается','Кабель выходит из строя','Сеть отключается на 1 час'],0,'Метод CSMA/CD генерирует Jam-последовательность для очистки линии и вычисляет случайную экспоненциальную паузу.'],
  ['Сколько полезных IP-адресов для компьютеров предоставляет подсеть /26?',['64 адреса','62 адреса','30 адресов','128 адресов'],1,'$2^{(32-26)} - 2 = 64 - 2 = 62$ хоста (минус адрес сети и broadcast).']
];
let qi=0,sc=0,ans=false,uname='';
const show=(id,v)=>$(id).classList.toggle('hid',!v);

function showQ(){
  const q=Q[qi];ans=false;
  $('#qn').textContent=`Вопрос ${qi+1} из ${Q.length}`;
  $('#qsc').textContent=sc;
  $('#qt').textContent=q[0];
  $('#qbar').style.width=qi/Q.length*100+'%';
  $('#qo').innerHTML=q[1].map((t,i)=>`<button class="opt" data-i="${i}">${t}</button>`).join('');
  $('#qe').textContent='';show('#qnext',false);
}
$('#qgo').onclick=()=>{
  uname=$('#uname').value.trim()||'Сетевой инженер';
  qi=sc=0;show('#qs',false);show('#qc',false);show('#qa',true);showQ();
};
$('#qo').onclick=e=>{
  const b=e.target.closest('.opt');if(!b||ans)return;
  ans=true;const i=+b.dataset.i,q=Q[qi],ok=(i===q[2]);
  $$('.opt')[q[2]].classList.add('ok');if(!ok)b.classList.add('bad');
  if(ok)sc++;
  ok?sfx.ok():sfx.err();
  $('#qsc').textContent=sc;
  $('#qe').innerHTML=(ok?'✅ <b>Верно!</b> ':'❌ <b>Ошибка.</b> ')+q[3];
  $('#qnext').textContent=qi<Q.length-1?'Следующий вопрос':'Посмотреть результат';
  show('#qnext',true);
};
$('#qnext').onclick=()=>{
  if(++qi<Q.length) return showQ();
  show('#qa',false);show('#qc',true);
  const p=Math.round(sc/Q.length*100);
  $('#cn').textContent=uname;
  $('#cs').textContent=`${sc} из ${Q.length} (${p}%)`;
  $('#cd').textContent='Дата аттестации: '+new Date().toLocaleDateString('ru-RU');
  $('#cg').textContent=p>=85?'Квалификация: Эксперт сетевой инфраструктуры!' : p>=60?'Квалификация: Специалист по сетям передачи данных.' : 'Рекомендуется повторить курс и пройти тест заново.';
  if(p>=60){sfx.ok();window.confetti&&confetti({particleCount:220,spread:90,origin:{y:.6}})};
};
$('#cpr').onclick=()=>window.print();
$('#cre').onclick=()=>{show('#qc',false);show('#qs',true)};

/* ================= СПРАВОЧНИК ================= */
const tbl=(h,rows)=>`<table><tr>${h.map(x=>`<th>${x}</th>`).join('')}</tr>${rows.map(r=>`<tr>${r.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</table>`;
$('#refc').innerHTML=`
  <h3>Сравнительный анализ кабелей связи</h3>
  ${tbl(['Тип кабеля','Скорость','Полоса частот','Дальность','Экранирование','Сфера применения'],[
    ['Cat.5e UTP','1 Гбит/с','100 МГц','100 м','Без экрана','Домашние сети, офисы'],
    ['Cat.6 F/UTP','1 Гбит/с (10G до 55 м)','250 МГц','100 м','Общая фольга','Офисные СКС, IP-камеры'],
    ['Cat.7 S/FTP','10 Гбит/с','600 МГц','100 м','Оплетка + фольга пар','ЦОД, серверные стойки'],
    ['Коаксиал RG-6','до сотен Мбит/с','до 3 ГГц','зависит от частоты','Оплетка + фольга','Кабельное ТВ, DOCSIS-модемы'],
    ['Оптоволокно (OS2)','10–400 Гбит/с','свет 1310/1550 нм','10–80 км без повторителя','Диэлектрик','Магистрали, FTTH / GPON в дом'],
    ['Подводный кабель','сотни Тбит/с (DWDM)','свет 1550 нм','тысячи км с EDFA','Стальная броня + Cu труба','Межконтинентальные артерии']
  ])}
  <h3>Архитектура L1, L2 и L3 оборудования</h3>
  ${tbl(['Критерий','Концентратор (Hub)','Коммутатор (Switch)','Маршрутизатор (Router)'],[
    ['Уровень OSI','1 — Физический','2 — Канальный (L3 у управляемых)','3 — Сетевой'],
    ['Единица данных','Биты','Кадры Ethernet (Frames)','IP-пакеты (Packets)'],
    ['Логика пересылки','Слепое дублирование во все порты','По таблице MAC-адресов','По IP-таблице и NAT'],
    ['Домены коллизий','Один общий домен','Каждый порт — отдельный домен','Изолирует широковещательные домены']
  ])}
`;
$('#refb').onclick=()=>$('#ref').classList.remove('hid');
$('#refx').onclick=()=>$('#ref').classList.add('hid');

/* ================= ЦИКЛ АНИМАЦИИ ================= */
const clock=new THREE.Clock();
function resize(){
  R.setSize(innerWidth,innerHeight);
  cam.aspect=innerWidth/innerHeight;
  cam.fov=cam.aspect<.9?72:50;
  cam.updateProjectionMatrix();
}
addEventListener('resize',resize);addEventListener('orientationchange',()=>setTimeout(resize,250));
resize();

(function animate(){
  requestAnimationFrame(animate);
  const t=clock.getElapsedTime();
  ctl.update();
  
  if(mode===0){
    if(obj===4 && waveActive){ // Оптоволокно
      ph.position.y=(t*2.2%6)-3;
      if(fiberCore!==hov) fiberCore.material.emissiveIntensity=1.1+.4*Math.sin(t*5);
    }
    if(obj===6){ // Роутер
      gRouter.pk.forEach(m=>{
        if(m.userData.id==='led' && m!==hov) m.material.emissiveIntensity=Math.sin(t*8+m.position.x*10)>0?1.2:.15;
      });
    }
    if(obj===7){ // Коммутатор
      gSwitch.pk.forEach(m=>{
        if(m.userData.id==='led' && m!==hov) m.material.emissiveIntensity=Math.sin(t*12+m.position.x*15)>0?1.2:.15;
        if(m.userData.fan) m.rotation.z=t*10;
      });
    }
    if(obj===9){ // Сервер
      gServer.pk.forEach(m=>{
        if(m.userData.id==='led' && m!==hov) m.material.emissiveIntensity=Math.sin(t*10+m.position.x*8)>0?1.3:.2;
        if(m.userData.fan) m.rotation.z=t*14;
      });
    }
  }
  
  if(mode===3){
    gWorld.pu.forEach(o=>{
      const u=(t*o.sp+o.off)%1;
      o.m.position.copy(o.c.getPointAt(o.rev?1-u:u));
    });
  }
  
  if(mode===0 || mode===2 || mode===3){
    R.render(S,cam);
  }
})();

/* Старт с 3D-Анатомии */

/* ================= МОДУЛЬ 5.2: СИМУЛЯТОР OTDR ================= */
(()=>{
  const cv=$('#otdr-cv'),cx=cv.getContext('2d');
  const hs=n=>{const s=Math.sin(n*127.1)*43758.5453;return s-Math.floor(s)};
  function draw(){
    const L=+$('#o-len').value,wl=+$('#o-wl').value,cut=$('#o-cut').checked,B=+$('#o-brk').value*L/100;
    $('#o-len-v').textContent=L+' км';$('#o-brk-v').textContent=B.toFixed(1)+' км';
    const a=wl===1310?.35:.20;
    let ev=[{k:0,t:'Коннектор (вход)',loss:.35,r:-45},{k:L/3,t:'Сварка',loss:.08,r:null},{k:2*L/3,t:'Коннектор (патч-панель)',loss:.4,r:-48}];
    ev.push(cut?{k:B,t:'ОБРЫВ ВОЛОКНА',loss:null,r:-20}:{k:L,t:'Конец линии (APC/UPC)',loss:0,r:-14});
    if(cut)ev=ev.filter(e=>e.k<=B);
    const end=ev[ev.length-1].k,xm=L*1.08,ml=46,mb=28,mt=10,mr=10,W=cv.width,H=cv.height,pw=W-ml-mr,ph=H-mt-mb,y0=6,y1=-34;
    const X=x=>ml+x/xm*pw,Y=d=>mt+(y0-d)/(y0-y1)*ph;
    cx.clearRect(0,0,W,H);cx.fillStyle='rgba(5,10,20,.85)';cx.fillRect(0,0,W,H);
    cx.font='11px system-ui';cx.lineWidth=1;
    for(let d=0;d>=-30;d-=10){cx.strokeStyle='rgba(125,211,252,.18)';cx.beginPath();cx.moveTo(ml,Y(d));cx.lineTo(W-mr,Y(d));cx.stroke();cx.fillStyle='#94a3b8';cx.fillText(d+' дБ',4,Y(d)+4)}
    const st=L>30?10:5;
    for(let k=0;k<=xm;k+=st){cx.strokeStyle='rgba(125,211,252,.12)';cx.beginPath();cx.moveTo(X(k),mt);cx.lineTo(X(k),H-mb);cx.stroke();cx.fillStyle='#94a3b8';cx.fillText(k+' км',X(k)-12,H-10)}
    const w=L*.006+.15,N=480;cx.strokeStyle='#22d3ee';cx.lineWidth=1.6;cx.beginPath();
    for(let i=0;i<=N;i++){
      const x=i/N*xm;let d;
      if(x>end+w){d=-31+(hs(i)-.5)*1.6}
      else{
        d=-a*Math.min(x,end);
        ev.forEach(e=>{if(e.loss&&x>e.k&&e.k>0)d-=e.loss;
          if(e.r!==null&&Math.abs(x-e.k)<w*4&&x>=e.k-w)d+=((60+e.r)/5)*Math.exp(-Math.pow((x-e.k)/w,2)*.7);
          if(e.k===0&&x<w*3)d-=.35});
        d+=(hs(i)-.5)*(.25+(-d)/22);
      }
      i?cx.lineTo(X(x),Y(d)):cx.moveTo(X(x),Y(d));
    }
    cx.stroke();
    let tl=0;ev.forEach(e=>{if(e.loss)tl+=e.loss});tl+=a*end;
    $('#otdr-ev').innerHTML='<table class="w-full text-xs border-collapse">'+
      '<tr class="text-cyan-300"><th class="text-left p-1">Событие</th><th class="text-left p-1">Позиция</th><th class="text-left p-1">Потери</th><th class="text-left p-1">Отражение</th></tr>'+
      ev.map(e=>`<tr class="border-t border-cyan-500/20"><td class="p-1">${e.t}</td><td class="p-1">${e.k.toFixed(2)} км</td><td class="p-1">${e.loss===null?'—':e.loss.toFixed(2)+' дБ'}</td><td class="p-1">${e.r===null?'нет (ступенька)':e.r+' дБ'}</td></tr>`).join('')+'</table>'+
      `<p class="mt-2 text-slate-300">Рэлеевское затухание: <b>${a} дБ/км</b> (${wl} нм). Суммарные потери линии до ${cut?'обрыва':'конца'}: <b>${tl.toFixed(2)} дБ</b>. `+
      (cut?`<span class="text-rose-400">Обрыв на ${B.toFixed(2)} км от OTDR — направить бригаду на трассу к этой отметке.</span>`:'<span class="text-emerald-300">Линия исправна: сварка даёт ступеньку без пика, коннекторы — френелевские всплески.</span>')+'</p>';
  }
  ['o-len','o-wl','o-cut','o-brk'].forEach(i=>$('#'+i).oninput=draw);
  $('#otdr-btn').onclick=()=>{draw();$('#otdr-modal').classList.remove('hid')};
  $('#otdr-x').onclick=()=>$('#otdr-modal').classList.add('hid');
})();

/* ================= МОДУЛЬ 6.1: ТИКЕТЫ «ИНЖЕНЕР НА СМЕНЕ» ================= */
(()=>{
  const T=[
    {t:'Тикет 1',h:'Абонент жалуется: интернет работает только на 100 Мбит/с вместо гигабита.',
     ev:'Fluke: пары 1-2 и 3-6 — OK. Пара 4-5 — обрыв на 3.2 м. Пара 7-8 — обрыв на 3.2 м. Линк: 100BASE-TX.',
     o:['Заменить сетевую карту ПК','Переобжать RJ-45: жилы 4,5,7,8 не контактируют с ножами (обрыв у разъёма)','Сменить DNS-сервер','Сократить кабель: длина больше 100 м'],a:1,
     e:'1000BASE-T использует все 4 пары. Fast Ethernet задействует только 1,2 и 3,6, поэтому при обрыве 4,5,7,8 порты договариваются на 100 Мбит/с. Дефект на 3.2 м — это плохая опрессовка штекера.'},
    {t:'Тикет 2',h:'Сетевой принтер недоступен с ПК бухгалтерии.',
     ev:'ПК: 192.168.1.200/24, шлюз 192.168.1.1. Принтер: 192.168.1.20, маска 255.255.255.128 (/25). Ping с ПК теряется на 100%.',
     o:['Заменить патч-корд принтера','Выставить на принтере маску /24 (255.255.255.0)','Перезагрузить коммутатор','Включить на ПК IPv6'],a:1,
     e:'Для принтера /25 — это сеть 192.168.1.0–127. Адрес .200 для него «чужой», ответ уходит на шлюз вместо прямого ARP, и обмен ломается. Маски должны совпадать: /24.'},
    {t:'Тикет 3',h:'Вся сеть офиса «встала»: светодиоды коммутаторов горят сплошным, загрузка CPU 99%.',
     ev:'Два SW соединены двумя патч-кордами (SW1:Gi0/23↔SW2:Gi0/23 и Gi0/24↔Gi0/24). spanning-tree отключён. MAC-таблица: адреса «прыгают» между портами. Broadcast > 400 000 pps.',
     o:['Добавить ещё один аплинк для скорости','Включить RSTP (spanning-tree mode rapid-pvst) и BPDU Guard на access-портах','Увеличить TTL на маршрутизаторе','Заменить блок питания SW1'],a:1,
     e:'Без STP кольцо L2 порождает петлю: широковещательные кадры бесконечно ходят по кругу (нет TTL в Ethernet) — это шторм. RSTP блокирует избыточный порт, BPDU Guard защищает от случайных петель.'}
  ];
  const solved=new Set();let cur=0;
  function tabs(){$('#tk-tabs').innerHTML=T.map((x,i)=>`<button class="nav ${i===cur?'act':''}" data-i="${i}">${solved.has(i)?'✅ ':''}${x.t}</button>`).join('');
    $$('#tk-tabs .nav').forEach(b=>b.onclick=()=>{cur=+b.dataset.i;render()});$('#tk-sc').textContent=solved.size}
  function render(){
    tabs();const x=T[cur];
    $('#tk-body').innerHTML=`<p class="mb-2 text-base text-slate-100">${x.h}</p><pre class="whitespace-pre-wrap text-xs p-2 mb-3 rounded bg-black/40 text-emerald-300 border border-emerald-500/30">${x.ev}</pre>`+
      '<div class="flex flex-col gap-2">'+x.o.map((s,i)=>`<button class="opt" data-i="${i}">${s}</button>`).join('')+'</div><div id="tk-fb" class="mt-3 text-sm"></div>';
    if(solved.has(cur)){const o=$$('#tk-body .opt')[x.a];o.classList.add('ok');$('#tk-fb').innerHTML='<b class="text-emerald-300">Решено.</b> '+x.e}
    $$('#tk-body .opt').forEach(b=>b.onclick=()=>{
      if(+b.dataset.i===x.a){b.classList.add('ok');sfx.ok();solved.add(cur);$('#tk-fb').innerHTML='<b class="text-emerald-300">Верно.</b> '+x.e;tabs();
        if(solved.size===T.length){$('#tk-fb').innerHTML+='<p class="mt-2 text-amber-300">Все тикеты закрыты — смена сдана!</p>';if(window.confetti)confetti({particleCount:160,spread:80,origin:{y:.6}})}}
      else{b.classList.add('bad');sfx.err();$('#tk-fb').innerHTML='<b class="text-rose-400">Не то.</b> Перечитайте вывод диагностики и попробуйте другой вариант.'}
    });
  }
  $('#tk-btn').onclick=()=>{render();$('#tk-modal').classList.remove('hid')};
  $('#tk-x').onclick=()=>$('#tk-modal').classList.add('hid');
})();


/* ================= МОБИЛЬНАЯ АДАПТАЦИЯ: сворачиваемые панели ================= */
(()=>{
  const mq=matchMedia('(max-width:768px),(max-height:520px)');
  $$('.mod>.p.absolute').forEach(p=>{
    const hd=document.createElement('button');
    hd.type='button';hd.className='sheet-h';hd.textContent='⚙ Панель управления';
    hd.setAttribute('aria-expanded','false');
    p.prepend(hd);p.classList.add('sheet','collapsed');
    hd.onclick=()=>{const c=p.classList.toggle('collapsed');hd.setAttribute('aria-expanded',String(!c))};
    p.addEventListener('click',e=>{
      if(mq.matches&&e.target.closest('.ob')){p.classList.add('collapsed');hd.setAttribute('aria-expanded','false')}
    });
  });
  $$('header.glass .nav').forEach(b=>b.addEventListener('click',()=>b.scrollIntoView({inline:'center',block:'nearest',behavior:'smooth'})));
})();

setMode(0);