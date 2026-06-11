/* ============================================================
   Arc90 — data layer
   100 habits · 10 categories · goal→habit suggestions
   Coach tips & Q&A (rule-based) · Protocol Tracker data
   ============================================================ */

const CATEGORIES = [
  { id: 'learn',   emoji: '📚', name: 'Learn & Grow' },
  { id: 'move',    emoji: '💪', name: 'Move & Train' },
  { id: 'eat',     emoji: '🥗', name: 'Eat Clean' },
  { id: 'money',   emoji: '💰', name: 'Money Smart' },
  { id: 'mind',    emoji: '🧘', name: 'Mind & Calm' },
  { id: 'work',    emoji: '💼', name: 'Career & Deep Work' },
  { id: 'sleep',   emoji: '😴', name: 'Sleep & Recover' },
  { id: 'create',  emoji: '🎨', name: 'Create & Express' },
  { id: 'connect', emoji: '❤️', name: 'Connect' },
  { id: 'home',    emoji: '🏡', name: 'Life Admin' },
  { id: 'custom',  emoji: '✨', name: 'Custom' },
];

const HABIT_LIBRARY = [
  // 📚 Learn & Grow
  { id: 1,  cat: 'learn',  emoji: '📖', name: 'Read 10 pages',                      min: 'Read 1 page' },
  { id: 2,  cat: 'learn',  emoji: '🎯', name: 'Study 1 focused hour',               min: 'Study 10 minutes' },
  { id: 3,  cat: 'learn',  emoji: '🗣️', name: 'Practice a language 15 min',         min: 'Practice 3 minutes' },
  { id: 4,  cat: 'learn',  emoji: '📝', name: 'Watch one tutorial & take notes',    min: 'Watch 5 minutes' },
  { id: 5,  cat: 'learn',  emoji: '🃏', name: 'Review flashcards',                  min: 'Review 5 cards' },
  { id: 6,  cat: 'learn',  emoji: '✍️', name: 'Summarize what you learned today',   min: 'Write one sentence' },
  { id: 7,  cat: 'learn',  emoji: '🎧', name: 'Listen to an educational podcast',   min: 'Listen 5 minutes' },
  { id: 8,  cat: 'learn',  emoji: '🎓', name: 'Complete one course module',         min: 'Open the course' },
  { id: 9,  cat: 'learn',  emoji: '💻', name: 'Practice coding 30 min',             min: 'Code 5 minutes' },
  { id: 10, cat: 'learn',  emoji: '🧑‍🏫', name: 'Teach someone one thing you learned', min: 'Share one fact' },
  // 💪 Move & Train
  { id: 11, cat: 'move',   emoji: '🏋️', name: 'Work out 30 min',                    min: '5-minute session' },
  { id: 12, cat: 'move',   emoji: '🚶', name: 'Hit 8,000 steps',                    min: '10-minute walk' },
  { id: 13, cat: 'move',   emoji: '🤸', name: 'Morning stretch 10 min',             min: 'Stretch 2 minutes' },
  { id: 14, cat: 'move',   emoji: '💥', name: 'Do 20 push-ups',                     min: '5 push-ups' },
  { id: 15, cat: 'move',   emoji: '🏃', name: 'Run 2 km',                           min: 'Run 5 minutes' },
  { id: 16, cat: 'move',   emoji: '🧘‍♀️', name: 'Yoga or pilates session',            min: '3 poses' },
  { id: 17, cat: 'move',   emoji: '🪜', name: 'Take the stairs every time',         min: 'One flight today' },
  { id: 18, cat: 'move',   emoji: '🌙', name: 'Walk after dinner',                  min: 'Walk to the corner' },
  { id: 19, cat: 'move',   emoji: '🦵', name: 'Mobility / foam roll 10 min',        min: 'Roll 2 minutes' },
  { id: 20, cat: 'move',   emoji: '🥇', name: 'Follow your training plan',          min: 'Do the warm-up' },
  // 🥗 Eat Clean
  { id: 21, cat: 'eat',    emoji: '🍳', name: 'Cook at home — no takeout',          min: 'Cook one meal' },
  { id: 22, cat: 'eat',    emoji: '🥦', name: 'Eat 2 servings of vegetables',       min: 'One serving' },
  { id: 23, cat: 'eat',    emoji: '💧', name: 'Drink 2L of water',                  min: 'One full glass now' },
  { id: 24, cat: 'eat',    emoji: '🥤', name: 'Zero sugary drinks',                 min: 'Swap one for water' },
  { id: 25, cat: 'eat',    emoji: '🍗', name: 'Protein with every meal',            min: 'Protein at one meal' },
  { id: 26, cat: 'eat',    emoji: '⏰', name: 'No snacking after 9pm',              min: 'Kitchen closed at 10' },
  { id: 27, cat: 'eat',    emoji: '💊', name: 'Take your vitamins',                 min: 'Take them' },
  { id: 28, cat: 'eat',    emoji: '🍎', name: 'Fruit instead of dessert',           min: 'Once today' },
  { id: 29, cat: 'eat',    emoji: '🥪', name: "Pack tomorrow's lunch",              min: 'Pack one item' },
  { id: 30, cat: 'eat',    emoji: '🍽️', name: 'Eat one meal without screens',       min: 'First 5 minutes' },
  // 💰 Money Smart
  { id: 31, cat: 'money',  emoji: '🔒', name: 'No-spend day',                       min: 'No impulse buys' },
  { id: 32, cat: 'money',  emoji: '🧾', name: 'Log every expense',                  min: 'Log the biggest one' },
  { id: 33, cat: 'money',  emoji: '☕', name: 'Make coffee at home',                min: 'Skip one bought coffee' },
  { id: 34, cat: 'money',  emoji: '🏦', name: 'Move $5 to savings',                 min: 'Move $1' },
  { id: 35, cat: 'money',  emoji: '⏳', name: '24-hour rule on impulse buys',       min: 'Wait 1 hour' },
  { id: 36, cat: 'money',  emoji: '🔍', name: 'Audit one subscription',             min: 'Open the list' },
  { id: 37, cat: 'money',  emoji: '📋', name: 'Stick to your grocery list',         min: 'Write the list' },
  { id: 38, cat: 'money',  emoji: '📦', name: 'Sell or donate one item',            min: 'Pick the item' },
  { id: 39, cat: 'money',  emoji: '📈', name: 'Read 10 min about money',            min: 'Read one article intro' },
  { id: 40, cat: 'money',  emoji: '👀', name: 'Check your account balance',         min: 'Open the app' },
  // 🧘 Mind & Calm
  { id: 41, cat: 'mind',   emoji: '🧘', name: 'Meditate 10 min',                    min: '10 slow breaths' },
  { id: 42, cat: 'mind',   emoji: '📓', name: 'Journal 5 min',                      min: 'Write one line' },
  { id: 43, cat: 'mind',   emoji: '🙏', name: "Write 3 things you're grateful for", min: 'Write one' },
  { id: 44, cat: 'mind',   emoji: '🌬️', name: '5 deep breaths before screens',      min: 'One deep breath' },
  { id: 45, cat: 'mind',   emoji: '🌅', name: 'No phone for first 30 min of day',   min: 'First 5 minutes' },
  { id: 46, cat: 'mind',   emoji: '📵', name: 'Digital sunset 1h before bed',       min: '15 minutes before' },
  { id: 47, cat: 'mind',   emoji: '🍃', name: 'Take a mindful walk',                min: '5 minutes outside' },
  { id: 48, cat: 'mind',   emoji: '🧠', name: "Brain-dump tomorrow's worries",      min: 'Write the top one' },
  { id: 49, cat: 'mind',   emoji: '💬', name: 'Say your affirmation out loud',      min: 'Once' },
  { id: 50, cat: 'mind',   emoji: '🩺', name: 'Do a 1-min body-scan check-in',      min: '20 seconds' },
  // 💼 Career & Deep Work
  { id: 51, cat: 'work',   emoji: '⚡', name: 'One 90-min deep work block',         min: 'One 25-min block' },
  { id: 52, cat: 'work',   emoji: '🗒️', name: "Plan tomorrow's top 3 tasks",        min: 'Write task #1' },
  { id: 53, cat: 'work',   emoji: '📬', name: 'Inbox to zero',                      min: 'Clear 10 emails' },
  { id: 54, cat: 'work',   emoji: '🤝', name: 'Message one person in your network', min: 'Draft the message' },
  { id: 55, cat: 'work',   emoji: '💼', name: 'Polish portfolio / CV 15 min',       min: 'Fix one line' },
  { id: 56, cat: 'work',   emoji: '🛠️', name: 'Learn one work skill 20 min',        min: '5 minutes' },
  { id: 57, cat: 'work',   emoji: '🙅', name: 'No social media during work hours',  min: 'Phone in another room 1h' },
  { id: 58, cat: 'work',   emoji: '🍅', name: 'Four pomodoros before lunch',        min: 'One pomodoro' },
  { id: 59, cat: 'work',   emoji: '🔁', name: 'Ask for one piece of feedback',      min: 'Pick who to ask' },
  { id: 60, cat: 'work',   emoji: '🚀', name: 'Ship one small thing',               min: 'Ship one fix' },
  // 😴 Sleep & Recover
  { id: 61, cat: 'sleep',  emoji: '🛏️', name: 'In bed by 11pm',                     min: 'In bed by 11:30' },
  { id: 62, cat: 'sleep',  emoji: '🌄', name: 'Wake at the same time daily',        min: 'Within 30 minutes' },
  { id: 63, cat: 'sleep',  emoji: '🚫', name: 'No caffeine after 2pm',              min: 'None after 4pm' },
  { id: 64, cat: 'sleep',  emoji: '🌚', name: 'No screens in bed',                  min: 'Phone out of reach' },
  { id: 65, cat: 'sleep',  emoji: '😴', name: 'Sleep 7+ hours',                     min: 'Lights out 15 min earlier' },
  { id: 66, cat: 'sleep',  emoji: '🕯️', name: 'Evening wind-down ritual',           min: '5-minute version' },
  { id: 67, cat: 'sleep',  emoji: '☀️', name: 'Morning sunlight 10 min',            min: '2 minutes outside' },
  { id: 68, cat: 'sleep',  emoji: '⏱️', name: 'Nap 20 min max',                     min: 'Set the alarm' },
  { id: 69, cat: 'sleep',  emoji: '❄️', name: 'Prep bedroom: cool & dark',          min: 'Curtains + window' },
  { id: 70, cat: 'sleep',  emoji: '🍷', name: 'No alcohol on weeknights',           min: 'Not tonight' },
  // 🎨 Create & Express
  { id: 71, cat: 'create', emoji: '🖊️', name: 'Write 200 words',                    min: 'Write one paragraph' },
  { id: 72, cat: 'create', emoji: '✏️', name: 'Sketch or draw 15 min',              min: 'One small sketch' },
  { id: 73, cat: 'create', emoji: '🎸', name: 'Practice your instrument 20 min',    min: 'Play one song' },
  { id: 74, cat: 'create', emoji: '📷', name: 'Take one intentional photo',         min: 'One photo' },
  { id: 75, cat: 'create', emoji: '🧪', name: 'Side project 30 min',                min: 'Open it, 5 minutes' },
  { id: 76, cat: 'create', emoji: '💡', name: 'Brainstorm 10 ideas',                min: '3 ideas' },
  { id: 77, cat: 'create', emoji: '🔧', name: "Refine yesterday's work",            min: 'One small fix' },
  { id: 78, cat: 'create', emoji: '🌍', name: 'Share one creation publicly',        min: 'Share with one person' },
  { id: 79, cat: 'create', emoji: '🧩', name: 'Learn one new technique',            min: 'Watch one example' },
  { id: 80, cat: 'create', emoji: '🖼️', name: 'Consume art for inspiration 15 min', min: '5 minutes' },
  // ❤️ Connect
  { id: 81, cat: 'connect', emoji: '📞', name: 'Call or text someone you love',     min: 'One text' },
  { id: 82, cat: 'connect', emoji: '🌟', name: 'Give one genuine compliment',       min: 'One compliment' },
  { id: 83, cat: 'connect', emoji: '🙌', name: 'Phones away at the table',          min: 'First 10 minutes' },
  { id: 84, cat: 'connect', emoji: '🫶', name: 'Do one small act of kindness',      min: 'Hold the door' },
  { id: 85, cat: 'connect', emoji: '👋', name: 'Check in on a friend',              min: 'One message' },
  { id: 86, cat: 'connect', emoji: '💌', name: 'Write a thank-you message',         min: 'One sentence' },
  { id: 87, cat: 'connect', emoji: '🌐', name: 'Make one new connection',           min: 'Say hi to someone' },
  { id: 88, cat: 'connect', emoji: '👨‍👩‍👧', name: 'Eat dinner with family / friends', min: 'Sit together 10 min' },
  { id: 89, cat: 'connect', emoji: '🗓️', name: 'Plan quality time this week',       min: 'Propose a day' },
  { id: 90, cat: 'connect', emoji: '👂', name: 'Listen without interrupting',       min: 'One conversation' },
  // 🏡 Life Admin
  { id: 91, cat: 'home',   emoji: '🛌', name: 'Make your bed',                      min: 'Pull the cover up' },
  { id: 92, cat: 'home',   emoji: '⏲️', name: '10-minute tidy',                     min: '2-minute tidy' },
  { id: 93, cat: 'home',   emoji: '🧽', name: 'Dishes done before bed',             min: 'Just your plate' },
  { id: 94, cat: 'home',   emoji: '👕', name: "Lay out tomorrow's clothes",         min: 'Pick the shirt' },
  { id: 95, cat: 'home',   emoji: '🪴', name: 'Water the plants',                   min: 'The thirsty one' },
  { id: 96, cat: 'home',   emoji: '🧹', name: 'Clear one surface',                  min: 'One corner' },
  { id: 97, cat: 'home',   emoji: '🧺', name: 'Complete one laundry cycle',         min: 'Start the load' },
  { id: 98, cat: 'home',   emoji: '📅', name: '5-min calendar & budget review',     min: 'Glance at tomorrow' },
  { id: 99, cat: 'home',   emoji: '🔨', name: 'Fix or finish one small thing',      min: 'Pick the thing' },
  { id: 100, cat: 'home',  emoji: '🗑️', name: 'Take out trash & reset kitchen',     min: 'Trash only' },
];

