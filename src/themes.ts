import type { PieceModelSet, ThemeId } from './types';

export type BorderRuneStyle = 'futhark' | 'samurai' | 'hieroglyph' | 'astral';
export type ParticleMode = 'dust' | 'sakura' | 'snow' | 'embers' | 'stars';
export type StainedGlassStyle = 'gothic' | 'shoji' | 'solar' | 'aurora' | 'magma' | 'nebula';

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  shortName: string;
  armyLabel: string;
  modelSet: PieceModelSet;
  accentHex: string;
  accentBrightHex: string;
  judgmentEyebrow: string;
  loadingLabel: string;
  environment: {
    bgHex: number;
    fogHex: number;
    fogDensity: number;
    hemiSkyHex: number;
    hemiGroundHex: number;
    hemiIntensity: number;
    keyHex: number;
    keyIntensity: number;
    rimHex: number;
    rimIntensity: number;
    zenithHex: number;
    zenithIntensity: number;
    envIntensity: number;
    wallBaseHex: string;
    wallTrimHex: number;
    nicheHex: number;
    columnHex: number;
    columnTrimHex: number;
    floorBaseHex: string;
    roofHex: number;
    doorWoodHex: number;
    doorIronHex: number;
    windowStyle: StainedGlassStyle;
    windowEmissiveHex: number;
    beamHex: number;
    beamOpacity: number;
  };
  brazier: {
    lightHex: number;
    lightIntensity: number;
    emberEmissiveHex: number;
    outerFlameHex: number;
    midFlameHex: number;
    innerFlameHex: number;
    sparkHex: number;
    pedestalHex: number;
    ironHex: number;
  };
  board: {
    lightSquareHex: string;
    lightVeinHex: string;
    darkSquareHex: string;
    darkVeinHex: string;
    borderBaseHex: string;
    borderVeinHex: string;
    runeHex: string;
    runeEmissiveHex: number;
    runeEmissiveIntensity: number;
    bezelHex: number;
    daisHex: number;
    mortarHex: number;
    runeStyle: BorderRuneStyle;
  };
  pieces: {
    overrideColors: boolean;
    whitePrimaryHex: number;
    whiteSecondaryHex: number;
    blackPrimaryHex: number;
    blackSecondaryHex: number;
    metalTrimHex: number;
    steelWhiteHex: number;
    steelBlackHex: number;
    emissiveHex?: number;
    emissiveIntensity?: number;
    roughnessScale?: number;
    coatWeight?: number;
  };
  particles: {
    mode: ParticleMode;
    colorHex: number;
    size: number;
    opacity: number;
  };
  combatVfx: {
    selectHex: string;
    quietHex: string;
    captureHex: string;
    checkHex: string;
    slashHex: number;
    magicHex: number;
    whiteShardHex: number;
    blackShardHex: number;
    trimShardHex: number;
  };
}

export const THEME_ORDER: ReadonlyArray<ThemeId> = [
  'gothic',
  'samurai',
  'pharaoh',
  'frost',
  'infernal',
  'astral',
];

