import { THEMES, THEME_ORDER } from '../themes';
import type {
  AIDifficulty,
  CameraPreset,
  GameMode,
  GameSettings,
  GameSnapshot,
  MusicSourceMode,
  PieceColor,
  PieceStylePreference,
  PieceType,
  ThemeId,
} from '../types';

export interface HudCallbacks {
  onNewGame: () => void;
  onFlipSide: () => void;
  onRequestAIMove: () => void;
  onChangeSettings: (patch: Partial<GameSettings>) => void;
  onUndo: () => void;
  onLoadPresetFen?: (fen: string) => void;
  onSubmitMove?: (notation: string) => void;
}

const PROMOTION_OPTIONS: ReadonlyArray<{ type: PieceType; label: string }> = [
  { type: 'q', label: 'Queen' },
  { type: 'r', label: 'Rook' },
  { type: 'b', label: 'Bishop' },
  { type: 'n', label: 'Knight' },
];

const SVG_ATTRS =
  'class="hud-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

const ICON_LOBBY = `<svg ${SVG_ATTRS}><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="9" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/></svg>`;

const ICON_FLIP = `<svg ${SVG_ATTRS}><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>`;

const ICON_AI = `<svg ${SVG_ATTRS}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;

const ICON_NEW_GAME = `<svg ${SVG_ATTRS}><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>`;

const ICON_CAMERA_ORBIT = `<svg ${SVG_ATTRS}><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/></svg>`;

const ICON_CAMERA_TOPDOWN = `<svg ${SVG_ATTRS}><rect x="3" y="3" width="7.5" height="7.5" rx="1"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1"/></svg>`;

const ICON_SOUND_ON = `<svg ${SVG_ATTRS}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;

const ICON_SOUND_OFF = `<svg ${SVG_ATTRS}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>`;

const ICON_CLOSE = `<svg ${SVG_ATTRS}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

const ICON_UNDO = `<svg ${SVG_ATTRS}><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>`;

const ICON_REALM = `<svg ${SVG_ATTRS}><polygon points="12 2 15.5 8.5 22 12 15.5 15.5 12 22 8.5 15.5 2 12 8.5 8.5 12 2"/></svg>`;

const ICON_MUSIC_ON = `<svg ${SVG_ATTRS}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;

const ICON_MUSIC_OFF = `<svg ${SVG_ATTRS}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/><line x1="3" y1="3" x2="21" y2="21"/></svg>`;

const SVG_CROWN = `<svg viewBox="0 0 48 36" fill="none" aria-hidden="true">
  <path d="M6 27L4 11l10.5 7.5L24 6l9.5 12.5L44 11l-2 16H6z" fill="rgba(212, 175, 55, 0.16)" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M8 31h32" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  <circle cx="24" cy="4.5" r="1.5" fill="currentColor"/>
  <circle cx="4" cy="9.5" r="1.3" fill="currentColor"/>
  <circle cx="44" cy="9.5" r="1.3" fill="currentColor"/>
</svg>`;

const SVG_DIAMOND = `<svg class="judgment-diamond" viewBox="0 0 12 12" fill="none" aria-hidden="true">
  <polygon points="6,1 11,6 6,11 1,6" stroke="currentColor" stroke-width="1.4" fill="rgba(212, 175, 55, 0.25)"/>
</svg>`;

const SVG_CORNER = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M2 15V2h13" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/>
  <path d="M6 11V6h5" stroke="currentColor" stroke-width="1.2" stroke-opacity="0.7"/>
</svg>`;

function renderPromotionPieceSvg(type: PieceType, color: PieceColor): string {
  const fill = color === 'w' ? '#EFE8DD' : '#161923';
  const stroke = color === 'w' ? '#2A2F40' : '#D4AF37';
  const accent = '#D4AF37';

  switch (type) {
    case 'q':
      return `<svg class="promo-piece-svg" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <path d="M9 30h22l2-14-7 5-6-10-6 10-7-5 2 14z" fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round"/>
        <rect x="9" y="32" width="22" height="3.5" rx="1" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>
        <circle cx="7" cy="14" r="1.8" fill="${accent}"/>
        <circle cx="20" cy="8.5" r="2" fill="${accent}"/>
        <circle cx="33" cy="14" r="1.8" fill="${accent}"/>
      </svg>`;
    case 'r':
      return `<svg class="promo-piece-svg" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <path d="M11 9h4v4h3V9h4v4h3V9h4v8l-2.5 2.5V30h-13V19.5L11 17V9z" fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round"/>
        <rect x="9" y="32" width="22" height="3.5" rx="1" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>
        <line x1="13.5" y1="22" x2="26.5" y2="22" stroke="${accent}" stroke-width="1.3"/>
      </svg>`;
    case 'b':
      return `<svg class="promo-piece-svg" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <circle cx="20" cy="7.5" r="2" fill="${accent}"/>
        <path d="M20 10c-5.5 3.8-7 9.5-5.5 14.5l-2 5.5h15l-2-5.5C27 19.5 25.5 13.8 20 10z" fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round"/>
        <path d="M20 16v6M17 19h6" stroke="${accent}" stroke-width="1.5" stroke-linecap="round"/>
        <rect x="9" y="32" width="22" height="3.5" rx="1" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>
      </svg>`;
    case 'n':
    default:
      return `<svg class="promo-piece-svg" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <path d="M12 30l2.5-9.5L10 21l-1.5-3.5L15 11l1.5-4 4 2.5c5.5 1.5 9.5 6.5 9.5 13.5V30H12z" fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round"/>
        <circle cx="15" cy="14" r="1.3" fill="${accent}"/>
        <rect x="9" y="32" width="22" height="3.5" rx="1" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>
      </svg>`;
  }
}

