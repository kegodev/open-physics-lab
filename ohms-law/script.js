(() => {
  "use strict";

  const state = {
    voltage: 9,
    resistance: 330,
    closed: true,
    readings: [],
  };

  const $ = (id) => document.getElementById(id);
  const elements = {
    voltageRange: $("voltageRange"),
    voltageNumber: $("voltageNumber"),
    resistanceRange: $("resistanceRange"),
    resistanceNumber: $("resistanceNumber"),
    toggle: $("circuitToggle"),
    toggleLabel: $("toggleLabel"),
    switchArm: $("switchArm"),
    electronFlow: $("electronFlow"),
    statusChip: $("statusChip"),
    statusText: $("statusText"),
    batteryValue: $("batteryValue"),
    resistorValue: $("resistorValue"),
    ammeterValue: $("ammeterValue"),
    voltmeterValue: $("voltmeterValue"),
    voltageReadout: $("voltageReadout"),
    resistanceReadout: $("resistanceReadout"),
    currentReadout: $("currentReadout"),
    currentUnit: $("currentUnit"),
    powerReadout: $("powerReadout"),
    powerUnit: $("powerUnit"),
    insightTitle: $("insightTitle"),
    insightBody: $("insightBody"),
    calculationText: $("calculationText"),
    calculationNote: $("calculationNote"),
    slopeBadge: $("slopeBadge"),
    graph: $("viGraph"),
    readingsBody: $("readingsBody"),
    clearReadings: $("clearReadings"),
  };

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const currentDisplay = (amps) => {
    if (amps < 1) return { value: (amps * 1000).toFixed(1), unit: "mA" };
    return { value: amps.toFixed(2), unit: "A" };
  };

  const powerDisplay = (watts) => {
    if (watts < 1) return { value: (watts * 1000).toFixed(0), unit: "mW" };
    return { value: watts.toFixed(2), unit: "W" };
  };

  const formatCurrent = (amps) => {
    const reading = currentDisplay(amps);
    return `${reading.value} ${reading.unit}`;
  };

  const formatPower = (watts) => {
    const reading = powerDisplay(watts);
    return `${reading.value} ${reading.unit}`;
  };

  function drawGraph(current) {
    const canvas = elements.graph;
    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const left = 72;
    const right = 28;
    const top = 34;
    const bottom = 55;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const xFor = (voltage) => left + (voltage / 24) * plotWidth;
    const yFor = (amps) => top + plotHeight - (amps / 0.5) * plotHeight;

    context.clearRect(0, 0, width, height);
    context.lineWidth = 1;
    context.font = '12px "DM Mono", monospace';
    context.textBaseline = "middle";

    for (let tick = 0; tick <= 4; tick += 1) {
      const amps = tick * 0.125;
      const y = yFor(amps);
      context.strokeStyle = "#e1e5de";
      context.beginPath();
      context.moveTo(left, y);
      context.lineTo(width - right, y);
      context.stroke();
      context.fillStyle = "#65716c";
      context.textAlign = "right";
      context.fillText(tick === 0 ? "0" : amps.toFixed(3), left - 12, y);
    }

    [0, 6, 12, 18, 24].forEach((volts) => {
      const x = xFor(volts);
      context.strokeStyle = "#e1e5de";
      context.beginPath();
      context.moveTo(x, top);
      context.lineTo(x, top + plotHeight);
      context.stroke();
      context.fillStyle = "#65716c";
      context.textAlign = "center";
      context.fillText(String(volts), x, top + plotHeight + 23);
    });

    context.strokeStyle = "#17231f";
    context.lineWidth = 1.8;
    context.beginPath();
    context.moveTo(left, top);
    context.lineTo(left, top + plotHeight);
    context.lineTo(width - right, top + plotHeight);
    context.stroke();

    const endCurrent = 24 / state.resistance;
    context.strokeStyle = "#ef704f";
    context.lineWidth = 5;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(xFor(0), yFor(0));
    context.lineTo(xFor(24), yFor(endCurrent));
    context.stroke();

    const pointX = xFor(state.voltage);
    const pointY = yFor(current);
    context.setLineDash([5, 6]);
    context.strokeStyle = "rgba(15, 95, 77, 0.42)";
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(pointX, yFor(0));
    context.lineTo(pointX, pointY);
    context.lineTo(left, pointY);
    context.stroke();
    context.setLineDash([]);

    context.fillStyle = "#c8ec78";
    context.strokeStyle = "#0f5f4d";
    context.lineWidth = 4;
    context.beginPath();
    context.arc(pointX, pointY, 9, 0, Math.PI * 2);
    context.fill();
    context.stroke();

    context.fillStyle = "#17231f";
    context.font = '600 13px "DM Mono", monospace';
    context.textAlign = "center";
    context.fillText("Voltage (V)", left + plotWidth / 2, height - 12);
    context.save();
    context.translate(18, top + plotHeight / 2);
    context.rotate(-Math.PI / 2);
    context.fillText("Current (A)", 0, 0);
    context.restore();

    canvas.setAttribute(
      "aria-label",
      `Voltage-current graph for ${state.resistance} ohms. Current at ${state.voltage} volts is ${current.toFixed(4)} amperes.`,
    );
  }

  function updateInsight(current) {
    if (!state.closed) {
      elements.insightTitle.textContent = "The path is broken";
      elements.insightBody.textContent = "Opening the switch makes current zero. Close it to give charge a complete path around the circuit.";
      return;
    }
    if (current >= 0.25) {
      elements.insightTitle.textContent = "Low resistance, strong current";
      elements.insightBody.textContent = "The resistor offers less opposition, so more current flows and electrical power rises quickly.";
      return;
    }
    if (current <= 0.02) {
      elements.insightTitle.textContent = "Resistance is limiting the flow";
      elements.insightBody.textContent = "Only a small current can pass. Increase voltage or lower resistance and watch the ammeter respond.";
      return;
    }
    elements.insightTitle.textContent = "Ohm's law is in balance";
    elements.insightBody.textContent = `${state.voltage.toFixed(1)} volts across ${state.resistance} ohms produces ${formatCurrent(current)} of current.`;
  }

  function updatePresetSelection() {
    document.querySelectorAll("[data-voltage][data-resistance]").forEach((button) => {
      const selected = Number(button.dataset.voltage) === state.voltage
        && Number(button.dataset.resistance) === state.resistance;
      button.classList.toggle("selected", selected);
    });
  }

  function update() {
    const theoreticalCurrent = state.voltage / state.resistance;
    const current = state.closed ? theoreticalCurrent : 0;
    const power = state.closed ? state.voltage * current : 0;
    const currentReading = currentDisplay(current);
    const powerReading = powerDisplay(power);

    elements.voltageRange.value = state.voltage;
    elements.voltageNumber.value = state.voltage;
    elements.resistanceRange.value = state.resistance;
    elements.resistanceNumber.value = state.resistance;

    elements.batteryValue.textContent = `${state.voltage.toFixed(1)} V`;
    elements.resistorValue.textContent = `${state.resistance} Ω`;
    elements.ammeterValue.textContent = formatCurrent(current);
    elements.voltmeterValue.textContent = `${state.closed ? state.voltage.toFixed(1) : "0.0"} V`;

    elements.voltageReadout.textContent = state.voltage.toFixed(1);
    elements.resistanceReadout.textContent = state.resistance;
    elements.currentReadout.textContent = currentReading.value;
    elements.currentUnit.textContent = currentReading.unit;
    elements.powerReadout.textContent = powerReading.value;
    elements.powerUnit.textContent = powerReading.unit;

    elements.toggle.classList.toggle("on", state.closed);
    elements.toggle.setAttribute("aria-checked", String(state.closed));
    elements.toggleLabel.textContent = state.closed ? "Closed" : "Open";
    elements.statusChip.classList.toggle("active", state.closed);
    elements.statusText.textContent = state.closed ? "Current flowing" : "Circuit open";
    elements.switchArm.setAttribute("x2", state.closed ? "326" : "315");
    elements.switchArm.setAttribute("y2", state.closed ? "112" : "68");
    elements.electronFlow.classList.toggle("paused", !state.closed);

    const duration = clamp(2.6 - current * 4, 0.65, 2.6);
    elements.electronFlow.querySelectorAll("animateMotion").forEach((animation, index) => {
      animation.setAttribute("dur", `${duration}s`);
      animation.setAttribute("begin", `${(-index * duration) / 6}s`);
    });

    elements.calculationText.textContent = `${state.voltage.toFixed(1)} ÷ ${state.resistance} = ${theoreticalCurrent.toFixed(4)} A`;
    elements.calculationNote.textContent = state.closed ? "" : "Calculated value applies when the switch is closed.";
    elements.slopeBadge.textContent = `slope = 1 / ${state.resistance} Ω`;

    updateInsight(current);
    updatePresetSelection();
    drawGraph(current);
  }

  function renderReadings() {
    if (state.readings.length === 0) {
      elements.readingsBody.innerHTML = '<tr class="empty-row"><td colspan="6">Set the controls, then record your first reading.</td></tr>';
      elements.clearReadings.classList.add("hidden");
      return;
    }

    elements.clearReadings.classList.remove("hidden");
    elements.readingsBody.innerHTML = state.readings.map((reading, index) => `
      <tr>
        <td><span class="trial-number">${String(index + 1).padStart(2, "0")}</span></td>
        <td>${reading.voltage.toFixed(1)} V</td>
        <td>${reading.resistance} Ω</td>
        <td>${formatCurrent(reading.current)}</td>
        <td>${formatPower(reading.power)}</td>
        <td><span class="table-status ${reading.closed ? "closed" : ""}">${reading.closed ? "Closed" : "Open"}</span></td>
      </tr>
    `).join("");
  }

  elements.voltageRange.addEventListener("input", (event) => {
    state.voltage = Number(event.target.value);
    update();
  });

  elements.resistanceRange.addEventListener("input", (event) => {
    state.resistance = Number(event.target.value);
    update();
  });

  elements.voltageNumber.addEventListener("input", (event) => {
    if (event.target.value === "") return;
    state.voltage = clamp(Number(event.target.value) || 0.5, 0.5, 24);
    update();
  });

  elements.resistanceNumber.addEventListener("input", (event) => {
    if (event.target.value === "") return;
    state.resistance = clamp(Math.round((Number(event.target.value) || 50) / 10) * 10, 50, 1000);
    update();
  });

  elements.toggle.addEventListener("click", () => {
    state.closed = !state.closed;
    update();
  });

  document.querySelectorAll("[data-voltage][data-resistance]").forEach((button) => {
    button.addEventListener("click", () => {
      state.voltage = Number(button.dataset.voltage);
      state.resistance = Number(button.dataset.resistance);
      state.closed = true;
      update();
    });
  });

  $("recordReading").addEventListener("click", () => {
    const current = state.closed ? state.voltage / state.resistance : 0;
    const power = state.closed ? state.voltage * current : 0;
    state.readings = [...state.readings.slice(-7), {
      voltage: state.voltage,
      resistance: state.resistance,
      current,
      power,
      closed: state.closed,
    }];
    renderReadings();
  });

  elements.clearReadings.addEventListener("click", () => {
    state.readings = [];
    renderReadings();
  });

  $("resetLab").addEventListener("click", () => {
    state.voltage = 9;
    state.resistance = 330;
    state.closed = true;
    state.readings = [];
    renderReadings();
    update();
  });

  update();
})();
