/**
 * CrossPoint Calendar Worker
 * Generates a BMP calendar display for the CrossPoint e-ink device
 * Display: 480x800 pixels, 8-bit grayscale
 *
 * Design: "Utilitarian Print" - high contrast, clear typography
 * Inspired by Swiss railway timetables and Braun design
 */

export interface Env {
  DISPLAY_WIDTH: string;
  DISPLAY_HEIGHT: string;
  GOOGLE_CALENDAR_API_KEY?: string;
  GOOGLE_CALENDAR_ID?: string;
}

// Weather data from Open-Meteo API
interface WeatherData {
  temperature: number;
  temperatureHigh: number;
  temperatureLow: number;
  condition: string;
  conditionCode: number;
}

// Calendar event
interface CalendarEvent {
  time: string;
  title: string;
  isAllDay: boolean;
}

// Day's events with date label
interface DayEvents {
  label: string;  // "TODAY", "TOMORROW", "MONDAY", etc.
  date: Date;
  events: CalendarEvent[];
}

// Brooklyn, NY coordinates (zip 11222)
const BROOKLYN_LAT = 40.7243;
const BROOKLYN_LON = -73.9493;
const TIMEZONE = 'America/New_York';

// WMO Weather codes to text
const WMO_CODES: { [key: number]: string } = {
  0: 'Clear',
  1: 'Mostly Clear',
  2: 'Partly Cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Rime Fog',
  51: 'Light Drizzle',
  53: 'Drizzle',
  55: 'Heavy Drizzle',
  61: 'Light Rain',
  63: 'Rain',
  65: 'Heavy Rain',
  66: 'Freezing Rain',
  67: 'Heavy Freezing Rain',
  71: 'Light Snow',
  73: 'Snow',
  75: 'Heavy Snow',
  77: 'Snow Grains',
  80: 'Light Showers',
  81: 'Showers',
  82: 'Heavy Showers',
  85: 'Light Snow Showers',
  86: 'Snow Showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm + Hail',
  99: 'Severe Thunderstorm',
};

async function fetchWeather(): Promise<WeatherData> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${BROOKLYN_LAT}&longitude=${BROOKLYN_LON}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=${encodeURIComponent(TIMEZONE)}&forecast_days=1`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status}`);
    }

    const data = await response.json() as {
      current: { temperature_2m: number; weather_code: number };
      daily: { temperature_2m_max: number[]; temperature_2m_min: number[] };
    };

    return {
      temperature: Math.round(data.current.temperature_2m),
      temperatureHigh: Math.round(data.daily.temperature_2m_max[0]),
      temperatureLow: Math.round(data.daily.temperature_2m_min[0]),
      condition: WMO_CODES[data.current.weather_code] || 'Unknown',
      conditionCode: data.current.weather_code,
    };
  } catch (error) {
    console.error('Weather fetch error:', error);
    return {
      temperature: 0,
      temperatureHigh: 0,
      temperatureLow: 0,
      condition: 'Unavailable',
      conditionCode: -1,
    };
  }
}

const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

function getDayLabel(date: Date, todayDate: string, tomorrowDate: string): string {
  const dateStr = date.toDateString();
  if (dateStr === todayDate) return 'TODAY';
  if (dateStr === tomorrowDate) return 'TOMORROW';
  return DAY_NAMES[date.getDay()];
}

