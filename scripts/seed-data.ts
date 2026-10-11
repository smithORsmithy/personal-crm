// Generates realistic fake contacts in Russian for local testing.
// A seeded random generator makes every run produce the same data.

import type { NewContact } from "../src/db/schema";

type Gender = "m" | "f";
type Random = () => number;

export type SeedNote = { body: string; createdAt: Date };
export type SeedContact = { contact: NewContact; notes: SeedNote[] };

// mulberry32: tiny deterministic PRNG
function createRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: Random, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

function randomInt(random: Random, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

function chance(random: Random, probability: number): boolean {
  return random() < probability;
}

const maleFirstNames = [
  "Александр", "Алексей", "Андрей", "Антон", "Арсений", "Артём", "Борис",
  "Вадим", "Валерий", "Василий", "Виктор", "Виталий", "Владимир", "Владислав",
  "Вячеслав", "Георгий", "Глеб", "Григорий", "Даниил", "Денис", "Дмитрий",
  "Евгений", "Егор", "Иван", "Игорь", "Илья", "Кирилл", "Константин", "Лев",
  "Леонид", "Максим", "Марк", "Матвей", "Михаил", "Никита", "Николай", "Олег",
  "Павел", "Пётр", "Роман", "Руслан", "Семён", "Сергей", "Станислав", "Степан",
  "Тимофей", "Тимур", "Фёдор", "Юрий", "Ярослав",
] as const;

const femaleFirstNames = [
  "Александра", "Алёна", "Алина", "Алиса", "Анастасия", "Анна", "Антонина",
  "Валентина", "Валерия", "Варвара", "Вера", "Вероника", "Виктория", "Галина",
  "Дарья", "Диана", "Ева", "Евгения", "Екатерина", "Елена", "Елизавета",
  "Жанна", "Зоя", "Инна", "Ирина", "Карина", "Кира", "Ксения", "Лариса",
  "Лидия", "Любовь", "Людмила", "Маргарита", "Марина", "Мария", "Милана",
  "Надежда", "Наталья", "Нина", "Оксана", "Ольга", "Полина", "Светлана",
  "София", "Таисия", "Тамара", "Татьяна", "Ульяна", "Юлия", "Яна",
] as const;

// Masculine forms; feminine forms are derived by feminineLastName()
const lastNames = [
  "Иванов", "Смирнов", "Кузнецов", "Попов", "Васильев", "Петров", "Соколов",
  "Михайлов", "Новиков", "Фёдоров", "Морозов", "Волков", "Алексеев", "Лебедев",
  "Семёнов", "Егоров", "Павлов", "Козлов", "Степанов", "Николаев", "Орлов",
  "Андреев", "Макаров", "Никитин", "Захаров", "Зайцев", "Соловьёв", "Борисов",
  "Яковлев", "Григорьев", "Романов", "Воробьёв", "Сергеев", "Кузьмин", "Фролов",
  "Александров", "Дмитриев", "Королёв", "Гусев", "Киселёв", "Ильин", "Максимов",
  "Поляков", "Сорокин", "Виноградов", "Ковалёв", "Белов", "Медведев", "Антонов",
  "Тарасов", "Жуков", "Баранов", "Филиппов", "Комаров", "Давыдов", "Беляев",
  "Герасимов", "Богданов", "Осипов", "Сидоров", "Матвеев", "Титов", "Марков",
  "Миронов", "Крылов", "Куликов", "Карпов", "Власов", "Мельников", "Денисов",
  "Гаврилов", "Тихонов", "Казаков", "Афанасьев", "Данилов", "Савельев", "Тимофеев",
  "Фомин", "Чернов", "Абрамов", "Мартынов", "Ефимов", "Федотов", "Щербаков",
  "Назаров", "Калинин", "Исаев", "Чернышёв", "Быков", "Маслов", "Родионов",
  "Коновалов", "Лазарев", "Воронин", "Климов", "Филатов", "Пономарёв", "Голубев",
  "Кудрявцев", "Прохоров", "Наумов", "Потапов", "Журавлёв", "Овчинников",
  "Трофимов", "Леонов", "Соболев", "Ермаков", "Колесников", "Гончаров", "Емельянов",
  "Никифоров", "Грачёв", "Котов", "Гришин", "Ефремов", "Архипов", "Громов",
  "Кириллов", "Малышев", "Панов", "Моисеев", "Румянцев", "Акимов", "Кондратьев",
  "Бирюков", "Горбунов", "Анисимов", "Ерёмин", "Тихомиров", "Галкин", "Лукьянов",
  "Островский", "Вишневский", "Покровский", "Чайковский", "Троицкий", "Высоцкий",
  "Шевченко", "Коваленко", "Бондаренко", "Ткаченко", "Ким", "Черных", "Седых",
] as const;

function feminineLastName(lastName: string): string {
  if (/(ский|цкий)$/.test(lastName)) {
    return `${lastName.slice(0, -2)}ая`;
  }
  if (/(ов|ев|ёв|ин|ын)$/.test(lastName)) {
    return `${lastName}а`;
  }
  // Shevchenko, Kim, Chernykh and the like do not change
  return lastName;
}

const translitMap: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh",
  щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

function translit(value: string): string {
  return [...value.toLowerCase()]
    .map((char) => translitMap[char] ?? char)
    .join("")
    .replace(/[^a-z0-9]/g, "");
}

const personalDomains = [
  "gmail.com", "yandex.ru", "mail.ru", "ya.ru", "outlook.com", "icloud.com",
  "bk.ru", "proton.me", "inbox.ru", "rambler.ru",
] as const;

const workDomains = [
  "severstudio.ru", "bright-lab.io", "mostbank.ru", "kvadrat-agency.ru",
  "dataflow.tech", "uralmash-group.ru", "skillbox-school.ru", "logist.pro",
] as const;

const officeRoles = [
  "Продакт-менеджер", "Фронтенд-разработчик", "Бэкенд-разработчик",
  "Дизайнер интерфейсов", "Аналитик данных", "Тестировщик", "Маркетолог",
  "HR-менеджер", "Проджект-менеджер", "Руководитель отдела продаж",
  "Технический директор", "Юрист", "Бухгалтер", "Финансовый аналитик",
  "Менеджер по закупкам", "SMM-специалист", "Системный администратор",
] as const;

const officePlaces = [
  "в банке", "в IT-компании", "в стартапе", "в маркетплейсе",
  "в консалтинговой компании", "в логистической компании",
  "в рекламном агентстве", "в госкорпорации", "в телеком-компании",
  "в студии разработки", "в онлайн-школе", "в строительной компании",
] as const;

const standaloneAbout = [
  "Стоматолог, принимает в клинике на Соколе", "Семейный врач",
  "Психолог, ведёт частную практику", "Фотограф, снимает свадьбы",
  "Архитектор, проектирует загородные дома", "Риелтор, помогает со съёмом квартир",
  "Нотариус", "Ветеринар в клинике у дома", "Тренер по теннису", "Фитнес-тренер",
  "Преподаватель английского", "Репетитор по математике", "Звукорежиссёр",
  "Шеф-повар итальянского ресторана", "Бариста в кофейне у работы",
  "Флорист, держит цветочную лавку", "Журналист, пишет про технологии",
  "Редактор в издательстве", "Переводчик с немецкого",
  "Предприниматель, сеть пекарен", "Основатель стартапа про доставку",
  "Научный сотрудник, биолог", "Аспирант-физик", "Студент магистратуры",
  "Автомеханик, чинит мою машину", "Мастер по ремонту квартир",
  "Юрист по недвижимости", "Финансовый консультант",
  "Инженер-конструктор на заводе", "Пилот гражданской авиации", "Экскурсовод",
  "Музыкант, играет в джаз-бэнде", "Художник-иллюстратор",
  "Организатор мероприятий", "Учит детей программированию",
  "Ведёт подкаст о книгах", "Кондитер, печёт торты на заказ",
  "Блогер о путешествиях", "Владелец книжного магазина", "Дизайнер на фрилансе",
  "Инструктор по йоге", "Инструктор по горным лыжам", "Парикмахер",
  "Детский врач", "Капитан команды по мини-футболу", "Мастер маникюра",
] as const;

const relationAbout: readonly (readonly [string, string])[] = [
  ["Сосед по даче", "Соседка по даче"],
  ["Сосед по лестничной клетке", "Соседка по лестничной клетке"],
  ["Двоюродный брат", "Двоюродная сестра"],
  ["Однокурсник", "Однокурсница"],
  ["Одноклассник", "Одноклассница"],
  ["Бывший коллега", "Бывшая коллега"],
  ["Друг детства", "Подруга детства"],
  ["Бывший руководитель", "Бывшая руководительница"],
  ["Муж подруги", "Жена друга"],
  ["Знакомый по йоге", "Знакомая по йоге"],
  ["Друг брата", "Подруга сестры"],
];

const cities = [
  { in: "в Казани", to: "до Казани" },
  { in: "в Санкт-Петербурге", to: "до Санкт-Петербурга" },
  { in: "в Новосибирске", to: "до Новосибирска" },
  { in: "в Екатеринбурге", to: "до Екатеринбурга" },
  { in: "в Сочи", to: "до Сочи" },
  { in: "в Калининграде", to: "до Калининграда" },
  { in: "в Нижнем Новгороде", to: "до Нижнего Новгорода" },
  { in: "в Ереване", to: "до Еревана" },
  { in: "в Тбилиси", to: "до Тбилиси" },
  { in: "в Самаре", to: "до Самары" },
  { in: "во Владивостоке", to: "до Владивостока" },
  { in: "в Москве", to: "до Москвы" },
] as const;

const friends = [
  { name: "Лена", genitive: "Лены", gender: "f" },
  { name: "Саша", genitive: "Саши", gender: "m" },
  { name: "Дима", genitive: "Димы", gender: "m" },
  { name: "Катя", genitive: "Кати", gender: "f" },
  { name: "Миша", genitive: "Миши", gender: "m" },
  { name: "Оля", genitive: "Оли", gender: "f" },
  { name: "Серёжа", genitive: "Серёжи", gender: "m" },
  { name: "Настя", genitive: "Насти", gender: "f" },
  { name: "Паша", genitive: "Паши", gender: "m" },
  { name: "Юля", genitive: "Юли", gender: "f" },
] as const;

type Context = { random: Random; gender: Gender };

const howWeMetTemplates: readonly ((ctx: Context) => string)[] = [
  () => "Учились вместе в университете",
  ({ random }) => {
    const year = randomInt(random, 2010, 2021);
    return `Работали в одной команде в ${year}–${year + randomInt(random, 1, 3)} годах`;
  },
  ({ random }) =>
    `Познакомились на конференции ${pick(random, cities).in} в ${randomInt(random, 2015, 2025)} году`,
  ({ random }) =>
    `Через общих друзей, на дне рождения у ${pick(random, friends).genitive}`,
  () => "Соседи по подъезду",
  () => "Вместе ходили на курсы английского",
  () => "Познакомились в походе по Алтаю",
  () => "Наши родители дружат с детства",
  () => "Учились в одной школе",
  () => "Соседние участки на даче",
  ({ random }) => `Сидели рядом в самолёте ${pick(random, cities).to}`,
  () => "Играем вместе в футбол по субботам",
  () => "Ходим в один спортзал",
  ({ random }) => {
    const friend = pick(random, friends);
    const verb = friend.gender === "m" ? "Познакомил" : "Познакомила";
    return `${verb} нас ${friend.name} на своей свадьбе`;
  },
  () => "Были в одной команде на хакатоне",
  ({ random }) => `Встретились на митапе ${pick(random, cities).in}`,
  ({ random }) => `Ехали в одном купе ${pick(random, cities).to}`,
  ({ random }) => `По рекомендации ${pick(random, friends).genitive}`,
  () => "Вместе волонтёрили на городском марафоне",
  () => "Разговорились в очереди в визовый центр",
  () => "Были в одной группе на курсах фотографии",
  ({ random }) =>
    `Делали совместный проект в ${randomInt(random, 2016, 2025)} году`,
  () => "Снимали вместе квартиру в студенчестве",
  () => "Были попутчиками в поездке по Грузии",
  () => "Сидим рядом в коворкинге",
  () => "Познакомились в чате жильцов дома",
  () => "Играли в одной команде в «Что? Где? Когда?»",
  () => "Наши дети ходят в одну школу",
  () => "Познакомились в бассейне",
  ({ gender }) =>
    gender === "m"
      ? "Пришёл к нам в отдел стажёром"
      : "Пришла к нам в отдел стажёром",
];

const monthsIn = [
  "январе", "феврале", "марте", "апреле", "мае", "июне", "июле", "августе",
  "сентябре", "октябре", "ноябре", "декабре",
] as const;

const monthsGenitive = [
  "января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа",
  "сентября", "октября", "ноября", "декабря",
] as const;

const specialists = [
  "стоматолога", "юриста", "автомеханика", "репетитора по английскому",
  "риелтора", "бухгалтера", "массажиста", "мастера по ремонту",
] as const;

const books = [
  "Мастер и Маргарита", "Sapiens", "Думай медленно… решай быстро",
  "Война и мир", "Чистый код", "Пиши, сокращай", "Шантарам", "Цветы для Элджернона",
] as const;

const trips = [
  "в Грузию", "на Алтай", "в Калининград", "на Байкал", "в Карелию",
  "в Армению", "на Камчатку", "в Узбекистан",
] as const;

const pronouns = {
  m: { He: "Он", he: "он", him: "ему", his: "его" },
  f: { He: "Она", he: "она", him: "ей", his: "её" },
} as const;

// Past-tense verb in the contact's gender: "обещал" / "обещала"
function past(gender: Gender, masculine: string, feminine: string): string {
  return gender === "m" ? masculine : feminine;
}

const noteTemplates: readonly ((ctx: Context) => string)[] = [
  ({ random }) =>
    `Созвонились. Договорились встретиться на кофе в ${pick(random, monthsIn)}.`,
  ({ random, gender }) =>
    `${pronouns[gender].He} ${past(gender, "обещал", "обещала")} прислать контакты хорошего ${pick(random, specialists)}.`,
  ({ random }) =>
    `Не забыть поздравить с днём рождения ${randomInt(random, 1, 28)} ${pick(random, monthsGenitive)}.`,
  ({ gender }) =>
    `${pronouns[gender].He} ищет работу в продуктовой команде — спросить знакомых, есть ли вакансии.`,
  ({ random, gender }) =>
    `Обсудили отпуск: ${pronouns[gender].he} собирается ${pick(random, trips)}. Попросить потом рекомендации, куда сходить.`,
  ({ random }) =>
    `Договорились вернуть книгу «${pick(random, books)}» до конца месяца.`,
  ({ gender }) =>
    `${pronouns[gender].He} ${past(gender, "переехал", "переехала")} в новую квартиру. Подарок на новоселье — за мной.`,
  ({ random }) =>
    `Встретились на выставке. Договорились созвониться в ${pick(random, monthsIn)} насчёт совместного проекта.`,
  ({ gender }) =>
    `Отправить ${pronouns[gender].him} презентацию с прошлой встречи.`,
  ({ gender }) =>
    `Договорились: я помогаю с резюме, ${pronouns[gender].he} — с переводом документов.`,
  ({ gender }) =>
    `${pronouns[gender].He} ${past(gender, "сменил", "сменила")} работу — расспросить при встрече, как на новом месте.`,
  ({ random }) =>
    `Обсудили идею совместного подкаста. Вернуться к разговору после ${randomInt(random, 1, 28)} ${pick(random, monthsGenitive)}.`,
  ({ gender }) =>
    `${pronouns[gender].He} ${past(gender, "советовал", "советовала")} сериал «Чернобыль». Посмотреть и обсудить.`,
  () => "Сыграли в теннис, договорились повторить через две недели.",
  ({ random, gender }) =>
    `Вернуть ${pronouns[gender].him} ${randomInt(random, 2, 9)} 000 ₽ за билеты на концерт.`,
  ({ random }) =>
    `Договорились пойти вместе на концерт в ${pick(random, monthsIn)}. Билеты покупаю я.`,
  ({ gender }) =>
    `${pronouns[gender].He} ${past(gender, "помог", "помогла")} с ремонтом машины. Отблагодарить — пригласить на ужин.`,
  ({ gender }) =>
    `Созвонились по видео. ${pronouns[gender].He} ${past(gender, "рассказал", "рассказала")} про новый проект — звучит интересно, следить.`,
  ({ random }) =>
    `Встреча выпускников ${randomInt(random, 1, 28)} ${pick(random, monthsGenitive)} — напомнить за неделю.`,
  ({ gender }) =>
    `${pronouns[gender].He} ${past(gender, "просил", "просила")} совет по ипотеке — переслать статью и контакт брокера.`,
  ({ gender }) =>
    `Договорились обменяться настольными играми: я даю «Каркассон», ${pronouns[gender].he} — «Билет на поезд».`,
  () => "Ездили вместе за грибами. Договорились повторить следующей осенью.",
  () => "Пообещали друг другу бегать по утрам — спросить, как успехи.",
  ({ gender }) =>
    `${pronouns[gender].He} ${past(gender, "искал", "искала")} фотографа на свадьбу — посоветовать Дениса.`,
  ({ gender }) =>
    `Говорили про переезд в другой город: ${pronouns[gender].he} пока думает. Созвониться через месяц.`,
  ({ gender }) =>
    `Случайно встретились в метро, обменялись новостями. ${pronouns[gender].He} теперь живёт в соседнем районе.`,
  ({ random }) =>
    `Договорились о консультации в ${pick(random, ["понедельник", "вторник", "среду", "четверг", "пятницу"])} в 19:00.`,
  ({ gender }) => `Отправить ${pronouns[gender].him} фотографии с поездки.`,
  ({ gender }) =>
    `Обсудили ремонт кухни, ${pronouns[gender].he} ${past(gender, "обещал", "обещала")} посчитать смету к пятнице.`,
  ({ gender }) =>
    `${pronouns[gender].He} в отпуске, вернётся 20-го — тогда и созвонимся.`,
  ({ gender }) =>
    `Познакомить ${pronouns[gender].his} с Мариной — у них похожие проекты.`,
  ({ gender }) =>
    `Поздравили ${pronouns[gender].his} с повышением всей компанией. Повод собраться летом на даче.`,
];

const DAY_MS = 24 * 60 * 60 * 1000;

function generateAbout(ctx: Context): string | null {
  const { random, gender } = ctx;
  const roll = random();
  if (roll < 0.08) return null;
  if (roll < 0.5) return `${pick(random, officeRoles)} ${pick(random, officePlaces)}`;
  if (roll < 0.85) return pick(random, standaloneAbout);
  const [masculine, feminine] = pick(random, relationAbout);
  return gender === "m" ? masculine : feminine;
}

function generatePhone(random: Random): string {
  const digits = (count: number) =>
    Array.from({ length: count }, () => randomInt(random, 0, 9)).join("");
  return `+7 9${digits(2)} ${digits(3)}-${digits(2)}-${digits(2)}`;
}

function generateEmail(
  random: Random,
  firstName: string,
  lastName: string,
  usedEmails: Set<string>,
): string {
  const first = translit(firstName);
  const last = translit(lastName);
  const domain = chance(random, 0.25)
    ? pick(random, workDomains)
    : pick(random, personalDomains);
  const variants = [
    `${first}.${last}`,
    `${first[0]}.${last}`,
    `${last}.${first}`,
    `${first}${last}${randomInt(random, 1, 99)}`,
    `${first}_${randomInt(random, 1980, 2004)}`,
  ];
  let local = pick(random, variants);
  let email = `${local}@${domain}`;
  for (let suffix = 2; usedEmails.has(email); suffix++) {
    local = `${local.replace(/\d+$/, "")}${suffix}`;
    email = `${local}@${domain}`;
  }
  usedEmails.add(email);
  return email;
}

function generateNotes(ctx: Context, createdAt: Date, now: Date): SeedNote[] {
  const { random } = ctx;
  const roll = random();
  const count =
    roll < 0.35 ? 0 : roll < 0.65 ? 1 : roll < 0.85 ? 2 : roll < 0.95 ? 3 : randomInt(random, 4, 6);

  const span = now.getTime() - createdAt.getTime();
  const times = Array.from(
    { length: count },
    () => createdAt.getTime() + Math.floor(random() * span),
  ).sort((a, b) => a - b);

  return times.map((time) => ({
    body: pick(random, noteTemplates)(ctx),
    createdAt: new Date(time),
  }));
}

export function generateContacts(count: number, seed: number): SeedContact[] {
  const random = createRandom(seed);
  const now = new Date();
  const usedEmails = new Set<string>();

  return Array.from({ length: count }, () => {
    const gender: Gender = chance(random, 0.5) ? "m" : "f";
    const ctx: Context = { random, gender };
    const firstName =
      gender === "m" ? pick(random, maleFirstNames) : pick(random, femaleFirstNames);
    const maleLastName = pick(random, lastNames);
    const lastName = gender === "m" ? maleLastName : feminineLastName(maleLastName);

    // Added sometime in the last three years
    const createdAt = new Date(
      now.getTime() - randomInt(random, 1, 3 * 365) * DAY_MS - randomInt(random, 0, DAY_MS),
    );
    const notes = generateNotes(ctx, createdAt, now);

    return {
      contact: {
        name: `${firstName} ${lastName}`,
        about: generateAbout(ctx),
        howWeMet: chance(random, 0.94) ? pick(random, howWeMetTemplates)(ctx) : null,
        phone: chance(random, 0.9) ? generatePhone(random) : null,
        email: chance(random, 0.8)
          ? generateEmail(random, firstName, lastName, usedEmails)
          : null,
        createdAt,
        updatedAt: createdAt,
      },
      notes,
    };
  });
}
