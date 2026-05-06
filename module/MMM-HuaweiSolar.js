Module.register("MMM-HuaweiSolar", {
    defaults: {
        updateInterval: 5000,
    },

    getStyles: function() {
        return ["MMM-HuaweiSolar.css"];
    },

    start: function() {
        this.solarData = {
            live: { yield: 0, net: 0, consumption: 0 },
            currentQuarter: { fromGrid: 0, fromSolar: 0 },
            previousQuarter: { fromGrid: 0, fromSolar: 0 }
        };
        this.sendSocketNotification("CONFIG", this.config);
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "DATA") {
            this.solarData = payload;
            this.updateDom();
        }
    },

    // Hilfsfunktion zur Ermittlung des vorherigen Quartals
    getPreviousQuarterInfo: function() {
        const now = new Date();
        let year = now.getFullYear();
        let month = now.getMonth() + 1;
        let currentQuarter = Math.ceil(month / 3);

        let prevQuarter = currentQuarter - 1;
        if (prevQuarter === 0) {
            prevQuarter = 4;
            year = year - 1;
        }
        return { key: `${year}_Q${prevQuarter}`, label: `Q${prevQuarter}` };
    },

    getDom: function() {
        var wrapper = document.createElement("div");
        wrapper.className = "huawei-container small regular";

        const netValue = this.solarData.live.net;
        const netLabel = netValue >= 0 ? "Einspeisung" : "Netzbezug";
        const netClass = netValue >= 0 ? "is-export" : "is-import";

        const now = new Date();
        const currentQuarterLabel = `Q${Math.ceil((now.getMonth() + 1) / 3)}`;
        const prevQuarterInfo = this.getPreviousQuarterInfo();

        wrapper.innerHTML = `
            <!-- LIVE WERTE -->
            <div class="solar-row">
                <span class="label">Ertrag</span>
                <span class="value">${this.solarData.live.yield} W</span>
            </div>
            <div class="solar-row ${netClass}">
                <span class="label">${netLabel}</span>
                <span class="value">${Math.abs(netValue)} W</span>
            </div>
            <div class="solar-row">
                <span class="label">Eigenverbrauch</span>
                <span class="value">${this.solarData.live.consumption} W</span>
            </div>

            <!-- AKTUELLES QUARTAL -->
            <div class="solar-header">Statistik ${currentQuarterLabel}</div>
            <div class="solar-row">
                <span class="label">Bezug Netz</span>
                <span class="value bright">${this.solarData.currentQuarter.fromGrid.toFixed(1)} kWh</span>
            </div>
            <div class="solar-row">
                <span class="label">Bezug Solar</span>
                <span class="value bright">${this.solarData.currentQuarter.fromSolar.toFixed(1)} kWh</span>
            </div>

            <!-- VORHERIGES QUARTAL -->
            <div class="solar-header">Statistik ${prevQuarterInfo.label}</div>
            <div class="solar-row">
                <span class="label">Bezug Netz</span>
                <span class="value bright">${this.solarData.previousQuarter.fromGrid.toFixed(1)} kWh</span>
            </div>
            <div class="solar-row">
                <span class="label">Bezug Solar</span>
                <span class="value bright">${this.solarData.previousQuarter.fromSolar.toFixed(1)} kWh</span>
            </div>
        `;
        return wrapper;
    }
});