/* Mission archetypes shown in the interview (multi-select, up to 3).
   Each suggests habits from the library and gives the user an identity to grow into. */
const GOAL_TYPES = [
  { id: 'fit',      emoji: '🏆', label: 'Get fit & strong',       identity: 'an athlete',            suggest: [11, 12, 14, 23, 13] },
  { id: 'health',   emoji: '🥗', label: 'Eat & live healthier',   identity: 'someone who respects their body', suggest: [21, 22, 23, 26, 18] },
  { id: 'learn',    emoji: '🧠', label: 'Master a skill',         identity: 'a relentless learner',  suggest: [2, 1, 5, 8, 56] },
  { id: 'lang',     emoji: '🗣️', label: 'Learn a language',       identity: 'a polyglot',            suggest: [3, 5, 7, 10, 1] },
  { id: 'study',    emoji: '🎓', label: 'Pass an exam',           identity: 'a focused scholar',     suggest: [2, 5, 52, 58, 61] },
  { id: 'money',    emoji: '💰', label: 'Save & be frugal',       identity: 'a wealth builder',      suggest: [31, 32, 33, 34, 21] },
  { id: 'career',   emoji: '💼', label: 'Level up my career',     identity: 'a high performer',      suggest: [51, 52, 54, 55, 60] },
  { id: 'business', emoji: '🚀', label: 'Launch a business',      identity: 'a founder',             suggest: [75, 51, 52, 54, 60] },
  { id: 'calm',     emoji: '🧘', label: 'Find calm & focus',      identity: 'a calm mind',           suggest: [41, 42, 43, 45, 46] },
  { id: 'create',   emoji: '🎨', label: 'Create something real',  identity: 'a maker',               suggest: [75, 71, 76, 78, 77] },
  { id: 'read',     emoji: '📖', label: 'Read more books',        identity: 'a reader',              suggest: [1, 46, 64, 7, 80] },
  { id: 'sleep',    emoji: '😴', label: 'Fix my sleep',           identity: 'someone who recovers like a pro', suggest: [61, 62, 63, 64, 67] },
  { id: 'social',   emoji: '❤️', label: 'Stronger relationships', identity: 'a present friend & partner', suggest: [81, 85, 88, 83, 84] },
  { id: 'digital',  emoji: '📵', label: 'Less screen time',       identity: 'someone who owns their attention', suggest: [45, 46, 57, 30, 64] },
  { id: 'organize', emoji: '🏡', label: 'Get organized',          identity: 'someone with their life in order', suggest: [91, 92, 52, 98, 94] },
];