export class HudOverlay {
  private readonly container: HTMLElement;
  private readonly callbacks: HudCallbacks;

  private settings: GameSettings;
  private snapshot: GameSnapshot | null = null;
  private aiThinking = false;
  private lobbyOpen = false;
  private pendingPromotionResolve: ((choice: PieceType) => void) | null = null;

  // Loading elements
  private loadingEl!: HTMLElement;
  private loadingFillEl!: HTMLElement;
  private loadingLabelEl!: HTMLElement;
  private loadingPercentEl!: HTMLElement;

  // Top-left elements
  private turnDotEl!: HTMLElement;
  private turnLabelEl!: HTMLElement;
  private modeBadgeEl!: HTMLElement;

  // Top-right elements
  private themeCycleBtnEl!: HTMLButtonElement;
  private themeLabelEl!: HTMLElement;
  private flipBtnEl!: HTMLButtonElement;
  private flipLabelEl!: HTMLElement;
  private aiMoveBtnEl!: HTMLButtonElement;
  private cameraBtnEl!: HTMLButtonElement;
  private musicBtnEl!: HTMLButtonElement;
  private soundBtnEl!: HTMLButtonElement;

  // Bottom-center elements
  private capturedEl!: HTMLElement;

  // Judgment modal elements
  private judgmentBackdropEl!: HTMLElement;
  private judgmentEyebrowTextEl!: HTMLElement;
  private judgmentHeadlineEl!: HTMLElement;
  private judgmentSubtitleEl!: HTMLElement;

  // Lobby modal elements
  private lobbyBackdropEl!: HTMLElement;
  private themeButtons!: NodeListOf<HTMLButtonElement>;
  private pieceStyleButtons!: NodeListOf<HTMLButtonElement>;
  private modeButtons!: NodeListOf<HTMLButtonElement>;
  private difficultyButtons!: NodeListOf<HTMLButtonElement>;
  private sideButtons!: NodeListOf<HTMLButtonElement>;
  private cameraButtons!: NodeListOf<HTMLButtonElement>;
  private musicSourceButtons!: NodeListOf<HTMLButtonElement>;
  private battleCamSwitchEl!: HTMLButtonElement;
  private musicSwitchEl!: HTMLButtonElement;
  private soundSwitchEl!: HTMLButtonElement;
  private historyCountEl!: HTMLElement;
  private historyListEl!: HTMLElement;
  private undoBtnEl!: HTMLButtonElement;
  private moveCmdInputEl!: HTMLInputElement;
  private moveCmdSubmitEl!: HTMLButtonElement;
  private presetButtons!: NodeListOf<HTMLButtonElement>;