async function fetchCalendarEvents(env: Env): Promise<DayEvents[]> {
  // If no Google Calendar configured, return mock data
  if (!env.GOOGLE_CALENDAR_API_KEY || !env.GOOGLE_CALENDAR_ID) {
    return getMockEvents();
  }

  try {
    const now = new Date();
    const todayStart = new Date(now.toLocaleString('en-US', { timeZone: TIMEZONE }));
    todayStart.setHours(0, 0, 0, 0);

    // Fetch up to 7 days ahead to have enough content
    const endDate = new Date(todayStart);
    endDate.setDate(endDate.getDate() + 7);

    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/events?key=${env.GOOGLE_CALENDAR_API_KEY}&timeMin=${todayStart.toISOString()}&timeMax=${endDate.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=50`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Calendar API error: ${response.status}`);
    }

    const data = await response.json() as {
      items: Array<{
        summary: string;
        start: { dateTime?: string; date?: string };
      }>;
    };

    // Group events by date
    const eventsByDate = new Map<string, { date: Date; events: CalendarEvent[] }>();

    const nowLocal = new Date(now.toLocaleString('en-US', { timeZone: TIMEZONE }));
    const todayDate = nowLocal.toDateString();
    const tomorrowDate = new Date(nowLocal.getTime() + 86400000).toDateString();

    for (const item of data.items || []) {
      const isAllDay = !item.start.dateTime;
      const startStr = item.start.dateTime || item.start.date || '';
      const startDate = new Date(startStr);
      const eventDateStr = startDate.toDateString();

      const event: CalendarEvent = {
        title: item.summary || 'Untitled',
        time: isAllDay ? 'All Day' : startDate.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: TIMEZONE,
        }),
        isAllDay,
      };

      if (!eventsByDate.has(eventDateStr)) {
        eventsByDate.set(eventDateStr, { date: startDate, events: [] });
      }
      eventsByDate.get(eventDateStr)!.events.push(event);
    }

    // Convert to array and add labels
    const days: DayEvents[] = [];
    for (const [dateStr, { date, events }] of eventsByDate) {
      days.push({
        label: getDayLabel(date, todayDate, tomorrowDate),
        date,
        events,
      });
    }

    // Sort by date
    days.sort((a, b) => a.date.getTime() - b.date.getTime());

    // If today has no events, still include it as empty
    if (days.length === 0 || days[0].label !== 'TODAY') {
      days.unshift({
        label: 'TODAY',
        date: nowLocal,
        events: [],
      });
    }

    return days;
  } catch (error) {
    console.error('Calendar fetch error:', error);
    return getMockEvents();
  }
}

function getMockEvents(): DayEvents[] {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86400000);
  return [
    {
      label: 'TODAY',
      date: now,
      events: [
        { time: '09:00', title: 'Team Standup', isAllDay: false },
        { time: '11:30', title: 'Design Review', isAllDay: false },
        { time: '14:00', title: 'Deep Work Block', isAllDay: false },
      ],
    },
    {
      label: 'TOMORROW',
      date: tomorrow,
      events: [
        { time: '10:00', title: 'Client Call', isAllDay: false },
      ],
    },
  ];
}

// ============================================================================
// BMP Generation
// ============================================================================

function createBMP(width: number, height: number, pixelData: Uint8Array): Uint8Array {
  const paddedRowSize = Math.ceil(width / 4) * 4;
  const pixelDataSize = paddedRowSize * height;
  const paletteSize = 256 * 4;
  const headerSize = 14;
  const dibHeaderSize = 40;
  const fileSize = headerSize + dibHeaderSize + paletteSize + pixelDataSize;

  const buffer = new Uint8Array(fileSize);
  const view = new DataView(buffer.buffer);

  // BMP Header
  buffer[0] = 0x42; buffer[1] = 0x4D;
  view.setUint32(2, fileSize, true);
  view.setUint32(6, 0, true);
  view.setUint32(10, headerSize + dibHeaderSize + paletteSize, true);

  // DIB Header
  view.setUint32(14, dibHeaderSize, true);
  view.setInt32(18, width, true);
  view.setInt32(22, -height, true); // negative = top-down
  view.setUint16(26, 1, true);
  view.setUint16(28, 8, true); // 8-bit
  view.setUint32(30, 0, true);
  view.setUint32(34, pixelDataSize, true);
  view.setInt32(38, 2835, true);
  view.setInt32(42, 2835, true);
  view.setUint32(46, 256, true);
  view.setUint32(50, 256, true);

  // Grayscale palette
  const paletteOffset = headerSize + dibHeaderSize;
  for (let i = 0; i < 256; i++) {
    buffer[paletteOffset + i * 4 + 0] = i;
    buffer[paletteOffset + i * 4 + 1] = i;
    buffer[paletteOffset + i * 4 + 2] = i;
    buffer[paletteOffset + i * 4 + 3] = 0;
  }

  // Pixel data
  const pixelOffset = headerSize + dibHeaderSize + paletteSize;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      buffer[pixelOffset + y * paddedRowSize + x] = pixelData[y * width + x];
    }
  }

  return buffer;
}

