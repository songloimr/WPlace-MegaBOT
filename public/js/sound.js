/* Sound */
let audioCtx = null;

function ensureAudioCtx() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx && audioCtx.state === 'suspended') { try { audioCtx.resume(); } catch { } }
    } catch { }
    return audioCtx;
}

function playNotifySound() {
    if (!soundEnabled) return;
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    try { ctx.resume(); } catch { }
    const now = ctx.currentTime;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);
    const targetVol = Math.max(0.0001, soundVolume * 0.8);
    masterGain.gain.exponentialRampToValueAtTime(targetVol, now + 0.02);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
    masterGain.connect(ctx.destination);

    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.14;
    const feedback = ctx.createGain(); feedback.gain.value = 0.25;
    const delayMix = ctx.createGain(); delayMix.gain.value = 0.35;
    delay.connect(feedback); feedback.connect(delay);
    delay.connect(delayMix); delayMix.connect(masterGain);

    function makeVoice(frequencyHz, startOffsetSec, durationSec) {
        const startAt = now + startOffsetSec;
        const stopAt = startAt + durationSec;

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequencyHz * 0.995, startAt);
        osc.frequency.linearRampToValueAtTime(frequencyHz, startAt + 0.08);

        const overtone = ctx.createOscillator();
        overtone.type = 'triangle';
        overtone.frequency.value = frequencyHz * 2;
        overtone.detune.value = 3;

        const vibrato = ctx.createOscillator();
        vibrato.type = 'sine';
        vibrato.frequency.value = 6;
        const vibratoGain = ctx.createGain();
        vibratoGain.gain.value = frequencyHz * 0.015;
        vibrato.connect(vibratoGain);
        vibratoGain.connect(osc.frequency);

        const voiceGain = ctx.createGain();
        voiceGain.gain.setValueAtTime(0.0001, startAt);
        voiceGain.gain.exponentialRampToValueAtTime(targetVol, startAt + 0.03);
        voiceGain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

        osc.connect(voiceGain);
        const overtoneGain = ctx.createGain(); overtoneGain.gain.value = 0.22;
        overtone.connect(overtoneGain); overtoneGain.connect(voiceGain);

        const dry = ctx.createGain(); dry.gain.value = 1.0;
        voiceGain.connect(dry); dry.connect(masterGain);
        const wetSend = ctx.createGain(); wetSend.gain.value = 0.55;
        voiceGain.connect(wetSend); wetSend.connect(delay);

        osc.start(startAt);
        overtone.start(startAt);
        vibrato.start(startAt);
        vibrato.stop(stopAt);
        overtone.stop(stopAt);
        osc.stop(stopAt + 0.01);
    }

    makeVoice(659.25, 0.00, 0.50);
    makeVoice(987.77, 0.09, 0.50);
    makeVoice(1318.51, 0.18, 0.65);

    try {
        const noiseDur = 0.18;
        const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * noiseDur), ctx.sampleRate);
        const ch = noiseBuf.getChannelData(0);
        for (let i = 0; i < ch.length; i++) {
            const t = i / ch.length;
            ch[i] = (Math.random() * 2 - 1) * (1 - t) * (1 - t) * 0.5;
        }
        const noise = ctx.createBufferSource(); noise.buffer = noiseBuf;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 4200; bp.Q.value = 1.1;
        const ng = ctx.createGain(); ng.gain.value = targetVol * 0.18;
        noise.connect(bp); bp.connect(ng); ng.connect(masterGain);
        noise.start(now);
        noise.stop(now + noiseDur);
    } catch { }
}

