/**
 * Avatar Builder - DiceBear Integration
 * Allows students to create custom avatars using DiceBear API
 * No API key required - completely free!
 */

class AvatarBuilder {
    constructor() {
        this.baseUrl = 'https://api.dicebear.com/7.x';

        // Get redirect URL and tutor selection from query params
        const urlParams = new URLSearchParams(window.location.search);
        this.fromPage = urlParams.get('from') || 'index';
        this.preSelectedTutor = urlParams.get('tutor') || null;

        // Update back link based on where we came from
        this.updateBackLink();

        // Current avatar configuration
        this.config = {
            style: 'adventurer',
            seed: this.generateSeed(),
            skinColor: 'd08b5b',
            hairColor: '4a3728',
            backgroundColor: 'transparent',
            glasses: false,
            earrings: false,
            flip: false
        };

        // Style-specific options (which styles support which features)
        this.styleFeatures = {
            'adventurer': { skin: true, hair: true, glasses: true, earrings: true },
            'adventurer-neutral': { skin: true, hair: true, glasses: true, earrings: false },
            'big-smile': { skin: true, hair: true, glasses: false, earrings: false },
            'lorelei': { skin: true, hair: true, glasses: true, earrings: true },
            'micah': { skin: false, hair: false, glasses: false, earrings: false },
            'pixel-art': { skin: true, hair: true, glasses: true, earrings: false },
            'thumbs': { skin: false, hair: false, glasses: false, earrings: false },
            'fun-emoji': { skin: false, hair: false, glasses: false, earrings: false }
        };

        this.init();
    }

    generateSeed() {
        return Math.random().toString(36).substring(2, 10);
    }

    updateBackLink() {
        const backLink = document.getElementById('back-link');
        if (!backLink) return;

        const pageMap = {
            'pick-tutor': '/pick-tutor.html',
            'pick-avatar': '/pick-avatar.html',
            'settings': '/settings.html',
            'index': '/index.html',
            'chat': '/chat.html'
        };

        backLink.href = pageMap[this.fromPage] || '/index.html';
    }

    getRedirectUrl() {
        const pageMap = {
            'pick-tutor': '/pick-tutor.html',
            'pick-avatar': '/pick-avatar.html',
            'settings': '/settings.html',
            'index': '/index.html',
            'chat': '/chat.html'
        };

        return pageMap[this.fromPage] || '/index.html';
    }

    init() {
        this.loadSavedAvatar();
        this.setupEventListeners();
        this.updatePreview();
    }

    async loadSavedAvatar() {
        try {
            const response = await fetch('/api/avatar/config');
            if (response.ok) {
                const data = await response.json();
                this.gallery = data.gallery || [];
                this.updateGalleryStatus();

                if (data.config) {
                    this.config = { ...this.config, ...data.config };
                    this.updateUIFromConfig();
                }
            }
        } catch (error) {
            console.log('No saved avatar config found, using defaults');
            this.gallery = [];
        }
    }

    updateGalleryStatus() {
        const statusEl = document.getElementById('gallery-status');
        if (statusEl) {
            const slotsUsed = this.gallery.length;
            if (slotsUsed < 3) {
                statusEl.textContent = `${3 - slotsUsed} of 3 avatar slots available`;
                statusEl.style.color = '#28a745';
            } else {
                statusEl.textContent = 'All 3 slots full - saving will replace oldest';
                statusEl.style.color = '#ffc107';
            }
        }
    }

    /**
     * Selection state for one option in a radiogroup. Three things move
     * together or the widget lies: the class (what you see), aria-checked
     * (what a screen reader announces), and tabindex (what Tab reaches).
     *
     * The tabindex is the roving half of the pattern: exactly one option in a
     * group is tabbable, so Tab moves between GROUPS and the arrow keys move
     * within one. Twenty-three swatches that each swallow a Tab press is not
     * navigation, it is an obstacle course.
     */
    setOption(btn, on) {
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-checked', String(on));
        btn.setAttribute('tabindex', on ? '0' : '-1');
    }