// ============================================================================
// Drawing Primitives
// ============================================================================

// Color constants (grayscale)
const INK_BLACK = 0;
const DARK_GRAY = 64;
const LIGHT_GRAY = 176;
const PAPER_WHITE = 255;

// Extended 8x12 bitmap font
const FONT_DATA: { [key: string]: number[] } = {
  '0': [0x3C,0x66,0x6E,0x76,0x66,0x66,0x3C,0x00,0x00,0x00,0x00,0x00],
  '1': [0x18,0x38,0x18,0x18,0x18,0x18,0x7E,0x00,0x00,0x00,0x00,0x00],
  '2': [0x3C,0x66,0x06,0x1C,0x30,0x60,0x7E,0x00,0x00,0x00,0x00,0x00],
  '3': [0x3C,0x66,0x06,0x1C,0x06,0x66,0x3C,0x00,0x00,0x00,0x00,0x00],
  '4': [0x0C,0x1C,0x3C,0x6C,0x7E,0x0C,0x0C,0x00,0x00,0x00,0x00,0x00],
  '5': [0x7E,0x60,0x7C,0x06,0x06,0x66,0x3C,0x00,0x00,0x00,0x00,0x00],
  '6': [0x1C,0x30,0x60,0x7C,0x66,0x66,0x3C,0x00,0x00,0x00,0x00,0x00],
  '7': [0x7E,0x06,0x0C,0x18,0x30,0x30,0x30,0x00,0x00,0x00,0x00,0x00],
  '8': [0x3C,0x66,0x66,0x3C,0x66,0x66,0x3C,0x00,0x00,0x00,0x00,0x00],
  '9': [0x3C,0x66,0x66,0x3E,0x06,0x0C,0x38,0x00,0x00,0x00,0x00,0x00],
  'A': [0x18,0x3C,0x66,0x66,0x7E,0x66,0x66,0x00,0x00,0x00,0x00,0x00],
  'B': [0x7C,0x66,0x66,0x7C,0x66,0x66,0x7C,0x00,0x00,0x00,0x00,0x00],
  'C': [0x3C,0x66,0x60,0x60,0x60,0x66,0x3C,0x00,0x00,0x00,0x00,0x00],
  'D': [0x78,0x6C,0x66,0x66,0x66,0x6C,0x78,0x00,0x00,0x00,0x00,0x00],
  'E': [0x7E,0x60,0x60,0x7C,0x60,0x60,0x7E,0x00,0x00,0x00,0x00,0x00],
  'F': [0x7E,0x60,0x60,0x7C,0x60,0x60,0x60,0x00,0x00,0x00,0x00,0x00],
  'G': [0x3C,0x66,0x60,0x6E,0x66,0x66,0x3C,0x00,0x00,0x00,0x00,0x00],
  'H': [0x66,0x66,0x66,0x7E,0x66,0x66,0x66,0x00,0x00,0x00,0x00,0x00],
  'I': [0x3C,0x18,0x18,0x18,0x18,0x18,0x3C,0x00,0x00,0x00,0x00,0x00],
  'J': [0x06,0x06,0x06,0x06,0x06,0x66,0x3C,0x00,0x00,0x00,0x00,0x00],
  'K': [0x66,0x6C,0x78,0x70,0x78,0x6C,0x66,0x00,0x00,0x00,0x00,0x00],
  'L': [0x60,0x60,0x60,0x60,0x60,0x60,0x7E,0x00,0x00,0x00,0x00,0x00],
  'M': [0x63,0x77,0x7F,0x6B,0x63,0x63,0x63,0x00,0x00,0x00,0x00,0x00],
  'N': [0x66,0x76,0x7E,0x7E,0x6E,0x66,0x66,0x00,0x00,0x00,0x00,0x00],
  'O': [0x3C,0x66,0x66,0x66,0x66,0x66,0x3C,0x00,0x00,0x00,0x00,0x00],
  'P': [0x7C,0x66,0x66,0x7C,0x60,0x60,0x60,0x00,0x00,0x00,0x00,0x00],
  'Q': [0x3C,0x66,0x66,0x66,0x6A,0x6C,0x36,0x00,0x00,0x00,0x00,0x00],
  'R': [0x7C,0x66,0x66,0x7C,0x6C,0x66,0x66,0x00,0x00,0x00,0x00,0x00],
  'S': [0x3C,0x66,0x60,0x3C,0x06,0x66,0x3C,0x00,0x00,0x00,0x00,0x00],
  'T': [0x7E,0x18,0x18,0x18,0x18,0x18,0x18,0x00,0x00,0x00,0x00,0x00],
  'U': [0x66,0x66,0x66,0x66,0x66,0x66,0x3C,0x00,0x00,0x00,0x00,0x00],
  'V': [0x66,0x66,0x66,0x66,0x66,0x3C,0x18,0x00,0x00,0x00,0x00,0x00],
  'W': [0x63,0x63,0x63,0x6B,0x7F,0x77,0x63,0x00,0x00,0x00,0x00,0x00],
  'X': [0x66,0x66,0x3C,0x18,0x3C,0x66,0x66,0x00,0x00,0x00,0x00,0x00],
  'Y': [0x66,0x66,0x66,0x3C,0x18,0x18,0x18,0x00,0x00,0x00,0x00,0x00],
  'Z': [0x7E,0x06,0x0C,0x18,0x30,0x60,0x7E,0x00,0x00,0x00,0x00,0x00],
  'a': [0x00,0x00,0x3C,0x06,0x3E,0x66,0x3E,0x00,0x00,0x00,0x00,0x00],
  'b': [0x60,0x60,0x7C,0x66,0x66,0x66,0x7C,0x00,0x00,0x00,0x00,0x00],
  'c': [0x00,0x00,0x3C,0x66,0x60,0x66,0x3C,0x00,0x00,0x00,0x00,0x00],
  'd': [0x06,0x06,0x3E,0x66,0x66,0x66,0x3E,0x00,0x00,0x00,0x00,0x00],
  'e': [0x00,0x00,0x3C,0x66,0x7E,0x60,0x3C,0x00,0x00,0x00,0x00,0x00],
  'f': [0x1C,0x36,0x30,0x7C,0x30,0x30,0x30,0x00,0x00,0x00,0x00,0x00],
  'g': [0x00,0x00,0x3E,0x66,0x66,0x3E,0x06,0x3C,0x00,0x00,0x00,0x00],
  'h': [0x60,0x60,0x7C,0x66,0x66,0x66,0x66,0x00,0x00,0x00,0x00,0x00],
  'i': [0x18,0x00,0x38,0x18,0x18,0x18,0x3C,0x00,0x00,0x00,0x00,0x00],
  'j': [0x0C,0x00,0x1C,0x0C,0x0C,0x0C,0x6C,0x38,0x00,0x00,0x00,0x00],
  'k': [0x60,0x60,0x66,0x6C,0x78,0x6C,0x66,0x00,0x00,0x00,0x00,0x00],
  'l': [0x38,0x18,0x18,0x18,0x18,0x18,0x3C,0x00,0x00,0x00,0x00,0x00],
  'm': [0x00,0x00,0x76,0x7F,0x6B,0x6B,0x63,0x00,0x00,0x00,0x00,0x00],
  'n': [0x00,0x00,0x7C,0x66,0x66,0x66,0x66,0x00,0x00,0x00,0x00,0x00],
  'o': [0x00,0x00,0x3C,0x66,0x66,0x66,0x3C,0x00,0x00,0x00,0x00,0x00],
  'p': [0x00,0x00,0x7C,0x66,0x66,0x7C,0x60,0x60,0x00,0x00,0x00,0x00],
  'q': [0x00,0x00,0x3E,0x66,0x66,0x3E,0x06,0x06,0x00,0x00,0x00,0x00],
  'r': [0x00,0x00,0x6E,0x76,0x60,0x60,0x60,0x00,0x00,0x00,0x00,0x00],
  's': [0x00,0x00,0x3E,0x60,0x3C,0x06,0x7C,0x00,0x00,0x00,0x00,0x00],
  't': [0x30,0x30,0x7C,0x30,0x30,0x36,0x1C,0x00,0x00,0x00,0x00,0x00],
  'u': [0x00,0x00,0x66,0x66,0x66,0x66,0x3E,0x00,0x00,0x00,0x00,0x00],
  'v': [0x00,0x00,0x66,0x66,0x66,0x3C,0x18,0x00,0x00,0x00,0x00,0x00],
  'w': [0x00,0x00,0x63,0x6B,0x6B,0x7F,0x36,0x00,0x00,0x00,0x00,0x00],
  'x': [0x00,0x00,0x66,0x3C,0x18,0x3C,0x66,0x00,0x00,0x00,0x00,0x00],
  'y': [0x00,0x00,0x66,0x66,0x66,0x3E,0x06,0x3C,0x00,0x00,0x00,0x00],
  'z': [0x00,0x00,0x7E,0x0C,0x18,0x30,0x7E,0x00,0x00,0x00,0x00,0x00],
  ' ': [0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00],
  ':': [0x00,0x18,0x18,0x00,0x18,0x18,0x00,0x00,0x00,0x00,0x00,0x00],
  '.': [0x00,0x00,0x00,0x00,0x00,0x18,0x18,0x00,0x00,0x00,0x00,0x00],
  ',': [0x00,0x00,0x00,0x00,0x00,0x18,0x18,0x30,0x00,0x00,0x00,0x00],
  '-': [0x00,0x00,0x00,0x7E,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00],
  '/': [0x06,0x0C,0x18,0x30,0x60,0x40,0x00,0x00,0x00,0x00,0x00,0x00],
  '°': [0x1C,0x36,0x36,0x1C,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00],
  '\'': [0x18,0x18,0x30,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00],
  '(': [0x0C,0x18,0x30,0x30,0x30,0x18,0x0C,0x00,0x00,0x00,0x00,0x00],
  ')': [0x30,0x18,0x0C,0x0C,0x0C,0x18,0x30,0x00,0x00,0x00,0x00,0x00],
  '+': [0x00,0x18,0x18,0x7E,0x18,0x18,0x00,0x00,0x00,0x00,0x00,0x00],
};

