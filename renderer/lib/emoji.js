// Emoji `:nom:` : table intégrée (environ 200 emoji courants, noms à la
// GitHub), recherche par préfixe pour l'autocomplétion et remplacement dans un
// texte hors blocs de code. Format UMD : CommonJS pour node et pour le moteur de
// rendu (bundlé par esbuild), global `window.mdrEmoji` dans le renderer.
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.mdrEmoji = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  // « nom emoji » séparés par des espaces, plusieurs noms possibles pour un même emoji.
  const BRUT = `
smile 😄 grin 😁 joy 😂 laughing 😆 smiley 😃 wink 😉 blush 😊 slightly_smiling_face 🙂 upside_down_face 🙃
heart_eyes 😍 kissing_heart 😘 yum 😋 stuck_out_tongue 😛 sunglasses 😎 nerd_face 🤓 thinking 🤔 neutral_face 😐
expressionless 😑 unamused 😒 roll_eyes 🙄 grimacing 😬 relieved 😌 pensive 😔 sleepy 😪 sleeping 😴 mask 😷
confused 😕 worried 😟 cry 😢 sob 😭 scream 😱 angry 😠 rage 😡 flushed 😳 hushed 😯 open_mouth 😮
astonished 😲 disappointed 😞 sweat 😓 weary 😩 tired_face 😫 triumph 😤 innocent 😇 hugs 🤗 shushing_face 🤫
partying_face 🥳 star_struck 🤩 pleading_face 🥺 exploding_head 🤯 rofl 🤣 zany_face 🤪 monocle_face 🧐 cold_face 🥶
hot_face 🥵 skull 💀 ghost 👻 alien 👽 robot 🤖 poop 💩 clown_face 🤡 see_no_evil 🙈 hear_no_evil 🙉 speak_no_evil 🙊
+1 👍 thumbsup 👍 -1 👎 thumbsdown 👎 ok_hand 👌 v ✌️ crossed_fingers 🤞 point_up ☝️ point_down 👇 point_left 👈
point_right 👉 raised_hand ✋ wave 👋 clap 👏 raised_hands 🙌 pray 🙏 handshake 🤝 muscle 💪 fist ✊ punch 👊
writing_hand ✍️ eyes 👀 brain 🧠 tongue 👅 ear 👂 nose 👃 bust_in_silhouette 👤 busts_in_silhouette 👥 baby 👶
man 👨 woman 👩 older_man 👴 older_woman 👵 technologist 🧑‍💻 student 🧑‍🎓 teacher 🧑‍🏫 scientist 🧑‍🔬 detective 🕵️
heart ❤️ orange_heart 🧡 yellow_heart 💛 green_heart 💚 blue_heart 💙 purple_heart 💜 black_heart 🖤 broken_heart 💔
sparkling_heart 💖 two_hearts 💕 100 💯 boom 💥 collision 💥 sparkles ✨ star ⭐ star2 🌟 zap ⚡ fire 🔥
tada 🎉 confetti_ball 🎊 balloon 🎈 gift 🎁 trophy 🏆 medal_sports 🏅 first_place_medal 🥇 crown 👑 gem 💎 dart 🎯
rocket 🚀 airplane ✈️ car 🚗 taxi 🚕 bus 🚌 train 🚆 bike 🚲 ship 🚢 anchor ⚓ construction 🚧 warning ⚠️
no_entry ⛔ stop_sign 🛑 white_check_mark ✅ heavy_check_mark ✔️ x ❌ negative_squared_cross_mark ❎ question ❓ exclamation ❗
bangbang ‼️ interrobang ⁉️ heavy_plus_sign ➕ heavy_minus_sign ➖ arrow_right ➡️ arrow_left ⬅️ arrow_up ⬆️ arrow_down ⬇️
arrows_counterclockwise 🔄 repeat 🔁 back 🔙 soon 🔜 top 🔝 new 🆕 free 🆓 ok 🆗 cool 🆒 sos 🆘
sun_with_face 🌞 sunny ☀️ partly_sunny ⛅ cloud ☁️ umbrella ☔ snowflake ❄️ rainbow 🌈 ocean 🌊 earth_africa 🌍
earth_americas 🌎 globe_with_meridians 🌐 moon 🌙 full_moon 🌕 milky_way 🌌 comet ☄️ volcano 🌋 mountain ⛰️ desert 🏜️
seedling 🌱 evergreen_tree 🌲 palm_tree 🌴 cactus 🌵 herb 🌿 four_leaf_clover 🍀 maple_leaf 🍁 tulip 🌷 rose 🌹 sunflower 🌻
dog 🐶 cat 🐱 mouse 🐭 rabbit 🐰 fox_face 🦊 bear 🐻 panda_face 🐼 lion 🦁 tiger 🐯 cow 🐮
pig 🐷 frog 🐸 monkey_face 🐵 chicken 🐔 penguin 🐧 bird 🐦 eagle 🦅 owl 🦉 bee 🐝 bug 🐛
butterfly 🦋 snail 🐌 turtle 🐢 snake 🐍 whale 🐳 dolphin 🐬 fish 🐟 octopus 🐙 crab 🦀 unicorn 🦄
apple 🍎 green_apple 🍏 banana 🍌 grapes 🍇 strawberry 🍓 lemon 🍋 cherries 🍒 peach 🍑 avocado 🥑 tomato 🍅
carrot 🥕 corn 🌽 hot_pepper 🌶️ bread 🍞 croissant 🥐 cheese 🧀 egg 🥚 pizza 🍕 hamburger 🍔 fries 🍟
hotdog 🌭 taco 🌮 sushi 🍣 cake 🍰 birthday 🎂 cookie 🍪 chocolate_bar 🍫 candy 🍬 icecream 🍨 doughnut 🍩
coffee ☕ tea 🍵 beer 🍺 beers 🍻 wine_glass 🍷 cocktail 🍸 champagne 🍾 milk_glass 🥛 fork_and_knife 🍴 popcorn 🍿
soccer ⚽ basketball 🏀 football 🏈 tennis 🎾 8ball 🎱 video_game 🎮 game_die 🎲 jigsaw 🧩 art 🎨 musical_note 🎵
guitar 🎸 microphone 🎤 headphones 🎧 clapper 🎬 camera 📷 movie_camera 🎥 tv 📺 radio 📻 book 📖 books 📚
bulb 💡 flashlight 🔦 battery 🔋 electric_plug 🔌 computer 💻 desktop_computer 🖥️ keyboard ⌨️ computer_mouse 🖱️ iphone 📱 telephone ☎️
email 📧 envelope ✉️ inbox_tray 📥 outbox_tray 📤 package 📦 memo 📝 pencil ✏️ pencil2 ✏️ pen 🖊️ paperclip 📎
link 🔗 pushpin 📌 round_pushpin 📍 scissors ✂️ file_folder 📁 open_file_folder 📂 page_facing_up 📄 clipboard 📋 calendar 📅 date 📅
chart_with_upwards_trend 📈 chart_with_downwards_trend 📉 bar_chart 📊 bookmark 🔖 label 🏷️ moneybag 💰 dollar 💵 euro 💶 credit_card 💳
lock 🔒 unlock 🔓 key 🔑 hammer 🔨 wrench 🔧 gear ⚙️ toolbox 🧰 magnet 🧲 microscope 🔬 telescope 🔭 mag 🔍
bell 🔔 mega 📣 loudspeaker 📢 hourglass ⌛ watch ⌚ alarm_clock ⏰ stopwatch ⏱️ hourglass_flowing_sand ⏳ shield 🛡️ bomb 💣
house 🏠 office 🏢 hospital 🏥 bank 🏦 school 🏫 factory 🏭 tent ⛺ checkered_flag 🏁 triangular_flag_on_post 🚩 white_flag 🏳️
fr 🇫🇷 gb 🇬🇧 us 🇺🇸 de 🇩🇪 es 🇪🇸 it 🇮🇹 ma 🇲🇦 tn 🇹🇳 dz 🇩🇿 be 🇧🇪 ch 🇨🇭 ca 🇨🇦 eu 🇪🇺
`;

  const TABLE = Object.create(null);
  const NOMS = [];
  const mots = BRUT.split(/\s+/).filter(Boolean);
  for (let i = 0; i + 1 < mots.length; i += 2) {
    const nom = mots[i];
    if (!(nom in TABLE)) { TABLE[nom] = mots[i + 1]; NOMS.push(nom); }
  }

  const RE_NOM = /^[a-z0-9_+\-]+$/;
  const existe = (nom) => RE_NOM.test(nom) && nom in TABLE;

  // Noms commençant par le préfixe (puis ceux qui le contiennent), bornés.
  function suggerer(prefixe, max = 30) {
    const p = String(prefixe || '').toLowerCase().replace(/^:/, '');
    if (!p) return [];
    const debut = NOMS.filter((n) => n.startsWith(p));
    const milieu = NOMS.filter((n) => !n.startsWith(p) && n.includes(p));
    return [...debut, ...milieu].slice(0, max).map((nom) => ({ nom, emoji: TABLE[nom] }));
  }

  // Remplace `:nom:` par l'emoji, hors blocs de code clôturés et hors code en
  // ligne. Les noms inconnus restent tels quels.
  function remplacer(texte) {
    const lignes = String(texte).split('\n');
    let cloture = null;
    return lignes.map((l) => {
      const m = /^\s*(`{3,}|~{3,})/.exec(l);
      if (cloture) {
        if (m && m[1][0] === cloture[0] && m[1].length >= cloture.length && l.trim() === m[1]) cloture = null;
        return l;
      }
      if (m) { cloture = m[1]; return l; }
      return l.split(/(`+[^`]*`+)/).map((morceau, i) => (i % 2 === 1 ? morceau
        : morceau.replace(/:([a-z0-9_+\-]+):/g, (tout, nom) => (existe(nom) ? TABLE[nom] : tout)))).join('');
    }).join('\n');
  }

  return { TABLE, NOMS, existe, suggerer, remplacer };
});