  // Promotion modal elements
  private promoBackdropEl!: HTMLElement;
  private promoSubtitleEl!: HTMLElement;
  private promoGridEl!: HTMLElement;

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.lobbyOpen) {
      this.closeLobby();
    }
  };

  constructor(
    container: HTMLElement,
    initialSettings: GameSettings,
    callbacks: HudCallbacks,
  ) {
    this.container = container;
    this.settings = { ...initialSettings };
    this.callbacks = callbacks;

    this.mountDOM();
    this.bindEvents();
    this.syncSettingsUI();
    window.addEventListener('keydown', this.onKeyDown);
  }

  public setLoadingProgress(percent: number, label: string): void {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    this.loadingEl.classList.remove('is-hidden');
    this.loadingEl.setAttribute('aria-hidden', 'false');
    this.loadingFillEl.style.width = `${clamped}%`;
    this.loadingPercentEl.textContent = `${clamped}%`;
    this.loadingLabelEl.textContent = label;
  }

  public hideLoading(): void {
    this.loadingEl.classList.add('is-hidden');
    this.loadingEl.setAttribute('aria-hidden', 'true');
  }

  public updateFromSnapshot(
    snapshot: GameSnapshot,
    settings: GameSettings,
    aiThinking: boolean,
  ): void {
    this.snapshot = snapshot;
    this.settings = { ...settings };
    this.aiThinking = aiThinking;

    if (!snapshot.isGameOver) {
      this.hideJudgmentModal();
    }

    this.syncStatusPill(snapshot, settings, aiThinking);
    this.syncSettingsUI();
    this.syncCapturedBar(snapshot);
    this.syncMoveHistory(snapshot);
  }

  public showJudgmentModal(snapshot: GameSnapshot): void {
    this.judgmentEyebrowTextEl.textContent = THEMES[this.settings.theme].judgmentEyebrow;
    if (snapshot.isCheckmate) {
      this.judgmentHeadlineEl.textContent = 'CHECKMATE';
      if (snapshot.winner === 'w') {
        this.judgmentSubtitleEl.textContent =
          'WHITE TRIUMPHS • THE BLACK KING HAS FALLEN';
      } else if (snapshot.winner === 'b') {
        this.judgmentSubtitleEl.textContent =
          'BLACK TRIUMPHS • THE WHITE KING HAS FALLEN';
      } else {
        this.judgmentSubtitleEl.textContent =
          'MATCH DECIDED • THE SOVEREIGN HAS FALLEN';
      }
    } else if (snapshot.isStalemate) {
      this.judgmentHeadlineEl.textContent = 'STALEMATE';
      this.judgmentSubtitleEl.textContent =
        'HONORABLE DRAW • NO LEGAL MOVES REMAIN';
    } else {
      this.judgmentHeadlineEl.textContent = 'DRAW';
      this.judgmentSubtitleEl.textContent =
        'HONORABLE DRAW • NO LEGAL MOVES REMAIN';
    }

    this.judgmentBackdropEl.classList.remove('is-hidden');
    this.judgmentBackdropEl.setAttribute('aria-hidden', 'false');
  }

  public hideJudgmentModal(): void {
    this.judgmentBackdropEl.classList.add('is-hidden');
    this.judgmentBackdropEl.setAttribute('aria-hidden', 'true');
  }

  public promptPromotion(color: PieceColor): Promise<PieceType> {
    if (this.pendingPromotionResolve) {
      this.pendingPromotionResolve('q');
      this.pendingPromotionResolve = null;
    }

    const sideName = color === 'w' ? 'White' : 'Black';
    this.promoSubtitleEl.textContent = `Choose an ascended piece for ${sideName}`;
    this.promoGridEl.innerHTML = PROMOTION_OPTIONS.map(
      ({ type, label }) => `
        <button type="button" class="promo-btn" data-promo-piece="${type}">
          ${renderPromotionPieceSvg(type, color)}
          <span>${label}</span>
        </button>
      `,
    ).join('');

    this.promoBackdropEl.classList.remove('is-hidden');
    this.promoBackdropEl.setAttribute('aria-hidden', 'false');

    return new Promise<PieceType>((resolve) => {
      this.pendingPromotionResolve = resolve;
    });
  }

  public openLobby(): void {
    this.lobbyOpen = true;
    this.lobbyBackdropEl.classList.remove('is-hidden');
    this.lobbyBackdropEl.setAttribute('aria-hidden', 'false');
    this.syncSettingsUI();
    if (this.snapshot) {
      this.syncMoveHistory(this.snapshot);
    }
  }

  public closeLobby(): void {
    this.lobbyOpen = false;
    this.lobbyBackdropEl.classList.add('is-hidden');
    this.lobbyBackdropEl.setAttribute('aria-hidden', 'true');
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    if (this.pendingPromotionResolve) {
      this.pendingPromotionResolve('q');
      this.pendingPromotionResolve = null;
    }
  }

  private mountDOM(): void {
    this.container.innerHTML = `
      <div class="sanctum-loading" data-role="loading" aria-hidden="false">
        <div class="loading-frame">
          <div class="loading-emblem">${SVG_CROWN}</div>
          <h1 class="loading-title">WIZARD CHESS</h1>
          <div class="loading-track">
            <div class="loading-fill" data-role="loading-fill"></div>
          </div>
          <div class="loading-meta">
            <span data-role="loading-label">Loading 3D Sanctum...</span>
            <span class="loading-percent" data-role="loading-percent">0%</span>
          </div>
        </div>
      </div>

      <header class="hud-top-left" aria-label="Match Status">
        <span class="hud-brand">WIZARD CHESS</span>
        <span class="hud-divider" aria-hidden="true"></span>
        <div class="hud-status">
          <span class="turn-dot is-white" data-role="turn-dot" aria-hidden="true"></span>
          <span class="turn-label" data-role="turn-label">White to Move</span>
        </div>
        <span class="hud-divider" aria-hidden="true"></span>
        <span class="hud-mode-badge" data-role="mode-badge">Single Player • You: White</span>
      </header>

      <nav class="hud-top-right" aria-label="Game Controls">
        <button type="button" class="hud-btn" data-action="lobby">
          ${ICON_LOBBY}
          <span>Lobby</span>
        </button>
        <button type="button" class="hud-btn" data-action="cycle-theme" title="Cycle Realm Theme">
          ${ICON_REALM}
          <span data-role="theme-label">Gothic</span>
        </button>
        <button type="button" class="hud-btn" data-action="flip-side">
          ${ICON_FLIP}
          <span data-role="flip-label">Play as Black</span>
        </button>
        <button type="button" class="hud-btn" data-action="ai-move">
          ${ICON_AI}
          <span>AI Move</span>
        </button>
        <button type="button" class="hud-btn" data-action="new-game">
          ${ICON_NEW_GAME}
          <span>New Game</span>
        </button>
        <span class="hud-divider" aria-hidden="true"></span>
        <button
          type="button"
          class="hud-btn hud-icon-btn"
          data-action="camera-toggle"
          title="Camera: Sanctum Orbit (Switch to Top-Down)"
          aria-label="Toggle Camera View"
        >
          ${ICON_CAMERA_ORBIT}
        </button>
        <button
          type="button"
          class="hud-btn hud-icon-btn"
          data-action="music-toggle"
          title="Music: On (Mute)"
          aria-label="Toggle Background Music"
        >
          ${ICON_MUSIC_ON}
        </button>
        <button
          type="button"
          class="hud-btn hud-icon-btn"
          data-action="sound-toggle"
          title="Audio: On (Mute)"
          aria-label="Toggle Sound"
        >
          ${ICON_SOUND_ON}
        </button>
      </nav>

      <footer class="hud-bottom-bar" aria-label="Controls and Capture Counter">
        <span class="hud-hint">Select a piece to view legal moves • Drag to orbit • Scroll to zoom</span>
        <span class="hud-divider" aria-hidden="true"></span>
        <span class="hud-captured" data-role="captured-text">Captured — White: 0 | Black: 0</span>
      </footer>

      <div class="modal-backdrop is-hidden" data-role="judgment-backdrop" aria-hidden="true">
        <section class="judgment-plaque" role="dialog" aria-modal="true" aria-labelledby="judgment-headline">
          <div class="judgment-inner-frame" aria-hidden="true"></div>
          <span class="judgment-corner judgment-corner--tl">${SVG_CORNER}</span>
          <span class="judgment-corner judgment-corner--tr">${SVG_CORNER}</span>
          <span class="judgment-corner judgment-corner--br">${SVG_CORNER}</span>
          <span class="judgment-corner judgment-corner--bl">${SVG_CORNER}</span>
          <button
            type="button"
            class="modal-close-btn judgment-close"
            data-action="judgment-close"
            aria-label="Dismiss Judgment"
            title="Inspect Board"
          >
            ${ICON_CLOSE}
          </button>
          <div class="judgment-eyebrow">
            ${SVG_DIAMOND}
            <span data-role="judgment-eyebrow-text">SANCTUM JUDGMENT</span>
            ${SVG_DIAMOND}
          </div>
          <div class="judgment-crown">${SVG_CROWN}</div>
          <h2 class="judgment-headline" id="judgment-headline" data-role="judgment-headline">CHECKMATE</h2>
          <p class="judgment-subtitle" data-role="judgment-subtitle">WHITE TRIUMPHS • THE BLACK KING HAS FALLEN</p>
          <div class="judgment-actions">
            <button type="button" class="btn-primary-gold" data-action="judgment-new-game">New Game</button>
            <button type="button" class="btn-secondary" data-action="judgment-lobby">Lobby</button>
          </div>
        </section>
      </div>

      <div class="modal-backdrop is-hidden" data-role="lobby-backdrop" aria-hidden="true">
        <section class="lobby-panel" role="dialog" aria-modal="true" aria-labelledby="lobby-title">
          <div class="modal-header">
            <h2 class="modal-title" id="lobby-title">SANCTUM LOBBY</h2>
            <button
              type="button"
              class="modal-close-btn"
              data-action="lobby-close"
              aria-label="Close Lobby"
            >
              ${ICON_CLOSE}
            </button>
          </div>

          <div class="lobby-body">
            <div class="lobby-settings">
              <div class="field-group">
                <span class="field-label">Realm &amp; 3D Army</span>
                <div class="theme-grid" role="group" aria-label="Realm Theme">
                  ${THEME_ORDER.map((id) => {
                    const t = THEMES[id];
                    return `
                      <button type="button" class="theme-card-btn" data-setting-theme="${id}">
                        <span class="theme-card-head">
                          <span class="theme-swatch" style="background:${t.accentHex}"></span>
                          <span class="theme-card-name">${t.name}</span>
                        </span>
                        <span class="theme-card-army">${t.armyLabel}</span>
                      </button>
                    `;
                  }).join('')}
                </div>
              </div>

              <div class="field-group">
                <span class="field-label">Game Mode</span>
                <div class="seg-group" role="group" aria-label="Game Mode">
                  <button type="button" class="seg-btn" data-setting-mode="ai">Single Player vs AI</button>
                  <button type="button" class="seg-btn" data-setting-mode="pass-and-play">Pass &amp; Play</button>
                </div>
              </div>

              <div class="field-group">
                <span class="field-label">AI Difficulty</span>
                <div class="seg-group" role="group" aria-label="AI Difficulty">
                  <button type="button" class="seg-btn" data-setting-difficulty="novice">Novice</button>
                  <button type="button" class="seg-btn" data-setting-difficulty="adept">Adept</button>
                  <button type="button" class="seg-btn" data-setting-difficulty="grandmaster">Grandmaster</button>
                </div>
              </div>

              <div class="field-group">
                <span class="field-label">Play As</span>
                <div class="seg-group" role="group" aria-label="Play As">
                  <button type="button" class="seg-btn" data-setting-side="w">White</button>
                  <button type="button" class="seg-btn" data-setting-side="b">Black</button>
                </div>
              </div>

              <div class="field-group">
                <span class="field-label">Camera Angle</span>
                <div class="seg-group" role="group" aria-label="Camera Angle">
                  <button type="button" class="seg-btn" data-setting-camera="player">Sanctum Orbit</button>
                  <button type="button" class="seg-btn" data-setting-camera="top-down">Tactical Top-Down</button>
                </div>
              </div>

              <div class="field-group">
                <span class="field-label">Music Score</span>
                <div class="seg-group" role="group" aria-label="Music Score">
                  <button type="button" class="seg-btn" data-setting-music-source="auto">Auto</button>
                  <button type="button" class="seg-btn" data-setting-music-source="theme-synth">Realm Score</button>
                  <button type="button" class="seg-btn" data-setting-music-source="video-ost">Video OST</button>
                </div>
              </div>

              <div class="toggle-list">
                <div class="toggle-row">
                  <span class="toggle-title">Battle Camera Swoop</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked="true"
                    class="switch-btn"
                    data-action="toggle-battle-cam"
                    aria-label="Battle Camera Swoop"
                  >
                    <span class="switch-thumb"></span>
                  </button>
                </div>
                <div class="toggle-row">
                  <span class="toggle-title">Background Music</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked="true"
                    class="switch-btn"
                    data-action="toggle-music-lobby"
                    aria-label="Background Music"
                  >
                    <span class="switch-thumb"></span>
                  </button>
                </div>
                <div class="toggle-row">
                  <span class="toggle-title">Sanctum Audio (SFX &amp; Master)</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked="true"
                    class="switch-btn"
                    data-action="toggle-sound-lobby"
                    aria-label="Sanctum Audio"
                  >
                    <span class="switch-thumb"></span>
                  </button>
                </div>
              </div>

              <div class="field-group">
                <span class="field-label">3D Piece Sculpt</span>
                <div class="seg-group piece-style-grid" role="group" aria-label="Piece Sculpt">
                  <button type="button" class="seg-btn is-active" data-setting-piece-style="theme-default">
                    Realm Default
                  </button>
                  <button type="button" class="seg-btn" data-setting-piece-style="sovereign">
                    Sovereign
                  </button>
                  <button type="button" class="seg-btn" data-setting-piece-style="crusader">
                    Crusader
                  </button>
                  <button type="button" class="seg-btn" data-setting-piece-style="samurai">
                    Samurai
                  </button>
                  <button type="button" class="seg-btn" data-setting-piece-style="pharaoh">
                    Pharaoh
                  </button>
                  <button type="button" class="seg-btn" data-setting-piece-style="astral">
                    Astral
                  </button>
                </div>
              </div>

              <div class="field-group">
                <span class="field-label">Tactical Presets</span>
                <div class="preset-row" role="group" aria-label="Tactical Presets">
                  <button
                    type="button"
                    class="preset-btn"
                    data-preset-fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
                  >
                    Standard Position
                  </button>
                  <button
                    type="button"
                    class="preset-btn"
                    data-preset-fen="r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4"
                  >
                    Scholar's Mate in 1
                  </button>
                </div>
              </div>
            </div>

            <div class="lobby-history">
              <div class="history-header">
                <span class="field-label">Move History</span>
                <span class="history-count" data-role="history-count">0 moves</span>
              </div>
              <div class="history-list" data-role="history-list">
                <div class="history-empty">No moves recorded yet.</div>
              </div>
              <button type="button" class="btn-secondary undo-btn" data-action="undo-move" disabled>
                ${ICON_UNDO}
                <span>Undo Last Move</span>
              </button>
              <div class="field-group move-cmd-group">
                <span class="field-label">Move Command</span>
                <div class="move-cmd-row">
                  <input
                    type="text"
                    class="move-cmd-input"
                    data-role="move-cmd-input"
                    aria-label="Algebraic or Coordinate Move"
                    placeholder="e.g. e4, Qxf7#, e2e4"
                    autocomplete="off"
                    spellcheck="false"
                  />
                  <button type="button" class="btn-secondary move-cmd-btn" data-action="submit-move">
                    Play Move
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" class="btn-secondary" data-action="lobby-fresh">Start Fresh Match</button>
            <button type="button" class="btn-primary-gold" data-action="lobby-resume">Resume Match</button>
          </div>
        </section>
      </div>

      <div class="modal-backdrop modal-backdrop--promo is-hidden" data-role="promo-backdrop" aria-hidden="true">
        <section class="promotion-panel" role="dialog" aria-modal="true" aria-labelledby="promo-title">
          <h2 class="promotion-title" id="promo-title">PAWN PROMOTION</h2>
          <p class="promotion-subtitle" data-role="promo-subtitle">Choose an ascended piece</p>
          <div class="promotion-grid" data-role="promo-grid"></div>
        </section>
      </div>
    `;

    this.loadingEl = this.query('[data-role="loading"]');
    this.loadingFillEl = this.query('[data-role="loading-fill"]');
    this.loadingLabelEl = this.query('[data-role="loading-label"]');
    this.loadingPercentEl = this.query('[data-role="loading-percent"]');

    this.turnDotEl = this.query('[data-role="turn-dot"]');
    this.turnLabelEl = this.query('[data-role="turn-label"]');
    this.modeBadgeEl = this.query('[data-role="mode-badge"]');

    this.themeCycleBtnEl = this.query('[data-action="cycle-theme"]');
    this.themeLabelEl = this.query('[data-role="theme-label"]');
    this.flipBtnEl = this.query('[data-action="flip-side"]');
    this.flipLabelEl = this.query('[data-role="flip-label"]');
    this.aiMoveBtnEl = this.query('[data-action="ai-move"]');
    this.cameraBtnEl = this.query('[data-action="camera-toggle"]');
    this.musicBtnEl = this.query('[data-action="music-toggle"]');
    this.soundBtnEl = this.query('[data-action="sound-toggle"]');

    this.capturedEl = this.query('[data-role="captured-text"]');

    this.judgmentBackdropEl = this.query('[data-role="judgment-backdrop"]');
    this.judgmentEyebrowTextEl = this.query('[data-role="judgment-eyebrow-text"]');
    this.judgmentHeadlineEl = this.query('[data-role="judgment-headline"]');
    this.judgmentSubtitleEl = this.query('[data-role="judgment-subtitle"]');

    this.lobbyBackdropEl = this.query('[data-role="lobby-backdrop"]');
    this.themeButtons = this.container.querySelectorAll('[data-setting-theme]');
    this.pieceStyleButtons = this.container.querySelectorAll('[data-setting-piece-style]');
    this.modeButtons = this.container.querySelectorAll('[data-setting-mode]');
    this.difficultyButtons = this.container.querySelectorAll('[data-setting-difficulty]');
    this.sideButtons = this.container.querySelectorAll('[data-setting-side]');
    this.cameraButtons = this.container.querySelectorAll('[data-setting-camera]');
    this.musicSourceButtons = this.container.querySelectorAll('[data-setting-music-source]');
    this.battleCamSwitchEl = this.query('[data-action="toggle-battle-cam"]');
    this.musicSwitchEl = this.query('[data-action="toggle-music-lobby"]');
    this.soundSwitchEl = this.query('[data-action="toggle-sound-lobby"]');
    this.historyCountEl = this.query('[data-role="history-count"]');
    this.historyListEl = this.query('[data-role="history-list"]');
    this.undoBtnEl = this.query('[data-action="undo-move"]');
    this.moveCmdInputEl = this.query('[data-role="move-cmd-input"]');
    this.moveCmdSubmitEl = this.query('[data-action="submit-move"]');
    this.presetButtons = this.container.querySelectorAll('[data-preset-fen]');

    this.promoBackdropEl = this.query('[data-role="promo-backdrop"]');
    this.promoSubtitleEl = this.query('[data-role="promo-subtitle"]');
    this.promoGridEl = this.query('[data-role="promo-grid"]');
  }

  private bindEvents(): void {
    // Top-right actions
    this.query<HTMLButtonElement>('[data-action="lobby"]').addEventListener('click', () => {
      this.openLobby();
    });

    this.themeCycleBtnEl.addEventListener('click', () => {
      const idx = THEME_ORDER.indexOf(this.settings.theme);
      const nextTheme = THEME_ORDER[(idx + 1) % THEME_ORDER.length];
      this.applySettingsPatch({ theme: nextTheme });
    });

    this.flipBtnEl.addEventListener('click', () => {
      this.callbacks.onFlipSide();
    });

    this.aiMoveBtnEl.addEventListener('click', () => {
      this.callbacks.onRequestAIMove();
    });

    this.query<HTMLButtonElement>('[data-action="new-game"]').addEventListener('click', () => {
      this.hideJudgmentModal();
      this.callbacks.onNewGame();
    });

    this.cameraBtnEl.addEventListener('click', () => {
      const nextPreset: CameraPreset =
        this.settings.cameraPreset === 'player' ? 'top-down' : 'player';
      this.applySettingsPatch({ cameraPreset: nextPreset });
    });

    this.musicBtnEl.addEventListener('click', () => {
      this.applySettingsPatch({ musicEnabled: !this.settings.musicEnabled });
    });

    this.soundBtnEl.addEventListener('click', () => {
      this.applySettingsPatch({ soundEnabled: !this.settings.soundEnabled });
    });

    // Judgment modal actions
    this.query<HTMLButtonElement>('[data-action="judgment-new-game"]').addEventListener(
      'click',
      () => {
        this.hideJudgmentModal();
        this.callbacks.onNewGame();
      },
    );

    this.query<HTMLButtonElement>('[data-action="judgment-lobby"]').addEventListener(
      'click',
      () => {
        this.hideJudgmentModal();
        this.openLobby();
      },
    );

    this.query<HTMLButtonElement>('[data-action="judgment-close"]').addEventListener(
      'click',
      () => {
        this.hideJudgmentModal();
      },
    );

    // Lobby modal close / footer
    this.query<HTMLButtonElement>('[data-action="lobby-close"]').addEventListener('click', () => {
      this.closeLobby();
    });

    this.query<HTMLButtonElement>('[data-action="lobby-resume"]').addEventListener('click', () => {
      this.closeLobby();
    });

    this.query<HTMLButtonElement>('[data-action="lobby-fresh"]').addEventListener('click', () => {
      this.closeLobby();
      this.hideJudgmentModal();
      this.callbacks.onNewGame();
    });

    this.lobbyBackdropEl.addEventListener('click', (e) => {
      if (e.target === this.lobbyBackdropEl) {
        this.closeLobby();
      }
    });

    // Lobby setting groups
    this.themeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.settingTheme as ThemeId | undefined;
        if (theme) {
          this.applySettingsPatch({ theme });
        }
      });
    });

    this.pieceStyleButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const pieceStyle = btn.dataset.settingPieceStyle as PieceStylePreference | undefined;
        if (pieceStyle) {
          this.applySettingsPatch({ pieceStyle });
        }
      });
    });

    this.modeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.settingMode as GameMode | undefined;
        if (mode) {
          this.applySettingsPatch({ mode });
        }
      });
    });

    this.difficultyButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const difficulty = btn.dataset.settingDifficulty as AIDifficulty | undefined;
        if (difficulty) {
          this.applySettingsPatch({ difficulty });
        }
      });
    });

    this.sideButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const side = btn.dataset.settingSide as PieceColor | undefined;
        if (side) {
          this.applySettingsPatch({ playerColor: side });
        }
      });
    });

    this.cameraButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const cameraPreset = btn.dataset.settingCamera as CameraPreset | undefined;
        if (cameraPreset) {
          this.applySettingsPatch({ cameraPreset });
        }
      });
    });

    this.musicSourceButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const musicSource = btn.dataset.settingMusicSource as MusicSourceMode | undefined;
        if (musicSource) {
          this.applySettingsPatch({ musicSource });
        }
      });
    });

    this.battleCamSwitchEl.addEventListener('click', () => {
      this.applySettingsPatch({ battleCam: !this.settings.battleCam });
    });

    this.musicSwitchEl.addEventListener('click', () => {
      this.applySettingsPatch({ musicEnabled: !this.settings.musicEnabled });
    });

    this.soundSwitchEl.addEventListener('click', () => {
      this.applySettingsPatch({ soundEnabled: !this.settings.soundEnabled });
    });

    this.undoBtnEl.addEventListener('click', () => {
      this.hideJudgmentModal();
      this.callbacks.onUndo();
    });

    const submitMoveCommand = (): void => {
      const val = this.moveCmdInputEl.value.trim();
      if (!val) return;
      this.moveCmdInputEl.value = '';
      this.closeLobby();
      this.callbacks.onSubmitMove?.(val);
    };

    this.moveCmdSubmitEl.addEventListener('click', submitMoveCommand);
    this.moveCmdInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitMoveCommand();
      }
    });

    this.presetButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const fen = btn.dataset.presetFen;
        if (!fen) return;
        this.closeLobby();
        this.hideJudgmentModal();
        this.callbacks.onLoadPresetFen?.(fen);
      });
    });

    // Promotion modal delegation
    this.promoGridEl.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest<HTMLButtonElement>('[data-promo-piece]');
      if (!btn) return;
      const piece = btn.dataset.promoPiece as PieceType | undefined;
      if (!piece) return;

      this.promoBackdropEl.classList.add('is-hidden');
      this.promoBackdropEl.setAttribute('aria-hidden', 'true');

      const resolve = this.pendingPromotionResolve;
      this.pendingPromotionResolve = null;
      resolve?.(piece);
    });
  }

  private applySettingsPatch(patch: Partial<GameSettings>): void {
    this.settings = { ...this.settings, ...patch };
    this.syncSettingsUI();
    if (this.snapshot) {
      this.syncStatusPill(this.snapshot, this.settings, this.aiThinking);
    }
    this.callbacks.onChangeSettings(patch);
  }

  private syncStatusPill(
    snapshot: GameSnapshot,
    settings: GameSettings,
    aiThinking: boolean,
  ): void {
    // Dot state
    this.turnDotEl.classList.toggle('is-white', snapshot.turn === 'w');
    this.turnDotEl.classList.toggle('is-black', snapshot.turn === 'b');
    this.turnDotEl.classList.toggle('is-check', snapshot.inCheck || snapshot.isCheckmate);
    this.turnDotEl.classList.toggle('is-thinking', aiThinking && !snapshot.isGameOver);

    // Status text
    let statusText: string;
    if (snapshot.isCheckmate) {
      statusText =
        snapshot.winner === 'w' ? 'Checkmate — White Wins' : 'Checkmate — Black Wins';
    } else if (snapshot.isStalemate) {
      statusText = 'Stalemate — Draw';
    } else if (snapshot.isDraw) {
      statusText = 'Draw — Match Drawn';
    } else {
      const side = snapshot.turn === 'w' ? 'White' : 'Black';
      const base = `${side} to Move${aiThinking ? ' (AI)...' : ''}`;
      statusText = snapshot.inCheck ? `Check — ${base}` : base;
    }

    this.turnLabelEl.textContent = statusText;
    this.turnLabelEl.classList.toggle('is-check', snapshot.inCheck && !snapshot.isGameOver);

    // Mode badge
    if (settings.mode === 'pass-and-play') {
      this.modeBadgeEl.textContent = 'Pass & Play';
    } else {
      const playerSide = settings.playerColor === 'w' ? 'White' : 'Black';
      this.modeBadgeEl.textContent = `Single Player • You: ${playerSide}`;
    }

    // AI Move button disabled state
    this.aiMoveBtnEl.disabled = aiThinking || snapshot.isGameOver;
  }

  private syncSettingsUI(): void {
    const {
      mode,
      playerColor,
      difficulty,
      cameraPreset,
      battleCam,
      soundEnabled,
      theme,
      pieceStyle,
      musicEnabled,
      musicSource,
    } = this.settings;

    const themeCfg = THEMES[theme];
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--gold', themeCfg.accentHex);
    rootStyle.setProperty('--gold-bright', themeCfg.accentBrightHex);
    rootStyle.setProperty('--border-gold', `${themeCfg.accentHex}59`);
    rootStyle.setProperty('--border-gold-strong', `${themeCfg.accentHex}a6`);
    rootStyle.setProperty('--gold-dim', `${themeCfg.accentHex}1f`);

    this.themeLabelEl.textContent = themeCfg.shortName;
    this.themeCycleBtnEl.title = `Realm: ${themeCfg.name} (${themeCfg.armyLabel}) — Click to switch`;

    // Mode badge fallback when snapshot hasn't arrived yet
    if (!this.snapshot) {
      if (mode === 'pass-and-play') {
        this.modeBadgeEl.textContent = 'Pass & Play';
      } else {
        this.modeBadgeEl.textContent = `Single Player • You: ${
          playerColor === 'w' ? 'White' : 'Black'
        }`;
      }
    }

    // Flip button label
    this.flipLabelEl.textContent =
      playerColor === 'w' ? 'Play as Black' : 'Play as White';

    // Camera toggle button
    const isTopDown = cameraPreset === 'top-down';
    this.cameraBtnEl.innerHTML = isTopDown ? ICON_CAMERA_TOPDOWN : ICON_CAMERA_ORBIT;
    this.cameraBtnEl.classList.toggle('is-active', isTopDown);
    const cameraTitle = isTopDown
      ? 'Camera: Tactical Top-Down (Switch to Sanctum Orbit)'
      : 'Camera: Sanctum Orbit (Switch to Top-Down)';
    this.cameraBtnEl.title = cameraTitle;
    this.cameraBtnEl.setAttribute('aria-label', cameraTitle);

    // Music toggle button
    this.musicBtnEl.innerHTML = musicEnabled ? ICON_MUSIC_ON : ICON_MUSIC_OFF;
    this.musicBtnEl.classList.toggle('is-active', musicEnabled);
    const musicTitle = musicEnabled ? 'Background Music: On (Mute)' : 'Background Music: Off (Enable)';
    this.musicBtnEl.title = musicTitle;
    this.musicBtnEl.setAttribute('aria-label', musicTitle);

    // Sound toggle button
    this.soundBtnEl.innerHTML = soundEnabled ? ICON_SOUND_ON : ICON_SOUND_OFF;
    this.soundBtnEl.classList.toggle('is-active', false);
    const soundTitle = soundEnabled ? 'Audio: On (Mute)' : 'Audio: Muted (Unmute)';
    this.soundBtnEl.title = soundTitle;
    this.soundBtnEl.setAttribute('aria-label', soundTitle);

    // Lobby controls
    this.themeButtons.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.settingTheme === theme);
    });
    this.pieceStyleButtons.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.settingPieceStyle === pieceStyle);
    });
    this.modeButtons.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.settingMode === mode);
    });
    this.difficultyButtons.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.settingDifficulty === difficulty);
    });
    this.sideButtons.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.settingSide === playerColor);
    });
    this.cameraButtons.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.settingCamera === cameraPreset);
    });
    this.musicSourceButtons.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.settingMusicSource === musicSource);
    });

    this.battleCamSwitchEl.setAttribute('aria-checked', String(battleCam));
    this.musicSwitchEl.setAttribute('aria-checked', String(musicEnabled));
    this.soundSwitchEl.setAttribute('aria-checked', String(soundEnabled));
  }

  private syncCapturedBar(snapshot: GameSnapshot): void {
    const { blackCapturedByWhite, whiteCapturedByBlack } = snapshot.captured;
    this.capturedEl.textContent = `Captured — White: ${blackCapturedByWhite} | Black: ${whiteCapturedByBlack}`;
  }

  private syncMoveHistory(snapshot: GameSnapshot): void {
    const moves = snapshot.moveHistory;
    this.historyCountEl.textContent = `${moves.length} ${moves.length === 1 ? 'move' : 'moves'}`;
    this.undoBtnEl.disabled = moves.length === 0 || this.aiThinking;

    if (moves.length === 0) {
      this.historyListEl.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'history-empty';
      empty.textContent = 'No moves recorded yet.';
      this.historyListEl.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < moves.length; i += 2) {
      const row = document.createElement('div');
      row.className = 'history-row';

      const numSpan = document.createElement('span');
      numSpan.className = 'history-num';
      numSpan.textContent = `${Math.floor(i / 2) + 1}.`;

      const whiteSpan = document.createElement('span');
      whiteSpan.className = 'history-san';
      if (i === moves.length - 1) whiteSpan.classList.add('is-latest');
      whiteSpan.textContent = moves[i] ?? '';

      const blackSpan = document.createElement('span');
      blackSpan.className = 'history-san history-san--black';
      if (i + 1 === moves.length - 1) blackSpan.classList.add('is-latest');
      blackSpan.textContent = moves[i + 1] ?? '';

      row.append(numSpan, whiteSpan, blackSpan);
      fragment.appendChild(row);
    }

    this.historyListEl.innerHTML = '';
    this.historyListEl.appendChild(fragment);
    this.historyListEl.scrollTop = this.historyListEl.scrollHeight;
  }

  private query<T extends HTMLElement>(selector: string): T {
    const el = this.container.querySelector<T>(selector);
    if (!el) {
      throw new Error(`HudOverlay missing expected element: ${selector}`);
    }
    return el;
  }
}
