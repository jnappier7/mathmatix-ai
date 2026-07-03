// public/js/avatar-config-data.js
// CLIENT MIRROR of utils/avatarCatalog.js — the selectable student avatar set.
// Coexists with DiceBear (create-your-own): when user.selectedAvatarId is a key
// here, the creature/character art renders; otherwise DiceBear is used.
// ⚠️ Keep in sync with utils/avatarCatalog.js (server is canonical).
(function () {
  function titleCase(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  var CREATURE_TIERS = [
    { level: 1,  rarity: 'common',    ids: ['lion', 'dragon', 'panda', 'owl', 'fox', 'tiger'] },
    { level: 5,  rarity: 'uncommon',  ids: ['unicorn', 'penguin', 'wolf'] },
    { level: 10, rarity: 'rare',      ids: ['phoenix', 'shark', 'eagle'] },
    { level: 15, rarity: 'rare',      ids: ['octopus', 'raccoon', 'leopard'] },
    { level: 20, rarity: 'epic',      ids: ['robot', 'alien'] },
    { level: 25, rarity: 'epic',      ids: ['ninja'] },
    { level: 30, rarity: 'legendary', ids: ['wizard', 'dinosaur'] }
  ];
  var CHARACTER_IDS = ['astronaut', 'architect', 'artist', 'bookworm', 'chef', 'coder',
    'dancer', 'filmmaker', 'gamer', 'musician', 'photographer', 'pirate', 'scientist',
    'superhero', 'cheerleader'];
  var SPORTS_IDS = ['swimmer', 'gymnast', 'golfer', 'tennis', 'wrestler', 'runner',
    'skateboarder', 'softball', 'volleyball', 'lacrosse', 'fieldhockey', 'figureskater',
    'equestrian', 'yoga'];
  var STYLE_IDS = ['concrete', 'wood', 'nature', 'graffiti'];

  var cfg = {};
  CREATURE_TIERS.forEach(function (t) {
    t.ids.forEach(function (id) {
      cfg[id] = { id: id, name: titleCase(id), image: id + '.png', group: 'creature', rarity: t.rarity, unlockLevel: t.level };
    });
  });
  CHARACTER_IDS.forEach(function (id) { cfg[id] = { id: id, name: titleCase(id), image: id + '.png', group: 'character', rarity: 'common', unlockLevel: 1 }; });
  SPORTS_IDS.forEach(function (id) { cfg[id] = { id: id, name: titleCase(id), image: id + '.png', group: 'sports', rarity: 'common', unlockLevel: 1 }; });
  STYLE_IDS.forEach(function (id) { cfg[id] = { id: id, name: titleCase(id), image: id + '.png', group: 'style', rarity: 'common', unlockLevel: 1 }; });

  window.AVATAR_CONFIG = cfg;
})();