/* ============================================================
   Coach tips — practical behavioral-design library.
   {habit} and {habitLower} are replaced with the user's weakest habit.
   No medical claims, no exaggerated neuroscience.
   ============================================================ */
const COACH_TIPS = [
  { icon: '🧲', title: 'Stack it onto an existing routine',
    body: 'Anchor it to something that already happens daily: “After I pour my morning coffee, I will {habitLower}.” New routines stick fastest when they ride on ones that are already automatic.' },
  { icon: '🤏', title: 'Shrink it to 2 minutes',
    body: 'If “{habit}” keeps losing, make the entry ridiculous: one page, one push-up, one sentence. The goal right now isn’t results — it’s becoming someone who shows up daily.' },
  { icon: '📍', title: 'Name the when & where',
    body: 'Vague plans fail quietly. Decide now: “I will {habitLower} at [time] in [place].” A specific plan removes the decision from the moment — and the moment is where habits die.' },
  { icon: '🪤', title: 'Design the room, not the willpower',
    body: 'Put the cue for “{habit}” where your eyes land — book on the pillow, shoes by the door, app on the first home screen. Make the easy option visible and the distraction invisible.' },
  { icon: '⏱️', title: 'The 20-second rule',
    body: 'Remove 20 seconds of friction from starting “{habitLower}” — and add 20 seconds of friction to whatever usually replaces it. Most habit battles are decided before they begin.' },
  { icon: '🪞', title: 'Act like the person you’re becoming',
    body: 'Stop saying “I’m trying to {habitLower}.” Say “I’m the kind of person who does this.” Each completion is a small vote for that identity — and consistency follows identity.' },
  { icon: '🚫', title: 'Never miss twice',
    body: 'Missing once is an accident. Missing twice is the start of a new pattern. If you skipped “{habitLower}” yesterday, today is non-negotiable — the minimum version counts.' },
  { icon: '🍿', title: 'Pair it with something you enjoy',
    body: 'Only allow a thing you look forward to while doing “{habitLower}” — your favorite playlist, that podcast, the good coffee. The habit borrows the appeal of the treat.' },
  { icon: '🎉', title: 'Mark the win immediately',
    body: 'The instant you finish “{habitLower}”, check it off and take the small moment of credit. An action that visibly counts is an action you’ll repeat.' },
  { icon: '🌅', title: 'Use a fresh start',
    body: 'Mondays, the 1st of the month, the day after a trip — clean-slate moments make restarting easier. If “{habitLower}” has been slipping, relaunch it tomorrow as Day 1, guilt deleted.' },
  { icon: '⛓️', title: 'Don’t break the chain',
    body: 'Your streak on “{habit}” is a chain you can see. The longer it grows, the more you’ll want to protect it — that’s why your Progress grid exists. Keep it visible.' },
  { icon: '🛡️', title: 'Pre-load the obstacle',
    body: 'Decide the rescue plan now: “If [obstacle] happens, then I will {habitLower} at [backup time] instead.” If-then plans move the decision out of the weak moment.' },
  { icon: '🎬', title: 'Rehearse the first 30 seconds',
    body: 'Don’t daydream the result — mentally walk through how “{habitLower}” starts: where you stand, what you grab, the first move. Familiar actions are easier to start.' },
  { icon: '🗣️', title: 'Tell one person',
    body: 'Text someone: “I do {habitLower} daily for 90 days — ask me about it Friday.” A promise made out loud is harder to quietly drop.' },
  { icon: '🔋', title: 'Protect your sleep first',
    body: 'Skipped “{habitLower}” again? Check your sleep before blaming your discipline. A rested mind follows through; a tired one negotiates. One earlier night beats ten motivational videos.' },
  { icon: '📣', title: 'Make the cue specific',
    body: 'Set a named reminder that says the action: not “reminder” but “{habit} — 2-minute version, now.” Specific cues get acted on; vague buzzes get swiped away.' },
  { icon: '🧗', title: 'Park it next to your strongest habit',
    body: 'Look at what you never miss — do “{habitLower}” immediately after it, same order, every time. Strong routines are the best scaffolding for weak ones.' },
  { icon: '💙', title: 'Forgive fast, restart faster',
    body: 'Beating yourself up after missing “{habitLower}” makes quitting more likely. Note it, shrink the habit, take the next rep. The streak that matters most is how fast you get back up.' },
];