export const THEMES: Record<ThemeId, ThemeConfig> = {
  gothic: {
    id: 'gothic',
    name: 'Gothic Sanctum',
    shortName: 'Gothic',
    armyLabel: 'Crusader Order',
    modelSet: 'crusader',
    accentHex: '#d4af37',
    accentBrightHex: '#e5c158',
    judgmentEyebrow: 'SANCTUM JUDGMENT',
    loadingLabel: 'Conjuring Gothic Sanctum...',
    environment: {
      bgHex: 0x07090e,
      fogHex: 0x080b12,
      fogDensity: 0.015,
      hemiSkyHex: 0x7392c4,
      hemiGroundHex: 0x2a1f16,
      hemiIntensity: 0.58,
      keyHex: 0xffe9ca,
      keyIntensity: 2.15,
      rimHex: 0x6c9ef0,
      rimIntensity: 0.95,
      zenithHex: 0xcfdcff,
      zenithIntensity: 0.35,
      envIntensity: 0.72,
      wallBaseHex: '#14171F',
      wallTrimHex: 0x222632,
      nicheHex: 0x12151c,
      columnHex: 0x262b36,
      columnTrimHex: 0x1b1f28,
      floorBaseHex: '#151820',
      roofHex: 0x0c0f16,
      doorWoodHex: 0x2a1b12,
      doorIronHex: 0x1a1d24,
      windowStyle: 'gothic',
      windowEmissiveHex: 0x5da0ff,
      beamHex: 0x7cb6ff,
      beamOpacity: 0.05,
    },
    brazier: {
      lightHex: 0xff7d2b,
      lightIntensity: 4.6,
      emberEmissiveHex: 0xff4c12,
      outerFlameHex: 0xff5412,
      midFlameHex: 0xff9a24,
      innerFlameHex: 0xffe484,
      sparkHex: 0xff8a2b,
      pedestalHex: 0x1e222b,
      ironHex: 0x171920,
    },
    board: {
      lightSquareHex: '#E7DFCF',
      lightVeinHex: 'rgba(155, 142, 124, 0.24)',
      darkSquareHex: '#181C24',
      darkVeinHex: 'rgba(92, 104, 128, 0.24)',
      borderBaseHex: '#0B0D12',
      borderVeinHex: 'rgba(226, 234, 245, 0.72)',
      runeHex: '#F0C75E',
      runeEmissiveHex: 0xffc95c,
      runeEmissiveIntensity: 0.45,
      bezelHex: 0xd4af37,
      daisHex: 0x1a1d24,
      mortarHex: 0x161412,
      runeStyle: 'futhark',
    },
    pieces: {
      overrideColors: false,
      whitePrimaryHex: 0xefe8dd,
      whiteSecondaryHex: 0xd9cfc0,
      blackPrimaryHex: 0x14161d,
      blackSecondaryHex: 0x222633,
      metalTrimHex: 0xd4af37,
      steelWhiteHex: 0xc8d0dc,
      steelBlackHex: 0xa6b0be,
    },
    particles: {
      mode: 'dust',
      colorHex: 0xd8c6a6,
      size: 0.085,
      opacity: 0.42,
    },
    combatVfx: {
      selectHex: '#e5c158',
      quietHex: '#38bdf8',
      captureHex: '#ef4444',
      checkHex: '#ef4444',
      slashHex: 0x67e8f9,
      magicHex: 0xf59e0b,
      whiteShardHex: 0xebe3d4,
      blackShardHex: 0x161922,
      trimShardHex: 0xd4af37,
    },
  },

  samurai: {
    id: 'samurai',
    name: 'Shogun Dojo',
    shortName: 'Samurai',
    armyLabel: 'Shogunate',
    modelSet: 'samurai',
    accentHex: '#dc2626',
    accentBrightHex: '#f59e0b',
    judgmentEyebrow: 'SHOGUNATE DECREE',
    loadingLabel: 'Entering the Shogun Dojo...',
    environment: {
      bgHex: 0x110709,
      fogHex: 0x16090c,
      fogDensity: 0.014,
      hemiSkyHex: 0xffbfa8,
      hemiGroundHex: 0x2d1410,
      hemiIntensity: 0.64,
      keyHex: 0xffe2c2,
      keyIntensity: 2.1,
      rimHex: 0xff6b8b,
      rimIntensity: 0.9,
      zenithHex: 0xffdcd4,
      zenithIntensity: 0.35,
      envIntensity: 0.75,
      wallBaseHex: '#231313',
      wallTrimHex: 0x3b1816,
      nicheHex: 0x170b0b,
      columnHex: 0x451614,
      columnTrimHex: 0x1a1111,
      floorBaseHex: '#1b1312',
      roofHex: 0x140b0b,
      doorWoodHex: 0x3c1912,
      doorIronHex: 0x1c1414,
      windowStyle: 'shoji',
      windowEmissiveHex: 0xffaa66,
      beamHex: 0xff9a76,
      beamOpacity: 0.045,
    },
    brazier: {
      lightHex: 0xff6428,
      lightIntensity: 4.8,
      emberEmissiveHex: 0xff3b10,
      outerFlameHex: 0xff4614,
      midFlameHex: 0xff8e24,
      innerFlameHex: 0xffe08a,
      sparkHex: 0xff7038,
      pedestalHex: 0x241616,
      ironHex: 0x181010,
    },
    board: {
      lightSquareHex: '#EDE4D3',
      lightVeinHex: 'rgba(176, 150, 120, 0.22)',
      darkSquareHex: '#1D1214',
      darkVeinHex: 'rgba(185, 58, 52, 0.26)',
      borderBaseHex: '#14090B',
      borderVeinHex: 'rgba(218, 62, 62, 0.65)',
      runeHex: '#E8B84B',
      runeEmissiveHex: 0xe64833,
      runeEmissiveIntensity: 0.42,
      bezelHex: 0xc89b3c,
      daisHex: 0x1f1112,
      mortarHex: 0x291111,
      runeStyle: 'samurai',
    },
    pieces: {
      overrideColors: false,
      whitePrimaryHex: 0xf2ece1,
      whiteSecondaryHex: 0xb92b27,
      blackPrimaryHex: 0x121216,
      blackSecondaryHex: 0x7f1d1d,
      metalTrimHex: 0xd9a838,
      steelWhiteHex: 0xd8dee9,
      steelBlackHex: 0x9ca3af,
    },
    particles: {
      mode: 'sakura',
      colorHex: 0xffa6c4,
      size: 0.12,
      opacity: 0.78,
    },
    combatVfx: {
      selectHex: '#f59e0b',
      quietHex: '#fb7185',
      captureHex: '#ef4444',
      checkHex: '#ef4444',
      slashHex: 0xff5a6e,
      magicHex: 0xf59e0b,
      whiteShardHex: 0xefe7da,
      blackShardHex: 0x171215,
      trimShardHex: 0xd9a838,
    },
  },

  pharaoh: {
    id: 'pharaoh',
    name: "Pharaoh's Temple",
    shortName: 'Pharaoh',
    armyLabel: 'Solar Dynasty',
    modelSet: 'pharaoh',
    accentHex: '#eab308',
    accentBrightHex: '#fde047',
    judgmentEyebrow: 'JUDGMENT OF OSIRIS',
    loadingLabel: 'Unsealing Solar Sanctuary...',
    environment: {
      bgHex: 0x140e06,
      fogHex: 0x1c1409,
      fogDensity: 0.013,
      hemiSkyHex: 0xffdf9e,
      hemiGroundHex: 0x3b2812,
      hemiIntensity: 0.68,
      keyHex: 0xfff0c2,
      keyIntensity: 2.35,
      rimHex: 0x2dd4bf,
      rimIntensity: 0.85,
      zenithHex: 0xffe8b8,
      zenithIntensity: 0.42,
      envIntensity: 0.78,
      wallBaseHex: '#3b2d1b',
      wallTrimHex: 0x5c4629,
      nicheHex: 0x1f170d,
      columnHex: 0x6b5231,
      columnTrimHex: 0xc2932b,
      floorBaseHex: '#2b2013',
      roofHex: 0x181108,
      doorWoodHex: 0x4a3418,
      doorIronHex: 0x8f6b24,
      windowStyle: 'solar',
      windowEmissiveHex: 0xffc845,
      beamHex: 0xffd269,
      beamOpacity: 0.06,
    },
    brazier: {
      lightHex: 0xffa629,
      lightIntensity: 5.0,
      emberEmissiveHex: 0xff7b00,
      outerFlameHex: 0xff7700,
      midFlameHex: 0xffb724,
      innerFlameHex: 0xfff3a8,
      sparkHex: 0xffc13b,
      pedestalHex: 0x4d3a22,
      ironHex: 0x2b2012,
    },
    board: {
      lightSquareHex: '#EFE1BE',
      lightVeinHex: 'rgba(182, 148, 86, 0.28)',
      darkSquareHex: '#1B1920',
      darkVeinHex: 'rgba(42, 132, 168, 0.30)',
      borderBaseHex: '#15120E',
      borderVeinHex: 'rgba(232, 188, 72, 0.62)',
      runeHex: '#FACC15',
      runeEmissiveHex: 0xf59e0b,
      runeEmissiveIntensity: 0.48,
      bezelHex: 0xeab308,
      daisHex: 0x3b2c1a,
      mortarHex: 0x261c0f,
      runeStyle: 'hieroglyph',
    },
    pieces: {
      overrideColors: false,
      whitePrimaryHex: 0xf4e8c8,
      whiteSecondaryHex: 0x1e6091,
      blackPrimaryHex: 0x17171d,
      blackSecondaryHex: 0x1d4e78,
      metalTrimHex: 0xebb628,
      steelWhiteHex: 0xe6c35c,
      steelBlackHex: 0xd4af37,
    },
    particles: {
      mode: 'dust',
      colorHex: 0xffe29a,
      size: 0.095,
      opacity: 0.5,
    },
    combatVfx: {
      selectHex: '#fde047',
      quietHex: '#2dd4bf',
      captureHex: '#f97316',
      checkHex: '#ef4444',
      slashHex: 0xfde047,
      magicHex: 0x14b8a6,
      whiteShardHex: 0xf2e4c2,
      blackShardHex: 0x1a1a22,
      trimShardHex: 0xebb628,
    },
  },

  frost: {
    id: 'frost',
    name: 'Frost Citadel',
    shortName: 'Frost',
    armyLabel: 'Glacial Guard',
    modelSet: 'crusader',
    accentHex: '#38bdf8',
    accentBrightHex: '#7dd3fc',
    judgmentEyebrow: 'GLACIAL VERDICT',
    loadingLabel: 'Crystallizing Frost Citadel...',
    environment: {
      bgHex: 0x050b14,
      fogHex: 0x081322,
      fogDensity: 0.015,
      hemiSkyHex: 0xa5e2ff,
      hemiGroundHex: 0x112238,
      hemiIntensity: 0.68,
      keyHex: 0xdbf4ff,
      keyIntensity: 2.15,
      rimHex: 0x38bdf8,
      rimIntensity: 1.15,
      zenithHex: 0xe0f7ff,
      zenithIntensity: 0.45,
      envIntensity: 0.82,
      wallBaseHex: '#142233',
      wallTrimHex: 0x1e354d,
      nicheHex: 0x0b1624,
      columnHex: 0x20364f,
      columnTrimHex: 0x162638,
      floorBaseHex: '#101d2c',
      roofHex: 0x07101c,
      doorWoodHex: 0x1a2c3d,
      doorIronHex: 0x4b6a88,
      windowStyle: 'aurora',
      windowEmissiveHex: 0x38d9f5,
      beamHex: 0x67e8f9,
      beamOpacity: 0.06,
    },
    brazier: {
      lightHex: 0x38bdf8,
      lightIntensity: 4.8,
      emberEmissiveHex: 0x0ea5e9,
      outerFlameHex: 0x0284c7,
      midFlameHex: 0x38bdf8,
      innerFlameHex: 0xe0f2fe,
      sparkHex: 0x7dd3fc,
      pedestalHex: 0x1b2d42,
      ironHex: 0x26394d,
    },
    board: {
      lightSquareHex: '#E3F2FA',
      lightVeinHex: 'rgba(105, 178, 224, 0.28)',
      darkSquareHex: '#101C2C',
      darkVeinHex: 'rgba(56, 189, 248, 0.26)',
      borderBaseHex: '#070F1B',
      borderVeinHex: 'rgba(186, 230, 253, 0.78)',
      runeHex: '#7DD3FC',
      runeEmissiveHex: 0x38bdf8,
      runeEmissiveIntensity: 0.55,
      bezelHex: 0x94c5e8,
      daisHex: 0x122236,
      mortarHex: 0x0c1929,
      runeStyle: 'futhark',
    },
    pieces: {
      overrideColors: true,
      whitePrimaryHex: 0xe2f3ff,
      whiteSecondaryHex: 0xb9dcf2,
      blackPrimaryHex: 0x0b182e,
      blackSecondaryHex: 0x1a355c,
      metalTrimHex: 0xc2dff7,
      steelWhiteHex: 0xe0f2fe,
      steelBlackHex: 0x7dd3fc,
      emissiveHex: 0x0369a1,
      emissiveIntensity: 0.14,
      coatWeight: 0.65,
    },
    particles: {
      mode: 'snow',
      colorHex: 0xe0f7ff,
      size: 0.105,
      opacity: 0.72,
    },
    combatVfx: {
      selectHex: '#7dd3fc',
      quietHex: '#22d3ee',
      captureHex: '#f43f5e',
      checkHex: '#fb7185',
      slashHex: 0x7dd3fc,
      magicHex: 0x22d3ee,
      whiteShardHex: 0xd9f2ff,
      blackShardHex: 0x102340,
      trimShardHex: 0xb8dcf5,
    },
  },

  infernal: {
    id: 'infernal',
    name: 'Infernal Forge',
    shortName: 'Infernal',
    armyLabel: 'Obsidian Hellforge',
    modelSet: 'crusader',
    accentHex: '#f97316',
    accentBrightHex: '#fb923c',
    judgmentEyebrow: 'FORGE JUDGMENT',
    loadingLabel: 'Stoking the Infernal Forge...',
    environment: {
      bgHex: 0x0e0404,
      fogHex: 0x170605,
      fogDensity: 0.016,
      hemiSkyHex: 0xff8a5b,
      hemiGroundHex: 0x3a0f07,
      hemiIntensity: 0.55,
      keyHex: 0xffb380,
      keyIntensity: 2.05,
      rimHex: 0xff3b1f,
      rimIntensity: 1.2,
      zenithHex: 0xffcdb2,
      zenithIntensity: 0.3,
      envIntensity: 0.68,
      wallBaseHex: '#1f0d0c',
      wallTrimHex: 0x2e1210,
      nicheHex: 0x140706,
      columnHex: 0x291110,
      columnTrimHex: 0x1c0a09,
      floorBaseHex: '#180a09',
      roofHex: 0x0d0404,
      doorWoodHex: 0x290e0a,
      doorIronHex: 0x1a0b0a,
      windowStyle: 'magma',
      windowEmissiveHex: 0xff4512,
      beamHex: 0xff5e24,
      beamOpacity: 0.055,
    },
    brazier: {
      lightHex: 0xff3b0a,
      lightIntensity: 5.4,
      emberEmissiveHex: 0xff2200,
      outerFlameHex: 0xdc2626,
      midFlameHex: 0xff5a12,
      innerFlameHex: 0xfef08a,
      sparkHex: 0xff5514,
      pedestalHex: 0x210d0c,
      ironHex: 0x170908,
    },
    board: {
      lightSquareHex: '#DCD0C4',
      lightVeinHex: 'rgba(175, 92, 62, 0.28)',
      darkSquareHex: '#170B0B',
      darkVeinHex: 'rgba(255, 84, 24, 0.34)',
      borderBaseHex: '#0E0505',
      borderVeinHex: 'rgba(255, 96, 36, 0.80)',
      runeHex: '#FB923C',
      runeEmissiveHex: 0xff4500,
      runeEmissiveIntensity: 0.62,
      bezelHex: 0xc25e28,
      daisHex: 0x1c0a09,
      mortarHex: 0x3b1208,
      runeStyle: 'futhark',
    },
    pieces: {
      overrideColors: true,
      whitePrimaryHex: 0xe3d2be,
      whiteSecondaryHex: 0xb89c84,
      blackPrimaryHex: 0x150a0a,
      blackSecondaryHex: 0x3d1410,
      metalTrimHex: 0xd96b27,
      steelWhiteHex: 0xfdba74,
      steelBlackHex: 0xef4444,
      emissiveHex: 0x7c1d05,
      emissiveIntensity: 0.22,
    },
    particles: {
      mode: 'embers',
      colorHex: 0xff6b24,
      size: 0.11,
      opacity: 0.85,
    },
    combatVfx: {
      selectHex: '#fb923c',
      quietHex: '#f59e0b',
      captureHex: '#ff2a2a',
      checkHex: '#ff1e1e',
      slashHex: 0xff6b1a,
      magicHex: 0xef4444,
      whiteShardHex: 0xdccbb8,
      blackShardHex: 0x240b0a,
      trimShardHex: 0xe06a28,
    },
  },

  astral: {
    id: 'astral',
    name: 'Astral Observatory',
    shortName: 'Astral',
    armyLabel: 'Celestial Archons',
    modelSet: 'astral',
    accentHex: '#a855f7',
    accentBrightHex: '#c084fc',
    judgmentEyebrow: 'CELESTIAL VERDICT',
    loadingLabel: 'Aligning Astral Constellations...',
    environment: {
      bgHex: 0x060512,
      fogHex: 0x0a071d,
      fogDensity: 0.014,
      hemiSkyHex: 0xc4b5fd,
      hemiGroundHex: 0x181036,
      hemiIntensity: 0.64,
      keyHex: 0xede9fe,
      keyIntensity: 2.1,
      rimHex: 0xa855f7,
      rimIntensity: 1.15,
      zenithHex: 0x38bdf8,
      zenithIntensity: 0.42,
      envIntensity: 0.8,
      wallBaseHex: '#120f26',
      wallTrimHex: 0x221b45,
      nicheHex: 0x0a0817,
      columnHex: 0x1e193d,
      columnTrimHex: 0x3b2c70,
      floorBaseHex: '#0d0b1e',
      roofHex: 0x05040f,
      doorWoodHex: 0x1b1638,
      doorIronHex: 0x6b5bb8,
      windowStyle: 'nebula',
      windowEmissiveHex: 0xa855f7,
      beamHex: 0xc084fc,
      beamOpacity: 0.055,
    },
    brazier: {
      lightHex: 0xa855f7,
      lightIntensity: 4.9,
      emberEmissiveHex: 0x9333ea,
      outerFlameHex: 0x7e22ce,
      midFlameHex: 0xa855f7,
      innerFlameHex: 0x67e8f9,
      sparkHex: 0xc084fc,
      pedestalHex: 0x1a1533,
      ironHex: 0x261f47,
    },
    board: {
      lightSquareHex: '#EAE8F7',
      lightVeinHex: 'rgba(139, 92, 246, 0.24)',
      darkSquareHex: '#100E24',
      darkVeinHex: 'rgba(168, 85, 247, 0.30)',
      borderBaseHex: '#080716',
      borderVeinHex: 'rgba(192, 132, 252, 0.72)',
      runeHex: '#D8B4FE',
      runeEmissiveHex: 0xa855f7,
      runeEmissiveIntensity: 0.56,
      bezelHex: 0xd4af37,
      daisHex: 0x120e29,
      mortarHex: 0x19123b,
      runeStyle: 'astral',
    },
    pieces: {
      overrideColors: false,
      whitePrimaryHex: 0xf1effa,
      whiteSecondaryHex: 0xa78bfa,
      blackPrimaryHex: 0x110e24,
      blackSecondaryHex: 0x3b2868,
      metalTrimHex: 0xe0bc54,
      steelWhiteHex: 0x7dd3fc,
      steelBlackHex: 0xc084fc,
    },
    particles: {
      mode: 'stars',
      colorHex: 0xd8b4fe,
      size: 0.1,
      opacity: 0.72,
    },
    combatVfx: {
      selectHex: '#c084fc',
      quietHex: '#38bdf8',
      captureHex: '#f43f5e',
      checkHex: '#f43f5e',
      slashHex: 0xc084fc,
      magicHex: 0x38bdf8,
      whiteShardHex: 0xeae6fa,
      blackShardHex: 0x14102b,
      trimShardHex: 0xe0bc54,
    },
  },
};
