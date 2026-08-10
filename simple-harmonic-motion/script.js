(function () {
  "use strict";

  const elements = {
    apparatusCanvas: document.getElementById("apparatus-canvas"),
    graphCanvas: document.getElementById("graph-canvas"),
    playButton: document.getElementById("play-button"),
    playLabel: document.getElementById("play-label"),
    buttonIcon: document.querySelector(".button-icon"),
    stepButton: document.getElementById("step-button"),
    resetButton: document.getElementById("reset-button"),
    speedInput: document.getElementById("speed-input"),
    runStatus: document.getElementById("run-status"),
    amplitudeInput: document.getElementById("amplitude-input"),
    massInput: document.getElementById("mass-input"),
    springInput: document.getElementById("spring-input"),
    phaseInput: document.getElementById("phase-input"),
    amplitudeOutput: document.getElementById("amplitude-output"),
    massOutput: document.getElementById("mass-output"),
    springOutput: document.getElementById("spring-output"),
    phaseOutput: document.getElementById("phase-output"),
    xValue: document.getElementById("x-value"),
    vValue: document.getElementById("v-value"),
    aValue: document.getElementById("a-value"),
    timeValue: document.getElementById("time-value"),
    omegaValue: document.getElementById("omega-value"),
    periodValue: document.getElementById("period-value"),
    frequencyValue: document.getElementById("frequency-value"),
    energyValue: document.getElementById("energy-value"),
    energySum: document.getElementById("energy-sum"),
    potentialBar: document.getElementById("potential-bar"),
    kineticBar: document.getElementById("kinetic-bar"),
    potentialValue: document.getElementById("potential-value"),
    kineticValue: document.getElementById("kinetic-value"),
    showVelocity: document.getElementById("show-velocity"),
    showAcceleration: document.getElementById("show-acceleration")
  };

  const presets = {
    slow: { amplitude: 0.45, mass: 3.2, spring: 7, phase: 0 },
    balanced: { amplitude: 0.35, mass: 1, spring: 16, phase: 0 },
    fast: { amplitude: 0.24, mass: 0.45, spring: 34, phase: 90 }
  };

  const colors = {
    text: "#f4f7ff",
    muted: "#aebbd3",
    quiet: "#7587a7",
    grid: "rgba(158, 181, 222, 0.16)",
    gridStrong: "rgba(158, 181, 222, 0.30)",
    blue: "#6ea8ff",
    cyan: "#48d7e8",
    purple: "#a98bff",
    orange: "#ffb05f",
    pink: "#ff7ca8",
    green: "#62dfb3",
    massDark: "#c86d28"
  };

  let simulationTime = 0;
  let running = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let lastFrame = performance.now();

  function readParameters() {
    return {
      amplitude: Number(elements.amplitudeInput.value),
      mass: Number(elements.massInput.value),
      spring: Number(elements.springInput.value),
      phase: Number(elements.phaseInput.value) * Math.PI / 180,
      speed: Number(elements.speedInput.value)
    };
  }

  function calculate(parameters, time) {
    const omega = Math.sqrt(parameters.spring / parameters.mass);
    const period = 2 * Math.PI / omega;
    const frequency = 1 / period;
    const angle = omega * time + parameters.phase;
    const displacement = parameters.amplitude * Math.cos(angle);
    const velocity = -parameters.amplitude * omega * Math.sin(angle);
    const acceleration = -omega * omega * displacement;
    const totalEnergy = 0.5 * parameters.spring * parameters.amplitude * parameters.amplitude;
    const potentialEnergy = 0.5 * parameters.spring * displacement * displacement;
    const kineticEnergy = Math.max(0, totalEnergy - potentialEnergy);

    return {
      omega,
      period,
      frequency,
      displacement,
      velocity,
      acceleration,
      totalEnergy,
      potentialEnergy,
      kineticEnergy
    };
  }

  function signed(value, digits) {
    const cleanValue = Math.abs(value) < Math.pow(10, -digits) / 2 ? 0 : value;
    return `${cleanValue >= 0 ? "+" : "−"}${Math.abs(cleanValue).toFixed(digits)}`;
  }

  function updateLabels(parameters, values) {
    elements.amplitudeOutput.textContent = `${parameters.amplitude.toFixed(2)} m`;
    elements.massOutput.textContent = `${parameters.mass.toFixed(2)} kg`;
    elements.springOutput.textContent = `${parameters.spring.toFixed(0)} N/m`;
    elements.phaseOutput.textContent = `${Math.round(parameters.phase * 180 / Math.PI)}°`;

    elements.xValue.textContent = `${signed(values.displacement, 3)} m`;
    elements.vValue.textContent = `${signed(values.velocity, 3)} m/s`;
    elements.aValue.textContent = `${signed(values.acceleration, 3)} m/s²`;
    elements.timeValue.textContent = `${simulationTime.toFixed(2)} s`;

    elements.omegaValue.textContent = `${values.omega.toFixed(2)} rad/s`;
    elements.periodValue.textContent = `${values.period.toFixed(2)} s`;
    elements.frequencyValue.textContent = `${values.frequency.toFixed(2)} Hz`;
    elements.energyValue.textContent = `${values.totalEnergy.toFixed(2)} J`;
    elements.energySum.textContent = `Σ ${values.totalEnergy.toFixed(2)} J`;
    elements.potentialValue.textContent = `${values.potentialEnergy.toFixed(2)} J`;
    elements.kineticValue.textContent = `${values.kineticEnergy.toFixed(2)} J`;

    const potentialPercent = values.totalEnergy > 0 ? values.potentialEnergy / values.totalEnergy * 100 : 0;
    const kineticPercent = values.totalEnergy > 0 ? values.kineticEnergy / values.totalEnergy * 100 : 0;
    elements.potentialBar.style.width = `${Math.min(100, potentialPercent)}%`;
    elements.kineticBar.style.width = `${Math.min(100, kineticPercent)}%`;
  }

  function prepareCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const targetWidth = Math.round(width * ratio);
    const targetHeight = Math.round(height * ratio);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    const context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { context, width, height };
  }

  function roundedRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function drawArrow(context, startX, startY, delta, color, label) {
    if (Math.abs(delta) < 3) {
      return;
    }

    const endX = startX + delta;
    const direction = Math.sign(delta);
    context.save();
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 2.5;
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, startY);
    context.stroke();
    context.beginPath();
    context.moveTo(endX, startY);
    context.lineTo(endX - direction * 8, startY - 5);
    context.lineTo(endX - direction * 8, startY + 5);
    context.closePath();
    context.fill();
    context.font = "700 11px Inter, system-ui, sans-serif";
    context.textAlign = direction > 0 ? "left" : "right";
    context.fillText(label, endX + direction * 7, startY - 7);
    context.restore();
  }

  function drawApparatus(parameters, values) {
    const { context, width, height } = prepareCanvas(elements.apparatusCanvas);
    context.clearRect(0, 0, width, height);

    const background = context.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, "rgba(10, 25, 45, 0.96)");
    background.addColorStop(1, "rgba(3, 10, 20, 0.98)");
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    const wallX = Math.max(48, width * 0.07);
    const equilibriumX = Math.max(wallX + 175, width * 0.63);
    const railY = height * 0.64;
    const massWidth = Math.max(58, Math.min(86, width * 0.095));
    const massHeight = Math.max(54, Math.min(72, height * 0.23));
    const available = Math.min(equilibriumX - wallX - 55, width - equilibriumX - massWidth - 28);
    const scale = Math.max(95, available / 0.66);
    const massCenterX = equilibriumX + values.displacement * scale;
    const massLeft = massCenterX - massWidth / 2;
    const springY = railY - massHeight * 0.5;

    context.strokeStyle = "rgba(158, 181, 222, 0.10)";
    context.lineWidth = 1;
    for (let x = 0; x <= width; x += 36) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let y = 0; y <= height; y += 36) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }

    context.fillStyle = "rgba(126, 149, 190, 0.22)";
    context.fillRect(wallX - 10, springY - 76, 15, railY - springY + 86);
    context.strokeStyle = "rgba(174, 194, 230, 0.45)";
    context.lineWidth = 2;
    for (let y = springY - 70; y < railY + 8; y += 14) {
      context.beginPath();
      context.moveTo(wallX - 10, y + 12);
      context.lineTo(wallX + 5, y);
      context.stroke();
    }

    context.strokeStyle = "rgba(160, 181, 218, 0.35)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(wallX - 10, railY + massHeight / 2 + 10);
    context.lineTo(width - 24, railY + massHeight / 2 + 10);
    context.stroke();

    context.strokeStyle = colors.cyan;
    context.lineWidth = 3;
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(wallX + 5, springY);
    const springStart = wallX + 14;
    const springEnd = massLeft;
    const springLength = Math.max(30, springEnd - springStart);
    const turns = 15;
    const segments = turns * 8;
    for (let index = 0; index <= segments; index += 1) {
      const progress = index / segments;
      const x = springStart + progress * springLength;
      const envelope = Math.sin(Math.PI * progress);
      const y = springY + Math.sin(progress * turns * Math.PI * 2) * 14 * envelope;
      context.lineTo(x, y);
    }
    context.stroke();

    context.save();
    context.setLineDash([5, 6]);
    context.strokeStyle = "rgba(169, 139, 255, 0.72)";
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(equilibriumX, 34);
    context.lineTo(equilibriumX, railY + massHeight / 2 + 22);
    context.stroke();
    context.restore();

    context.fillStyle = colors.purple;
    context.font = "700 11px Inter, system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText("equilibrium", equilibriumX, 25);

    const leftLimit = equilibriumX - parameters.amplitude * scale;
    const rightLimit = equilibriumX + parameters.amplitude * scale;
    context.strokeStyle = "rgba(255, 176, 95, 0.65)";
    context.lineWidth = 2;
    [leftLimit, rightLimit].forEach((x) => {
      context.beginPath();
      context.moveTo(x, railY + massHeight / 2 + 4);
      context.lineTo(x, railY + massHeight / 2 + 17);
      context.stroke();
    });
    context.fillStyle = colors.orange;
    context.font = "700 10px Inter, system-ui, sans-serif";
    context.fillText("−A", leftLimit, railY + massHeight / 2 + 32);
    context.fillText("+A", rightLimit, railY + massHeight / 2 + 32);

    const massGradient = context.createLinearGradient(massLeft, railY - massHeight, massLeft + massWidth, railY);
    massGradient.addColorStop(0, colors.orange);
    massGradient.addColorStop(1, colors.massDark);
    context.shadowColor = "rgba(255, 176, 95, 0.32)";
    context.shadowBlur = 24;
    context.fillStyle = massGradient;
    roundedRect(context, massLeft, railY - massHeight, massWidth, massHeight, 12);
    context.fill();
    context.shadowBlur = 0;
    context.strokeStyle = "rgba(255, 235, 204, 0.58)";
    context.lineWidth = 1.5;
    context.stroke();

    context.fillStyle = "rgba(8, 19, 33, 0.9)";
    context.font = "800 13px Inter, system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText(`${parameters.mass.toFixed(2)} kg`, massCenterX, railY - massHeight / 2 + 4);

    const displacementY = railY + massHeight / 2 + 55;
    context.strokeStyle = colors.blue;
    context.fillStyle = colors.blue;
    context.lineWidth = 2.5;
    context.beginPath();
    context.moveTo(equilibriumX, displacementY);
    context.lineTo(massCenterX, displacementY);
    context.stroke();
    if (Math.abs(massCenterX - equilibriumX) > 5) {
      const direction = Math.sign(massCenterX - equilibriumX);
      context.beginPath();
      context.moveTo(massCenterX, displacementY);
      context.lineTo(massCenterX - direction * 8, displacementY - 5);
      context.lineTo(massCenterX - direction * 8, displacementY + 5);
      context.closePath();
      context.fill();
    }
    context.font = "700 11px Inter, system-ui, sans-serif";
    context.fillText(`x = ${signed(values.displacement, 3)} m`, (equilibriumX + massCenterX) / 2, displacementY + 19);

    const maxVelocity = Math.max(0.01, parameters.amplitude * values.omega);
    const maxAcceleration = Math.max(0.01, parameters.amplitude * values.omega * values.omega);
    drawArrow(context, massCenterX, railY - massHeight - 28, values.velocity / maxVelocity * 62, colors.green, "v");
    drawArrow(context, massCenterX, railY - massHeight - 50, values.acceleration / maxAcceleration * 62, colors.pink, "a");

    context.fillStyle = colors.quiet;
    context.font = "600 10px Inter, system-ui, sans-serif";
    context.textAlign = "left";
    context.fillText("spring force = −kx", wallX + 4, height - 15);
  }

  function drawGraph(parameters, values) {
    const { context, width, height } = prepareCanvas(elements.graphCanvas);
    context.clearRect(0, 0, width, height);
    context.fillStyle = "rgba(4, 12, 23, 0.96)";
    context.fillRect(0, 0, width, height);

    const left = Math.max(56, width * 0.075);
    const right = 18;
    const top = 17;
    const bottom = 27;
    const plotWidth = Math.max(10, width - left - right);
    const plotHeight = Math.max(10, height - top - bottom);
    const lanes = [
      { key: "x", label: "x / A", color: colors.blue, visible: true, phase: 0 },
      { key: "v", label: "v / Aω", color: colors.green, visible: elements.showVelocity.checked, phase: -Math.PI / 2 },
      { key: "a", label: "a / Aω²", color: colors.pink, visible: elements.showAcceleration.checked, phase: Math.PI }
    ].filter((lane) => lane.visible);
    const laneHeight = plotHeight / lanes.length;
    const duration = values.period * 2;

    context.strokeStyle = colors.grid;
    context.lineWidth = 1;
    for (let tick = 0; tick <= 8; tick += 1) {
      const x = left + tick / 8 * plotWidth;
      context.beginPath();
      context.moveTo(x, top);
      context.lineTo(x, top + plotHeight);
      context.stroke();
    }

    context.font = "600 10px Inter, system-ui, sans-serif";
    context.textAlign = "center";
    context.fillStyle = colors.quiet;
    for (let tick = 0; tick <= 4; tick += 1) {
      const t = tick / 4 * duration;
      const x = left + tick / 4 * plotWidth;
      context.fillText(`${t.toFixed(2)} s`, x, height - 8);
    }

    lanes.forEach((lane, laneIndex) => {
      const laneTop = top + laneIndex * laneHeight;
      const centerY = laneTop + laneHeight / 2;
      const amplitudeY = laneHeight * 0.32;

      context.strokeStyle = colors.gridStrong;
      context.beginPath();
      context.moveTo(left, centerY);
      context.lineTo(left + plotWidth, centerY);
      context.stroke();

      context.fillStyle = lane.color;
      context.textAlign = "right";
      context.font = "700 10px Inter, system-ui, sans-serif";
      context.fillText(lane.label, left - 9, centerY + 3);

      context.strokeStyle = lane.color;
      context.lineWidth = 2.2;
      context.beginPath();
      const samples = Math.max(180, Math.floor(plotWidth));
      for (let sample = 0; sample <= samples; sample += 1) {
        const progress = sample / samples;
        const t = progress * duration;
        const normalized = Math.cos(values.omega * t + parameters.phase + lane.phase);
        const x = left + progress * plotWidth;
        const y = centerY - normalized * amplitudeY;
        if (sample === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }
      context.stroke();
    });

    const markerProgress = (simulationTime % duration) / duration;
    const markerX = left + markerProgress * plotWidth;
    context.save();
    context.setLineDash([4, 4]);
    context.strokeStyle = "rgba(244, 247, 255, 0.78)";
    context.lineWidth = 1.3;
    context.beginPath();
    context.moveTo(markerX, top);
    context.lineTo(markerX, top + plotHeight);
    context.stroke();
    context.restore();

    context.fillStyle = colors.text;
    context.beginPath();
    context.arc(markerX, top + 5, 3.5, 0, Math.PI * 2);
    context.fill();
  }

  function updateRunState() {
    elements.playButton.setAttribute("aria-pressed", String(running));
    elements.playLabel.textContent = running ? "Pause" : "Play";
    elements.buttonIcon.textContent = running ? "Ⅱ" : "▶";
    elements.runStatus.textContent = running ? "Running" : "Paused";
    elements.runStatus.classList.toggle("is-paused", !running);
  }

  function render() {
    const parameters = readParameters();
    const values = calculate(parameters, simulationTime);
    updateLabels(parameters, values);
    drawApparatus(parameters, values);
    drawGraph(parameters, values);
  }

  function frame(timestamp) {
    const delta = Math.min(0.05, Math.max(0, (timestamp - lastFrame) / 1000));
    lastFrame = timestamp;
    if (running) {
      simulationTime += delta * Number(elements.speedInput.value);
    }
    render();
    window.requestAnimationFrame(frame);
  }

  elements.playButton.addEventListener("click", () => {
    running = !running;
    lastFrame = performance.now();
    updateRunState();
  });

  elements.stepButton.addEventListener("click", () => {
    running = false;
    const values = calculate(readParameters(), simulationTime);
    simulationTime += values.period / 120;
    updateRunState();
    render();
  });

  elements.resetButton.addEventListener("click", () => {
    simulationTime = 0;
    running = false;
    updateRunState();
    render();
  });

  [
    elements.amplitudeInput,
    elements.massInput,
    elements.springInput,
    elements.phaseInput,
    elements.speedInput,
    elements.showVelocity,
    elements.showAcceleration
  ].forEach((control) => control.addEventListener("input", render));

  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      const preset = presets[button.dataset.preset];
      elements.amplitudeInput.value = preset.amplitude;
      elements.massInput.value = preset.mass;
      elements.springInput.value = preset.spring;
      elements.phaseInput.value = preset.phase;
      simulationTime = 0;
      render();
    });
  });

  window.addEventListener("resize", render);
  updateRunState();
  render();
  window.requestAnimationFrame(frame);
}());