/* Coach Q&A — deterministic answers assembled from the user's real stats.
   Placeholders: {weak} {weakPct} {strong} {strongPct} {momentum} {count} {day} {weakMin} */
const COACH_QA = [
  { id: 'behind',   q: 'Why am I falling behind?',
    a: 'Your numbers say it’s not everything — it’s mostly “{weak}” at {weakPct}% this week, while “{strong}” is at {strongPct}%. You don’t have a discipline problem; you have one badly-placed habit. Shrink it to “{weakMin}” for 7 days and attach it to a fixed moment of your day.' },
  { id: 'priority', q: 'Which habit should I prioritize?',
    a: 'Protect “{strong}” — it’s your anchor at {strongPct}%. Then put your energy on “{weak}” ({weakPct}%): do its minimum version, “{weakMin}”, immediately after the anchor. One anchor plus one rescue beats five half-efforts.' },
  { id: 'toomuch',  q: 'Am I trying to do too much?',
    a: 'You’re running {count} habits with a Momentum Score of {momentum}%. The honest read: if momentum sits under 60% for a week, pause everything except your top 3 until they feel automatic — then add back one at a time. Fewer reps, fully kept, builds more than many reps half-kept.' },
  { id: 'easier',   q: 'How do I make it easier to start?',
    a: 'Cut the start cost. Tonight, stage everything “{weak}” needs so tomorrow it takes one move to begin — and commit only to “{weakMin}”. Starting is the whole game; size can come back later.' },
  { id: 'tomorrow', q: 'Give me a realistic plan for tomorrow.',
    a: 'Day {day} plan: ① “{strong}” at its usual time — it’s your sure win. ② “{weak}” immediately after, minimum version only: “{weakMin}”. ③ Everything else stays normal. Two intentional reps and a normal day is a good day.' },
];

