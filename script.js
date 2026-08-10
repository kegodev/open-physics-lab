(() => {
  'use strict';

  const CONSTANTS = Object.freeze({
    h: 6.62607015e-34,
    e: 1.602176634e-19,
    c: 299792458,
    hcEvNm: 1239.8419843320026,
    acceptedH: 6.62607015e-34
  });

  const WAVELENGTHS = [
    { nm: 365, name: 'Mercury UV', color: '#8f78ff', transmission: 0.78 },
    { nm: 405, name: 'Violet', color: '#9a67ff', transmission: 0.91 },
    { nm: 436, name: 'Blue', color: '#4f9dff', transmission: 0.94 },
    { nm: 546, name: 'Green', color: '#52e28a', transmission: 0.98 },
    { nm: 577, name: 'Yellow', color: '#ffe36e', transmission: 0.92 }
  ];

  const MATERIALS = [
    { id: 'cesium', name: 'Cesium', phi: 2.14, qe: 1.12, color: '#d8b667' },
    { id: 'potassium', name: 'Potassium', phi: 2.30, qe: 1.00, color: '#c3a55d' },
    { id: 'sodium', name: 'Sodium', phi: 2.75, qe: 0.88, color: '#d6bd72' },
    { id: 'calcium', name: 'Calcium', phi: 2.90, qe: 0.78, color: '#c6c9cc' },
    { id: 'zinc', name: 'Zinc', phi: 4.30, qe: 0.62, color: '#aab8c1' }
  ];

  const DEFAULT_STATE = {
    version: 1,
    mode: 'learn',
    theme: 'dark',
    sessionId: '',
    sessionSeed: 0,
    lampOn: false,
    warmup: 0,
    lampStable: false,
    shutterOpen: false,
    wavelength: 436,
    intensity: 60,
    aperture: 4,
    distance: 25,
    cathode: 'cesium',
    voltage: 0,
    meterRange: 100,
    calibrationMode: false,
    calibrated: false,
    zeroCorrection: 0,
    hiddenOffset: 0,
    hiddenWorkFunctionShift: 0,
    hiddenContactPotential: 0,
    hiddenResponsivity: 1,
    zeroThreshold: 1,
    readings: [],
    stoppingResults: [],
    notes: '',
    prelabScore: null,
    report: {
      studentName: '', studentNumber: '', moduleCode: 'Modern Physics', lecturerName: '',
      practicalDate: '', title: "Determination of Planck's Constant Using the Photoelectric Effect",
      conclusion: '', uncertainty: ''
    },
    actions: [],
    regression: null
  };

  let state = structuredClone(DEFAULT_STATE);
  let warmupTimer = null;
  let animationFrame = null;
  let lastVisualUpdate = 0;
  let autoSweepRunning = false;
  let noiseTick = 0;

  const $ = (id) => document.getElementById(id);
  const qsa = (selector) => [...document.querySelectorAll(selector)];

  function seededRandom(seed) {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  function randomNormal(seedA, seedB) {
    const u = Math.max(1e-12, seededRandom(seedA));
    const v = seededRandom(seedB);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function makeSessionId() {
    const stamp = new Date().toISOString().slice(0,10).replaceAll('-', '');
    const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
    return `PE-${stamp}-${rand}`;
  }

  function initialiseHiddenParameters(force = false) {
    if (!state.sessionId || force) {
      state.sessionId = makeSessionId();
      state.sessionSeed = Math.floor(Math.random() * 2_000_000_000);
    }
    const s = state.sessionSeed;
    state.hiddenOffset = -1.8 + seededRandom(s + 11) * 3.6;
    state.hiddenWorkFunctionShift = -0.035 + seededRandom(s + 12) * 0.07;
    state.hiddenContactPotential = -0.035 + seededRandom(s + 13) * 0.07;
    state.hiddenResponsivity = 0.90 + seededRandom(s + 14) * 0.22;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem('dinglo-photoelectric-state-v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        state = { ...structuredClone(DEFAULT_STATE), ...parsed, report: { ...DEFAULT_STATE.report, ...(parsed.report || {}) } };
      }
    } catch (error) {
      console.warn('Could not restore simulator state:', error);
    }
    initialiseHiddenParameters(false);
    if (!state.report.practicalDate) state.report.practicalDate = new Date().toISOString().slice(0,10);
  }

  function saveState() {
    $('saveStatus').textContent = 'Saving...';
    try {
      localStorage.setItem('dinglo-photoelectric-state-v1', JSON.stringify(state));
      setTimeout(() => $('saveStatus').textContent = 'Saved locally', 180);
    } catch (error) {
      $('saveStatus').textContent = 'Save failed';
      console.warn(error);
    }
  }

  function logAction(type, details = {}) {
    state.actions.push({ at: new Date().toISOString(), type, details });
    if (state.actions.length > 600) state.actions.splice(0, state.actions.length - 600);
    saveState();
  }

  function toast(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    $('toastContainer').appendChild(el);
    setTimeout(() => el.remove(), 3400);
  }

  function currentMaterial() {
    return MATERIALS.find(m => m.id === state.cathode) || MATERIALS[0];
  }

  function currentFilter() {
    return WAVELENGTHS.find(w => w.nm === Number(state.wavelength)) || WAVELENGTHS[2];
  }

  function effectiveWorkFunction() {
    return currentMaterial().phi + state.hiddenWorkFunctionShift;
  }

  function physicsModel(voltage = state.voltage, options = {}) {
    const filter = currentFilter();
    const material = currentMaterial();
    const lambda = Number(state.wavelength);
    const f = CONSTANTS.c / (lambda * 1e-9);
    const photonEnergy = CONSTANTS.hcEvNm / lambda;
    const phi = effectiveWorkFunction();
    const kmax = Math.max(0, photonEnergy - phi);
    const thresholdMet = photonEnergy > phi;
    const trueStopping = Math.max(0, kmax + state.hiddenContactPotential);

    const opticalScale = (state.intensity / 100)
      * Math.pow(state.aperture / 4, 2)
      * Math.pow(25 / state.distance, 2)
      * filter.transmission
      * material.qe
      * state.hiddenResponsivity;
    const spectralScale = Math.max(0.18, Math.min(1.25, 0.55 + 0.45 * photonEnergy / 3.5));
    const saturationCurrent = thresholdMet && state.lampOn && state.shutterOpen
      ? Math.min(8500, 145 * opticalScale * spectralScale)
      : 0;

    let collectionFraction = 0;
    if (thresholdMet && state.lampOn && state.shutterOpen) {
      if (trueStopping <= 0.0001) {
        collectionFraction = voltage >= 0 ? 1 - Math.exp(-0.8 * (voltage + 0.05)) : 0;
      } else if (voltage <= -trueStopping) {
        collectionFraction = 0;
      } else if (voltage < 0) {
        const x = (voltage + trueStopping) / trueStopping;
        collectionFraction = Math.pow(Math.max(0, Math.min(1, x)), 1.65);
      } else {
        collectionFraction = 0.82 + 0.18 * (1 - Math.exp(-voltage / 1.3));
      }
    }

    const idealPhotoCurrent = saturationCurrent * collectionFraction;
    const warmupInstability = state.lampOn && !state.lampStable ? (1 - state.warmup / 100) : 0;
    const drift = idealPhotoCurrent * warmupInstability * (0.08 * Math.sin(Date.now() / 460) + 0.035);
    const darkCurrent = state.lampOn ? 0.55 : 0.18;
    const calibrationSignal = state.calibrationMode ? (state.hiddenOffset + darkCurrent) : 0;
    const rawNoiseless = state.calibrationMode
      ? calibrationSignal
      : idealPhotoCurrent + darkCurrent + state.hiddenOffset + drift;

    const range = Number(state.meterRange);
    const baseNoise = Math.max(0.035, range * 0.0015);
    const signalNoise = Math.sqrt(Math.max(0, idealPhotoCurrent)) * 0.018;
    const noise = options.noNoise ? 0 : randomNormal(state.sessionSeed + noiseTick * 2 + 31, state.sessionSeed + noiseTick * 2 + 32) * (baseNoise + signalNoise);
    const corrected = rawNoiseless + noise - state.zeroCorrection;
    const overloaded = Math.abs(corrected) > range * 0.999;
    const resolution = range <= 10 ? 0.01 : range <= 100 ? 0.1 : range <= 1000 ? 1 : 10;
    const displayed = overloaded ? Math.sign(corrected) * range : Math.round(corrected / resolution) * resolution;

    return {
      lambda, frequency: f, photonEnergy, phi, kmax, thresholdMet, trueStopping,
      saturationCurrent, collectionFraction, idealPhotoCurrent, darkCurrent,
      rawCurrent: corrected, displayedCurrent: displayed, overloaded, resolution,
      warmupInstability
    };
  }

  function formatScientific(value, digits = 3) {
    if (!Number.isFinite(value)) return '—';
    return value.toExponential(digits).replace('e+', ' × 10^').replace('e-', ' × 10^-');
  }

  function formatCurrent(value, range = state.meterRange) {
    if (!Number.isFinite(value)) return '—';
    if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(range >= 10000 ? 2 : 3)} nA`;
    const decimals = range <= 10 ? 2 : range <= 100 ? 1 : 0;
    return `${value.toFixed(decimals)} pA`;
  }

  function setBenchMessage(message, type = 'info') {
    const el = $('benchMessage');
    el.textContent = message;
    el.className = `bench-message ${type}`;
  }

  function populateSelects() {
    $('wavelengthSelect').innerHTML = WAVELENGTHS.map(w => `<option value="${w.nm}">${w.nm} nm — ${w.name}</option>`).join('');
    $('cathodeSelect').innerHTML = MATERIALS.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
    const graphOptions = ['<option value="all">All wavelengths</option>', ...WAVELENGTHS.map(w => `<option value="${w.nm}">${w.nm} nm</option>`)].join('');
    $('ivWavelengthFilter').innerHTML = graphOptions;
    const swatches = $('filterSwatches');
    swatches.innerHTML = '';
    WAVELENGTHS.forEach((w, i) => {
      const angle = -90 + i * 72;
      const rad = angle * Math.PI / 180;
      const x = 60 + Math.cos(rad) * 41;
      const y = 80 + Math.sin(rad) * 41;
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', '13');
      c.setAttribute('fill', w.color); c.setAttribute('data-wave', String(w.nm));
      c.setAttribute('opacity', '.45');
      swatches.appendChild(c);
    });
  }

  function syncControlsFromState() {
    $('wavelengthSelect').value = String(state.wavelength);
    $('intensityInput').value = String(state.intensity);
    $('apertureSelect').value = String(state.aperture);
    $('distanceInput').value = String(state.distance);
    $('cathodeSelect').value = state.cathode;
    $('voltageInput').value = String(state.voltage);
    $('voltageNumber').value = Number(state.voltage).toFixed(2);
    $('rangeSelect').value = String(state.meterRange);
    $('calibrationToggle').checked = state.calibrationMode;
    $('thresholdInput').value = String(state.zeroThreshold);
    $('labNotes').value = state.notes || '';
    Object.entries({
      studentName: 'studentName', studentNumber: 'studentNumber', moduleCode: 'moduleCode',
      lecturerName: 'lecturerName', practicalDate: 'practicalDate', title: 'reportTitle',
      conclusion: 'reportConclusion', uncertainty: 'reportUncertainty'
    }).forEach(([key, id]) => $(id).value = state.report[key] || '');
    document.body.classList.toggle('light', state.theme === 'light');
  }

  function applyMode() {
    document.body.classList.toggle('laboratory-mode', state.mode === 'laboratory');
    document.body.classList.toggle('assessment-mode', state.mode === 'assessment');
    qsa('.mode-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === state.mode));
    $('modeStatus').textContent = state.mode[0].toUpperCase() + state.mode.slice(1);

    if (state.mode === 'assessment') {
      $('cathodeSelect').disabled = true;
      $('cathodeSelect').title = 'Cathode identity is hidden and locked in Assessment mode.';
      $('openManualBtn').disabled = true;
    } else {
      $('cathodeSelect').disabled = false;
      $('cathodeSelect').title = '';
      $('openManualBtn').disabled = false;
    }
  }

  function updateOutputs() {
    noiseTick += 1;
    const model = physicsModel();
    const filter = currentFilter();
    const material = currentMaterial();

    $('sessionId').textContent = state.sessionId;
    $('intensityOut').textContent = `${state.intensity}%`;
    $('distanceOut').textContent = `${state.distance} cm`;
    $('voltageOut').textContent = `${Number(state.voltage).toFixed(3)} V`;
    $('thresholdOut').textContent = `${Number(state.zeroThreshold).toFixed(1)} pA`;
    $('photonEnergyReadout').textContent = `${model.photonEnergy.toFixed(3)} eV`;
    $('currentReadout').textContent = model.overloaded ? 'OVERLOAD' : formatCurrent(model.displayedCurrent);
    $('stoppingReadout').textContent = `${model.trueStopping.toFixed(3)} V`;
    $('workFunctionReadout').textContent = `${model.phi.toFixed(3)} eV`;
    $('frequencyMetric').textContent = `${(model.frequency / 1e14).toFixed(3)} × 10¹⁴ Hz`;
    $('kineticMetric').textContent = `${model.kmax.toFixed(3)} eV`;
    $('saturationMetric').textContent = `${model.saturationCurrent.toFixed(1)} pA`;
    $('collectionMetric').textContent = `${(model.collectionFraction * 100).toFixed(1)}%`;
    $('svgVoltageDisplay').textContent = `${Number(state.voltage).toFixed(3)} V`;
    $('svgCurrentDisplay').textContent = model.overloaded ? 'OVERLOAD' : formatCurrent(model.displayedCurrent);
    $('svgCurrentDisplay').setAttribute('fill', model.overloaded ? '#ff7a85' : '#9df8bc');
    $('svgMeterState').textContent = `${state.calibrationMode ? 'CAL · ' : ''}Range: ${state.meterRange >= 1000 ? `${state.meterRange/1000} nA` : `${state.meterRange} pA`}`;

    const statusDot = $('lampStatusDot');
    statusDot.className = 'status-dot';
    if (state.lampOn && state.lampStable) statusDot.classList.add('on');
    else if (state.lampOn) statusDot.classList.add('warming');
    $('lampStatusText').textContent = !state.lampOn ? 'Lamp off' : state.lampStable ? (state.shutterOpen ? 'Lamp stable · shutter open' : 'Lamp stable · shutter closed') : `Lamp warming · ${Math.round(state.warmup)}%`;

    $('lampBtn').textContent = state.lampOn ? 'Switch lamp off' : 'Switch lamp on';
    $('shutterBtn').textContent = state.shutterOpen ? 'Close shutter' : 'Open shutter';
    $('shutterBtn').disabled = !state.lampOn || !state.lampStable;
    $('warmupWrap').hidden = !state.lampOn || state.lampStable;
    $('warmupBar').style.width = `${state.warmup}%`;
    $('warmupText').textContent = `${Math.round(state.warmup)}%`;

    $('lampBulb').setAttribute('fill', state.lampOn ? filter.color : '#5c6874');
    $('lampBulb').setAttribute('filter', state.lampOn ? 'url(#glow)' : 'none');
    $('lampHalo').setAttribute('stroke', filter.color);
    $('lampHalo').setAttribute('opacity', state.lampOn ? String(.2 + .65 * state.warmup/100) : '0');
    $('lampLed').setAttribute('fill', state.lampOn ? (state.lampStable ? '#62e59b' : '#ffc857') : '#6f7d8b');
    $('beamGroup').setAttribute('opacity', state.lampOn && state.lampStable && state.shutterOpen ? '1' : '0');
    $('beamPolygon').setAttribute('fill', filter.color);
    $('beamPolygon2').setAttribute('fill', filter.color);
    $('apertureHole').setAttribute('r', String(4 + state.aperture * 1.35));
    $('apertureHole').setAttribute('fill', filter.color);
    $('cathodePlate').setAttribute('fill', material.color);
    qsa('#filterSwatches circle').forEach(c => c.setAttribute('opacity', c.dataset.wave === String(state.wavelength) ? '1' : '.28'));

    if (!state.lampOn) {
      $('thresholdReadout').textContent = 'Lamp off';
      $('liveExplanation').textContent = 'The source is off. No photons reach the cathode and only a small instrument background remains.';
    } else if (!state.lampStable) {
      $('thresholdReadout').textContent = 'Source warming';
      $('liveExplanation').textContent = 'The source and amplifier are stabilising. Measurements taken now will show stronger drift.';
    } else if (!state.shutterOpen) {
      $('thresholdReadout').textContent = 'Shutter closed';
      $('liveExplanation').textContent = 'The shutter blocks the beam. This is the correct condition for zero calibration and dark-current checks.';
    } else if (!model.thresholdMet) {
      $('thresholdReadout').textContent = 'Below threshold';
      $('liveExplanation').textContent = `Photon energy (${model.photonEnergy.toFixed(2)} eV) is below the effective work function. Increasing intensity cannot produce photoemission.`;
    } else {
      $('thresholdReadout').textContent = 'Emission allowed';
      const region = state.voltage <= -model.trueStopping ? 'stopping region' : state.voltage < 0 ? 'retarding region' : state.voltage < 2 ? 'collection region' : 'near saturation';
      $('liveExplanation').textContent = `Photoelectrons are emitted. At ${state.voltage.toFixed(2)} V the apparatus is in the ${region}; approximately ${(model.collectionFraction*100).toFixed(1)}% of the saturation photocurrent is collected.`;
    }

    if (model.overloaded) setBenchMessage('Current meter overload. Select a larger range before recording.', 'error');
    else if (state.calibrationMode && state.shutterOpen) setBenchMessage('Calibration mode is active while the shutter is open. Close the shutter before zeroing.', 'warn');
    else if (state.calibrationMode) setBenchMessage('Calibration mode active. Close the shutter, then zero the current meter.', 'info');
    else if (!state.calibrated) setBenchMessage('The current meter has not been zero-calibrated. Close the shutter and calibrate before precision measurements.', 'warn');
    else if (!state.lampOn) setBenchMessage('Switch on the mercury source to begin.', 'info');
    else if (!state.lampStable) setBenchMessage('Allow the lamp to finish stabilising before recording precision data.', 'warn');
    else if (!state.shutterOpen) setBenchMessage('The shutter is closed. Open it when calibration is complete and you are ready to measure.', 'info');
    else if (!model.thresholdMet) setBenchMessage('No photoemission: the selected photon energy is below the cathode work function.', 'warn');
    else setBenchMessage('Apparatus ready. Adjust the anode potential and record a complete current-voltage sweep.', 'success');

    updateChecklist(model);
    updateElectronAnimation(model);
  }

  function updateChecklist(model) {
    const checks = [
      [state.lampOn, 'Mercury source switched on'],
      [state.lampStable, 'Source and amplifier stabilised'],
      [state.calibrated, 'Current meter zero-calibrated'],
      [state.shutterOpen, 'Shutter opened for measurement'],
      [model.thresholdMet, 'Photon energy above threshold'],
      [state.readings.length >= 5, 'At least five current readings recorded'],
      [new Set(state.stoppingResults.map(r => r.lambda)).size >= 3, 'Stopping potentials obtained at three wavelengths'],
      [Boolean(state.regression), 'Linear regression completed']
    ];
    $('checklist').innerHTML = checks.map(([done, label]) => `<div class="check-item ${done ? 'done' : ''}"><span class="check-icon">${done ? '✓' : '•'}</span><span>${label}</span></div>`).join('');
  }

  function createParticles() {
    const photons = $('photonParticles');
    photons.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('r', '4'); c.setAttribute('fill', '#76d5ff'); c.dataset.index = String(i);
      photons.appendChild(c);
    }
    const electrons = $('electronParticles');
    electrons.innerHTML = '';
    for (let i = 0; i < 13; i++) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('r', '4.2'); c.setAttribute('fill', '#70d8ff'); c.setAttribute('filter', 'url(#glow)'); c.dataset.index = String(i);
      electrons.appendChild(c);
    }
  }

  function animateVisuals(timestamp) {
    if (!lastVisualUpdate) lastVisualUpdate = timestamp;
    const elapsed = timestamp / 1000;
    const model = physicsModel(state.voltage, { noNoise: true });
    const filter = currentFilter();
    const photonCount = Math.max(2, Math.round(2 + state.intensity / 12));
    qsa('#photonParticles circle').forEach((c, i) => {
      const active = state.lampOn && state.lampStable && state.shutterOpen && i < photonCount;
      c.style.display = active ? '' : 'none';
      const progress = (elapsed * (0.45 + state.intensity / 180) + i / photonCount) % 1;
      const x = 255 + progress * 350;
      const y = 202 + Math.sin(i * 1.7 + progress * 5) * 8;
      c.setAttribute('cx', String(x)); c.setAttribute('cy', String(y)); c.setAttribute('fill', filter.color);
    });
    const eCount = Math.round(Math.min(13, model.collectionFraction * 8 + model.saturationCurrent / 180));
    qsa('#electronParticles circle').forEach((c, i) => {
      const active = model.thresholdMet && state.lampOn && state.lampStable && state.shutterOpen && i < eCount;
      c.style.display = active ? '' : 'none';
      const speed = .22 + model.kmax * .12 + Math.max(0, state.voltage) * .025;
      const progress = (elapsed * speed + i / Math.max(1, eCount)) % 1;
      const directionAllowed = state.voltage > -model.trueStopping;
      const x = directionAllowed ? 58 + progress * 136 : 58 + Math.sin(progress * Math.PI) * Math.max(8, 70 * model.collectionFraction);
      const y = 125 + Math.sin(i * 2.1 + progress * 6) * (10 + i % 3 * 3);
      c.setAttribute('cx', String(x)); c.setAttribute('cy', String(y));
    });
    if (timestamp - lastVisualUpdate > 180) {
      updateOutputs();
      lastVisualUpdate = timestamp;
    }
    animationFrame = requestAnimationFrame(animateVisuals);
  }

  function updateElectronAnimation() {
    // Animation loop reads current state; function retained for semantic clarity.
  }

  function toggleLamp() {
    state.lampOn = !state.lampOn;
    state.shutterOpen = false;
    if (!state.lampOn) {
      state.warmup = 0; state.lampStable = false;
      if (warmupTimer) clearInterval(warmupTimer);
      warmupTimer = null;
      logAction('lamp_off');
    } else {
      state.warmup = 0; state.lampStable = false;
      logAction('lamp_on');
      warmupTimer = setInterval(() => {
        state.warmup = Math.min(100, state.warmup + 2.5);
        if (state.warmup >= 100) {
          state.lampStable = true;
          clearInterval(warmupTimer); warmupTimer = null;
          toast('Lamp and amplifier stabilised.', 'success');
          logAction('warmup_complete');
        }
        updateOutputs();
        saveState();
      }, 350);
    }
    updateOutputs(); saveState();
  }

  function toggleShutter() {
    if (!state.lampOn || !state.lampStable) return;
    state.shutterOpen = !state.shutterOpen;
    logAction(state.shutterOpen ? 'shutter_open' : 'shutter_close');
    updateOutputs();
  }

  function zeroMeter() {
    const model = physicsModel(state.voltage, { noNoise: true });
    if (!state.calibrationMode) return toast('Enable calibration mode first.', 'warning');
    if (state.shutterOpen) return toast('Close the shutter before zeroing the meter.', 'warning');
    if (!state.lampOn || !state.lampStable) return toast('Switch on and stabilise the source before calibration.', 'warning');
    state.zeroCorrection = state.hiddenOffset + model.darkCurrent;
    state.calibrated = true;
    $('calibrationStatus').textContent = `Meter zeroed on the ${state.meterRange >= 1000 ? state.meterRange/1000 + ' nA' : state.meterRange + ' pA'} range.`;
    logAction('meter_zeroed', { range: state.meterRange });
    toast('Current meter zero calibration completed.', 'success');
    updateOutputs();
  }

  function canRecord() {
    if (state.calibrationMode) { toast('Exit calibration mode before recording experimental data.', 'warning'); return false; }
    if (!state.lampOn || !state.lampStable) { toast('The source must be switched on and stable.', 'warning'); return false; }
    if (!state.shutterOpen) { toast('Open the shutter before recording.', 'warning'); return false; }
    const model = physicsModel();
    if (model.overloaded) { toast('Select a larger current range; the meter is overloaded.', 'error'); return false; }
    return true;
  }

  function recordReading(source = 'manual') {
    if (!canRecord()) return false;
    noiseTick += 1;
    const model = physicsModel();
    const reading = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString(),
      lambda: state.wavelength,
      frequency: model.frequency,
      intensity: state.intensity,
      aperture: state.aperture,
      distance: state.distance,
      cathode: state.mode === 'assessment' ? 'hidden' : state.cathode,
      voltage: Number(state.voltage),
      current: model.displayedCurrent,
      range: state.meterRange,
      resolution: model.resolution,
      source
    };
    state.readings.push(reading);
    logAction('reading_recorded', { lambda: reading.lambda, voltage: reading.voltage, current: reading.current, source });
    renderReadings(); drawIVGraph(); updateReport();
    if (source === 'manual') toast(`Reading recorded: ${reading.voltage.toFixed(2)} V, ${formatCurrent(reading.current, reading.range)}.`, 'success');
    return true;
  }

  async function runVoltageSweep() {
    if (autoSweepRunning) return;
    if (!canRecord()) return;
    const model = physicsModel(0, { noNoise: true });
    if (!model.thresholdMet) return toast('No current-voltage sweep is useful below threshold frequency.', 'warning');
    autoSweepRunning = true;
    $('scanBtn').disabled = true;
    $('recordReadingBtn').disabled = true;
    const start = Math.max(-5, -(model.trueStopping + 0.7));
    const end = Math.min(6, 3.5);
    const points = 18;
    logAction('voltage_sweep_started', { start, end, points, lambda: state.wavelength });
    for (let i = 0; i < points; i++) {
      state.voltage = Number((start + (end - start) * i / (points - 1)).toFixed(3));
      syncVoltageControls(); updateOutputs();
      await new Promise(resolve => setTimeout(resolve, 105));
      recordReading('automatic-sweep');
    }
    autoSweepRunning = false;
    $('scanBtn').disabled = false;
    $('recordReadingBtn').disabled = false;
    logAction('voltage_sweep_completed', { lambda: state.wavelength });
    toast('Voltage sweep completed and added to the notebook.', 'success');
  }

  function estimateStoppingPotential() {
    const lambda = Number(state.wavelength);
    const rows = state.readings
      .filter(r => Number(r.lambda) === lambda && Math.abs(r.intensity - state.intensity) <= 1 && Number(r.aperture) === Number(state.aperture))
      .sort((a,b) => a.voltage - b.voltage);
    if (rows.length < 5) return toast('Record at least five readings at this wavelength, intensity and aperture.', 'warning');
    const threshold = Number(state.zeroThreshold);
    let lower = null, upper = null;
    for (let i = 0; i < rows.length - 1; i++) {
      if (rows[i].current <= threshold && rows[i+1].current > threshold) {
        lower = rows[i]; upper = rows[i+1]; break;
      }
    }
    if (!lower || !upper) {
      const closest = [...rows].sort((a,b) => Math.abs(a.current-threshold) - Math.abs(b.current-threshold))[0];
      if (!closest || Math.abs(closest.current-threshold) > Math.max(5, threshold * 3)) return toast('The sweep does not cross the zero-current criterion. Extend the retarding-voltage range.', 'warning');
      const vs = Math.abs(closest.voltage);
      addStoppingResult(lambda, vs, Math.max(closest.resolution * .02, .04), 'nearest threshold');
      return;
    }
    const slope = (upper.current - lower.current) / (upper.voltage - lower.voltage);
    const crossingVoltage = slope === 0 ? lower.voltage : lower.voltage + (threshold - lower.current) / slope;
    const vs = Math.abs(crossingVoltage);
    const voltageSpacing = Math.abs(upper.voltage - lower.voltage);
    const uncertainty = Math.max(0.01, voltageSpacing / 2, Number(state.zeroThreshold) / Math.max(1, Math.abs(slope)));
    addStoppingResult(lambda, vs, Math.min(.5, uncertainty), 'interpolated sweep');
    logAction('stopping_potential_estimated', { lambda, vs, uncertainty, threshold });
  }

  function addStoppingResult(lambda, vs, uncertainty, method, silent = false) {
    if (!Number.isFinite(lambda) || !Number.isFinite(vs) || lambda <= 0 || vs < 0) return toast('Enter valid stopping-potential data.', 'error');
    const frequency = CONSTANTS.c / (lambda * 1e-9);
    const existingIndex = state.stoppingResults.findIndex(r => Number(r.lambda) === Number(lambda));
    const result = { id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`, lambda: Number(lambda), frequency, vs: Number(vs), uncertainty: Number(uncertainty), method, timestamp: new Date().toISOString() };
    if (existingIndex >= 0) state.stoppingResults[existingIndex] = result;
    else state.stoppingResults.push(result);
    state.stoppingResults.sort((a,b) => a.frequency - b.frequency);
    state.regression = null;
    renderStoppingResults(); drawVFGraph(); updateReport(); saveState();
    if (!silent) toast(`Stopping potential saved for ${lambda} nm: ${vs.toFixed(3)} V.`, 'success');
  }

  function calculateRegression() {
    const pts = state.stoppingResults.filter(r => Number.isFinite(r.frequency) && Number.isFinite(r.vs));
    if (pts.length < 3) return toast('At least three different wavelengths are required.', 'warning');
    const xs = pts.map(p => p.frequency / 1e14);
    const ys = pts.map(p => p.vs);
    const n = xs.length;
    const meanX = xs.reduce((a,b)=>a+b,0)/n;
    const meanY = ys.reduce((a,b)=>a+b,0)/n;
    const sxx = xs.reduce((s,x)=>s+(x-meanX)**2,0);
    const sxy = xs.reduce((s,x,i)=>s+(x-meanX)*(ys[i]-meanY),0);
    if (sxx === 0) return toast('Use more than one wavelength.', 'warning');
    const slopeScaled = sxy / sxx; // volts per 1e14 Hz
    const intercept = meanY - slopeScaled * meanX;
    const predicted = xs.map(x => slopeScaled*x + intercept);
    const ssRes = ys.reduce((s,y,i)=>s+(y-predicted[i])**2,0);
    const ssTot = ys.reduce((s,y)=>s+(y-meanY)**2,0);
    const r2 = ssTot > 0 ? 1 - ssRes/ssTot : 1;
    const residualVariance = n > 2 ? ssRes/(n-2) : 0;
    const slopeSEScaled = Math.sqrt(residualVariance/sxx);
    const interceptSE = Math.sqrt(residualVariance*(1/n + meanX**2/sxx));
    const slopeSI = slopeScaled / 1e14;
    const slopeSESI = slopeSEScaled / 1e14;
    const hMeasured = slopeSI * CONSTANTS.e;
    const hUncertainty = slopeSESI * CONSTANTS.e;
    const percentError = Math.abs(hMeasured-CONSTANTS.acceptedH)/CONSTANTS.acceptedH*100;
    const workFunctionEv = -intercept;
    const thresholdFrequency = slopeSI !== 0 ? -intercept/slopeSI : NaN;
    state.regression = { n, slopeScaled, slopeSI, slopeSESI, intercept, interceptSE, r2, hMeasured, hUncertainty, percentError, workFunctionEv, thresholdFrequency };
    logAction('regression_completed', { n, hMeasured, percentError, r2 });
    drawVFGraph(); renderRegressionSummary(); updateReport();
    toast('Regression completed. Planck’s constant has been calculated.', 'success');
  }

  function renderReadings() {
    const tbody = $('readingsTable').querySelector('tbody');
    if (!state.readings.length) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:24px">No readings recorded.</td></tr>';
      return;
    }
    tbody.innerHTML = state.readings.map((r,i) => `<tr>
      <td>${i+1}</td><td>${new Date(r.timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}</td>
      <td>${r.lambda}</td><td>${(r.frequency/1e14).toFixed(3)}</td><td>${r.intensity}%</td><td>${r.aperture} mm</td>
      <td>${r.voltage.toFixed(3)}</td><td>${Number(r.current).toFixed(r.range<=10?2:r.range<=100?1:0)}</td><td>${r.range>=1000?r.range/1000+' nA':r.range+' pA'}</td>
      <td><button class="delete-row" data-reading-id="${r.id}" aria-label="Delete reading">×</button></td></tr>`).join('');
    qsa('[data-reading-id]').forEach(btn => btn.addEventListener('click', () => {
      state.readings = state.readings.filter(r => r.id !== btn.dataset.readingId);
      logAction('reading_deleted', { id: btn.dataset.readingId });
      renderReadings(); drawIVGraph(); updateReport();
    }));
  }

  function renderStoppingResults() {
    const tbody = $('stoppingTable').querySelector('tbody');
    if (!state.stoppingResults.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px">No stopping-potential results.</td></tr>';
      return;
    }
    tbody.innerHTML = state.stoppingResults.map((r,i) => `<tr>
      <td>${i+1}</td><td>${r.lambda}</td><td>${(r.frequency/1e14).toFixed(3)}</td><td>${r.vs.toFixed(3)}</td><td>${r.uncertainty.toFixed(3)}</td><td>${r.method}</td>
      <td><button class="delete-row" data-stop-id="${r.id}" aria-label="Delete stopping result">×</button></td></tr>`).join('');
    qsa('[data-stop-id]').forEach(btn => btn.addEventListener('click', () => {
      state.stoppingResults = state.stoppingResults.filter(r => r.id !== btn.dataset.stopId);
      state.regression = null;
      logAction('stopping_result_deleted', { id: btn.dataset.stopId });
      renderStoppingResults(); drawVFGraph(); renderRegressionSummary(); updateReport();
    }));
  }

  function canvasSetup(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.max(500, rect.width || 900);
    const cssHeight = cssWidth < 650 ? 330 : 430;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    return { ctx, width: cssWidth, height: cssHeight };
  }

  function graphTheme() {
    const styles = getComputedStyle(document.body);
    return { text: styles.getPropertyValue('--text').trim(), muted: styles.getPropertyValue('--muted').trim(), line: styles.getPropertyValue('--line').trim(), accent: styles.getPropertyValue('--accent').trim(), success: styles.getPropertyValue('--success').trim(), bg: styles.getPropertyValue('--bg').trim(), warning: styles.getPropertyValue('--warning').trim() };
  }

  function drawAxes(ctx, width, height, bounds, labels) {
    const theme = graphTheme();
    const margin = { l: 70, r: 28, t: 26, b: 58 };
    const pw = width-margin.l-margin.r, ph = height-margin.t-margin.b;
    ctx.clearRect(0,0,width,height);
    ctx.fillStyle = theme.bg; ctx.fillRect(0,0,width,height);
    ctx.font = '12px system-ui'; ctx.lineWidth = 1;
    const xMap = x => margin.l + (x-bounds.xMin)/(bounds.xMax-bounds.xMin)*pw;
    const yMap = y => margin.t + ph - (y-bounds.yMin)/(bounds.yMax-bounds.yMin)*ph;
    ctx.strokeStyle = theme.line; ctx.fillStyle = theme.muted;
    for (let i=0;i<=6;i++) {
      const x = bounds.xMin + (bounds.xMax-bounds.xMin)*i/6;
      const px=xMap(x); ctx.beginPath();ctx.moveTo(px,margin.t);ctx.lineTo(px,margin.t+ph);ctx.stroke();
      ctx.textAlign='center';ctx.fillText(formatAxis(x),px,margin.t+ph+20);
    }
    for (let i=0;i<=5;i++) {
      const y = bounds.yMin + (bounds.yMax-bounds.yMin)*i/5;
      const py=yMap(y);ctx.beginPath();ctx.moveTo(margin.l,py);ctx.lineTo(margin.l+pw,py);ctx.stroke();
      ctx.textAlign='right';ctx.fillText(formatAxis(y),margin.l-9,py+4);
    }
    ctx.strokeStyle = theme.muted; ctx.lineWidth=1.3;
    ctx.beginPath();ctx.moveTo(margin.l,margin.t);ctx.lineTo(margin.l,margin.t+ph);ctx.lineTo(margin.l+pw,margin.t+ph);ctx.stroke();
    ctx.fillStyle=theme.text;ctx.font='600 13px system-ui';ctx.textAlign='center';ctx.fillText(labels.x,margin.l+pw/2,height-15);
    ctx.save();ctx.translate(18,margin.t+ph/2);ctx.rotate(-Math.PI/2);ctx.fillText(labels.y,0,0);ctx.restore();
    return { xMap, yMap, margin, pw, ph, theme };
  }

  function formatAxis(value) {
    const abs=Math.abs(value);
    if (abs>=1000) return `${(value/1000).toFixed(1)}k`;
    if (abs<1 && abs!==0) return value.toFixed(2);
    return value.toFixed(abs>=100?0:abs>=10?1:2).replace(/\.00$/,'');
  }

  function paddedBounds(values, defaultMin, defaultMax, includeZero = false) {
    if (!values.length) return [defaultMin, defaultMax];
    let min=Math.min(...values), max=Math.max(...values);
    if (includeZero) { min=Math.min(0,min); max=Math.max(0,max); }
    if (min===max) { min-=1;max+=1; }
    const pad=(max-min)*.12;
    return [min-pad,max+pad];
  }

  function drawIVGraph() {
    const canvas=$('ivCanvas');
    const {ctx,width,height}=canvasSetup(canvas);
    const selected=$('ivWavelengthFilter').value;
    const rows=state.readings.filter(r=>selected==='all'||String(r.lambda)===selected).sort((a,b)=>a.voltage-b.voltage);
    const [xMin,xMax]=paddedBounds(rows.map(r=>r.voltage),-5,5,true);
    const [yMin,yMax]=paddedBounds(rows.map(r=>r.current),0,100,true);
    const axes=drawAxes(ctx,width,height,{xMin,xMax,yMin,yMax},{x:'Anode potential / V',y:'Photocurrent / pA'});
    if (!rows.length) return;
    const grouped=new Map();
    rows.forEach(r=>{const key=String(r.lambda);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(r);});
    grouped.forEach((points,key)=>{
      const color=(WAVELENGTHS.find(w=>String(w.nm)===key)||{color:axes.theme.accent}).color;
      ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;ctx.beginPath();
      points.forEach((p,i)=>{const x=axes.xMap(p.voltage),y=axes.yMap(p.current);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();
      points.forEach(p=>{ctx.beginPath();ctx.arc(axes.xMap(p.voltage),axes.yMap(p.current),4,0,Math.PI*2);ctx.fill();});
    });
    const legend=[...grouped.keys()];
    ctx.font='12px system-ui';ctx.textAlign='left';
    legend.forEach((key,i)=>{const color=(WAVELENGTHS.find(w=>String(w.nm)===key)||{color:axes.theme.accent}).color;ctx.fillStyle=color;ctx.fillRect(axes.margin.l+10+i*92,10,13,4);ctx.fillStyle=axes.theme.muted;ctx.fillText(`${key} nm`,axes.margin.l+29+i*92,15);});
  }

  function drawVFGraph() {
    const canvas=$('vfCanvas');
    const {ctx,width,height}=canvasSetup(canvas);
    const pts=state.stoppingResults;
    const xs=pts.map(p=>p.frequency/1e14), ys=pts.map(p=>p.vs);
    const [xMin,xMax]=paddedBounds(xs,4.5,8.5,false);
    const [yMin,yMax]=paddedBounds(ys,0,2.5,true);
    const axes=drawAxes(ctx,width,height,{xMin,xMax,yMin,yMax},{x:'Frequency / 10¹⁴ Hz',y:'Stopping potential / V'});
    if (!pts.length) return;
    if (state.regression) {
      const r=state.regression;
      ctx.strokeStyle=axes.theme.success;ctx.lineWidth=2.2;ctx.beginPath();
      ctx.moveTo(axes.xMap(xMin),axes.yMap(r.slopeScaled*xMin+r.intercept));
      ctx.lineTo(axes.xMap(xMax),axes.yMap(r.slopeScaled*xMax+r.intercept));ctx.stroke();
    }
    pts.forEach(p=>{
      const x=axes.xMap(p.frequency/1e14),y=axes.yMap(p.vs);
      const ePx=Math.abs(axes.yMap(p.vs+p.uncertainty)-axes.yMap(p.vs));
      ctx.strokeStyle=axes.theme.muted;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y-ePx);ctx.lineTo(x,y+ePx);ctx.moveTo(x-4,y-ePx);ctx.lineTo(x+4,y-ePx);ctx.moveTo(x-4,y+ePx);ctx.lineTo(x+4,y+ePx);ctx.stroke();
      ctx.fillStyle=axes.theme.accent;ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();
    });
  }

  function renderRegressionSummary() {
    if (!state.regression) {
      $('regressionSummary').textContent='Add at least three stopping-potential results at different wavelengths.';
      return;
    }
    const r=state.regression;
    $('regressionSummary').innerHTML=`<strong>Fit:</strong> V<sub>s</sub> = (${r.slopeScaled.toFixed(4)}) f<sub>14</sub> ${r.intercept>=0?'+':'−'} ${Math.abs(r.intercept).toFixed(4)}; `+
      `<strong>R²:</strong> ${r.r2.toFixed(4)} · <strong>h:</strong> (${(r.hMeasured/1e-34).toFixed(4)} ± ${(r.hUncertainty/1e-34).toFixed(4)}) × 10<sup>−34</sup> J·s · `+
      `<strong>Error:</strong> ${r.percentError.toFixed(2)}% · <strong>φ:</strong> ${r.workFunctionEv.toFixed(3)} eV.`;
  }

  function fitIvSummary() {
    const selected=$('ivWavelengthFilter').value;
    const rows=state.readings.filter(r=>selected==='all'||String(r.lambda)===selected).sort((a,b)=>a.voltage-b.voltage);
    if (rows.length<5) return toast('Select a sweep with at least five readings.', 'warning');
    const max=Math.max(...rows.map(r=>r.current));
    const min=Math.min(...rows.map(r=>r.current));
    const plateau=rows.filter(r=>r.voltage>1).map(r=>r.current);
    const sat=plateau.length?plateau.reduce((a,b)=>a+b,0)/plateau.length:max;
    const nearZero=rows.reduce((best,r)=>Math.abs(r.current-state.zeroThreshold)<Math.abs(best.current-state.zeroThreshold)?r:best,rows[0]);
    $('ivSummary').innerHTML=`<strong>Sweep summary:</strong> ${rows.length} points; observed current range ${min.toFixed(2)}–${max.toFixed(2)} pA; estimated saturation level ${sat.toFixed(2)} pA; closest point to the ${state.zeroThreshold.toFixed(1)} pA criterion occurs at ${nearZero.voltage.toFixed(3)} V.`;
  }

  function renderReportCompleteness() {
    const uniqueWaves=new Set(state.stoppingResults.map(r=>r.lambda)).size;
    const items=[
      [state.report.studentName.trim().length>1,'Student details'],
      [state.readings.length>=10,'At least 10 raw readings'],
      [uniqueWaves>=3,'At least 3 wavelengths'],
      [Boolean(state.regression),'Planck-constant regression'],
      [state.notes.trim().length>=60,'Laboratory observations'],
      [state.report.conclusion.trim().length>=50,'Conclusion'],
      [state.report.uncertainty.trim().length>=40,'Uncertainty discussion']
    ];
    $('reportCompleteness').innerHTML=items.map(([ok,label])=>`<div class="completion-item ${ok?'ok':''}"><span>${label}</span><strong>${ok?'Complete':'Required'}</strong></div>`).join('');
  }

  function reportHTML(full = false) {
    const r=state.regression;
    const readingsRows=state.readings.slice(0, full?state.readings.length:12).map((x,i)=>`<tr><td>${i+1}</td><td>${x.lambda}</td><td>${x.voltage.toFixed(3)}</td><td>${Number(x.current).toFixed(2)}</td><td>${x.intensity}%</td></tr>`).join('');
    const stoppingRows=state.stoppingResults.map((x,i)=>`<tr><td>${i+1}</td><td>${x.lambda}</td><td>${(x.frequency/1e14).toFixed(3)}</td><td>${x.vs.toFixed(3)}</td><td>${x.uncertainty.toFixed(3)}</td></tr>`).join('');
    const regressionText=r?`The least-squares fit gave V<sub>s</sub> = ${r.slopeScaled.toFixed(4)}f<sub>14</sub> ${r.intercept>=0?'+':'−'} ${Math.abs(r.intercept).toFixed(4)} with R² = ${r.r2.toFixed(4)}. The measured Planck constant was ${(r.hMeasured/1e-34).toFixed(4)} × 10<sup>−34</sup> J·s, corresponding to ${r.percentError.toFixed(2)}% error relative to the SI defining value. The fitted work function was ${r.workFunctionEv.toFixed(3)} eV.`:'Regression has not yet been completed.';
    return `
      <div style="text-align:center;border-bottom:2px solid #17212b;padding-bottom:12px;margin-bottom:18px">
        <h2 style="margin:0 0 5px">${escapeHtml(state.report.title)}</h2>
        <div>${escapeHtml(state.report.moduleCode)} · ${escapeHtml(state.report.practicalDate)}</div>
        <div><strong>${escapeHtml(state.report.studentName||'Student name')}</strong> · ${escapeHtml(state.report.studentNumber||'Student number')}</div>
        <div>Session ${escapeHtml(state.sessionId)}</div>
      </div>
      <h3>1. Aim</h3><p>To investigate the photoelectric effect, obtain current-voltage characteristics, determine stopping potentials at multiple frequencies, and estimate Planck's constant and the cathode work function.</p>
      <h3>2. Theory</h3><p>Einstein's photoelectric equation is K<sub>max</sub> = hf − φ. At the stopping potential, eV<sub>s</sub> = hf − φ, so the slope of V<sub>s</sub> against frequency equals h/e.</p>
      <h3>3. Apparatus and procedure</h3><p>A virtual mercury source, wavelength filters, aperture selector, evacuated phototube, variable DC supply and sensitive current meter were configured. The source was stabilised and the meter was zero-calibrated with the shutter closed. Current was recorded while the anode potential was varied from retarding to accelerating values. Stopping potential was estimated using the selected zero-current criterion.</p>
      <h3>4. Raw results</h3>
      <table><thead><tr><th>#</th><th>λ (nm)</th><th>Bias (V)</th><th>Current (pA)</th><th>Intensity</th></tr></thead><tbody>${readingsRows||'<tr><td colspan="5">No readings</td></tr>'}</tbody></table>
      ${!full&&state.readings.length>12?`<p><em>Preview shows 12 of ${state.readings.length} readings. The printed report includes all readings.</em></p>`:''}
      <h3>5. Stopping-potential results</h3>
      <table><thead><tr><th>#</th><th>λ (nm)</th><th>f (10¹⁴ Hz)</th><th>V<sub>s</sub> (V)</th><th>u(V<sub>s</sub>) (V)</th></tr></thead><tbody>${stoppingRows||'<tr><td colspan="5">No results</td></tr>'}</tbody></table>
      <h3>6. Analysis</h3><p>${regressionText}</p>
      <h3>7. Observations and discussion</h3><p>${escapeHtml(state.notes||'No laboratory observations entered.').replaceAll('\n','<br>')}</p>
      <h3>8. Uncertainty</h3><p>${escapeHtml(state.report.uncertainty||'No uncertainty discussion entered.').replaceAll('\n','<br>')}</p>
      <h3>9. Conclusion</h3><p>${escapeHtml(state.report.conclusion||'No conclusion entered.').replaceAll('\n','<br>')}</p>
      <h3>Reference values</h3><p>Planck constant h = 6.62607015 × 10<sup>−34</sup> J·s; elementary charge e = 1.602176634 × 10<sup>−19</sup> C; speed of light c = 299792458 m·s<sup>−1</sup>.</p>`;
  }

  function escapeHtml(value) {
    return String(value??'').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }

  function updateReport() {
    renderReportCompleteness();
    $('reportPreview').innerHTML=reportHTML(false);
  }

  function printReport() {
    updateReport();
    const win=window.open('', '_blank');
    if(!win) return toast('Allow pop-ups to generate the printable report.', 'warning');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(state.report.title)}</title><style>
      @page{size:A4;margin:18mm}body{font-family:Georgia,serif;color:#17212b;line-height:1.5;font-size:11pt}h2{font-size:18pt}h3{margin-top:20px;border-bottom:1px solid #ccd4da;padding-bottom:4px}table{width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:8.5pt;margin:8px 0 14px}th,td{border:1px solid #adb8c2;padding:5px;text-align:right}th{background:#eef2f5}p{orphans:3;widows:3}.page-break{page-break-before:always}</style></head><body>${reportHTML(true)}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
    win.document.close();
    logAction('report_print_opened');
  }


  function safeFilename(value, fallback='download') {
    const cleaned=String(value||fallback).trim().replace(/[^a-z0-9._-]+/gi,'-').replace(/^-+|-+$/g,'');
    return cleaned || fallback;
  }

  function serialiseSvg(svg) {
    const clone=svg.cloneNode(true);
    clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
    clone.setAttribute('xmlns:xlink','http://www.w3.org/1999/xlink');
    if(!clone.getAttribute('width')) clone.setAttribute('width', svg.viewBox?.baseVal?.width || svg.clientWidth || 1120);
    if(!clone.getAttribute('height')) clone.setAttribute('height', svg.viewBox?.baseVal?.height || svg.clientHeight || 460);
    return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
  }

  function exportApparatusSvg() {
    const svg=$('apparatusSvg');
    if(!svg) return toast('Apparatus diagram is unavailable.','error');
    downloadBlob(serialiseSvg(svg), `${safeFilename(state.sessionId)}-photoelectric-apparatus.svg`, 'image/svg+xml;charset=utf-8');
    logAction('apparatus_svg_exported');
    toast('Apparatus SVG downloaded.','success');
  }

  function exportCanvasSvg(canvasId, filename, title) {
    const canvas=$(canvasId);
    if(!canvas) return toast('Graph is unavailable.','error');
    const png=canvas.toDataURL('image/png');
    const width=canvas.width, height=canvas.height;
    const svg=`<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}"><title>${escapeHtml(title)}</title><rect width="100%" height="100%" fill="white"/><image width="${width}" height="${height}" href="${png}" xlink:href="${png}"/></svg>`;
    downloadBlob(svg, filename, 'image/svg+xml;charset=utf-8');
    logAction('graph_svg_exported',{canvasId});
    toast('Graph SVG downloaded.','success');
  }

  function pdfAscii(value) {
    return String(value??'')
      .replace(/[–—−]/g,'-').replace(/[×]/g,'x').replace(/[φΦ]/g,'phi')
      .replace(/[λΛ]/g,'lambda').replace(/[²]/g,'^2').replace(/[³]/g,'^3')
      .replace(/[¹]/g,'^1').replace(/[⁴]/g,'^4').replace(/[⁻]/g,'-')
      .normalize('NFKD').replace(/[^\x20-\x7E\n]/g,'');
  }

  function wrapPdfText(text, max=92) {
    const out=[];
    pdfAscii(text).split(/\n+/).forEach(paragraph=>{
      const words=paragraph.trim().split(/\s+/).filter(Boolean);
      if(!words.length){out.push('');return;}
      let line='';
      words.forEach(word=>{
        const candidate=line?`${line} ${word}`:word;
        if(candidate.length>max && line){out.push(line);line=word;} else line=candidate;
      });
      if(line) out.push(line);
    });
    return out;
  }

  function pdfEscape(text) {
    return pdfAscii(text).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
  }

  function buildReportPdf() {
    const pages=[[]];
    let page=pages[0], y=790;
    const addLine=(text,size=10,bold=false,indent=0,gap=14)=>{
      if(y<55){page=[];pages.push(page);y=790;}
      page.push({text:pdfAscii(text),size,bold,x:50+indent,y});
      y-=gap;
    };
    const addParagraph=(text,size=10)=>{wrapPdfText(text,94).forEach(line=>addLine(line,size,false,0,13));y-=4;};
    const section=(title)=>{y-=4;addLine(title,12,true,0,18);};

    addLine(state.report.title || 'Photoelectric Effect Practical Report',16,true,0,22);
    addLine(`${state.report.moduleCode || 'Modern Physics'} | ${state.report.practicalDate || ''}`,10,false);
    addLine(`${state.report.studentName || 'Student name'} | ${state.report.studentNumber || 'Student number'}`,10,false);
    addLine(`Lecturer: ${state.report.lecturerName || 'Not entered'}`,10,false);
    addLine(`Session: ${state.sessionId}`,9,false,0,18);

    section('1. Aim');
    addParagraph("To investigate the photoelectric effect, obtain current-voltage characteristics, determine stopping potentials at multiple frequencies, and estimate Planck's constant and the cathode work function.");
    section('2. Theory');
    addParagraph("Einstein's photoelectric equation is Kmax = hf - phi. At the stopping potential, eVs = hf - phi, so the slope of stopping potential against frequency equals h/e.");
    section('3. Apparatus and procedure');
    addParagraph('A virtual mercury source, wavelength filters, aperture selector, evacuated phototube, variable DC supply and sensitive current meter were configured. The source was stabilised and the meter was zero-calibrated with the shutter closed. Current was recorded while the anode potential was varied from retarding to accelerating values.');

    section('4. Raw results');
    addLine('No.  lambda(nm)  Bias(V)  Current(pA)  Intensity  Range(pA)',9,true,0,13);
    if(!state.readings.length) addLine('No readings recorded.',9);
    state.readings.forEach((r,i)=>addLine(`${String(i+1).padStart(3)}  ${String(r.lambda).padStart(9)}  ${Number(r.voltage).toFixed(3).padStart(7)}  ${Number(r.current).toFixed(2).padStart(11)}  ${String(r.intensity+'%').padStart(9)}  ${String(r.range).padStart(9)}`,8,false,0,11));

    section('5. Stopping-potential results');
    addLine('No.  lambda(nm)  f(10^14 Hz)  Vs(V)  u(Vs)(V)',9,true,0,13);
    if(!state.stoppingResults.length) addLine('No stopping-potential results recorded.',9);
    state.stoppingResults.forEach((r,i)=>addLine(`${String(i+1).padStart(3)}  ${String(r.lambda).padStart(9)}  ${(r.frequency/1e14).toFixed(3).padStart(11)}  ${r.vs.toFixed(3).padStart(6)}  ${r.uncertainty.toFixed(3).padStart(8)}`,8,false,0,11));

    section('6. Analysis');
    if(state.regression){
      const r=state.regression;
      addParagraph(`The least-squares fit gave Vs = ${r.slopeScaled.toFixed(4)} f14 ${r.intercept>=0?'+':'-'} ${Math.abs(r.intercept).toFixed(4)}, with R^2 = ${r.r2.toFixed(4)}. The measured Planck constant was ${(r.hMeasured/1e-34).toFixed(4)} x 10^-34 J s with uncertainty ${(r.hUncertainty/1e-34).toFixed(4)} x 10^-34 J s. Percentage error was ${r.percentError.toFixed(2)}%. The fitted work function was ${r.workFunctionEv.toFixed(3)} eV.`);
    } else addParagraph('Regression has not yet been completed.');
    section('7. Observations and discussion');addParagraph(state.notes || 'No laboratory observations entered.');
    section('8. Uncertainty');addParagraph(state.report.uncertainty || 'No uncertainty discussion entered.');
    section('9. Conclusion');addParagraph(state.report.conclusion || 'No conclusion entered.');
    section('Reference values');addParagraph('Planck constant h = 6.62607015 x 10^-34 J s; elementary charge e = 1.602176634 x 10^-19 C; speed of light c = 299792458 m s^-1.');

    const objects=[null];
    objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
    objects[2]='';
    objects[3]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    objects[4]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
    const pageRefs=[];
    pages.forEach((items,index)=>{
      const content=items.map(item=>`BT /F${item.bold?2:1} ${item.size} Tf 1 0 0 1 ${item.x} ${item.y} Tm (${pdfEscape(item.text)}) Tj ET`).join('\n');
      const contentRef=objects.length;
      objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      const pageRef=objects.length;
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentRef} 0 R >>`);
      pageRefs.push(pageRef);
    });
    objects[2]=`<< /Type /Pages /Kids [${pageRefs.map(r=>`${r} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`;
    let pdf='%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const offsets=[0];
    for(let i=1;i<objects.length;i++){offsets[i]=pdf.length;pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`;}
    const xref=pdf.length;
    pdf+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for(let i=1;i<objects.length;i++) pdf+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
    pdf+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([new Uint8Array([...pdf].map(ch=>ch.charCodeAt(0)&255))],{type:'application/pdf'});
  }

  function downloadReportPdf() {
    updateReport();
    const blob=buildReportPdf();
    const filename=`${safeFilename(state.report.studentName||state.sessionId)}-photoelectric-effect-report.pdf`;
    downloadBlob(blob, filename, 'application/pdf');
    logAction('report_pdf_downloaded',{filename,pages:'auto'});
    toast('PDF report downloaded.','success');
  }

  function exportCSV() {
    if(!state.readings.length) return toast('No raw readings to export.', 'warning');
    const rows=[['index','timestamp','wavelength_nm','frequency_hz','intensity_percent','aperture_mm','distance_cm','anode_voltage_V','photocurrent_pA','meter_range_pA','source']];
    state.readings.forEach((r,i)=>rows.push([i+1,r.timestamp,r.lambda,r.frequency,r.intensity,r.aperture,r.distance,r.voltage,r.current,r.range,r.source]));
    downloadBlob(rows.map(row=>row.join(',')).join('\n'),'photoelectric_raw_data.csv','text/csv');
    logAction('csv_exported',{rows:state.readings.length});
  }

  function exportSession() {
    downloadBlob(JSON.stringify(state,null,2),`${state.sessionId}-photoelectric-session.json`,'application/json');
    logAction('session_exported');
  }

  function importSession(file) {
    const reader=new FileReader();
    reader.onload=()=>{
      try {
        const imported=JSON.parse(reader.result);
        if(!imported.version||!Array.isArray(imported.readings)) throw new Error('Invalid session file');
        state={...structuredClone(DEFAULT_STATE),...imported,report:{...DEFAULT_STATE.report,...(imported.report||{})}};
        initialiseHiddenParameters(false);syncControlsFromState();applyMode();renderAll();saveState();
        toast('Session imported successfully.','success');
      } catch(error){toast(`Import failed: ${error.message}`,'error');}
    };
    reader.readAsText(file);
  }

  function downloadBlob(content, filename, type) {
    const blob=content instanceof Blob ? content : new Blob([content],{type});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);
  }

  function resetBench() {
    if (autoSweepRunning) return;
    const preserve={ mode:state.mode, theme:state.theme, sessionId:state.sessionId, sessionSeed:state.sessionSeed, readings:state.readings, stoppingResults:state.stoppingResults, notes:state.notes, report:state.report, actions:state.actions };
    state={...structuredClone(DEFAULT_STATE),...preserve};initialiseHiddenParameters(false);syncControlsFromState();applyMode();renderAll();logAction('bench_reset');toast('Bench controls reset. Notebook data was preserved.','success');
  }

  function clearAllSession() {
    state=structuredClone(DEFAULT_STATE);initialiseHiddenParameters(true);state.report.practicalDate=new Date().toISOString().slice(0,10);syncControlsFromState();applyMode();renderAll();saveState();toast('A new experimental session has been created.','success');
  }

  function syncVoltageControls() {
    $('voltageInput').value=String(state.voltage);$('voltageNumber').value=Number(state.voltage).toFixed(2);$('voltageOut').textContent=`${Number(state.voltage).toFixed(3)} V`;
  }

  function renderAll() {
    updateOutputs();renderReadings();renderStoppingResults();drawIVGraph();drawVFGraph();renderRegressionSummary();updateReport();
  }

  function addDemoDataset() {
    if(state.mode!=='learn') return toast('Demonstration data are available only in Learn mode.','warning');
    const old={...state};
    const wavelengths=[365,405,436,546,577];
    state.readings=[];state.stoppingResults=[];state.lampOn=true;state.lampStable=true;state.warmup=100;state.shutterOpen=true;state.calibrated=true;state.zeroCorrection=state.hiddenOffset+.55;state.cathode='cesium';state.intensity=60;state.aperture=4;state.distance=25;
    wavelengths.forEach((lambda,wi)=>{
      state.wavelength=lambda;
      const trueVs=physicsModel(0,{noNoise:true}).trueStopping;
      const voltages=[];for(let i=0;i<12;i++)voltages.push(-(trueVs+.35)+i*((trueVs+3.2)/11));
      voltages.forEach((v,i)=>{state.voltage=Number(v.toFixed(3));noiseTick+=1;const m=physicsModel();state.readings.push({id:`demo-${lambda}-${i}`,timestamp:new Date(Date.now()+wi*1000+i).toISOString(),lambda,frequency:m.frequency,intensity:60,aperture:4,distance:25,cathode:'cesium',voltage:state.voltage,current:m.displayedCurrent,range:1000,resolution:1,source:'demonstration'});});
      const noise=(seededRandom(state.sessionSeed+lambda)-.5)*.035;addStoppingResult(lambda,Math.max(0,trueVs+noise),.025,'demonstration', true);
    });
    state.wavelength=436;state.voltage=0;state.regression=null;syncControlsFromState();calculateRegression();renderAll();saveState();toast('Demonstration dataset loaded. Replace it with your own experimental data for assessment.','success');
    logAction('demonstration_dataset_loaded');
  }

  function handleModeChange(newMode) {
    if(newMode===state.mode) return;
    state.mode=newMode;
    if(newMode==='assessment') {
      const assessmentMaterials = MATERIALS.filter(m => m.phi <= 2.80);
      const idx=Math.floor(seededRandom(state.sessionSeed+77)*assessmentMaterials.length);
      state.cathode=assessmentMaterials[idx].id;
      state.readings=[];state.stoppingResults=[];state.regression=null;state.notes='';state.calibrated=false;state.zeroCorrection=0;
      initialiseHiddenParameters(true);
      toast('Assessment mode started with a new hidden apparatus configuration.','warning');
      logAction('assessment_started',{sessionId:state.sessionId});
    } else logAction('mode_changed',{mode:newMode});
    syncControlsFromState();applyMode();renderAll();saveState();
  }

  function bindEvents() {
    qsa('.mode-btn').forEach(btn=>btn.addEventListener('click',()=>handleModeChange(btn.dataset.mode)));
    qsa('.section-tab').forEach(btn=>btn.addEventListener('click',()=>{
      qsa('.section-tab').forEach(b=>b.classList.toggle('active',b===btn));
      qsa('.app-section').forEach(sec=>sec.classList.toggle('active',sec.id===`section-${btn.dataset.section}`));
      if(btn.dataset.section==='notebook'){setTimeout(()=>{drawIVGraph();drawVFGraph();},80);}
      if(btn.dataset.section==='report')updateReport();
    }));
    $('themeBtn').addEventListener('click',()=>{state.theme=state.theme==='dark'?'light':'dark';document.body.classList.toggle('light',state.theme==='light');saveState();drawIVGraph();drawVFGraph();});
    $('newSessionBtn').addEventListener('click',()=>{if(confirm('Start a new session and clear all current data?')) clearAllSession();});
    $('openManualBtn').addEventListener('click',()=>$('manualDialog').showModal());
    $('closeManualBtn').addEventListener('click',()=>$('manualDialog').close());
    $('manualDialog').addEventListener('click',e=>{if(e.target===$('manualDialog'))$('manualDialog').close();});
    $('lampBtn').addEventListener('click',toggleLamp);$('shutterBtn').addEventListener('click',toggleShutter);$('resetBenchBtn').addEventListener('click',resetBench);

    const simpleBindings=[
      ['wavelengthSelect','wavelength',Number,'wavelength_changed'],['intensityInput','intensity',Number,'intensity_changed'],['apertureSelect','aperture',Number,'aperture_changed'],
      ['distanceInput','distance',Number,'distance_changed'],['cathodeSelect','cathode',String,'cathode_changed'],['rangeSelect','meterRange',Number,'range_changed'],['thresholdInput','zeroThreshold',Number,'criterion_changed']
    ];
    simpleBindings.forEach(([id,key,convert,action])=>$(id).addEventListener('input',()=>{state[key]=convert($(id).value);if(key==='meterRange')state.calibrated=false;logAction(action,{value:state[key]});updateOutputs();saveState();}));
    $('voltageInput').addEventListener('input',()=>{state.voltage=Number($('voltageInput').value);syncVoltageControls();updateOutputs();});
    $('voltageInput').addEventListener('change',()=>logAction('voltage_changed',{value:state.voltage}));
    $('voltageNumber').addEventListener('change',()=>{state.voltage=Math.max(-5,Math.min(10,Number($('voltageNumber').value)||0));syncVoltageControls();logAction('voltage_changed',{value:state.voltage});updateOutputs();saveState();});
    qsa('.step-btn').forEach(btn=>btn.addEventListener('click',()=>{state.voltage=Math.max(-5,Math.min(10,Number((state.voltage+Number(btn.dataset.step)).toFixed(3))));syncVoltageControls();logAction('voltage_stepped',{value:state.voltage});updateOutputs();saveState();}));
    $('calibrationToggle').addEventListener('change',()=>{state.calibrationMode=$('calibrationToggle').checked;logAction('calibration_mode',{enabled:state.calibrationMode});updateOutputs();saveState();});
    $('zeroMeterBtn').addEventListener('click',zeroMeter);$('recordReadingBtn').addEventListener('click',()=>recordReading('manual'));$('demoDataBtn').addEventListener('click',addDemoDataset);$('scanBtn').addEventListener('click',runVoltageSweep);$('estimateVsBtn').addEventListener('click',estimateStoppingPotential);

    $('exportCsvBtn').addEventListener('click',exportCSV);$('exportApparatusSvgBtn').addEventListener('click',exportApparatusSvg);$('exportIvSvgBtn').addEventListener('click',()=>exportCanvasSvg('ivCanvas',`${safeFilename(state.sessionId)}-current-voltage-graph.svg`,'Photocurrent versus anode potential'));$('exportVfSvgBtn').addEventListener('click',()=>exportCanvasSvg('vfCanvas',`${safeFilename(state.sessionId)}-stopping-potential-frequency-graph.svg`,'Stopping potential versus frequency'));
    $('clearReadingsBtn').addEventListener('click',()=>{if(confirm('Clear all raw current-voltage readings?')){state.readings=[];state.regression=null;logAction('all_readings_cleared');renderReadings();drawIVGraph();updateReport();}});
    $('ivWavelengthFilter').addEventListener('change',drawIVGraph);$('fitIvBtn').addEventListener('click',fitIvSummary);
    $('addManualVsBtn').addEventListener('click',()=>addStoppingResult(Number($('manualLambda').value),Number($('manualVs').value),Number($('manualUnc').value), 'manual entry'));
    $('clearStoppingBtn').addEventListener('click',()=>{if(confirm('Clear all stopping-potential results and regression?')){state.stoppingResults=[];state.regression=null;logAction('stopping_results_cleared');renderStoppingResults();drawVFGraph();renderRegressionSummary();updateReport();}});
    $('regressionBtn').addEventListener('click',calculateRegression);
    $('labNotes').addEventListener('input',()=>{state.notes=$('labNotes').value;saveState();updateReport();});

    $('prelabForm').addEventListener('submit',e=>{e.preventDefault();const data=new FormData(e.target);const answers={q1:'b',q2:'a',q3:'b',q4:'b'};let score=0;Object.entries(answers).forEach(([q,a])=>{if(data.get(q)===a)score++;});state.prelabScore=score;logAction('prelab_submitted',{score});$('quizResult').innerHTML=`You scored <strong>${score}/4</strong>. ${score===4?'You are ready to begin the practical.':'Review the theory and correct the missed concepts before assessment.'}`;saveState();});

    const reportBindings={studentName:'studentName',studentNumber:'studentNumber',moduleCode:'moduleCode',lecturerName:'lecturerName',practicalDate:'practicalDate',reportTitle:'title',reportConclusion:'conclusion',reportUncertainty:'uncertainty'};
    Object.entries(reportBindings).forEach(([id,key])=>$(id).addEventListener('input',()=>{state.report[key]=$(id).value;saveState();updateReport();}));
    $('previewReportBtn').addEventListener('click',()=>{updateReport();toast('Report preview refreshed.','success');});$('downloadPdfBtn').addEventListener('click',downloadReportPdf);$('printReportBtn').addEventListener('click',printReport);$('exportSessionBtn').addEventListener('click',exportSession);$('importSessionInput').addEventListener('change',()=>{const file=$('importSessionInput').files[0];if(file)importSession(file);});

    window.addEventListener('resize',()=>{clearTimeout(window.__graphResize);window.__graphResize=setTimeout(()=>{drawIVGraph();drawVFGraph();},140);});
    document.addEventListener('keydown',e=>{
      if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();recordReading('keyboard');}
      if(e.key===' '&&document.activeElement===document.body){e.preventDefault();toggleShutter();}
    });

    // Hidden developer/demo shortcut: Alt+D loads sample data in Learn mode.
    document.addEventListener('keydown',e=>{if(e.altKey&&e.key.toLowerCase()==='d')addDemoDataset();});
  }

  function init() {
    loadState();populateSelects();createParticles();syncControlsFromState();applyMode();bindEvents();renderAll();
    if(state.lampOn&&!state.lampStable){state.lampOn=false;state.warmup=0;state.lampStable=false;}
    animationFrame=requestAnimationFrame(animateVisuals);
  }

  init();
})();
