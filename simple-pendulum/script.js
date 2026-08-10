(() => {
      "use strict";

      const $ = (selector) => document.querySelector(selector);
      const $$ = (selector) => Array.from(document.querySelectorAll(selector));
      const TAU = Math.PI * 2;
      const toRad = (degrees) => degrees * Math.PI / 180;
      const toDeg = (radians) => radians * 180 / Math.PI;
      const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

      const elements = {
        stage: $("#simulationStage"),
        canvas: $("#simCanvas"),
        graph: $("#graphCanvas"),
        play: $("#playButton"),
        playIcon: $("#playIcon"),
        reset: $("#resetButton"),
        step: $("#stepButton"),
        length: $("#lengthRange"),
        lengthReadout: $("#lengthReadout"),
        mass: $("#massRange"),
        massReadout: $("#massReadout"),
        releaseAngle: $("#angleRange"),
        angleReadout: $("#angleReadout"),
        gravitySelect: $("#gravitySelect"),
        gravityInput: $("#gravityInput"),
        gravityReadout: $("#gravityReadout"),
        damping: $("#dampingRange"),
        dampingReadout: $("#dampingReadout"),
        angleMetric: $("#angleMetric"),
        speedMetric: $("#speedMetric"),
        periodMetric: $("#periodMetric"),
        theoryMetric: $("#theoryMetric"),
        energyMetric: $("#energyMetric"),
        smallPeriod: $("#smallPeriod"),
        exactPeriod: $("#exactPeriod"),
        measuredPeriod: $("#measuredPeriod"),
        periodDifference: $("#periodDifference"),
        tension: $("#tensionValue"),
        angularSpeed: $("#angularSpeedValue"),
        stopwatchTime: $("#stopwatchTime"),
        stopwatchStart: $("#stopwatchStart"),
        stopwatchReset: $("#stopwatchReset"),
        lapCount: $("#lapCount"),
        insightTitle: $("#insightTitle"),
        insightText: $("#insightText"),
        graphHint: $("#graphHint"),
        chartLegend: $("#chartLegend"),
        trialBody: $("#trialBody"),
        record: $("#recordButton"),
        export: $("#exportButton"),
        clear: $("#clearButton"),
        help: $("#helpButton"),
        helpModal: $("#helpModal"),
        closeHelp: $("#closeHelp"),
        toast: $("#toast")
      };

      const ctx = elements.canvas.getContext("2d");
      const graphCtx = elements.graph.getContext("2d");

      const state = {
        length: 1,
        mass: 1,
        gravity: 9.81,
        damping: 0,
        releaseAngle: 20,
        theta: toRad(20),
        omega: 0,
        running: false,
        dragging: false,
        speedScale: 1,
        simTime: 0,
        accumulator: 0,
        lastFrame: performance.now(),
        measuredPeriod: null,
        lastPositiveCrossing: null,
        periodsDetected: 0,
        thermalEnergy: 0,
        lastHistoryTime: -1,
        history: [],
        trail: [],
        showAngle: true,
        showVectors: false,
        showTrail: false,
        showRuler: false,
        showGrid: true,
        sound: false,
        chartMode: "motion",
        stopwatchRunning: false,
        stopwatchValue: 0,
        stopwatchLaps: 0,
        trialRows: [],
        pointer: { x: 0, y: 0 },
        geometry: { pivotX: 0, pivotY: 0, bobX: 0, bobY: 0, scale: 1, bobRadius: 25 },
        audioContext: null
      };

      const colors = {
        purple: "#5b3fd6",
        purpleDark: "#342078",
        purpleLight: "#b7a9ff",
        orange: "#ed7a2d",
        blue: "#2794d6",
        green: "#1aa577",
        red: "#dc4167",
        ink: "#27304f",
        muted: "#7d86a6",
        line: "#c9cee2"
      };

      function setRangeProgress(input) {
        const min = Number(input.min);
        const max = Number(input.max);
        const value = Number(input.value);
        const progress = ((value - min) / (max - min)) * 100;
        input.style.setProperty("--range-progress", progress + "%");
      }

      function completeEllipticK(k) {
        let a = 1;
        let b = Math.sqrt(Math.max(0, 1 - k * k));
        for (let i = 0; i < 12; i += 1) {
          const nextA = (a + b) / 2;
          const nextB = Math.sqrt(a * b);
          a = nextA;
          b = nextB;
          if (Math.abs(a - b) < 1e-12) break;
        }
        return Math.PI / (2 * a);
      }

      function smallAnglePeriod() {
        return TAU * Math.sqrt(state.length / state.gravity);
      }

      function nonlinearPeriod() {
        const amplitude = toRad(Math.abs(state.releaseAngle));
        const k = Math.sin(amplitude / 2);
        return 4 * Math.sqrt(state.length / state.gravity) * completeEllipticK(k);
      }

      function energies() {
        const kinetic = 0.5 * state.mass * state.length * state.length * state.omega * state.omega;
        const potential = state.mass * state.gravity * state.length * (1 - Math.cos(state.theta));
        return {
          kinetic,
          potential,
          mechanical: kinetic + potential,
          thermal: Math.max(0, state.thermalEnergy),
          total: kinetic + potential + Math.max(0, state.thermalEnergy)
        };
      }

      function tension() {
        return state.mass * (state.gravity * Math.cos(state.theta) + state.length * state.omega * state.omega);
      }

      function acceleration(theta, omega) {
        return -(state.gravity / state.length) * Math.sin(theta) - state.damping * omega;
      }

      function physicsStep(dt) {
        const previousTheta = state.theta;
        const previousOmega = state.omega;

        const k1Theta = previousOmega;
        const k1Omega = acceleration(previousTheta, previousOmega);
        const k2Theta = previousOmega + 0.5 * dt * k1Omega;
        const k2Omega = acceleration(previousTheta + 0.5 * dt * k1Theta, previousOmega + 0.5 * dt * k1Omega);
        const k3Theta = previousOmega + 0.5 * dt * k2Omega;
        const k3Omega = acceleration(previousTheta + 0.5 * dt * k2Theta, previousOmega + 0.5 * dt * k2Omega);
        const k4Theta = previousOmega + dt * k3Omega;
        const k4Omega = acceleration(previousTheta + dt * k3Theta, previousOmega + dt * k3Omega);

        state.theta = previousTheta + (dt / 6) * (k1Theta + 2 * k2Theta + 2 * k3Theta + k4Theta);
        state.omega = previousOmega + (dt / 6) * (k1Omega + 2 * k2Omega + 2 * k3Omega + k4Omega);
        state.simTime += dt;
        state.thermalEnergy += state.mass * state.length * state.length * state.damping * state.omega * state.omega * dt;

        if (state.stopwatchRunning) {
          state.stopwatchValue += dt;
        }

        const positiveCrossing = previousTheta < 0 && state.theta >= 0 && state.omega > 0;
        if (positiveCrossing) {
          if (state.lastPositiveCrossing !== null) {
            const period = state.simTime - state.lastPositiveCrossing;
            if (period > 0.1) {
              state.measuredPeriod = period;
              state.periodsDetected += 1;
            }
          }
          state.lastPositiveCrossing = state.simTime;
        }

        if ((previousTheta < 0 && state.theta >= 0) || (previousTheta > 0 && state.theta <= 0)) {
          if (state.sound) playCrossingTone();
          if (state.stopwatchRunning) state.stopwatchLaps += 1;
        }

        if (state.simTime - state.lastHistoryTime >= 0.04) {
          const e = energies();
          state.history.push({
            t: state.simTime,
            theta: toDeg(state.theta),
            omega: state.omega,
            kinetic: e.kinetic,
            potential: e.potential,
            thermal: e.thermal,
            total: e.total
          });
          if (state.history.length > 1000) state.history.shift();
          state.trail.push(state.theta);
          if (state.trail.length > 70) state.trail.shift();
          state.lastHistoryTime = state.simTime;
        }
      }

      function resetExperiment(options = {}) {
        const preserveRunning = Boolean(options.preserveRunning);
        state.theta = toRad(state.releaseAngle);
        state.omega = 0;
        state.simTime = 0;
        state.accumulator = 0;
        state.measuredPeriod = null;
        state.lastPositiveCrossing = null;
        state.periodsDetected = 0;
        state.thermalEnergy = 0;
        state.history = [];
        state.trail = [];
        state.lastHistoryTime = -1;
        state.stopwatchValue = 0;
        state.stopwatchRunning = false;
        state.stopwatchLaps = 0;
        state.running = preserveRunning;
        updatePlayButton();
        updateAllReadouts();
        drawScene();
        drawGraph();
      }

      function togglePlay(force) {
        state.running = typeof force === "boolean" ? force : !state.running;
        state.lastFrame = performance.now();
        updatePlayButton();
      }

      function updatePlayButton() {
        elements.playIcon.className = state.running ? "pause-icon" : "play-icon";
        elements.play.setAttribute("aria-label", state.running ? "Pause simulation" : "Start simulation");
        elements.play.title = state.running ? "Pause simulation" : "Start simulation";
      }

      function formatStopwatch(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remaining = seconds - minutes * 60;
        return String(minutes).padStart(2, "0") + ":" + remaining.toFixed(2).padStart(5, "0");
      }

      function updateAllReadouts() {
        const e = energies();
        const small = smallAnglePeriod();
        const exact = nonlinearPeriod();
        const measured = state.measuredPeriod;
        const difference = measured === null ? null : Math.abs(measured - exact) / exact * 100;

        elements.length.value = state.length.toFixed(2);
        elements.mass.value = state.mass.toFixed(2);
        elements.releaseAngle.value = Math.round(state.releaseAngle);
        elements.gravityInput.value = state.gravity.toFixed(2);
        elements.damping.value = state.damping.toFixed(2);
        [elements.length, elements.mass, elements.releaseAngle, elements.damping].forEach(setRangeProgress);

        elements.lengthReadout.textContent = state.length.toFixed(2) + " m";
        elements.massReadout.textContent = state.mass.toFixed(2) + " kg";
        elements.angleReadout.textContent = Math.round(state.releaseAngle) + "°";
        elements.gravityReadout.textContent = state.gravity.toFixed(2) + " m/s²";
        elements.dampingReadout.textContent =
          state.damping === 0 ? "None" :
          state.damping < 0.18 ? "Low" :
          state.damping < 0.45 ? "Medium" : "Strong";

        elements.angleMetric.textContent = toDeg(state.theta).toFixed(1) + "°";
        elements.speedMetric.textContent = Math.abs(state.length * state.omega).toFixed(3) + " m/s";
        elements.periodMetric.textContent = measured === null ? "—" : measured.toFixed(3) + " s";
        elements.theoryMetric.textContent = exact.toFixed(3) + " s";
        elements.energyMetric.textContent = e.mechanical.toFixed(3) + " J";
        elements.smallPeriod.textContent = small.toFixed(3) + " s";
        elements.exactPeriod.textContent = exact.toFixed(3) + " s";
        elements.measuredPeriod.textContent = measured === null ? "—" : measured.toFixed(3) + " s";
        elements.periodDifference.textContent = difference === null ? "—" : difference.toFixed(2) + "%";
        elements.tension.textContent = Math.max(0, tension()).toFixed(2) + " N";
        elements.angularSpeed.textContent = state.omega.toFixed(3) + " rad/s";
        elements.stopwatchTime.textContent = formatStopwatch(state.stopwatchValue);
        elements.lapCount.textContent = state.stopwatchLaps + (state.stopwatchLaps === 1 ? " lap" : " laps");
        elements.stopwatchStart.textContent = state.stopwatchRunning ? "Pause" : "Start";

        updateInsight();
      }

      function updateInsight() {
        if (state.damping >= 0.18) {
          elements.insightTitle.textContent = "Energy is being dissipated";
          elements.insightText.textContent = "Air resistance removes mechanical energy, so the amplitude shrinks. The lost mechanical energy appears as thermal energy on the energy graph.";
        } else if (state.releaseAngle >= 35) {
          const increase = (nonlinearPeriod() / smallAnglePeriod() - 1) * 100;
          elements.insightTitle.textContent = "The small-angle model is breaking down";
          elements.insightText.textContent = "At " + Math.round(state.releaseAngle) + "°, the nonlinear period is about " + increase.toFixed(1) + "% longer than 2π√(L/g). The restoring force is no longer proportional to angle.";
        } else if (state.gravity < 3) {
          elements.insightTitle.textContent = "Weak gravity, slow swing";
          elements.insightText.textContent = "Lower gravity produces less angular acceleration and a longer period. The bob's mass still does not appear in the period equation.";
        } else {
          elements.insightTitle.textContent = "What to notice";
          elements.insightText.textContent = "Change only the bob mass and compare periods. The energy and tension change, but an ideal pendulum's period stays the same.";
        }
      }

      function resizeCanvas(canvas, context) {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));
        if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
          canvas.width = Math.round(width * dpr);
          canvas.height = Math.round(height * dpr);
        }
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { width, height };
      }

      function roundedRect(context, x, y, width, height, radius) {
        const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
        context.beginPath();
        context.moveTo(x + r, y);
        context.arcTo(x + width, y, x + width, y + height, r);
        context.arcTo(x + width, y + height, x, y + height, r);
        context.arcTo(x, y + height, x, y, r);
        context.arcTo(x, y, x + width, y, r);
        context.closePath();
      }

      function drawArrow(context, x1, y1, x2, y2, color, label) {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const head = 8;
        context.save();
        context.strokeStyle = color;
        context.fillStyle = color;
        context.lineWidth = 2.5;
        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
        context.stroke();
        context.beginPath();
        context.moveTo(x2, y2);
        context.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
        context.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
        context.closePath();
        context.fill();
        if (label) {
          context.font = "700 11px Inter, Arial, sans-serif";
          context.fillText(label, x2 + 7 * Math.cos(angle + Math.PI / 2), y2 + 7 * Math.sin(angle + Math.PI / 2));
        }
        context.restore();
      }

      function drawGrid(context, width, height) {
        if (!state.showGrid) return;
        context.save();
        context.strokeStyle = "rgba(91, 63, 214, 0.055)";
        context.lineWidth = 1;
        for (let x = 0; x <= width; x += 26) {
          context.beginPath();
          context.moveTo(x, 0);
          context.lineTo(x, height);
          context.stroke();
        }
        for (let y = 0; y <= height * 0.73; y += 26) {
          context.beginPath();
          context.moveTo(0, y);
          context.lineTo(width, y);
          context.stroke();
        }
        context.restore();
      }

      function drawRuler(context, pivotX, pivotY, scale, height) {
        if (!state.showRuler) return;
        const x = Math.max(66, pivotX - Math.min(230, scale * 1.45));
        const maxLength = Math.min(2.5, (height - pivotY - 60) / scale);
        context.save();
        context.fillStyle = "rgba(255,255,255,0.84)";
        context.strokeStyle = "#aeb7cf";
        context.lineWidth = 1;
        roundedRect(context, x - 24, pivotY - 9, 48, maxLength * scale + 18, 7);
        context.fill();
        context.stroke();
        context.font = "700 9px Inter, Arial, sans-serif";
        context.fillStyle = colors.muted;
        context.textAlign = "right";
        for (let m = 0; m <= maxLength + 0.001; m += 0.1) {
          const y = pivotY + m * scale;
          const major = Math.abs((m * 10) % 5) < 0.01;
          context.beginPath();
          context.moveTo(x - (major ? 13 : 7), y);
          context.lineTo(x + (major ? 13 : 7), y);
          context.stroke();
          if (major) context.fillText(m.toFixed(1) + " m", x - 15, y + 3);
        }
        context.restore();
      }

      function drawProtractor(context, pivotX, pivotY, radius) {
        if (!state.showAngle) return;
        context.save();
        context.strokeStyle = "rgba(91, 63, 214, 0.25)";
        context.fillStyle = colors.purpleDark;
        context.lineWidth = 1.3;
        context.setLineDash([3, 4]);
        context.beginPath();
        context.moveTo(pivotX, pivotY);
        context.lineTo(pivotX, pivotY + radius + 8);
        context.stroke();
        context.setLineDash([]);

        for (let degrees = -80; degrees <= 80; degrees += 10) {
          const angle = toRad(degrees);
          const inner = degrees % 20 === 0 ? radius - 8 : radius - 4;
          const x1 = pivotX + Math.sin(angle) * inner;
          const y1 = pivotY + Math.cos(angle) * inner;
          const x2 = pivotX + Math.sin(angle) * radius;
          const y2 = pivotY + Math.cos(angle) * radius;
          context.beginPath();
          context.moveTo(x1, y1);
          context.lineTo(x2, y2);
          context.stroke();
        }

        const start = -Math.PI / 2;
        const end = state.theta - Math.PI / 2;
        context.strokeStyle = colors.orange;
        context.lineWidth = 3;
        context.beginPath();
        if (state.theta >= 0) {
          context.arc(pivotX, pivotY, radius * 0.60, Math.PI / 2 - state.theta, Math.PI / 2);
        } else {
          context.arc(pivotX, pivotY, radius * 0.60, Math.PI / 2, Math.PI / 2 - state.theta);
        }
        context.stroke();

        const labelAngle = state.theta / 2;
        const labelX = pivotX + Math.sin(labelAngle) * radius * 0.78;
        const labelY = pivotY + Math.cos(labelAngle) * radius * 0.78;
        context.font = "800 12px Inter, Arial, sans-serif";
        context.textAlign = "center";
        context.fillStyle = colors.orange;
        context.fillText(Math.abs(toDeg(state.theta)).toFixed(1) + "°", labelX, labelY);
        context.restore();
      }

      function drawEnergyBars(context, width, height) {
        const e = energies();
        const maxEnergy = Math.max(0.001, e.total);
        const bars = [
          { label: "PE", value: e.potential, color: colors.purple },
          { label: "KE", value: e.kinetic, color: colors.green },
          { label: "Heat", value: e.thermal, color: colors.orange }
        ];
        const boxW = width < 600 ? 140 : 166;
        const boxH = 100;
        const x = width - boxW - 13;
        const y = height - boxH - 76;
        context.save();
        context.fillStyle = "rgba(255,255,255,0.9)";
        context.strokeStyle = "rgba(182,189,215,0.9)";
        roundedRect(context, x, y, boxW, boxH, 11);
        context.fill();
        context.stroke();
        context.font = "800 10px Inter, Arial, sans-serif";
        context.fillStyle = colors.ink;
        context.fillText("ENERGY", x + 11, y + 16);
        bars.forEach((bar, index) => {
          const barY = y + 27 + index * 22;
          context.fillStyle = "#e7e9f2";
          roundedRect(context, x + 11, barY, boxW - 53, 8, 4);
          context.fill();
          const fillW = Math.max(1, (boxW - 53) * clamp(bar.value / maxEnergy, 0, 1));
          context.fillStyle = bar.color;
          roundedRect(context, x + 11, barY, fillW, 8, 4);
          context.fill();
          context.fillStyle = colors.muted;
          context.font = "700 8px Inter, Arial, sans-serif";
          context.textAlign = "right";
          context.fillText(bar.label, x + boxW - 8, barY + 7);
        });
        context.restore();
      }

      function drawScene() {
        const { width, height } = resizeCanvas(elements.canvas, ctx);
        ctx.clearRect(0, 0, width, height);
        drawGrid(ctx, width, height);

        const pivotX = width / 2;
        const pivotY = width < 520 ? 104 : 88;
        const massScale = Math.cbrt(state.mass);
        const bobRadius = clamp(19 + massScale * 7, 23, width < 520 ? 35 : 42);
        const available = Math.max(180, height - pivotY - bobRadius - 34);
        const verticalScale = available / 2.5;
        const horizontalScale = (width / 2 - bobRadius - 18) / (state.length * Math.sin(toRad(80)));
        const scale = Math.min(width < 520 ? 145 : 215, verticalScale, Math.max(42, horizontalScale));
        const stringPixels = state.length * scale;
        const bobX = pivotX + Math.sin(state.theta) * stringPixels;
        const bobY = pivotY + Math.cos(state.theta) * stringPixels;

        state.geometry = { pivotX, pivotY, bobX, bobY, scale, bobRadius };

        drawRuler(ctx, pivotX, pivotY, scale, height);
        drawProtractor(ctx, pivotX, pivotY, Math.min(110, stringPixels * 0.44));

        if (state.showTrail && state.trail.length > 1) {
          ctx.save();
          state.trail.forEach((trailTheta, index) => {
            const alpha = (index + 1) / state.trail.length;
            const x = pivotX + Math.sin(trailTheta) * stringPixels;
            const y = pivotY + Math.cos(trailTheta) * stringPixels;
            ctx.fillStyle = "rgba(91,63,214," + (alpha * 0.24).toFixed(3) + ")";
            ctx.beginPath();
            ctx.arc(x, y, 2 + alpha * 2, 0, TAU);
            ctx.fill();
          });
          ctx.restore();
        }

        ctx.save();
        const floorY = height * 0.73;
        const supportLeft = pivotX - Math.min(280, width * 0.30);
        const supportRight = pivotX + Math.min(280, width * 0.30);

        ctx.strokeStyle = "#4e5770";
        ctx.lineCap = "round";
        ctx.lineWidth = width < 520 ? 10 : 13;
        ctx.beginPath();
        ctx.moveTo(supportLeft, floorY + 50);
        ctx.lineTo(supportLeft + 40, pivotY - 22);
        ctx.lineTo(supportRight - 40, pivotY - 22);
        ctx.lineTo(supportRight, floorY + 50);
        ctx.stroke();

        ctx.strokeStyle = "#8891a9";
        ctx.lineWidth = width < 520 ? 4 : 6;
        ctx.beginPath();
        ctx.moveTo(supportLeft + 12, floorY + 50);
        ctx.lineTo(supportRight - 12, floorY + 50);
        ctx.stroke();

        ctx.fillStyle = "#30384f";
        ctx.beginPath();
        ctx.arc(pivotX, pivotY, 12, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#bac0d1";
        ctx.beginPath();
        ctx.arc(pivotX, pivotY, 5, 0, TAU);
        ctx.fill();

        ctx.strokeStyle = "#343a50";
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(pivotX, pivotY);
        ctx.lineTo(bobX, bobY);
        ctx.stroke();

        ctx.strokeStyle = "rgba(255,255,255,0.68)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pivotX + 2, pivotY + 5);
        ctx.lineTo(bobX + 2, bobY - bobRadius * 0.7);
        ctx.stroke();

        const gradient = ctx.createRadialGradient(
          bobX - bobRadius * 0.34,
          bobY - bobRadius * 0.38,
          bobRadius * 0.12,
          bobX,
          bobY,
          bobRadius
        );
        gradient.addColorStop(0, "#b8abff");
        gradient.addColorStop(0.36, "#765ee9");
        gradient.addColorStop(1, "#3b267f");
        ctx.shadowColor = "rgba(47, 32, 119, 0.32)";
        ctx.shadowBlur = 16;
        ctx.shadowOffsetY = 7;
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(bobX, bobY, bobRadius, 0, TAU);
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.strokeStyle = "#2e1b70";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.beginPath();
        ctx.ellipse(bobX - bobRadius * 0.31, bobY - bobRadius * 0.35, bobRadius * 0.20, bobRadius * 0.12, -0.6, 0, TAU);
        ctx.fill();

        ctx.font = "800 " + clamp(bobRadius * 0.36, 9, 13) + "px Inter, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "#fff";
        ctx.fillText(state.mass.toFixed(1) + " kg", bobX, bobY + 4);
        ctx.restore();

        if (state.showVectors) {
          const v = state.length * state.omega;
          const velocityScale = clamp(Math.abs(v) * 34, 18, 92);
          const tangentX = Math.cos(state.theta) * Math.sign(state.omega || 1);
          const tangentY = -Math.sin(state.theta) * Math.sign(state.omega || 1);
          drawArrow(ctx, bobX, bobY, bobX + tangentX * velocityScale, bobY + tangentY * velocityScale, colors.blue, "v");

          const gravityScale = clamp(state.mass * state.gravity * 3.5, 34, 86);
          drawArrow(ctx, bobX, bobY, bobX, bobY + gravityScale, colors.orange, "mg");

          const tensionScale = clamp(Math.max(0, tension()) * 3.3, 30, 90);
          const towardPivotX = -Math.sin(state.theta);
          const towardPivotY = -Math.cos(state.theta);
          drawArrow(ctx, bobX, bobY, bobX + towardPivotX * tensionScale, bobY + towardPivotY * tensionScale, colors.green, "T");
        }

        drawEnergyBars(ctx, width, height);

        if (!state.running && !state.dragging && state.simTime === 0) {
          ctx.save();
          const text = width < 520 ? "Drag the bob" : "Drag the bob, then release";
          ctx.font = "800 11px Inter, Arial, sans-serif";
          const textWidth = ctx.measureText(text).width;
          const x = clamp(bobX - textWidth / 2 - 10, 54, width - textWidth - 20);
          const y = clamp(bobY + bobRadius + 12, 150, height - 80);
          ctx.fillStyle = "rgba(36,19,95,0.87)";
          roundedRect(ctx, x, y, textWidth + 20, 28, 8);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.textAlign = "left";
          ctx.fillText(text, x + 10, y + 18);
          ctx.restore();
        }
      }

      function drawGraph() {
        const { width, height } = resizeCanvas(elements.graph, graphCtx);
        const g = graphCtx;
        g.clearRect(0, 0, width, height);
        g.fillStyle = "#fbfcff";
        g.fillRect(0, 0, width, height);

        const margin = { left: 44, right: 14, top: 18, bottom: 34 };
        const plotW = width - margin.left - margin.right;
        const plotH = height - margin.top - margin.bottom;
        g.strokeStyle = "#e3e6f0";
        g.lineWidth = 1;
        g.font = "700 8px Inter, Arial, sans-serif";
        g.fillStyle = colors.muted;
        g.textAlign = "right";

        for (let i = 0; i <= 4; i += 1) {
          const y = margin.top + (plotH * i / 4);
          g.beginPath();
          g.moveTo(margin.left, y);
          g.lineTo(width - margin.right, y);
          g.stroke();
        }
        for (let i = 0; i <= 4; i += 1) {
          const x = margin.left + (plotW * i / 4);
          g.beginPath();
          g.moveTo(x, margin.top);
          g.lineTo(x, height - margin.bottom);
          g.stroke();
        }

        if (state.history.length < 2) {
          g.fillStyle = "#8a91a8";
          g.textAlign = "center";
          g.font = "700 10px Inter, Arial, sans-serif";
          g.fillText("Start the simulation to collect graph data", width / 2, height / 2);
          updateChartLegend();
          return;
        }

        const recentStart = Math.max(0, state.simTime - 12);
        const recent = state.history.filter((point) => point.t >= recentStart);
        const minT = recent[0]?.t ?? 0;
        const maxT = Math.max(minT + 0.2, recent[recent.length - 1]?.t ?? 1);

        const xForTime = (t) => margin.left + ((t - minT) / (maxT - minT)) * plotW;
        const yLinear = (value, min, max) => margin.top + (1 - (value - min) / (max - min)) * plotH;

        function plotLine(points, xAccessor, yAccessor, color, widthValue = 2) {
          g.save();
          g.strokeStyle = color;
          g.lineWidth = widthValue;
          g.lineJoin = "round";
          g.lineCap = "round";
          g.beginPath();
          points.forEach((point, index) => {
            const x = xAccessor(point);
            const y = yAccessor(point);
            if (index === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          });
          g.stroke();
          g.restore();
        }

        if (state.chartMode === "motion") {
          const maxAngle = Math.max(10, ...recent.map((point) => Math.abs(point.theta))) * 1.12;
          plotLine(recent, (p) => xForTime(p.t), (p) => yLinear(p.theta, -maxAngle, maxAngle), colors.purple, 2.4);
          g.fillStyle = colors.muted;
          g.textAlign = "right";
          g.fillText(maxAngle.toFixed(0) + "°", margin.left - 5, margin.top + 3);
          g.fillText("0°", margin.left - 5, margin.top + plotH / 2 + 3);
          g.fillText("-" + maxAngle.toFixed(0) + "°", margin.left - 5, margin.top + plotH + 3);
          g.textAlign = "center";
          g.fillText("time (s)", margin.left + plotW / 2, height - 9);
        } else if (state.chartMode === "energy") {
          const maxEnergy = Math.max(0.01, ...recent.map((point) => point.total)) * 1.08;
          plotLine(recent, (p) => xForTime(p.t), (p) => yLinear(p.potential, 0, maxEnergy), colors.purple, 2);
          plotLine(recent, (p) => xForTime(p.t), (p) => yLinear(p.kinetic, 0, maxEnergy), colors.green, 2);
          plotLine(recent, (p) => xForTime(p.t), (p) => yLinear(p.thermal, 0, maxEnergy), colors.orange, 2);
          plotLine(recent, (p) => xForTime(p.t), (p) => yLinear(p.total, 0, maxEnergy), colors.ink, 1.4);
          g.fillStyle = colors.muted;
          g.textAlign = "right";
          g.fillText(maxEnergy.toFixed(2) + " J", margin.left - 5, margin.top + 3);
          g.fillText("0 J", margin.left - 5, margin.top + plotH + 3);
          g.textAlign = "center";
          g.fillText("time (s)", margin.left + plotW / 2, height - 9);
        } else {
          const maxAngle = Math.max(10, ...state.history.map((point) => Math.abs(point.theta))) * 1.1;
          const maxOmega = Math.max(0.5, ...state.history.map((point) => Math.abs(point.omega))) * 1.1;
          plotLine(
            state.history.slice(-500),
            (p) => margin.left + ((p.theta + maxAngle) / (2 * maxAngle)) * plotW,
            (p) => yLinear(p.omega, -maxOmega, maxOmega),
            colors.purple,
            2
          );
          g.fillStyle = colors.muted;
          g.textAlign = "right";
          g.fillText(maxOmega.toFixed(1), margin.left - 5, margin.top + 3);
          g.fillText("0", margin.left - 5, margin.top + plotH / 2 + 3);
          g.fillText("-" + maxOmega.toFixed(1), margin.left - 5, margin.top + plotH + 3);
          g.textAlign = "center";
          g.fillText("angle θ (degrees)", margin.left + plotW / 2, height - 9);
        }
        updateChartLegend();
      }

      function updateChartLegend() {
        let items;
        if (state.chartMode === "motion") {
          items = [{ label: "Angle θ", color: colors.purple }];
          elements.graphHint.textContent = "Angle is plotted against simulated time. Damping causes successive peaks to shrink.";
        } else if (state.chartMode === "energy") {
          items = [
            { label: "Potential", color: colors.purple },
            { label: "Kinetic", color: colors.green },
            { label: "Thermal", color: colors.orange },
            { label: "Total", color: colors.ink }
          ];
          elements.graphHint.textContent = "Potential and kinetic energy exchange continuously. With damping, mechanical energy becomes thermal energy.";
        } else {
          items = [{ label: "θ versus ω", color: colors.purple }];
          elements.graphHint.textContent = "The phase-space loop closes without damping and spirals inward when energy is dissipated.";
        }
        elements.chartLegend.innerHTML = items.map((item) =>
          '<span class="legend-item"><span class="legend-swatch" style="--legend:' + item.color + '"></span>' + item.label + '</span>'
        ).join("");
      }

      function animate(now) {
        const realDelta = Math.min(0.05, Math.max(0, (now - state.lastFrame) / 1000));
        state.lastFrame = now;

        if (state.running && !state.dragging) {
          state.accumulator += realDelta * state.speedScale;
          const fixedStep = 1 / 240;
          let safety = 0;
          while (state.accumulator >= fixedStep && safety < 40) {
            physicsStep(fixedStep);
            state.accumulator -= fixedStep;
            safety += 1;
          }
        }

        drawScene();
        if (state.running || state.dragging) {
          updateAllReadouts();
          drawGraph();
        }
        requestAnimationFrame(animate);
      }

      function pointerPosition(event) {
        const rect = elements.canvas.getBoundingClientRect();
        return {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top
        };
      }

      function startDrag(event) {
        const point = pointerPosition(event);
        const { bobX, bobY, bobRadius } = state.geometry;
        const distance = Math.hypot(point.x - bobX, point.y - bobY);
        if (distance <= bobRadius + 22) {
          state.dragging = true;
          state.running = false;
          state.omega = 0;
          state.measuredPeriod = null;
          state.lastPositiveCrossing = null;
          elements.canvas.setPointerCapture?.(event.pointerId);
          updatePlayButton();
          updateDrag(point);
        }
      }

      function updateDrag(point) {
        if (!state.dragging) return;
        const { pivotX, pivotY } = state.geometry;
        let angle = Math.atan2(point.x - pivotX, point.y - pivotY);
        angle = clamp(angle, toRad(-80), toRad(80));
        state.theta = angle;
        state.releaseAngle = Math.max(5, Math.abs(toDeg(angle)));
        state.omega = 0;
        state.simTime = 0;
        state.thermalEnergy = 0;
        state.history = [];
        state.trail = [];
        state.lastHistoryTime = -1;
        state.measuredPeriod = null;
        state.lastPositiveCrossing = null;
        updateAllReadouts();
        drawScene();
        drawGraph();
      }

      function moveDrag(event) {
        if (!state.dragging) return;
        updateDrag(pointerPosition(event));
      }

      function endDrag(event) {
        if (!state.dragging) return;
        state.dragging = false;
        elements.canvas.releasePointerCapture?.(event.pointerId);
        state.running = true;
        state.lastFrame = performance.now();
        updatePlayButton();
      }

      function syncQuickButton(button, checked) {
        button.classList.toggle("active", checked);
        button.setAttribute("aria-pressed", String(checked));
      }

      function bindDisplayToggle(checkboxId, quickButton, stateKey) {
        const checkbox = $("#" + checkboxId);
        const apply = (value) => {
          state[stateKey] = value;
          checkbox.checked = value;
          if (quickButton) syncQuickButton(quickButton, value);
          drawScene();
        };
        checkbox.addEventListener("change", () => apply(checkbox.checked));
        if (quickButton) quickButton.addEventListener("click", () => apply(!state[stateKey]));
      }

      function playCrossingTone() {
        try {
          if (!state.audioContext) {
            state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
          }
          const audio = state.audioContext;
          const oscillator = audio.createOscillator();
          const gain = audio.createGain();
          oscillator.frequency.value = 520;
          oscillator.type = "sine";
          gain.gain.setValueAtTime(0.0001, audio.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.055, audio.currentTime + 0.008);
          gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.08);
          oscillator.connect(gain);
          gain.connect(audio.destination);
          oscillator.start();
          oscillator.stop(audio.currentTime + 0.09);
        } catch (error) {
          state.sound = false;
          $("#soundToggle").checked = false;
        }
      }

      function selectGravityPreset() {
        const options = Array.from(elements.gravitySelect.options);
        const match = options.find((option) =>
          option.value !== "custom" && Math.abs(Number(option.value) - state.gravity) < 0.005
        );
        elements.gravitySelect.value = match ? match.value : "custom";
      }

      function applyPreset(name) {
        const presets = {
          short: { length: 0.45, mass: 1, gravity: 9.81, damping: 0, angle: 10 },
          earth: { length: 1, mass: 1, gravity: 9.81, damping: 0, angle: 20 },
          large: { length: 1.25, mass: 1.5, gravity: 9.81, damping: 0, angle: 65 },
          moon: { length: 1, mass: 1, gravity: 1.62, damping: 0, angle: 20 }
        };
        const preset = presets[name];
        if (!preset) return;
        state.length = preset.length;
        state.mass = preset.mass;
        state.gravity = preset.gravity;
        state.damping = preset.damping;
        state.releaseAngle = preset.angle;
        selectGravityPreset();
        $$(".preset-button").forEach((button) => button.classList.toggle("active", button.dataset.preset === name));
        resetExperiment();
        showToast(name.charAt(0).toUpperCase() + name.slice(1) + " preset loaded");
      }

      function recordTrial() {
        const exact = nonlinearPeriod();
        const measured = state.measuredPeriod;
        const error = measured === null ? null : Math.abs(measured - exact) / exact * 100;
        state.trialRows.push({
          trial: state.trialRows.length + 1,
          length: state.length,
          mass: state.mass,
          gravity: state.gravity,
          amplitude: state.releaseAngle,
          small: smallAnglePeriod(),
          exact,
          measured,
          error
        });
        renderTrials();
        showToast(measured === null ? "Trial saved without a measured period" : "Trial saved to the notebook");
      }

      function renderTrials() {
        if (state.trialRows.length === 0) {
          elements.trialBody.innerHTML = '<tr class="empty-row"><td colspan="9">No trials recorded yet. Run the pendulum and select “Record trial”.</td></tr>';
          return;
        }
        elements.trialBody.innerHTML = state.trialRows.map((row) => `
          <tr>
            <td>${row.trial}</td>
            <td>${row.length.toFixed(2)}</td>
            <td>${row.mass.toFixed(2)}</td>
            <td>${row.gravity.toFixed(2)}</td>
            <td>${row.amplitude.toFixed(1)}</td>
            <td>${row.small.toFixed(4)}</td>
            <td>${row.exact.toFixed(4)}</td>
            <td>${row.measured === null ? "—" : row.measured.toFixed(4)}</td>
            <td>${row.error === null ? "—" : row.error.toFixed(2)}</td>
          </tr>
        `).join("");
      }

      function exportTrials() {
        if (state.trialRows.length === 0) {
          showToast("Record at least one trial before exporting");
          return;
        }
        const header = ["Trial", "Length (m)", "Mass (kg)", "Gravity (m/s^2)", "Amplitude (deg)", "Small-angle period (s)", "Exact nonlinear period (s)", "Measured period (s)", "Error (%)"];
        const rows = state.trialRows.map((row) => [
          row.trial,
          row.length.toFixed(4),
          row.mass.toFixed(4),
          row.gravity.toFixed(4),
          row.amplitude.toFixed(2),
          row.small.toFixed(6),
          row.exact.toFixed(6),
          row.measured === null ? "" : row.measured.toFixed(6),
          row.error === null ? "" : row.error.toFixed(4)
        ]);
        const csv = [header, ...rows].map((row) => row.join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "dinglo-pendulum-trials.csv";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showToast("CSV file exported");
      }

      let toastTimer;
      function showToast(message) {
        elements.toast.textContent = message;
        elements.toast.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2200);
      }

      function switchPanel(name) {
        $$(".panel-tab").forEach((tab) => {
          const active = tab.dataset.tab === name;
          tab.classList.toggle("active", active);
          tab.setAttribute("aria-selected", String(active));
        });
        $$(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === name + "Panel"));
        if (name === "graph") drawGraph();
      }

      function bindEvents() {
        elements.play.addEventListener("click", () => togglePlay());
        elements.reset.addEventListener("click", () => resetExperiment());
        elements.step.addEventListener("click", () => {
          togglePlay(false);
          for (let i = 0; i < 10; i += 1) physicsStep(1 / 240);
          updateAllReadouts();
          drawScene();
          drawGraph();
        });

        elements.length.addEventListener("input", () => {
          state.length = Number(elements.length.value);
          resetExperiment();
        });
        elements.mass.addEventListener("input", () => {
          state.mass = Number(elements.mass.value);
          resetExperiment();
        });
        elements.releaseAngle.addEventListener("input", () => {
          state.releaseAngle = Number(elements.releaseAngle.value);
          resetExperiment();
        });
        elements.damping.addEventListener("input", () => {
          state.damping = Number(elements.damping.value);
          updateAllReadouts();
          setRangeProgress(elements.damping);
        });

        elements.gravitySelect.addEventListener("change", () => {
          if (elements.gravitySelect.value === "custom") {
            elements.gravityInput.focus();
            return;
          }
          state.gravity = Number(elements.gravitySelect.value);
          resetExperiment();
        });

        elements.gravityInput.addEventListener("change", () => {
          state.gravity = clamp(Number(elements.gravityInput.value) || 9.81, 0.1, 30);
          selectGravityPreset();
          resetExperiment();
        });

        $$(".preset-button").forEach((button) => button.addEventListener("click", () => applyPreset(button.dataset.preset)));
        $$(".speed-button").forEach((button) => button.addEventListener("click", () => {
          state.speedScale = Number(button.dataset.speed);
          $$(".speed-button").forEach((item) => item.classList.toggle("active", item === button));
        }));

        $$(".panel-tab").forEach((tab) => tab.addEventListener("click", () => switchPanel(tab.dataset.tab)));
        $$(".chart-button").forEach((button) => button.addEventListener("click", () => {
          state.chartMode = button.dataset.chart;
          $$(".chart-button").forEach((item) => item.classList.toggle("active", item === button));
          drawGraph();
        }));

        bindDisplayToggle("showAngle", $("#quickAngle"), "showAngle");
        bindDisplayToggle("showVectors", $("#quickVector"), "showVectors");
        bindDisplayToggle("showTrail", $("#quickTrail"), "showTrail");
        bindDisplayToggle("showRuler", $("#quickRuler"), "showRuler");
        bindDisplayToggle("showGrid", null, "showGrid");
        bindDisplayToggle("soundToggle", null, "sound");

        elements.stopwatchStart.addEventListener("click", () => {
          state.stopwatchRunning = !state.stopwatchRunning;
          updateAllReadouts();
        });
        elements.stopwatchReset.addEventListener("click", () => {
          state.stopwatchRunning = false;
          state.stopwatchValue = 0;
          state.stopwatchLaps = 0;
          updateAllReadouts();
        });

        elements.canvas.addEventListener("pointerdown", startDrag);
        elements.canvas.addEventListener("pointermove", moveDrag);
        elements.canvas.addEventListener("pointerup", endDrag);
        elements.canvas.addEventListener("pointercancel", endDrag);

        elements.record.addEventListener("click", recordTrial);
        elements.export.addEventListener("click", exportTrials);
        elements.clear.addEventListener("click", () => {
          if (state.trialRows.length === 0) return;
          state.trialRows = [];
          renderTrials();
          showToast("Notebook cleared");
        });

        elements.help.addEventListener("click", () => {
          elements.helpModal.classList.add("open");
          elements.closeHelp.focus();
        });
        elements.closeHelp.addEventListener("click", () => elements.helpModal.classList.remove("open"));
        elements.helpModal.addEventListener("click", (event) => {
          if (event.target === elements.helpModal) elements.helpModal.classList.remove("open");
        });

        window.addEventListener("keydown", (event) => {
          const target = event.target;
          if (target && /INPUT|SELECT|TEXTAREA|BUTTON/.test(target.tagName)) return;
          if (event.code === "Space") {
            event.preventDefault();
            togglePlay();
          } else if (event.key.toLowerCase() === "r") {
            resetExperiment();
          } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            const direction = event.key === "ArrowRight" ? 1 : -1;
            state.releaseAngle = clamp(state.releaseAngle + direction, 5, 80);
            resetExperiment();
          } else if (event.key === "Escape") {
            elements.helpModal.classList.remove("open");
          }
        });

        window.addEventListener("resize", () => {
          drawScene();
          drawGraph();
        });

        document.addEventListener("visibilitychange", () => {
          state.lastFrame = performance.now();
        });
      }

      function initialize() {
        [elements.length, elements.mass, elements.releaseAngle, elements.damping].forEach(setRangeProgress);
        bindEvents();
        selectGravityPreset();
        updateAllReadouts();
        updateChartLegend();
        drawScene();
        drawGraph();
        requestAnimationFrame(animate);
      }

      initialize();
    })();