function drawChar(pixels: Uint8Array, width: number, x: number, y: number, char: string, color: number, scale: number) {
  const data = FONT_DATA[char];
  if (!data) return;

  for (let row = 0; row < 8; row++) {
    const rowData = data[row];
    for (let col = 0; col < 8; col++) {
      if (rowData & (0x80 >> col)) {
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const px = x + col * scale + sx;
            const py = y + row * scale + sy;
            if (px >= 0 && px < width && py >= 0) {
              pixels[py * width + px] = color;
            }
          }
        }
      }
    }
  }
}

function drawText(pixels: Uint8Array, width: number, x: number, y: number, text: string, color: number, scale: number = 1) {
  let cx = x;
  for (const char of text) {
    drawChar(pixels, width, cx, y, char, color, scale);
    cx += 8 * scale;
  }
}

function getTextWidth(text: string, scale: number = 1): number {
  return text.length * 8 * scale;
}

function drawCenteredText(pixels: Uint8Array, width: number, y: number, text: string, color: number, scale: number = 1) {
  const textWidth = getTextWidth(text, scale);
  const x = Math.floor((width - textWidth) / 2);
  drawText(pixels, width, x, y, text, color, scale);
}

function drawRightAlignedText(pixels: Uint8Array, width: number, y: number, text: string, color: number, scale: number, margin: number) {
  const textWidth = getTextWidth(text, scale);
  const x = width - margin - textWidth;
  drawText(pixels, width, x, y, text, color, scale);
}