function updateSoundUi() {
    try {
        if (soundVolumeEl) {
            const percent = Math.round(soundVolume * 100);
            try { soundVolumeEl.setAttribute('aria-valuenow', String(percent)); } catch { }
            try {
                const fill = soundVolumeEl.querySelector('.slider-fill');
                const thumb = soundVolumeEl.querySelector('.slider-thumb');
                if (fill) fill.style.height = percent + '%';
                if (thumb) thumb.style.bottom = percent + '%';
            } catch { }
        }
        if (soundVolumeValue) soundVolumeValue.textContent = Math.round(soundVolume * 100) + '%';
        if (soundToggleBtn) {
            soundToggleBtn.classList.toggle('muted', !soundEnabled || soundVolume === 0);
            soundToggleBtn.textContent = (!soundEnabled || soundVolume === 0) ? '🔇' : (soundVolume < 0.5 ? '🔈' : '🔊');
            soundToggleBtn.setAttribute('aria-pressed', soundEnabled ? 'true' : 'false');
        }
    } catch { }
}

function setSoundEnabled(v) {
    soundEnabled = !!v;
    try { localStorage.setItem('sound.enabled', soundEnabled ? 'true' : 'false'); } catch { }
    updateSoundUi();
}

function setSoundVolume(v) {
    const n = Number(v);
    if (!isNaN(n)) {
        const normalized = n > 1 ? (n / 100) : n;
        soundVolume = Math.min(1, Math.max(0, normalized));
        try { localStorage.setItem('sound.volume', String(soundVolume)); } catch { }
        updateSoundUi();
    }
}

if (soundToggleBtn) {
    soundToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isZero = soundVolume === 0;
        if (isZero) {
            setSoundEnabled(true);
            setSoundVolume(1);
            try { ensureAudioCtx(); } catch { }
        } else {
            setSoundVolume(0);
        }
    });
    soundToggleBtn.addEventListener('mouseenter', () => {
        const sc = document.getElementById('sound-control');
        if (sc) sc.classList.add('open');
    });
    soundToggleBtn.addEventListener('mouseleave', (e) => {
        const sc = document.getElementById('sound-control');
        if (!sc) return;
        const to = e && e.relatedTarget ? e.relatedTarget : null;
        if (to && sc.contains(to)) return;
        setTimeout(() => { if (!sc.matches(':hover')) sc.classList.remove('open'); }, 120);
    });
    soundToggleBtn.addEventListener('auxclick', (e) => {
        if (e && e.button === 1) { e.preventDefault(); setSoundEnabled(!soundEnabled); updateSoundUi(); }
    });
}

if (soundVolumeEl) {
    let isDraggingVol = false;
    const onMove = (clientY) => {
        const rect = soundVolumeEl.getBoundingClientRect();
        const y = Math.min(Math.max(clientY - rect.top, 0), rect.height);
        const ratio = 1 - (y / rect.height);
        setSoundVolume(ratio);
        if (soundEnabled) { try { ensureAudioCtx(); } catch { } }
    };
    soundVolumeEl.addEventListener('pointerdown', (e) => {
        isDraggingVol = true;
        try { soundVolumeEl.setPointerCapture(e.pointerId); } catch { }
        onMove(e.clientY);
        const sc = document.getElementById('sound-control');
        if (sc) sc.classList.add('open');
    });
    soundVolumeEl.addEventListener('pointermove', (e) => {
        if (!isDraggingVol) return;
        onMove(e.clientY);
    });
    const endDrag = () => {
        if (!isDraggingVol) return;
        isDraggingVol = false;
        const sc = document.getElementById('sound-control');
        setTimeout(() => { if (sc && !sc.matches(':hover')) sc.classList.remove('open'); }, 200);
    };
    soundVolumeEl.addEventListener('pointerup', endDrag);
    soundVolumeEl.addEventListener('pointercancel', endDrag);
    soundVolumeEl.addEventListener('mouseleave', () => {
        const sc = document.getElementById('sound-control');
        setTimeout(() => { if (sc && !sc.matches(':hover')) sc.classList.remove('open'); }, 200);
    });
}

document.addEventListener('click', (e) => {
    const sc = document.getElementById('sound-control');
    if (!sc) return;
    if (sc.contains(e.target)) return;
    sc.classList.remove('open');
});

updateSoundUi();
