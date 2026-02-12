import BN from "bn.js";

// Helper to decode I80F48 (128-bit fixed point: 80 integer bits, 48 fractional bits)
// Represented as a little-endian 16-byte array
function decodeI80F48(data: number[]): string {
  if (data.length !== 16) return "Invalid I80F48";

  // Create a buffer from the array
  const buffer = Buffer.from(data);

  // Read as 128-bit little-endian integer
  let bn = new BN(buffer, "le");

  // Handle signed values: I80F48 is signed, check bit 127 (MSB)
  const isNegative = buffer[15] & 0x80;
  if (isNegative) {
    // Two's complement for 128-bit
    const maxVal = new BN(1).shln(128);
    bn = bn.sub(maxVal);
  }

  // I80F48 means the number is X * 2^-48
  // 2^48 = 281474976710656
  const divisor = new BN(2).pow(new BN(48));

  // Integer part
  const integerPart = bn.div(divisor);

  // Fractional part (use absolute value for fractional calculation)
  const PRECISION = 1_000_000;
  const remainder = bn.mod(divisor).abs();
  const fractionalPart = remainder.muln(PRECISION).div(divisor);

  const sign = isNegative ? "-" : "";
  const intStr = integerPart.abs().toString();
  const fracStr = fractionalPart.toString().padStart(6, "0");

  return `${sign}${intStr}.${fracStr}`;
}

// Helper to check if something is a byte array-like object
function isByteArray(data: unknown): data is number[] | Record<string, number> {
  if (Array.isArray(data)) {
    return data.every((n) => typeof n === "number" && n >= 0 && n <= 255);
  }
  if (typeof data === "object" && data !== null) {
    const keys = Object.keys(data as object);
    if (keys.length === 0) return false;
    // Check if keys are 0, 1, 2...
    return (
      keys.every((k, i) => k === i.toString()) &&
      Object.values(data as object).every((n) => typeof n === "number")
    );
  }
  return false;
}

// Helper to decode a byte array as UTF-8 string, trimming at endByte or null terminator
function decodeUtf8ByteArray(
  data: number[],
  endByte?: number
): string | null {
  // Determine the actual end of the string
  // end_*_byte fields indicate the last valid byte index, so we need endByte + 1 for slice length
  const length = endByte !== undefined && endByte > 0 && endByte < data.length
    ? endByte + 1
    : data.findIndex((b) => b === 0);
  
  const actualLength = length === -1 ? data.length : length;
  
  if (actualLength === 0) return null;
  
  try {
    // Extract valid bytes and decode as UTF-8
    const bytes = data.slice(0, actualLength);
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const decoded = decoder.decode(new Uint8Array(bytes));
    
    // Validate that it looks like a reasonable string (mostly printable ASCII or valid UTF-8)
    // Check if at least 80% of characters are printable
    const printableCount = decoded.split("").filter((c) => {
      const code = c.charCodeAt(0);
      return (code >= 32 && code < 127) || code > 127;
    }).length;
    
    if (printableCount / decoded.length < 0.8) {
      return null;
    }
    
    return decoded.trim();
  } catch {
    return null;
  }
}

// Recursive function to parse data into a human-readable format
// We return 'any' here because the parsed structure mirrors the unknown input structure (IDL data)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseData(data: unknown, keyName?: string): any {
  if (data === null || data === undefined) return data;

  // Handle BigInt
  if (typeof data === "bigint") {
    return data.toString();
  }

  // Handle BN.js
  if (BN.isBN(data)) {
    return data.toString();
  }

  // Handle PublicKey
  if (
    typeof data === "object" &&
    data !== null &&
    "toBase58" in data &&
    typeof (data as { toBase58: unknown }).toBase58 === "function"
  ) {
    return (data as { toBase58: () => string }).toBase58();
  }

  // Handle String (sometimes Pubkeys are strings already if coming from JSON)
  if (typeof data === "string") {
    return data;
  }

  // Handle I80F48 Special Case (WrappedI80F48)
  if (
    typeof data === "object" &&
    data !== null &&
    Object.keys(data).length === 1 &&
    "value" in data &&
    Array.isArray((data as { value: unknown }).value) &&
    (data as { value: unknown[] }).value.length === 16 &&
    (data as { value: unknown[] }).value.every((n) => typeof n === "number")
  ) {
    return decodeI80F48((data as { value: number[] }).value);
  }

  // Smart Detection for F64 as Bytes (e.g. asset_amount_seized)
  // Condition: 8 bytes, key contains "amount" or similar
  if (
    keyName &&
    (keyName.includes("amount") || keyName.includes("value")) &&
    isByteArray(data)
  ) {
    const values = Array.isArray(data) ? data : Object.values(data as object);
    if (values.length === 8) {
      try {
        const buf = Buffer.from(values as number[]);
        const floatVal = buf.readDoubleLE(0);
        // If it looks like a reasonable float (not extremely tiny/large unless expected)
        // Just return it formatted
        return floatVal; // JSON view will show number
      } catch {
        // ignore
      }
    }
  }

  // Handle Arrays
  if (Array.isArray(data)) {
    return data.map((item, index) => parseData(item, `${keyName}[${index}]`));
  }

  // Handle Objects
  if (typeof data === "object") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newObj: any = {};
    // Iterate over object keys safely
    const obj = data as Record<string, unknown>;
    
    // Build a map of end_*_byte markers for string byte arrays
    // Pattern: end_<field_name>_byte -> field_name (e.g., end_ticker_byte -> ticker)
    const endByteMarkers = new Map<string, number>();
    for (const key in obj) {
      const match = key.match(/^end_(.+)_byte$/);
      if (match) {
        const fieldName = match[1];
        const value = obj[key];
        if (typeof value === "number") {
          endByteMarkers.set(fieldName, value);
        }
      }
    }
    
    for (const key in obj) {
      if (key.startsWith("_pad") || key.startsWith("padding")) continue;
      
      const value = obj[key];
      
      // Check if this is a byte array with a corresponding end_*_byte marker
      if (endByteMarkers.has(key) && isByteArray(value)) {
        const endByte = endByteMarkers.get(key);
        const values = Array.isArray(value) ? value : Object.values(value as object);
        const decoded = decodeUtf8ByteArray(values as number[], endByte);
        if (decoded) {
          newObj[key] = decoded;
          continue;
        }
      }
      
      newObj[key] = parseData(value, key);
    }
    return newObj;
  }

  return data;
}