function fillRect(pixels: Uint8Array, width: number, height: number, x: number, y: number, w: number, h: number, color: number) {
  for (let py = y; py < y + h && py < height; py++) {
    for (let px = x; px < x + w && px < width; px++) {
      if (px >= 0 && py >= 0) {
        pixels[py * width + px] = color;
      }
    }
  }
}

function drawHLine(pixels: Uint8Array, width: number, y: number, x1: number, x2: number, color: number, thickness: number = 1) {
  fillRect(pixels, width, 9999, x1, y, x2 - x1, thickness, color);
}

function drawDashedHLine(pixels: Uint8Array, width: number, y: number, x1: number, x2: number, color: number, dashLen: number = 8, gapLen: number = 4) {
  let x = x1;
  let drawing = true;
  while (x < x2) {
    if (drawing) {
      const end = Math.min(x + dashLen, x2);
      for (let px = x; px < end; px++) {
        pixels[y * width + px] = color;
      }
      x += dashLen;
    } else {
      x += gapLen;
    }
    drawing = !drawing;
  }
}

// Weather icons (simple line art, 64x64)
function drawWeatherIcon(pixels: Uint8Array, width: number, x: number, y: number, code: number) {
  const size = 48;

  if (code === 0 || code === 1) {
    // Sun - circle with rays
    const cx = x + size / 2;
    const cy = y + size / 2;
    const r = 14;
    // Draw circle
    for (let angle = 0; angle < 360; angle += 5) {
      const rad = angle * Math.PI / 180;
      const px = Math.round(cx + r * Math.cos(rad));
      const py = Math.round(cy + r * Math.sin(rad));
      if (px >= 0 && px < width) pixels[py * width + px] = INK_BLACK;
    }
    // Draw rays
    for (let i = 0; i < 8; i++) {
      const angle = i * 45 * Math.PI / 180;
      const r1 = r + 4;
      const r2 = r + 10;
      const x1 = Math.round(cx + r1 * Math.cos(angle));
      const y1 = Math.round(cy + r1 * Math.sin(angle));
      const x2 = Math.round(cx + r2 * Math.cos(angle));
      const y2 = Math.round(cy + r2 * Math.sin(angle));
      // Simple line
      for (let t = 0; t <= 10; t++) {
        const px = Math.round(x1 + (x2 - x1) * t / 10);
        const py = Math.round(y1 + (y2 - y1) * t / 10);
        if (px >= 0 && px < width && py >= 0) pixels[py * width + px] = INK_BLACK;
      }
    }
  } else if (code >= 2 && code <= 3) {
    // Cloud
    drawCloudShape(pixels, width, x + 8, y + 16, 32, 20);
  } else if (code >= 45 && code <= 48) {
    // Fog - horizontal lines
    for (let i = 0; i < 4; i++) {
      const ly = y + 12 + i * 10;
      drawHLine(pixels, width, ly, x + 4, x + size - 4, DARK_GRAY, 2);
    }
  } else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    // Rain - cloud with drops
    drawCloudShape(pixels, width, x + 8, y + 8, 32, 16);
    // Rain drops
    for (let i = 0; i < 3; i++) {
      const dx = x + 14 + i * 10;
      const dy = y + 32;
      for (let j = 0; j < 8; j++) {
        pixels[(dy + j) * width + dx] = INK_BLACK;
      }
    }
  } else if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) {
    // Snow - cloud with snowflakes
    drawCloudShape(pixels, width, x + 8, y + 8, 32, 16);
    // Snowflakes (asterisks)
    for (let i = 0; i < 3; i++) {
      const sx = x + 14 + i * 10;
      const sy = y + 36;
      pixels[sy * width + sx] = INK_BLACK;
      pixels[(sy - 2) * width + sx] = INK_BLACK;
      pixels[(sy + 2) * width + sx] = INK_BLACK;
      pixels[sy * width + sx - 2] = INK_BLACK;
      pixels[sy * width + sx + 2] = INK_BLACK;
    }
  } else if (code >= 95) {
    // Thunderstorm - cloud with lightning
    drawCloudShape(pixels, width, x + 8, y + 4, 32, 16);
    // Lightning bolt
    const lx = x + 24;
    const ly = y + 24;
    for (let i = 0; i < 12; i++) {
      const px = lx + (i < 6 ? -i : i - 12);
      const py = ly + i * 2;
      pixels[py * width + px] = INK_BLACK;
      pixels[py * width + px + 1] = INK_BLACK;
    }
  } else {
    // Unknown - question mark
    drawText(pixels, width, x + 16, y + 16, '?', INK_BLACK, 3);
  }
}

