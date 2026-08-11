(() => {
  const canvas = document.getElementById('spectrumCanvas');
  const ctx = canvas.getContext('2d');

  const tempSlider = document.getElementById('tempSlider');
  const tempValue = document.getElementById('tempValue');
  const peakWavelength = document.getElementById('peakWavelength');
  const peakFrequency = document.getElementById('peakFrequency');
  const powerValue = document.getElementById('powerValue');
  const regionValue = document.getElementById('regionValue');
  const visualDescription = document.getElementById('visualDescription');
  const previewPeak = document.getElementById('previewPeak');
  const graphNote = document.getElementById('graphNote');
  const zoomIn = document.getElementById('zoomIn');
  const zoomOut = document.getElementById('zoomOut');
  const zoomReset = document.getElementById('zoomReset');

  const visibleToggle = document.getElementById('visibleToggle');
  const peakToggle = document.getElementById('peakToggle');
  const gridToggle = document.getElementById('gridToggle');

  let showVisible = true;
  let showPeak = true;
  let showGrid = true;
  let lambdaMin = 100;
  let lambdaMax = 3000;
  const absoluteMin = 10;
  const absoluteMax = 10000;

  const h = 6.62607015e-34;
  const c = 299792458;
  const k = 1.380649e-23;
  const sigma = 5.670374419e-8;
  const wien = 2.897771955e-3;

  function superscriptExponent(exp) {
    const map = {'-':'⁻','0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'};
    return String(exp).split('').map(ch => map[ch] || ch).join('');
  }

  function sci(value, decimals = 2) {
    if (!value) return '0';
    const exp = Math.floor(Math.log10(Math.abs(value)));
    const mantissa = value / Math.pow(10, exp);
    return `${mantissa.toFixed(decimals)} × 10${superscriptExponent(exp)}`;
  }

  function planck(lambdaMeters, T) {
    const a = 2 * h * c * c;
    const b = h * c / (lambdaMeters * k * T);
    if (b > 700) return 0;
    return a / (Math.pow(lambdaMeters, 5) * Math.expm1(b));
  }

  function regionForNm(nm) {
    if (nm < 10) return 'X-ray';
    if (nm < 380) return 'Ultraviolet';
    if (nm <= 750) return 'Visible';
    if (nm < 1e6) return 'Infrared';
    return 'Microwave';
  }

  function wavelengthColor(nm, alpha = 1) {
    let r = 0, g = 0, b = 0;

    if (nm >= 380 && nm < 440) {
      r = -(nm - 440) / 60; g = 0; b = 1;
    } else if (nm < 490) {
      r = 0; g = (nm - 440) / 50; b = 1;
    } else if (nm < 510) {
      r = 0; g = 1; b = -(nm - 510) / 20;
    } else if (nm < 580) {
      r = (nm - 510) / 70; g = 1; b = 0;
    } else if (nm < 645) {
      r = 1; g = -(nm - 645) / 65; b = 0;
    } else if (nm <= 780) {
      r = 1; g = 0; b = 0;
    } else {
      return `rgba(255,255,255,${alpha})`;
    }

    let factor = 1;
    if (nm >= 380 && nm < 420) factor = 0.3 + 0.7 * (nm - 380) / 40;
    else if (nm > 700 && nm <= 780) factor = 0.3 + 0.7 * (780 - nm) / 80;

    const gamma = 0.8;
    r = Math.round(255 * Math.pow(Math.max(0, r * factor), gamma));
    g = Math.round(255 * Math.pow(Math.max(0, g * factor), gamma));
    b = Math.round(255 * Math.pow(Math.max(0, b * factor), gamma));

    return `rgba(${r},${g},${b},${alpha})`;
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function draw() {
    const T = Number(tempSlider.value);
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;

    ctx.clearRect(0, 0, W, H);

    const pad = { l: 68, r: 22, t: 24, b: 54 };
    const gw = W - pad.l - pad.r;
    const gh = H - pad.t - pad.b;


    if (showVisible) {
      const x1 = pad.l + ((380 - lambdaMin) / (lambdaMax - lambdaMin)) * gw;
      const x2 = pad.l + ((750 - lambdaMin) / (lambdaMax - lambdaMin)) * gw;
      const grad = ctx.createLinearGradient(x1, 0, x2, 0);
      const stops = [380,430,480,520,570,620,680,750];
      stops.forEach(nm => {
        grad.addColorStop((nm - 380) / (750 - 380), wavelengthColor(nm, .13));
      });
      ctx.fillStyle = grad;
      ctx.fillRect(x1, pad.t, x2 - x1, gh);
    }

    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#777781';
    ctx.strokeStyle = '#232329';
    ctx.lineWidth = 1;

    const span = lambdaMax - lambdaMin;
    const roughStep = span / 6;
    const pow10 = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const normalized = roughStep / pow10;
    const nice = normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10;
    const step = nice * pow10;
    const firstTick = Math.ceil(lambdaMin / step) * step;
    const xTicks = [];
    for (let v = firstTick; v <= lambdaMax + step * .01; v += step) xTicks.push(v);
    xTicks.forEach(nm => {
      const x = pad.l + ((nm - lambdaMin) / (lambdaMax - lambdaMin)) * gw;
      if (showGrid) {
        ctx.beginPath();
        ctx.moveTo(x, pad.t);
        ctx.lineTo(x, pad.t + gh);
        ctx.stroke();
      }
      ctx.textAlign = 'center';
      ctx.fillText(nm >= 1000 ? (nm/1000).toFixed(nm % 1000 === 0 ? 0 : 1) + 'k' : Math.round(nm), x, H - 27);
    });

    const samples = 1000;
    const values = [];
    let maxB = 0;

    for (let i = 0; i <= samples; i++) {
      const nm = lambdaMin + (lambdaMax - lambdaMin) * (i / samples);
      const B = planck(nm * 1e-9, T);
      values.push({ nm, B });
      if (B > maxB) maxB = B;
    }

    const yTicks = [0, .25, .5, .75, 1];
    yTicks.forEach(v => {
      const y = pad.t + gh - v * gh;
      if (showGrid) {
        ctx.beginPath();
        ctx.moveTo(pad.l, y);
        ctx.lineTo(pad.l + gw, y);
        ctx.stroke();
      }
      ctx.fillStyle = '#777781';
      ctx.textAlign = 'right';
      ctx.fillText(v.toFixed(2), pad.l - 10, y + 4);
    });

    ctx.strokeStyle = '#8c8c95';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, pad.t + gh);
    ctx.lineTo(pad.l + gw, pad.t + gh);
    ctx.stroke();

    ctx.save();
    ctx.translate(17, pad.t + gh / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8e8e98';
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillText('Relative spectral radiance', 0, 0);
    ctx.restore();

    ctx.fillStyle = '#8e8e98';
    ctx.textAlign = 'center';
    ctx.fillText('Wavelength (nm)', pad.l + gw / 2, H - 7);

    const areaGrad = ctx.createLinearGradient(0, pad.t, 0, pad.t + gh);
    areaGrad.addColorStop(0, 'rgba(255,255,255,.16)');
    areaGrad.addColorStop(1, 'rgba(255,255,255,.01)');

    ctx.beginPath();
    values.forEach((p, i) => {
      const x = pad.l + ((p.nm - lambdaMin) / (lambdaMax - lambdaMin)) * gw;
      const y = pad.t + gh - (p.B / maxB) * gh * .91;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(pad.l + gw, pad.t + gh);
    ctx.lineTo(pad.l, pad.t + gh);
    ctx.closePath();
    ctx.fillStyle = areaGrad;
    ctx.fill();

    ctx.beginPath();
    values.forEach((p, i) => {
      const x = pad.l + ((p.nm - lambdaMin) / (lambdaMax - lambdaMin)) * gw;
      const y = pad.t + gh - (p.B / maxB) * gh * .91;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#f5f5f6';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(255,255,255,.2)';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    const peakNm = (wien / T) * 1e9;
    graphNote.textContent = `Planck distribution · wavelength scale: ${Math.round(lambdaMin)}–${Math.round(lambdaMax)} nm`;
    if (showPeak && peakNm >= lambdaMin && peakNm <= lambdaMax) {
      const peakX = pad.l + ((peakNm - lambdaMin) / (lambdaMax - lambdaMin)) * gw;
      const peakB = planck(peakNm * 1e-9, T);
      const peakY = pad.t + gh - (peakB / maxB) * gh * .91;

      ctx.save();
      ctx.setLineDash([5,5]);
      ctx.strokeStyle = 'rgba(255,255,255,.42)';
      ctx.beginPath();
      ctx.moveTo(peakX, peakY);
      ctx.lineTo(peakX, pad.t + gh);
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(peakX, peakY, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();

      const labelX = Math.min(Math.max(peakX, pad.l + 55), pad.l + gw - 55);
      const labelY = Math.max(pad.t + 18, peakY - 18);
      ctx.fillStyle = 'rgba(8,8,10,.88)';
      ctx.strokeStyle = '#303038';
      ctx.lineWidth = 1;
      ctx.roundRect(labelX - 52, labelY - 16, 104, 28, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f0f0f2';
      ctx.textAlign = 'center';
      ctx.fillText(`λmax ${peakNm.toFixed(0)} nm`, labelX, labelY + 2);
    }
  }

  function updateStats() {
    const T = Number(tempSlider.value);
    const peakM = wien / T;
    const peakNm = peakM * 1e9;
    const freq = c / peakM;
    const power = sigma * Math.pow(T, 4);
    const region = regionForNm(peakNm);

    tempValue.textContent = T.toLocaleString('en-US').replace(/,/g,' ');
    peakWavelength.textContent = peakNm >= 1000
      ? `${(peakNm / 1000).toFixed(2)} μm`
      : `${peakNm.toFixed(1)} nm`;
    peakFrequency.textContent = `${sci(freq)} Hz`;
    powerValue.textContent = `${sci(power)} W/m²`;
    regionValue.textContent = region;

    let message = `At ${T.toLocaleString('en-US').replace(/,/g,' ')} K, the peak emission is in the ${region.toLowerCase()} region`;
    if (region === 'Visible') message += ', so a substantial part of the radiation lies within human vision.';
    else if (region === 'Infrared') message += ', beyond the red edge of human vision.';
    else if (region === 'Ultraviolet') message += ', at wavelengths shorter than visible light.';
    else message += '.';
    visualDescription.textContent = message;

    const previewPercent = Math.max(0, Math.min(100, ((peakNm - 380) / (750 - 380)) * 100));
    previewPeak.style.left = `calc(${previewPercent}% - 1px)`;
    previewPeak.style.opacity = peakNm >= 380 && peakNm <= 750 ? '1' : '.18';

    document.querySelectorAll('.preset').forEach(btn => {
      btn.classList.toggle('active', Number(btn.dataset.temp) === T);
    });

    draw();
  }

  tempSlider.addEventListener('input', updateStats);

  document.querySelectorAll('.preset').forEach(btn => {
    btn.addEventListener('click', () => {
      tempSlider.value = btn.dataset.temp;
      updateStats();
    });
  });

  function toggle(btn, key) {
    btn.classList.toggle('on');
    const on = btn.classList.contains('on');
    if (key === 'visible') showVisible = on;
    if (key === 'peak') showPeak = on;
    if (key === 'grid') showGrid = on;
    draw();
  }

  visibleToggle.addEventListener('click', () => toggle(visibleToggle, 'visible'));
  peakToggle.addEventListener('click', () => toggle(peakToggle, 'peak'));
  gridToggle.addEventListener('click', () => toggle(gridToggle, 'grid'));


  function zoom(factor) {
    const center = (lambdaMin + lambdaMax) / 2;
    let half = ((lambdaMax - lambdaMin) / 2) * factor;
    half = Math.max(75, Math.min(4995, half));
    lambdaMin = Math.max(absoluteMin, center - half);
    lambdaMax = Math.min(absoluteMax, center + half);

    if (lambdaMin === absoluteMin) lambdaMax = Math.min(absoluteMax, lambdaMin + half * 2);
    if (lambdaMax === absoluteMax) lambdaMin = Math.max(absoluteMin, lambdaMax - half * 2);
    draw();
  }

  zoomIn.addEventListener('click', () => zoom(0.65));
  zoomOut.addEventListener('click', () => zoom(1.55));
  zoomReset.addEventListener('click', () => {
    lambdaMin = 100;
    lambdaMax = 3000;
    draw();
  });

  window.addEventListener('resize', resizeCanvas);

  updateStats();
  resizeCanvas();
})();
