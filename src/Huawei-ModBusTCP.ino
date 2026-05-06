#include <ESP8266WiFi.h>
#include <ModbusIP_ESP8266.h> // Von Alexander Emelianov
#include <SoftwareSerial.h>

// --- WLAN-Zugangsdaten ---
const char* ssid     = "ssid-where-huawei";
const char* password = "ssid-password";

// --- Huawei Inverter Einstellungen ---
IPAddress inverterIP(192, 168, 189, 3);
const uint16_t inverterPort = 502; // Alternativ 6607 versuchen
const uint8_t  SLAVE_ID     = 1;   // Inverter und Smart Meter nutzen ID 1

// Modbus Register Adressen
const uint16_t REG_INV_POWER   = 32080; // Aktueller Ertrag (W)
const uint16_t REG_METER_POWER = 37113; // Netzfluss (W) - Positiv=Einspeisung, Negativ=Bezug

// SoftwareSerial für Raspberry Pi 5 (TX an GPIO 26 / RX an GPIO 13 des Pi)
// ESP8266: D5 (GPIO14) ist TX, D6 (GPIO12) ist RX
SoftwareSerial swSer(12, 14); 

ModbusIP mb;

// Hilfsfunktion zum stabilen Auslesen von 32-Bit Registern
int32_t read32Bit(uint16_t reg) {
  uint16_t res[2]; 
  uint16_t transID = mb.readHreg(inverterIP, reg, res, 2, nullptr, SLAVE_ID);
  
  if (transID) {
    uint32_t startTime = millis();
    while(mb.isTransaction(transID)) { 
      mb.task(); 
      delay(10); 
      if (millis() - startTime > 2000) return 0; // Timeout Schutz
    }
    // Huawei liefert High-Word (res[0]) vor Low-Word (res[1])
    return (int32_t)((res[0] << 16) | res[1]);
  }
  return 0;
}

void setup() {
  // Serieller Monitor für USB-Debug
  Serial.begin(115200);
  
  // SoftwareSerial zum Raspberry Pi
  swSer.begin(9600);
  
  // WLAN Verbindung
  WiFi.begin(ssid, password);
  Serial.print("Verbinde mit WLAN");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWLAN bereit!");
  Serial.print("ESP IP: "); Serial.println(WiFi.localIP());

  // Modbus Client initialisieren
  mb.client();
  swSer.println("ESP_START"); // Signal an den Pi
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    
    // Verbindung zum Inverter prüfen/aufbauen
    if (!mb.isConnected(inverterIP)) {
      mb.connect(inverterIP, inverterPort);
      Serial.println("Versuche Verbindung zum Inverter...");
    } else {
      
      // 1. Werte abrufen
      int32_t yieldPower   = read32Bit(REG_INV_POWER);
      int32_t netPower     = read32Bit(REG_METER_POWER);
      
      // 2. Eigenverbrauch berechnen
      int32_t consumption = yieldPower - netPower;

      // 3. Daten an den Raspberry Pi 5 senden (GPIO 26)
      // Format: Ertrag;Netz;Eigenverbrauch
      swSer.print(">>>>"); // Start-Flag
      swSer.print(yieldPower);
      swSer.print(";");
      swSer.print(netPower);
      swSer.print(";");
      swSer.print(consumption);
      swSer.println("<<<<"); // End-Flag mit Zeilenumbruch für den Parser

      // 4. Debug-Ausgabe auf USB-Konsole
      Serial.print("Sende -> Ertrag: "); Serial.print(yieldPower);
      Serial.print("W | Netz: "); Serial.print(netPower);
      Serial.print("W | Eigenverbrauch: "); Serial.print(consumption);
      Serial.println("W");
    }
  } else {
    Serial.println("WLAN Verbindung verloren!");
    WiFi.begin(ssid, password); // Reconnect
  }

  delay(5000); // Alle 5 Sekunden aktualisieren
}