function drawCloudShape(pixels: Uint8Array, width: number, x: number, y: number, w: number, h: number) {
  // Simple cloud outline
  const cx1 = x + w * 0.3;
  const cy1 = y + h * 0.4;
  const r1 = h * 0.4;

  const cx2 = x + w * 0.6;
  const cy2 = y + h * 0.3;
  const r2 = h * 0.5;

  const cx3 = x + w * 0.8;
  const cy3 = y + h * 0.5;
  const r3 = h * 0.35;

  // Draw arcs
  for (let angle = 180; angle <= 360; angle += 3) {
    const rad = angle * Math.PI / 180;
    let px = Math.round(cx1 + r1 * Math.cos(rad));
    let py = Math.round(cy1 + r1 * Math.sin(rad));
    if (px >= 0 && px < width && py >= 0) pixels[py * width + px] = INK_BLACK;

    px = Math.round(cx2 + r2 * Math.cos(rad));
    py = Math.round(cy2 + r2 * Math.sin(rad));
    if (px >= 0 && px < width && py >= 0) pixels[py * width + px] = INK_BLACK;

    px = Math.round(cx3 + r3 * Math.cos(rad));
    py = Math.round(cy3 + r3 * Math.sin(rad));
    if (px >= 0 && px < width && py >= 0) pixels[py * width + px] = INK_BLACK;
  }

  // Bottom line
  drawHLine(pixels, width, Math.round(y + h * 0.75), Math.round(x + w * 0.1), Math.round(x + w * 0.95), INK_BLACK, 1);
}