/* Daily nudge copy — rotated for reminders & in-app banners. */
const NUDGES = [
  'Day {day} of 90. {left} habit{s} left today — keep the arc filling. ⚡',
  'Small reps, real momentum. {left} to go today.',
  '90-day you is built today. Knock out {left} more.',
  'Don’t break the chain — {left} habit{s} between you and a complete day.',
  'Two minutes counts. Start the smallest one.',
  'Show up sloppy if you must — just show up. {left} left.',
];

/* ============================================================
   Protocol Tracker — tracking-only wellness log.
   No recommendations, no dosing, no medical advice.
   ============================================================ */
const PROTOCOL_TYPES = [
  { id: 'medication', label: 'Medication', emoji: '💊' },
  { id: 'supplement', label: 'Supplement', emoji: '🌿' },
  { id: 'peptide',    label: 'Peptide',    emoji: '🧬' },
  { id: 'nutrition',  label: 'Nutrition',  emoji: '🥗' },
  { id: 'fitness',    label: 'Fitness',    emoji: '🏋️' },
  { id: 'other',      label: 'Other',      emoji: '📋' },
];

const SYMPTOMS = [
  { id: 'none',      label: 'Feeling fine', flag: false },
  { id: 'nausea',    label: 'Nausea', flag: false },
  { id: 'fatigue',   label: 'Fatigue', flag: false },
  { id: 'headache',  label: 'Headache', flag: false },
  { id: 'dizzy',     label: 'Mild dizziness', flag: false },
  { id: 'appetite',  label: 'Appetite change', flag: false },
  { id: 'sleep',     label: 'Sleep change', flag: false },
  { id: 'mood',      label: 'Mood change', flag: false },
  { id: 'stomach',   label: 'Stomach upset', flag: false },
  { id: 'sev-dizzy', label: 'Severe dizziness', flag: true },
  { id: 'chest',     label: 'Chest pain', flag: true },
  { id: 'breath',    label: 'Trouble breathing', flag: true },
  { id: 'faint',     label: 'Fainting', flag: true },
  { id: 'allergy',   label: 'Allergic reaction', flag: true },
  { id: 'seizure',   label: 'Seizure symptoms', flag: true },
];

const PROTOCOL_DISCLAIMER = 'Track your routine, reminders, symptoms, and notes. Arc90 does not provide medical advice, dosing recommendations, or treatment suggestions. Always follow guidance from a licensed healthcare professional.';

const URGENT_MSG = 'This may need urgent medical attention. Please contact a medical professional or emergency services now.';

const DOSING_BOUNDARY = 'Arc90 can help you track your routine, reminders, symptoms, and notes — but it cannot recommend doses or tell you what to take. For dosing or medical decisions, follow your clinician’s instructions.';
