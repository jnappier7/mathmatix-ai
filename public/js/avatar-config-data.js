// public/js/avatar-config-data.js
// Creature avatar configuration (Blooket-style)
// Cool creatures that students can pick as their avatar

window.AVATAR_CONFIG = {
  // ===== ALWAYS UNLOCKED (Starter Creatures) =====
  'lion': {
    name: '🦁 Lion',
    image: 'lion.png',
    category: 'wild',
    rarity: 'common',
    description: 'Bold, brave, and ready to conquer any math challenge!',
    unlocked: true
  },
  'dragon': {
    name: '🐉 Dragon',
    image: 'dragon.png',
    category: 'fantasy',
    rarity: 'common',
    description: 'Breathe fire through tough problems!',
    unlocked: true
  },
  'panda': {
    name: '🐼 Panda',
    image: 'panda.png',
    category: 'cute',
    rarity: 'common',
    description: 'Chill vibes, smart mind!',
    unlocked: true
  },
  'owl': {
    name: '🦉 Owl',
    image: 'owl.png',
    category: 'wise',
    rarity: 'common',
    description: 'Wise and thoughtful problem solver.',
    unlocked: true
  },
  'fox': {
    name: '🦊 Fox',
    image: 'fox.png',
    category: 'clever',
    rarity: 'common',
    description: 'Quick thinking and creative!',
    unlocked: true
  },
  'tiger': {
    name: '🐯 Tiger',
    image: 'tiger.png',
    category: 'wild',
    rarity: 'common',
    description: 'Fierce focus and determination!',
    unlocked: true
  },

  // ===== UNLOCK AT LEVEL 5 =====
  'unicorn': {
    name: '🦄 Unicorn',
    image: 'unicorn.png',
    category: 'fantasy',
    rarity: 'uncommon',
    description: 'Magical math powers!',
    unlockLevel: 5
  },
  'penguin': {
    name: '🐧 Penguin',
    image: 'penguin.png',
    category: 'cute',
    rarity: 'uncommon',
    description: 'Cool under pressure!',
    unlockLevel: 5
  },
  'wolf': {
    name: '🐺 Wolf',
    image: 'wolf.png',
    category: 'wild',
    rarity: 'uncommon',
    description: 'Pack mentality - never give up!',
    unlockLevel: 5
  },

  // ===== UNLOCK AT LEVEL 10 =====
  'phoenix': {
    name: '🔥 Phoenix',
    image: 'phoenix.png',
    category: 'legendary',
    rarity: 'rare',
    description: 'Rise from mistakes stronger than before!',
    unlockLevel: 10
  },
  'shark': {
    name: '🦈 Shark',
    image: 'shark.png',
    category: 'ocean',
    rarity: 'rare',
    description: 'Swim through problems with precision!',
    unlockLevel: 10
  },
  'eagle': {
    name: '🦅 Eagle',
    image: 'eagle.png',
    category: 'wise',
    rarity: 'rare',
    description: 'Soar above challenges!',
    unlockLevel: 10
  },

  // ===== UNLOCK AT LEVEL 15 =====
  'octopus': {
    name: '🐙 Octopus',
    image: 'octopus.png',
    category: 'ocean',
    rarity: 'rare',
    description: 'Multi-tasking master!',
    unlockLevel: 15
  },
  'raccoon': {
    name: '🦝 Raccoon',
    image: 'raccoon.png',
    category: 'clever',
    rarity: 'rare',
    description: 'Find creative solutions!',
    unlockLevel: 15
  },

  // ===== UNLOCK AT LEVEL 20+ (Epic/Legendary) =====
  'robot': {
    name: '🤖 Robot',
    image: 'robot.png',
    category: 'tech',
    rarity: 'epic',
    description: 'Calculate with precision!',
    unlockLevel: 20
  },
  'alien': {
    name: '👽 Alien',
    image: 'alien.png',
    category: 'space',
    rarity: 'epic',
    description: 'Out-of-this-world thinking!',
    unlockLevel: 20
  },
  'ninja': {
    name: '🥷 Ninja',
    image: 'ninja.png',
    category: 'stealth',
    rarity: 'epic',
    description: 'Silent, swift, successful!',
    unlockLevel: 25
  },
  'wizard': {
    name: '🧙 Wizard',
    image: 'wizard.png',
    category: 'magic',
    rarity: 'legendary',
    description: 'Master of mathematical spells!',
    unlockLevel: 30
  },
  'dinosaur': {
    name: '🦖 T-Rex',
    image: 'dinosaur.png',
    category: 'ancient',
    rarity: 'legendary',
    description: 'Prehistoric power!',
    unlockLevel: 30
  },

  // Default fallback
  'default': {
    name: '😊 Student',
    image: 'default.png',
    category: 'default',
    rarity: 'common',
    description: 'Ready to learn!',
    unlocked: true
  }
};
