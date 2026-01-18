/**
 * Receipt Parser - Extracts structured data from OCR text
 */

export interface ParsedReceipt {
  vendor_name: string | null;
  date: string | null;
  line_items: ParsedLineItem[];
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  raw_text: string;
}

export interface ParsedLineItem {
  description: string;
  quantity: number;
  unit_price: number | null;
  total: number;
}

// Common patterns for parsing receipts
const DATE_PATTERNS = [
  // MM/DD/YYYY or MM-DD-YYYY
  /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
  // YYYY-MM-DD
  /(\d{4})-(\d{2})-(\d{2})/,
  // DD MMM YYYY (e.g., 15 Jan 2024)
  /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i,
  // Month DD, YYYY (e.g., January 15, 2024)
  /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})/i,
];

const PRICE_PATTERN = /\$?\s*(\d+[,.]?\d*\.?\d{0,2})/;

const TOTAL_KEYWORDS = ["total", "grand total", "amount due", "balance", "amt"];
const SUBTOTAL_KEYWORDS = ["subtotal", "sub total", "sub-total"];
const TAX_KEYWORDS = ["tax", "vat", "gst", "hst"];

/**
 * Parse OCR text into structured receipt data
 */
export function parseReceipt(ocrText: string): ParsedReceipt {
  const lines = ocrText.split("\n").map((l) => l.trim()).filter(Boolean);

  const result: ParsedReceipt = {
    vendor_name: extractVendorName(lines),
    date: extractDate(ocrText),
    line_items: extractLineItems(lines),
    subtotal: extractAmount(lines, SUBTOTAL_KEYWORDS),
    tax: extractAmount(lines, TAX_KEYWORDS),
    total: extractAmount(lines, TOTAL_KEYWORDS),
    raw_text: ocrText,
  };

  return result;
}

/**
 * Extract vendor name - usually the first few lines
 */
function extractVendorName(lines: string[]): string | null {
  // Look at the first 5 lines for potential vendor name
  const candidateLines = lines.slice(0, 5);

  for (const line of candidateLines) {
    // Skip if it's a date, phone number, or address-like line
    if (/^\d{3}[-\s]?\d{3}/.test(line)) continue; // Phone
    if (/^\d{1,2}[\/\-]\d{1,2}/.test(line)) continue; // Date
    if (/^[\d\s]+[a-zA-Z]/.test(line) && line.length < 30) continue; // Address

    // If it's reasonable text, it might be the vendor name
    if (line.length >= 3 && line.length <= 50 && /[a-zA-Z]/.test(line)) {
      // Clean up the vendor name
      return line
        .replace(/[^\w\s&'-]/g, "")
        .trim()
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    }
  }

  return null;
}

/**
 * Extract date from the text
 */
function extractDate(text: string): string | null {
  const monthMap: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04",
    may: "05", jun: "06", jul: "07", aug: "08",
    sep: "09", oct: "10", nov: "11", dec: "12",
  };

  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      let year: string, month: string, day: string;

      if (pattern.source.includes("\\d{4}-")) {
        // YYYY-MM-DD
        [, year, month, day] = match;
      } else if (pattern.source.includes("Jan|Feb")) {
        // Contains month name
        const monthStr = match[1].toLowerCase().substring(0, 3);
        month = monthMap[monthStr] || "01";

        if (pattern.source.startsWith("(\\d{1,2})\\s+")) {
          // DD MMM YYYY
          day = match[1].padStart(2, "0");
          year = match[3];
        } else {
          // Month DD, YYYY
          day = match[2].padStart(2, "0");
          year = match[3];
        }
      } else {
        // MM/DD/YYYY or MM-DD-YYYY
        [, month, day, year] = match;
        month = month.padStart(2, "0");
        day = day.padStart(2, "0");
      }

      // Validate the date
      const dateStr = `${year}-${month}-${day}`;
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        return dateStr;
      }
    }
  }

  return null;
}

/**
 * Extract line items from the receipt
 */
function extractLineItems(lines: string[]): ParsedLineItem[] {
  const items: ParsedLineItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip header/footer lines
    if (isHeaderOrFooter(line)) continue;

    // Look for lines that contain a price at the end
    const priceMatch = line.match(/(\$?\s*\d+[,.]?\d*\.?\d{0,2})\s*$/);
    if (!priceMatch) continue;

    const priceStr = priceMatch[1].replace(/[^\d.]/g, "");
    const price = parseFloat(priceStr);

    if (isNaN(price) || price <= 0) continue;

    // Extract the description (everything before the price)
    let description = line.substring(0, priceMatch.index).trim();

    // Try to extract quantity if present
    let quantity = 1;
    let unitPrice: number | null = null;

    // Pattern: QTY x PRICE or QTY @ PRICE
    const qtyMatch = description.match(/^(\d+)\s*[x@]\s*(\$?\d+\.?\d*)?\s*/i);
    if (qtyMatch) {
      quantity = parseInt(qtyMatch[1], 10) || 1;
      if (qtyMatch[2]) {
        unitPrice = parseFloat(qtyMatch[2].replace(/[^\d.]/g, ""));
      }
      description = description.substring(qtyMatch[0].length).trim();
    }

    // Clean up description
    description = description
      .replace(/^\d+\s+/, "") // Remove leading numbers
      .replace(/[^\w\s&'-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (description.length < 2) continue;

    // Skip total/subtotal lines
    if (TOTAL_KEYWORDS.some((k) => description.toLowerCase().includes(k))) continue;
    if (SUBTOTAL_KEYWORDS.some((k) => description.toLowerCase().includes(k))) continue;
    if (TAX_KEYWORDS.some((k) => description.toLowerCase().includes(k))) continue;

    items.push({
      description,
      quantity,
      unit_price: unitPrice || (quantity > 1 ? price / quantity : null),
      total: price,
    });
  }

  return items;
}

/**
 * Extract a specific amount (subtotal, tax, or total)
 */
function extractAmount(lines: string[], keywords: string[]): number | null {
  for (const line of lines) {
    const lowerLine = line.toLowerCase();

    for (const keyword of keywords) {
      if (lowerLine.includes(keyword)) {
        const priceMatch = line.match(PRICE_PATTERN);
        if (priceMatch) {
          const amount = parseFloat(priceMatch[1].replace(/,/g, ""));
          if (!isNaN(amount)) {
            return amount;
          }
        }
      }
    }
  }

  return null;
}

/**
 * Check if a line is likely header or footer content
 */
function isHeaderOrFooter(line: string): boolean {
  const lowerLine = line.toLowerCase();

  const skipPatterns = [
    "thank you",
    "please come again",
    "visit us at",
    "www.",
    "http",
    "receipt",
    "cashier",
    "terminal",
    "store #",
    "card ending",
    "approved",
    "customer copy",
    "merchant copy",
  ];

  return skipPatterns.some((p) => lowerLine.includes(p));
}

/**
 * Format a number as currency (BSD)
 */
export function formatParsedCurrency(amount: number | null): string {
  if (amount === null) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "BSD",
  }).format(amount);
}