    /**
     * Wire a container of role="radio" buttons as a real radiogroup.
     *
     * Selection previously lived in four near-identical blocks — clear every
     * sibling, set this one, write the config field, re-render — reachable only
     * by mouse. This is that logic once, plus the keyboard contract the ARIA
     * roles promise: arrows move focus AND selection (that is radio behaviour,
     * not listbox), Home/End jump to the ends, and both wrap.
     *
     * Space and Enter are deliberately not handled here. These are real
     * <button> elements, so the browser already turns both into a click, and
     * the delegated click listener below selects. Re-implementing that would
     * only risk diverging from it.
     *
     * @param {HTMLElement} container  the [role="radiogroup"]
     * @param {(btn: HTMLElement) => void} onSelect  side effects for this group
     */
    initRadioGroup(container, onSelect) {
        if (!container) return;
        const options = () => Array.from(container.querySelectorAll('[role="radio"]'));

        const select = (btn, { moveFocus = false } = {}) => {
            options().forEach((o) => this.setOption(o, o === btn));
            if (moveFocus) btn.focus();
            onSelect(btn);
        };

        // Delegated: the option set is static today, but randomize() and
        // updateUIFromConfig() both rewrite selection state, and a delegated
        // listener cannot go stale against them.
        container.addEventListener('click', (e) => {
            const btn = e.target.closest('[role="radio"]');
            if (btn && container.contains(btn)) select(btn);
        });

        container.addEventListener('keydown', (e) => {
            const opts = options();
            const focused = document.activeElement && document.activeElement.closest
                ? document.activeElement.closest('[role="radio"]')
                : null;
            const i = focused ? opts.indexOf(focused) : -1;
            if (i === -1) return;

            let next;
            switch (e.key) {
                case 'ArrowRight':
                case 'ArrowDown':
                    next = opts[(i + 1) % opts.length];
                    break;
                case 'ArrowLeft':
                case 'ArrowUp':
                    next = opts[(i - 1 + opts.length) % opts.length];
                    break;
                case 'Home':
                    next = opts[0];
                    break;
                case 'End':
                    next = opts[opts.length - 1];
                    break;
                default:
                    return;
            }
            // Reached only for keys handled above. Calling this any earlier
            // would swallow Tab and trap focus in the very group these arrows
            // exist to make navigable.
            e.preventDefault();
            select(next, { moveFocus: true });
        });
    }

    updateUIFromConfig() {
        // Update style selection
        document.querySelectorAll('.style-btn').forEach(btn => {
            this.setOption(btn, btn.dataset.style === this.config.style);
        });

        // Update skin color
        document.querySelectorAll('#skin-picker .color-btn').forEach(btn => {
            this.setOption(btn, btn.dataset.color === this.config.skinColor);
        });

        // Update hair color
        document.querySelectorAll('#hair-color-picker .color-btn').forEach(btn => {
            this.setOption(btn, btn.dataset.color === this.config.hairColor);
        });

        // Update background
        document.querySelectorAll('#bg-picker .color-btn').forEach(btn => {
            this.setOption(btn, btn.dataset.color === this.config.backgroundColor);
        });

        // Update toggles
        const glassesToggle = document.getElementById('glasses-toggle');
        const earringsToggle = document.getElementById('earrings-toggle');
        const flipToggle = document.getElementById('flip-toggle');

        if (glassesToggle) glassesToggle.checked = this.config.glasses;
        if (earringsToggle) earringsToggle.checked = this.config.earrings;
        if (flipToggle) flipToggle.checked = this.config.flip;

        // Update feature visibility based on style
        this.updateFeatureVisibility();
    }

    setupEventListeners() {
        // Style selection
        this.initRadioGroup(document.getElementById('style-selector'), (btn) => {
            this.config.style = btn.dataset.style;
            this.config.seed = this.generateSeed(); // New seed for new style
            this.updateFeatureVisibility();
            this.updatePreview();
        });

        // Colours. Same widget three times over, differing only in which field
        // of the config the choice writes to.
        for (const [id, field] of [
            ['skin-picker', 'skinColor'],
            ['hair-color-picker', 'hairColor'],
            ['bg-picker', 'backgroundColor'],
        ]) {
            this.initRadioGroup(document.getElementById(id), (btn) => {
                this.config[field] = btn.dataset.color;
                this.updatePreview();
            });
        }

        // Accessories toggles
        document.getElementById('glasses-toggle')?.addEventListener('change', (e) => {
            this.config.glasses = e.target.checked;
            this.updatePreview();
        });

        document.getElementById('earrings-toggle')?.addEventListener('change', (e) => {
            this.config.earrings = e.target.checked;
            this.updatePreview();
        });

        // Flip toggle
        document.getElementById('flip-toggle')?.addEventListener('change', (e) => {
            this.config.flip = e.target.checked;
            this.updatePreview();
        });

        // Randomize button
        document.getElementById('randomize-btn')?.addEventListener('click', () => {
            this.randomize();
        });

        // Save button
        document.getElementById('save-avatar-btn')?.addEventListener('click', () => {
            this.saveAvatar();
        });
    }

    updateFeatureVisibility() {
        const features = this.styleFeatures[this.config.style] || {};

        // Show/hide skin options
        const skinGroup = document.getElementById('skin-group');
        if (skinGroup) {
            skinGroup.style.display = features.skin ? 'block' : 'none';
        }

        // Show/hide hair color options
        const hairGroup = document.getElementById('hair-color-group');
        if (hairGroup) {
            hairGroup.style.display = features.hair ? 'block' : 'none';
        }

        // Show/hide accessories
        const accessoriesGroup = document.getElementById('accessories-group');
        if (accessoriesGroup) {
            const hasAnyAccessory = features.glasses || features.earrings;
            accessoriesGroup.style.display = hasAnyAccessory ? 'block' : 'none';

            // Individual toggles
            const glassesToggle = document.getElementById('glasses-toggle')?.parentElement;
            const earringsToggle = document.getElementById('earrings-toggle')?.parentElement;

            if (glassesToggle) glassesToggle.style.display = features.glasses ? 'flex' : 'none';
            if (earringsToggle) earringsToggle.style.display = features.earrings ? 'flex' : 'none';
        }
    }

