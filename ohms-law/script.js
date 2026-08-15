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
    switchSvgStatus: $("switchSvgStatus"),
    electronFlow: $("electronFlow"),
    statusChip: $("statusChip"),
    statusText: $("statusText"),
    topCircuitStatus: $("topCircuitStatus"),
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
    conductanceReadout: $("conductanceReadout"),
    derivedCurrent: $("derivedCurrent"),
    derivedPower: $("derivedPower"),
    energyReadout: $("energyReadout"),
    thermalStatus: $("thermalStatus"),
    transportObservation: $("transportObservation"),
    insightTitle: $("insightTitle"),
    insightBody: $("insightBody"),
    calculationText: $("calculationText"),
    calculationNote: $("calculationNote"),
    slopeBadge: $("slopeBadge"),
    graphEquation: $("graphEquation"),
    graph: $("viGraph"),
    readingsBody: $("readingsBody"),
    clearReadings: $("clearReadings"),
    exportReadings: $("exportReadings"),
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

  const energyDisplay = (joules) => {
    if (joules < 1) return `${(joules * 1000).toFixed(0)} mJ`;
    return `${joules.toFixed(2)} J`;
  };

  const conductanceDisplay = (ohms) => {
    const siemens = 1 / ohms;
    return siemens < 1 ? `${(siemens * 1000).toFixed(2)} mS` : `${siemens.toFixed(2)} S`;
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
    const left = 76;
    const right = 30;
    const top = 30;
    const bottom = 58;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const xFor = (voltage) => left + (voltage / 24) * plotWidth;
    const yFor = (amps) => top + plotHeight - (amps / 0.5) * plotHeight;

    context.clearRect(0, 0, width, height);
    context.lineWidth = 1;
    context.font = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    context.textBaseline = "middle";

    for (let tick = 0; tick <= 4; tick += 1) {
      const amps = tick * 0.125;
      const y = yFor(amps);
      context.strokeStyle = "rgba(157, 177, 217, 0.12)";
      context.beginPath();
      context.moveTo(left, y);
      context.lineTo(width - right, y);
      context.stroke();
      context.fillStyle = "#7185a0";
      context.textAlign = "right";
      context.fillText(tick === 0 ? "0" : amps.toFixed(3), left - 12, y);
    }

    [0, 6, 12, 18, 24].forEach((volts) => {
      const x = xFor(volts);
      context.strokeStyle = "rgba(157, 177, 217, 0.12)";
      context.beginPath();
      context.moveTo(x, top);
      context.lineTo(x, top + plotHeight);
      context.stroke();
      context.fillStyle = "#7185a0";
      context.textAlign = "center";
      context.fillText(String(volts), x, top + plotHeight + 22);
    });

    context.strokeStyle = "rgba(174, 187, 211, 0.55)";
    context.lineWidth = 1.4;
    context.beginPath();
    context.moveTo(left, top);
    context.lineTo(left, top + plotHeight);
    context.lineTo(width - right, top + plotHeight);
    context.stroke();

    const endCurrent = 24 / state.resistance;
    context.strokeStyle = "#a98bff";
    context.lineWidth = 4;
    context.lineCap = "round";
    context.shadowColor = "rgba(169, 139, 255, 0.38)";
    context.shadowBlur = 12;
    context.beginPath();
    context.moveTo(xFor(0), yFor(0));
    context.lineTo(xFor(24), yFor(endCurrent));
    context.stroke();
    context.shadowBlur = 0;

    const pointX = xFor(state.voltage);
    const pointY = yFor(current);
    context.setLineDash([4, 6]);
    context.strokeStyle = "rgba(72, 215, 232, 0.4)";
    context.lineWidth = 1.2;
    context.beginPath();
    context.moveTo(pointX, yFor(0));
    context.lineTo(pointX, pointY);
    context.lineTo(left, pointY);
    context.stroke();
    context.setLineDash([]);

    context.fillStyle = "#07111f";
    context.strokeStyle = "#48d7e8";
    context.lineWidth = 4;
    context.shadowColor = "rgba(72, 215, 232, 0.6)";
    context.shadowBlur = 14;
    context.beginPath();
    context.arc(pointX, pointY, 8, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.shadowBlur = 0;

    context.fillStyle = "#aebbd3";
    context.font = '700 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
    context.textAlign = "center";
    context.fillText("VOLTAGE (V)", left + plotWidth / 2, height - 12);
    context.save();
    context.translate(18, top + plotHeight / 2);
    context.rotate(-Math.PI / 2);
    context.fillText("CURRENT (A)", 0, 0);
    context.restore();

    canvas.setAttribute(
      "aria-label",
      `Voltage-current graph for ${state.resistance} ohms. The present operating point is ${state.voltage} volts and ${current.toFixed(4)} amperes.`,
    );
  }

  function updateInsight(current) {
    if (!state.closed) {
      elements.insightTitle.textContent = "The conducting path is interrupted";
      elements.insightBody.textContent = "Opening the switch makes measured current zero. The source still has potential difference, but charge has no complete path.";
      elements.transportObservation.textContent = "No current — the path is interrupted";
      return;
    }
    if (current >= 0.25) {
      elements.insightTitle.textContent = "Low resistance produces a strong current";
      elements.insightBody.textContent = "The load offers little opposition, so current and ideal load power both rise sharply.";
      elements.transportObservation.textContent = "Low resistance produces a strong current";
      return;
    }
    if (current <= 0.02) {
      elements.insightTitle.textContent = "Resistance is limiting the current";
      elements.insightBody.textContent = "Only a small current passes through the load. Increase voltage or lower resistance and observe the ammeter.";
      elements.transportObservation.textContent = "Resistance is limiting current flow";
      return;
    }
    elements.insightTitle.textContent = "Voltage, resistance and current are in balance";
    elements.insightBody.textContent = `${state.voltage.toFixed(1)} volts across ${state.resistance} ohms produces ${formatCurrent(current)} of current.`;
    elements.transportObservation.textContent = "Current is proportional to applied voltage";
  }

  function updateThermalStatus(power) {
    elements.thermalStatus.classList.remove("elevated", "high");
    const label = elements.thermalStatus.querySelector("span");
    if (!state.closed) {
      label.textContent = "No dissipation while the circuit is open";
      return;
    }
    if (power >= 2) {
      elements.thermalStatus.classList.add("high");
      label.textContent = "High dissipation in the ideal load";
      return;
    }
    if (power >= 0.5) {
      elements.thermalStatus.classList.add("elevated");
      label.textContent = "Moderate dissipation in the ideal load";
      return;
    }
    label.textContent = "Low dissipation in the ideal load";
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
    elements.conductanceReadout.textContent = conductanceDisplay(state.resistance);
    elements.derivedCurrent.textContent = formatCurrent(current);
    elements.derivedPower.textContent = formatPower(power);
    elements.energyReadout.textContent = energyDisplay(power);

    elements.toggle.classList.toggle("on", state.closed);
    elements.toggle.setAttribute("aria-checked", String(state.closed));
    elements.toggleLabel.textContent = state.closed ? "Closed" : "Open";
    elements.statusChip.classList.toggle("active", state.closed);
    elements.statusText.textContent = state.closed ? "Current flowing" : "Circuit open";
    elements.switchSvgStatus.textContent = state.closed ? "CLOSED" : "OPEN";
    elements.topCircuitStatus.innerHTML = `<i class="status-dot ${state.closed ? "flowing" : "open"}" aria-hidden="true"></i> ${state.closed ? "Closed circuit" : "Open circuit"}`;
    elements.switchArm.setAttribute("x2", state.closed ? "334" : "322");
    elements.switchArm.setAttribute("y2", state.closed ? "116" : "72");
    elements.electronFlow.classList.toggle("paused", !state.closed);

    const duration = clamp(2.6 - current * 4, 0.65, 2.6);
    elements.electronFlow.querySelectorAll("animateMotion").forEach((animation, index) => {
      animation.setAttribute("dur", `${duration}s`);
      animation.setAttribute("begin", `${(-index * duration) / 6}s`);
    });

    elements.calculationText.textContent = `${state.voltage.toFixed(1)} ÷ ${state.resistance} = ${theoreticalCurrent.toFixed(4)} A`;
    elements.calculationNote.textContent = state.closed
      ? "Voltage drives current; resistance limits it."
      : "This calculated current applies when the switch is closed.";
    elements.slopeBadge.textContent = `slope = 1 / ${state.resistance} Ω`;
    elements.graphEquation.textContent = `I = V / ${state.resistance} Ω`;

    updateInsight(current);
    updateThermalStatus(power);
    updatePresetSelection();
    drawGraph(current);
  }

  function renderReadings() {
    if (state.readings.length === 0) {
      elements.readingsBody.innerHTML = '<tr class="empty-row"><td colspan="6">No observations recorded. Configure the circuit, then select “Record reading”.</td></tr>';
      elements.clearReadings.classList.add("hidden");
      elements.exportReadings.disabled = true;
      return;
    }

    elements.clearReadings.classList.remove("hidden");
    elements.exportReadings.disabled = false;
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

  function exportCsv() {
    if (state.readings.length === 0) return;
    const rows = [
      ["trial", "voltage_v", "resistance_ohm", "current_a", "power_w", "circuit"],
      ...state.readings.map((reading, index) => [
        index + 1,
        reading.voltage.toFixed(1),
        reading.resistance,
        reading.current.toFixed(6),
        reading.power.toFixed(6),
        reading.closed ? "closed" : "open",
      ]),
    ];
    const csv = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "dinglo-ohms-law-readings.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
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

  elements.exportReadings.addEventListener("click", exportCsv);

  $("resetLab").addEventListener("click", () => {
    state.voltage = 9;
    state.resistance = 330;
    state.closed = true;
    state.readings = [];
    renderReadings();
    update();
  });

  renderReadings();
  update();
})();
