import { SerialPort } from 'serialport';
import { EventEmitter } from 'events';

interface HH42Options {
  baudRate?: number;
  dataBits?: 5 | 6 | 7 | 8;
  stopBits?: 1 | 2;
  parity?: 'none' | 'even' | 'odd' | 'mark' | 'space';
}

class HH42 extends EventEmitter {
  private portTemperature: SerialPort | null = null;
  private buffer: string = '';
  private readingInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize the serial port for communication with the HH42 thermometer
   * @param portName The name of the serial port to connect to
   * @param options Optional SerialPort configuration options
   */
  initializeSerialPort(portName: string, options: HH42Options = {}): void {
    this.stopTemperatureReading();
    if (this.portTemperature && this.portTemperature.isOpen) {
      this.portTemperature.close();
    }
    this.portTemperature = new SerialPort({
      path: portName,
      baudRate: options.baudRate || 9600,
      dataBits: options.dataBits || 8,
      stopBits: options.stopBits || 1,
      parity: options.parity || 'none',
    });

    this.portTemperature.on('data', (data: Buffer) => {
      this.buffer += data.toString('ascii');
      this.processBuffer();
    });

    this.portTemperature.on('open', () => {
      console.log('Port opened successfully');
      this.enterHostMode();
      this.requestTemperatureReading();
      this.emit('portOpenedTemperature', portName);
    });

    this.portTemperature.on('error', (err: Error) => {
      console.error('Serial port error:', err.message);
      this.emit('serialErrorTemperature', err.message);
    });
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\r\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine === '>' || trimmedLine === 'T') continue;
      if (/^[-\s]?\d+\.\d+\s?[CF]?$/.test(trimmedLine)) {
        const temperatureValue = parseFloat(trimmedLine);
        const unit = trimmedLine.slice(-1) === 'C' || trimmedLine.slice(-1) === 'F' ? trimmedLine.slice(-1) : '';

        this.emit('serialDataTemperature', { temperatureValue, unit });
      }
    }
  }

  private enterHostMode(): void {
    if (this.portTemperature && this.portTemperature.isOpen) {
      this.portTemperature.set({ rts: true });
    }
  }

  private requestTemperatureReading(): void {
    if (this.portTemperature && this.portTemperature.isOpen) {
      this.readingInterval = setInterval(() => {
        this.portTemperature?.write('T\r\n');
      }, 524);
    }
  }

  /**
   * Stop reading temperature data from the HH42 thermometer
   */
  stopTemperatureReading(): void {
    if (this.readingInterval) {
      clearInterval(this.readingInterval);
      this.readingInterval = null;
    }
  }

  /**
   * Get a list of available serial ports
   * @returns Promise<string[]> A promise that resolves to an array of available port names
   */
  static async getAvailablePorts(): Promise<string[]> {
    try {
      const ports = await SerialPort.list();
      return ports.map(port => port.path);
    } catch (err) {
      console.error('Error getting available ports:', err);
      return [];
    }
  }
}

export default HH42;