// ============================================================================
// Main Rendering
// ============================================================================

function renderDisplay(
  width: number,
  height: number,
  weather: WeatherData,
  days: DayEvents[],
  generatedAt: Date
): Uint8Array {
  const pixels = new Uint8Array(width * height);
  pixels.fill(PAPER_WHITE);

  const MARGIN = 24;
  const contentWidth = width - MARGIN * 2;
  const FOOTER_HEIGHT = 50;
  const maxContentY = height - FOOTER_HEIGHT;

  // ========== WEATHER SECTION (0-180px) ==========
  const weatherSectionHeight = 180;

  // Temperature (huge, left side)
  const tempStr = `${weather.temperature}`;
  drawText(pixels, width, MARGIN, 30, tempStr, INK_BLACK, 10);
  // Degree symbol
  const tempWidth = getTextWidth(tempStr, 10);
  drawText(pixels, width, MARGIN + tempWidth, 30, '°', INK_BLACK, 4);

  // Right side: location, condition, hi/lo
  const rightX = 240;

  // Weather icon
  drawWeatherIcon(pixels, width, rightX, 20, weather.conditionCode);

  // Location
  drawText(pixels, width, rightX + 56, 28, 'BROOKLYN NY', INK_BLACK, 2);

  // Condition
  drawText(pixels, width, rightX + 56, 60, weather.condition, DARK_GRAY, 2);

  // Hi/Lo
  const hiLoStr = `H:${weather.temperatureHigh} L:${weather.temperatureLow}`;
  drawText(pixels, width, rightX + 56, 92, hiLoStr, DARK_GRAY, 2);

  // Weather section bottom border
  drawHLine(pixels, width, weatherSectionHeight, MARGIN, width - MARGIN, INK_BLACK, 3);

  // ========== DATE HEADER (180-250px) ==========
  const now = generatedAt;
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  const dateStr = `${DAY_NAMES[now.getDay()]}, ${monthNames[now.getMonth()]} ${now.getDate()}`;
  drawCenteredText(pixels, width, weatherSectionHeight + 20, dateStr, INK_BLACK, 3);

  // Date header bottom border
  const dateSectionEnd = weatherSectionHeight + 70;
  drawHLine(pixels, width, dateSectionEnd, MARGIN, width - MARGIN, INK_BLACK, 2);

  // ========== CALENDAR EVENTS ==========
  let eventY = dateSectionEnd + 20;
  const eventRowHeight = 45;
  const dayHeaderHeight = 40;
  const timeColumnWidth = 100;

  // Render days until we run out of space
  for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
    const day = days[dayIndex];
    const isFirstDay = dayIndex === 0;
    const isToday = day.label === 'TODAY';

    // Check if we have space for at least the header + 1 event (or "No events")
    const minSpaceNeeded = dayHeaderHeight + eventRowHeight;
    if (eventY + minSpaceNeeded > maxContentY) {
      break; // No more space
    }

    // Add separator before non-first days
    if (!isFirstDay) {
      // Dashed separator
      drawDashedHLine(pixels, width, eventY, MARGIN, width - MARGIN, DARK_GRAY, 6, 4);
      eventY += 15;
    }

    // Day label (TODAY is black/bold, others are gray)
    const labelColor = isToday ? INK_BLACK : DARK_GRAY;
    drawText(pixels, width, MARGIN, eventY, day.label, labelColor, 2);
    eventY += dayHeaderHeight - 5;

    // Handle empty day
    if (day.events.length === 0) {
      drawText(pixels, width, MARGIN + timeColumnWidth, eventY, 'No events', LIGHT_GRAY, 2);
      eventY += eventRowHeight;
      continue;
    }

    // Render events for this day
    for (let eventIndex = 0; eventIndex < day.events.length; eventIndex++) {
      // Check if we have space for this event
      if (eventY + 30 > maxContentY) {
        // Show "+N more" if we're cutting off events
        const remaining = day.events.length - eventIndex;
        if (remaining > 0) {
          drawText(pixels, width, MARGIN, eventY, `+${remaining} more...`, LIGHT_GRAY, 2);
          eventY += 30;
        }
        break;
      }

      const event = day.events[eventIndex];
      const eventColor = isToday ? INK_BLACK : DARK_GRAY;

      // Time
      drawText(pixels, width, MARGIN, eventY, event.time, eventColor, 2);

      // Event title (truncate if needed)
      const maxTitleWidth = contentWidth - timeColumnWidth - 10;
      let title = event.title;
      while (getTextWidth(title, 2) > maxTitleWidth && title.length > 3) {
        title = title.slice(0, -4) + '...';
      }
      drawText(pixels, width, MARGIN + timeColumnWidth, eventY, title, eventColor, 2);

      // Subtle divider (only between events, not after last)
      eventY += 26;
      if (eventIndex < day.events.length - 1 && eventY + eventRowHeight <= maxContentY) {
        drawHLine(pixels, width, eventY, MARGIN, width - MARGIN, LIGHT_GRAY, 1);
      }
      eventY += eventRowHeight - 26;
    }
  }

  // ========== FOOTER ==========
  const footerY = height - 30;

  // Thin top border
  drawHLine(pixels, width, footerY - 10, MARGIN, width - MARGIN, LIGHT_GRAY, 1);

  // "Generated at" timestamp (right aligned, small)
  const timeStr = generatedAt.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIMEZONE,
  });
  const genStr = `Generated ${timeStr}`;
  drawRightAlignedText(pixels, width, footerY, genStr, DARK_GRAY, 1, MARGIN);

  return pixels;
}

// ============================================================================
// Worker Handler
// ============================================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const width = parseInt(env.DISPLAY_WIDTH) || 480;
    const height = parseInt(env.DISPLAY_HEIGHT) || 800;

    // Fetch data in parallel
    const [weather, days] = await Promise.all([
      fetchWeather(),
      fetchCalendarEvents(env),
    ]);

    // Generate display
    const generatedAt = new Date();
    const pixels = renderDisplay(width, height, weather, days, generatedAt);

    // Create BMP
    const bmp = createBMP(width, height, pixels);

    return new Response(bmp, {
      headers: {
        'Content-Type': 'image/bmp',
        'Content-Disposition': 'inline; filename="calendar.bmp"',
        'Cache-Control': 'no-cache',
      },
    });
  },
};