    buildAvatarUrl() {
        const params = new URLSearchParams();
        params.set('seed', this.config.seed);

        // Background
        if (this.config.backgroundColor !== 'transparent') {
            params.set('backgroundColor', this.config.backgroundColor);
        }

        // Flip
        if (this.config.flip) {
            params.set('flip', 'true');
        }

        // Style-specific parameters
        const style = this.config.style;
        const features = this.styleFeatures[style] || {};

        if (features.skin && this.config.skinColor) {
            params.set('skinColor', this.config.skinColor);
        }

        if (features.hair && this.config.hairColor) {
            params.set('hairColor', this.config.hairColor);
        }

        // Glasses - different parameter names for different styles
        if (features.glasses) {
            if (this.config.glasses) {
                if (style === 'adventurer' || style === 'adventurer-neutral') {
                    params.set('glasses', 'variant01,variant02,variant03,variant04,variant05');
                    params.set('glassesProbability', '100');
                } else if (style === 'lorelei') {
                    params.set('glasses', 'variant01,variant02,variant03');
                    params.set('glassesProbability', '100');
                } else if (style === 'pixel-art') {
                    params.set('glasses', 'dark,dark2,light,light2');
                    params.set('glassesProbability', '100');
                }
            } else {
                params.set('glassesProbability', '0');
            }
        }

        // Earrings
        if (features.earrings) {
            if (this.config.earrings) {
                params.set('earrings', 'variant01,variant02,variant03,variant04,variant05,variant06');
                params.set('earringsProbability', '100');
            } else {
                params.set('earringsProbability', '0');
            }
        }

        return `${this.baseUrl}/${style}/svg?${params.toString()}`;
    }

    updatePreview() {
        const preview = document.getElementById('avatar-preview');
        if (!preview) return;

        preview.classList.add('loading');

        const url = this.buildAvatarUrl();

        // Create a new image to preload
        const img = new Image();
        img.onload = () => {
            preview.src = url;
            preview.classList.remove('loading');
        };
        img.onerror = () => {
            preview.classList.remove('loading');
            console.error('Failed to load avatar');
        };
        img.src = url;
    }

    randomize() {
        // Random style
        const styles = Object.keys(this.styleFeatures);
        this.config.style = styles[Math.floor(Math.random() * styles.length)];

        // Random seed
        this.config.seed = this.generateSeed();

        // Random skin color
        const skinColors = ['f2d3b1', 'ecad80', 'd08b5b', 'ae5d29', '694d3d'];
        this.config.skinColor = skinColors[Math.floor(Math.random() * skinColors.length)];

        // Random hair color
        const hairColors = ['090806', '4a3728', 'b58143', 'a55728', 'd6c4c2', 'cc3333', '6699ff', 'ff66cc', '9966ff', '66ff66'];
        this.config.hairColor = hairColors[Math.floor(Math.random() * hairColors.length)];

        // Random background
        const bgColors = ['transparent', 'b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf', 'd5f5e3', 'fef9c3'];
        this.config.backgroundColor = bgColors[Math.floor(Math.random() * bgColors.length)];

        // Random accessories
        this.config.glasses = Math.random() > 0.7;
        this.config.earrings = Math.random() > 0.7;
        this.config.flip = Math.random() > 0.5;

        // Update UI
        this.updateUIFromConfig();
        this.updatePreview();

        this.showToast('Randomized!', 'success');
    }

    async saveAvatar() {
        const saveBtn = document.getElementById('save-avatar-btn');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        }

        try {
            const avatarUrl = this.buildAvatarUrl();

            const response = await csrfFetch('/api/avatar/dicebear', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    config: this.config,
                    avatarUrl: avatarUrl
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to save avatar');
            }

            // Update gallery status with response
            if (data.gallery) {
                this.gallery = data.gallery;
                this.updateGalleryStatus();
            }

            const slotNum = (data.slotIndex !== undefined) ? data.slotIndex + 1 : '?';

            // If tutor was pre-selected, save that too and go straight to chat
            if (this.preSelectedTutor) {
                const tutorResponse = await csrfFetch('/api/user/settings', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        selectedTutorId: this.preSelectedTutor,
                        selectedAvatarId: `gallery-${data.slotIndex}`
                    })
                });

                if (tutorResponse.ok) {
                    this.showToast(`Avatar saved to slot ${slotNum}! Starting chat...`, 'success');
                    setTimeout(() => {
                        window.location.href = '/chat.html';
                    }, 1000);
                    return;
                }
            }

            this.showToast(`Avatar saved to slot ${slotNum}!`, 'success');

            // Redirect back to pick-avatar with flag to auto-select custom avatar
            setTimeout(() => {
                if (this.fromPage === 'pick-avatar') {
                    window.location.href = '/pick-avatar.html?avatar=custom';
                } else {
                    window.location.href = this.getRedirectUrl();
                }
            }, 1500);

        } catch (error) {
            console.error('Save error:', error);
            this.showToast('Failed to save avatar', 'error');
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Avatar';
            }
        }
    }

    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        if (!toast) return;

        toast.textContent = message;
        toast.className = `toast ${type} show`;

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.avatarBuilder = new AvatarBuilder();
});
