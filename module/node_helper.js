const NodeHelper = require("node_helper");
const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const fs = require("fs");
const path = require("path");

module.exports = NodeHelper.create({
    start: function() {
        // Pfad auf dein NAS (NFS-Share)
        this.savePath = "/home/pi/sauron/mirror/solar_stats.json";
        this.solarData = { yield: 0, net: 0, consumption: 0 };
        this.stats = this.loadStats();
        this.lastUpdateTime = Date.now();

        // UART 1 Pfad & Baudrate 9600
        this.port = new SerialPort({
            path: "/dev/ttyAMA1",
            baudRate: 9600
        });

        const parser = this.port.pipe(new ReadlineParser({ delimiter: "\n" }));

        parser.on("data", (data) => {
            const rawData = data.trim();

            // NEU: Prüfung auf Framing >>>> und <<<<
            if (rawData.startsWith(">>>>") && rawData.endsWith("<<<<")) {
                // Entferne die 4 Zeichen am Anfang und 4 am Ende
                const cleanData = rawData.substring(4, rawData.length - 4);
                const parts = cleanData.split(";");

                if (parts.length >= 3) {
                    const yieldPower = parseInt(parts[0]);
                    const netPower = parseInt(parts[1]);
                    const consumption = parseInt(parts[2]);

                    // Plausibilitäts-Check gegen extreme Ausreisser
                    if (Math.abs(yieldPower) > 100000 || Math.abs(netPower) > 100000) return;

                    this.solarData = { yield: yieldPower, net: netPower, consumption: consumption };

                    // 1. Energieberechnung durchführen
                    this.calculateEnergy(yieldPower, netPower, consumption);

                    // 2. Vorheriges Quartal ermitteln
                    const now = new Date();
                    let year = now.getFullYear();
                    let month = now.getMonth() + 1;
                    let currentQuarter = Math.ceil(month / 3);

                    let prevQuarter = currentQuarter - 1;
                    let prevYear = year;
                    if (prevQuarter === 0) {
                        prevQuarter = 4;
                        prevYear = year - 1;
                    }
                    const prevKey = `${prevYear}_Q${prevQuarter}`;

                    // 3. Daten an das Modul senden
                    this.sendSocketNotification("DATA", {
                        live: this.solarData,
                        currentQuarter: this.getCurrentQuarterData(),
                        previousQuarter: this.stats[prevKey] || { fromGrid: 0, fromSolar: 0 }
                    });
                }
            }
        });

        // Da die Daten auf dem NAS liegen: Speichern alle 10 Sekunden
        setInterval(() => { this.saveStats(); }, 10000);
    },

    // Bestimmt das aktuelle Jahr und Quartal (z.B. "2026_Q2")
    getQuarterKey: function() {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const quarter = Math.ceil(month / 3);
        return `${year}_Q${quarter}`;
    },

    // Berechnet die Energie in kWh basierend auf der Zeitdifferenz
    calculateEnergy: function(yieldW, netW, consumptionW) {
        const now = Date.now();
        const timeDiffHours = (now - this.lastUpdateTime) / (1000 * 60 * 60); // Zeit in Std.
        this.lastUpdateTime = now;

        if (timeDiffHours <= 0 || timeDiffHours > 1) return; // Schutz vor Zeitsprüngen

        const key = this.getQuarterKey();
        if (!this.stats[key]) {
            this.stats[key] = { fromGrid: 0, fromSolar: 0 };
        }

        // Netzbezug ermitteln: Wenn netW negativ ist, beziehen wir Strom aus dem Netz
        const gridPower = netW < 0 ? Math.abs(netW) : 0;
        // Solar-Eigenverbrauch ermitteln: Was im Haus verbraucht wird, abzüglich des Netzbezugs
        const solarPower = consumptionW - gridPower;

        // Umrechnung von W in kWh
        const kwhFromGrid = (gridPower * timeDiffHours) / 1000;
        const kwhFromSolar = (solarPower > 0 ? solarPower * timeDiffHours : 0) / 1000;

        this.stats[key].fromGrid += kwhFromGrid;
        this.stats[key].fromSolar += kwhFromSolar;
    },

    getCurrentQuarterData: function() {
        const key = this.getQuarterKey();
        return this.stats[key] || { fromGrid: 0, fromSolar: 0 };
    },

    loadStats: function() {
        try {
            if (fs.existsSync(this.savePath)) {
                return JSON.parse(fs.readFileSync(this.savePath, "utf8"));
            }
        } catch (e) { console.error("Fehler beim Laden der Solar-Statistiken:", e); }
        return {};
    },

    saveStats: function() {
        try {
            const dir = path.dirname(this.savePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.savePath, JSON.stringify(this.stats, null, 2), "utf8");
        } catch (e) { console.error("Fehler beim Speichern der Solar-Statistiken:", e); }
    }
});
