// Курс Echo: уроки от нуля (A1) до продвинутого (C1).
// Каждый урок — тема и что именно учим. После теста Echo ставит ученика на подходящий урок.

export const LEVELS = {
  A1: 'Начинающий',
  A2: 'Базовый',
  B1: 'Средний',
  B2: 'Выше среднего',
  C1: 'Продвинутый'
};

const RAW = {
  A1: [
    ['Алфавит и звуки', 'буквы, трудные звуки th, w, r; hello, hi, bye'],
    ['Знакомство', 'my name is, I am, nice to meet you, how are you'],
    ['Числа 1–20 и возраст', 'one…twenty, how old are you, I am … years old'],
    ['Глагол to be', 'I am / you are / he is, отрицания и вопросы'],
    ['Откуда ты', 'страны и национальности, where are you from'],
    ['Семья', 'mother, father, brother, sister; have got / has got'],
    ['Предметы вокруг', 'this / that / these / those, a / an, множественное число'],
    ['Цвета и описание', 'цвета, big / small, new / old, порядок слов'],
    ['Еда и напитки', 'I like / I don\'t like, I want, some / any'],
    ['Present Simple: я и ты', 'I work, you play, do you…? I don\'t…'],
    ['Present Simple: он и она', 'he works, she plays, does / doesn\'t'],
    ['Распорядок дня', 'get up, have breakfast, go to work, at 7 o\'clock'],
    ['Время и дни недели', 'what time is it, дни, in the morning, on Monday'],
    ['Дом и комнаты', 'there is / there are, предлоги in, on, under, next to'],
    ['Числа до 100 и цены', 'twenty…hundred, how much is it, магазин'],
    ['Одежда и погода', 'wear, it is cold / hot / raining, сезоны'],
    ['Can и can\'t', 'умения и просьбы: can you help me?'],
    ['Present Continuous', 'I am doing сейчас, what are you doing?'],
    ['Хобби', 'in my free time, I like + -ing, often / sometimes'],
    ['Город и дорога', 'where is…, turn left, go straight, it is near']
  ],
  A2: [
    ['Was и were', 'прошлое глагола to be: I was at home'],
    ['Past Simple: правильные глаголы', 'played, watched, worked; произношение -ed'],
    ['Past Simple: неправильные глаголы', 'went, saw, ate, had, did, made'],
    ['Вопросы и отрицания в прошлом', 'did you…? I didn\'t…, рассказ о выходных'],
    ['Going to', 'планы: I am going to…'],
    ['Will', 'решения на ходу и прогнозы: I will…, I think it will…'],
    ['Сравнения', 'bigger, more interesting, better, worse'],
    ['Превосходная степень', 'the biggest, the most…, the best'],
    ['Исчисляемые и неисчисляемые', 'much / many, a lot of, a few / a little'],
    ['Кафе и ресторан', 'I\'d like…, could I have…, the bill please'],
    ['Покупки', 'size, try on, too big / not big enough'],
    ['Путешествия', 'аэропорт, отель, билеты, вопросы к людям'],
    ['Здоровье', 'части тела, I have a headache, you should…'],
    ['Must и have to', 'обязанности и правила, mustn\'t / don\'t have to'],
    ['Present Perfect: опыт', 'have you ever…? I have been to…'],
    ['Present Perfect и Past Simple', 'когда что, already / yet / just'],
    ['Наречия и частотность', 'quickly, well, always / usually / never'],
    ['Предлоги времени', 'in / on / at, for / since, ago'],
    ['Работа и учёба', 'профессии, what do you do, I work as…'],
    ['Разговор обо мне', 'связный рассказ о себе 1–2 минуты']
  ],
  B1: [
    ['Past Continuous', 'I was doing, when / while, рассказ истории'],
    ['Present Perfect Continuous', 'I have been doing, how long'],
    ['Used to', 'привычки в прошлом: I used to…'],
    ['First Conditional', 'if it rains, I will…'],
    ['Second Conditional', 'if I had…, I would…'],
    ['Модальные: возможность', 'might, may, could, must be, can\'t be'],
    ['Советы и предложения', 'should, ought to, why don\'t you, how about'],
    ['Герундий и инфинитив', 'enjoy doing, want to do, stop doing / stop to do'],
    ['Пассивный залог', 'it is made, it was built'],
    ['Косвенная речь', 'he said that…, she told me…'],
    ['Относительные предложения', 'who, which, that, where'],
    ['Фразовые глаголы: базовые', 'get up, give up, look for, turn on'],
    ['Вопросы с хвостиком', 'you are…, aren\'t you? it\'s nice, isn\'t it?'],
    ['Будущее: все способы', 'will, going to, Present Continuous для планов'],
    ['Мнение и спор', 'I think, in my opinion, I agree / disagree because'],
    ['Чувства и эмоции', 'bored / boring, excited / exciting, I feel…'],
    ['Технологии и интернет', 'лексика гаджетов и соцсетей'],
    ['Телефон и сообщения', 'звонки, вежливые просьбы, could you…'],
    ['Связки', 'however, although, because of, so, that\'s why'],
    ['Рассказ истории', 'связно рассказать случай из жизни 2–3 минуты']
  ],
  B2: [
    ['Past Perfect', 'I had done: что было раньше в прошлом'],
    ['Third Conditional', 'if I had known, I would have…'],
    ['Смешанные условные', 'if I had studied, I would be…'],
    ['Wish и if only', 'I wish I had…, I wish I had done…'],
    ['Модальные о прошлом', 'should have, could have, must have, might have'],
    ['Пассив: сложные формы', 'it has been done, it is said that…'],
    ['Have something done', 'I had my car repaired'],
    ['Косвенная речь: вопросы и просьбы', 'asked if…, told me to…'],
    ['Future Continuous и Future Perfect', 'I will be doing, I will have done'],
    ['Фразовые глаголы: работа и жизнь', 'put off, come up with, run out of, deal with'],
    ['Коллокации', 'make / do, take / have, сочетания слов как у носителей'],
    ['Артикли без ошибок', 'a / the / ничего: трудные случаи'],
    ['Инверсия и усиление', 'never have I…, it was… that, what I need is…'],
    ['Причастные обороты', 'having finished…, the man standing there'],
    ['Работа: собеседование', 'рассказать о себе, сильные стороны, вопросы'],
    ['Деловое общение', 'вежливые формулировки, письма, созвоны'],
    ['Дискуссия', 'аргументы, уступки, вежливое несогласие'],
    ['Идиомы на каждый день', 'break the ice, piece of cake, on the same page'],
    ['Новости и общество', 'обсуждение новостей и проблем'],
    ['Свободная речь B2', 'монолог 3–4 минуты на любую тему без пауз']
  ],
  C1: [
    ['Тонкости времён', 'нюансы смысла между временами'],
    ['Сложный пассив и безличные', 'he is believed to have…, there is said to be…'],
    ['Эмфаза и клефты', 'what really matters is…, it is… who…'],
    ['Модальные: оттенки', 'needn\'t have, would rather, be bound to'],
    ['Сослагательное', 'it\'s time we went, suppose / as if, I suggest he go'],
    ['Словообразование', 'приставки и суффиксы, семьи слов'],
    ['Регистр', 'формально и неформально: как говорить к месту'],
    ['Хеджирование', 'смягчение: it seems, to some extent, arguably'],
    ['Продвинутые связки', 'nevertheless, whereas, provided that, given that'],
    ['Идиомы и сленг', 'живая речь, фильмы и сериалы'],
    ['Фразовые глаголы: продвинутые', 'многозначные фразовые глаголы'],
    ['Произношение и интонация', 'связная речь, ударение, ритм'],
    ['Аргументация', 'структура убедительной речи'],
    ['Презентация', 'выступление: начало, переходы, вывод'],
    ['Абстрактные темы', 'наука, культура, этика — обсуждение'],
    ['Свободная речь C1', 'долгий разговор на сложные темы без подготовки']
  ]
};

// Плоский список уроков: { id: 'A2-05', level: 'A2', n: 5, title, goal }.
export const COURSE = Object.entries(RAW).flatMap(([level, list]) =>
  list.map(([title, goal], i) => ({
    id: `${level}-${String(i + 1).padStart(2, '0')}`,
    level,
    n: i + 1,
    title,
    goal
  }))
);

export const lessonById = (id) => COURSE.find(l => l.id === id);

// Первый урок уровня — с него Echo начинает после теста.
export function firstLessonOf(level) {
  const key = String(level || '').toUpperCase().match(/[ABC][12]/)?.[0];
  if (key === 'C2') return COURSE.find(l => l.level === 'C1');
  return COURSE.find(l => l.level === key) || COURSE[0];
}

// Интервалы повторения слов (в занятиях): чем лучше знаешь слово, тем реже оно попадается.
export const REVIEW_STEPS = [1, 2, 4, 8, 16, 32];
