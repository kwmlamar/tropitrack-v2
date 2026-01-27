/**
 * Enhanced Receipt Parser - Uses AI for accurate data extraction
 * Specifically optimized for Bahamian hardware store receipts
 * Supports discounts (Extra Discount, Account Discount, etc.)
 */

import OpenAI from "openai";

// Initialize OpenAI client (will use OPENAI_API_KEY from environment)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ParsedVendor {
  name: string;
  address?: string;
  phone?: string;
  tin?: string; // Tax Identification Number
}

export interface ParsedCustomer {
  name?: string;
  location?: string;
  account_number?: string;
}

export interface ParsedInvoiceDetails {
  number?: string;
  date: string;
  time?: string;
  cashier?: string;
}

export interface EnhancedLineItem {
  product_code?: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface ParsedTotals {
  subtotal: number;
  discount: number;
  discount_label?: string;
  subtotal_after_discount: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
}

export interface TotalsValidation {
  line_items_total: number;
  calculated_total: number;
  has_discount: boolean;
  totals_match: boolean;
}

export interface AccountBalance {
  previous_outstanding?: number;
  payment_amount?: number;
  new_outstanding?: number;
}

export interface EnhancedParsedReceipt {
  vendor: ParsedVendor;
  customer?: ParsedCustomer;
  invoice: ParsedInvoiceDetails;
  line_items: EnhancedLineItem[];
  totals: ParsedTotals;
  validation: TotalsValidation;
  account_balance?: AccountBalance;
  raw_text: string;
  confidence: number;
  parsing_method: "ai" | "regex" | "fallback";
}

// Common Bahamian vendors for fuzzy matching
const KNOWN_VENDORS = [
  {
    name: "Lord Byron Enterprises",
    patterns: ["lord byron", "byron enterprises", "queen's highway", "governor's harbour"],
    address: "Queen's Highway, P.O. Box EL-25045, Governor's Harbour",
    phone: "(242) 828-3476",
    tin: "100039450",
  },
  {
    name: "Paradise Service Plaza",
    patterns: ["paradise service", "paradise plaza", "palmetto point"],
    address: "Queen's Highway, Palmetto Point",
    phone: "242-332-0033",
    tin: "100040692",
  },
  {
    name: "Kelly's Hardware",
    patterns: ["kelly's", "kellys hardware"],
    address: "Nassau",
  },
  {
    name: "Builder's Supply",
    patterns: ["builder's supply", "builders supply"],
    address: "Nassau",
  },
  {
    name: "Home Fabrics",
    patterns: ["home fabrics"],
    address: "Nassau",
  },
  {
    name: "John S George",
    patterns: ["john s george", "john george"],
    address: "Nassau",
  },
];

/**
 * Parse receipt using AI (GPT-4o-mini)
 */
export async function parseReceiptWithAI(ocrText: string): Promise<EnhancedParsedReceipt> {
  const systemPrompt = `You are a receipt parser for Bahamian hardware stores. Extract structured data from receipt text.

Common vendors in the Bahamas:
- Lord Byron Enterprises (Queen's Highway, Governor's Harbour) - TIN: 100039450
- Paradise Service Plaza (Palmetto Point) - TIN: 100040692
- Kelly's Hardware (Nassau)
- Builder's Supply (Nassau)

CRITICAL: Bahamian receipts often include discounts:
- "Extra Discount"
- "Account Discount"
- "Promotional Discount"
- "Your Savings"
- "Discount"
These appear BETWEEN subtotal and VAT. Look for negative amounts or lines with "discount" in them.

Receipt calculation flow:
1. Line items → Subtotal
2. Subtotal - Discount = Subtotal after discount
3. (Subtotal after discount) × VAT rate (10%) = VAT amount
4. Subtotal after discount + VAT = Total

VAT in the Bahamas is 10%.

Extract all available information:
1. Vendor name, address, phone, TIN (Tax Identification Number)
2. Customer name, location, account number (if shown)
3. Invoice number, date (format as YYYY-MM-DD), time, cashier name
4. All line items with product codes (if shown), descriptions, quantities, unit prices, and line totals
5. Subtotal (before discount)
6. Discount amount (if present) - VERY IMPORTANT - extract even if $0.00
7. Discount label (what the receipt calls it)
8. VAT (10%) - calculated on subtotal AFTER discount
9. Total
10. Outstanding A/R balance if present

Important parsing rules:
- Product codes are often numeric (e.g., "03465")
- Prices are in BSD (Bahamian Dollar, same as USD)
- Look for patterns like "QTY @ PRICE" or "quantity x price"
- The date format on receipts is often MM/DD/YYYY - convert to YYYY-MM-DD
- Line items may span multiple lines
- Discount is usually shown as a negative number or with a minus sign

Return a JSON object with this exact structure:
{
  "vendor": {
    "name": "string",
    "address": "string or null",
    "phone": "string or null",
    "tin": "string or null"
  },
  "customer": {
    "name": "string or null",
    "location": "string or null",
    "account_number": "string or null"
  },
  "invoice": {
    "number": "string or null",
    "date": "YYYY-MM-DD",
    "time": "HH:MM or null",
    "cashier": "string or null"
  },
  "line_items": [
    {
      "product_code": "string or null",
      "description": "string",
      "quantity": number,
      "unit_price": number,
      "total": number
    }
  ],
  "totals": {
    "subtotal": number,
    "discount": number,
    "discount_label": "string or null",
    "subtotal_after_discount": number,
    "vat_rate": 0.10,
    "vat_amount": number,
    "total": number
  },
  "account_balance": {
    "previous_outstanding": number or null,
    "payment_amount": number or null,
    "new_outstanding": number or null
  },
  "confidence": number between 0 and 1 indicating parsing confidence
}

IMPORTANT VALIDATION:
- If discount present: (subtotal - discount) × 1.10 should approximately equal total
- If no discount: subtotal × 1.10 should approximately equal total
- Always extract discount even if $0.00
- subtotal_after_discount = subtotal - discount`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Parse this receipt:\n\n${ocrText}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1, // Low temperature for consistent parsing
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from AI");
    }

    const parsed = JSON.parse(content);

    // Validate and clean the parsed data
    return validateAndCleanParsedReceipt(parsed, ocrText);
  } catch (error) {
    console.error("AI parsing error:", error);
    // Fall back to regex-based parsing
    return parseReceiptWithRegex(ocrText);
  }
}

/**
 * Validate and clean AI-parsed receipt data
 */
function validateAndCleanParsedReceipt(parsed: any, ocrText: string): EnhancedParsedReceipt {
  // Ensure vendor info
  const vendor: ParsedVendor = {
    name: parsed.vendor?.name || "Unknown Vendor",
    address: parsed.vendor?.address || undefined,
    phone: cleanPhone(parsed.vendor?.phone),
    tin: parsed.vendor?.tin || undefined,
  };

  // Try to match known vendor for additional info
  const matchedVendor = matchKnownVendor(vendor.name, ocrText);
  if (matchedVendor) {
    vendor.name = matchedVendor.name;
    vendor.address = vendor.address || matchedVendor.address;
    vendor.phone = vendor.phone || matchedVendor.phone;
    vendor.tin = vendor.tin || matchedVendor.tin;
  }

  // Ensure invoice details
  const invoice: ParsedInvoiceDetails = {
    number: parsed.invoice?.number || undefined,
    date: validateDate(parsed.invoice?.date) || new Date().toISOString().split("T")[0],
    time: parsed.invoice?.time || undefined,
    cashier: parsed.invoice?.cashier || undefined,
  };

  // Ensure line items
  const lineItems: EnhancedLineItem[] = (parsed.line_items || []).map((item: any) => ({
    product_code: item.product_code || undefined,
    description: cleanDescription(item.description || "Unknown Item"),
    quantity: parseFloat(item.quantity) || 1,
    unit_price: parseFloat(item.unit_price) || 0,
    total: parseFloat(item.total) || 0,
  })).filter((item: EnhancedLineItem) => item.description && item.total > 0);

  // Calculate line items total
  const lineItemsTotal = lineItems.reduce((sum, item) => sum + item.total, 0);

  // Extract totals with discount support
  let subtotal = parseFloat(parsed.totals?.subtotal) || 0;
  let discount = parseFloat(parsed.totals?.discount) || 0;
  const discountLabel = parsed.totals?.discount_label || undefined;
  let subtotalAfterDiscount = parseFloat(parsed.totals?.subtotal_after_discount) || 0;
  let vatAmount = parseFloat(parsed.totals?.vat_amount) || 0;
  let total = parseFloat(parsed.totals?.total) || 0;

  // If subtotal missing, use line items total
  if (subtotal === 0 && lineItemsTotal > 0) {
    subtotal = lineItemsTotal;
  }

  // Ensure discount is positive (some receipts show it as negative)
  discount = Math.abs(discount);

  // Calculate subtotal after discount
  if (subtotalAfterDiscount === 0) {
    subtotalAfterDiscount = subtotal - discount;
  }

  // If VAT missing, calculate it (10% on subtotal after discount)
  if (vatAmount === 0 && subtotalAfterDiscount > 0) {
    vatAmount = Math.round(subtotalAfterDiscount * 0.10 * 100) / 100;
  }

  // Calculate expected total
  const calculatedTotal = Math.round((subtotalAfterDiscount + vatAmount) * 100) / 100;

  // If receipt total is missing or significantly wrong, use calculated
  if (total === 0) {
    total = calculatedTotal;
  }

  // Check if totals match (within 50 cents tolerance)
  const totalsMatch = Math.abs(total - calculatedTotal) < 0.50;

  if (!totalsMatch) {
    console.warn(`Total mismatch. Receipt: ${total}, Calculated: ${calculatedTotal}`);
    console.warn(`  Subtotal: ${subtotal}, Discount: ${discount}, VAT: ${vatAmount}`);
  }

  const totals: ParsedTotals = {
    subtotal,
    discount,
    discount_label: discountLabel,
    subtotal_after_discount: subtotalAfterDiscount,
    vat_rate: parseFloat(parsed.totals?.vat_rate) || 0.10,
    vat_amount: vatAmount,
    total,
  };

  const validation: TotalsValidation = {
    line_items_total: Math.round(lineItemsTotal * 100) / 100,
    calculated_total: calculatedTotal,
    has_discount: discount > 0,
    totals_match: totalsMatch,
  };

  // Account balance (optional)
  const accountBalance: AccountBalance | undefined = parsed.account_balance
    ? {
        previous_outstanding: parsed.account_balance.previous_outstanding || undefined,
        payment_amount: parsed.account_balance.payment_amount || undefined,
        new_outstanding: parsed.account_balance.new_outstanding || undefined,
      }
    : undefined;

  return {
    vendor,
    customer: parsed.customer
      ? {
          name: parsed.customer.name || undefined,
          location: parsed.customer.location || undefined,
          account_number: parsed.customer.account_number || undefined,
        }
      : undefined,
    invoice,
    line_items: lineItems,
    totals,
    validation,
    account_balance: accountBalance,
    raw_text: ocrText,
    confidence: parseFloat(parsed.confidence) || 0.8,
    parsing_method: "ai",
  };
}

/**
 * Fallback regex-based parsing for when AI is unavailable
 */
export function parseReceiptWithRegex(ocrText: string): EnhancedParsedReceipt {
  const lines = ocrText.split("\n").map((l) => l.trim()).filter(Boolean);

  // Extract vendor
  const vendor = extractVendorFromText(lines, ocrText);

  // Extract date
  const date = extractDate(ocrText);

  // Extract invoice number
  const invoiceNumber = extractInvoiceNumber(ocrText);

  // Extract line items
  const lineItems = extractLineItems(lines);

  // Extract totals (with discount support)
  const totals = extractTotals(lines, lineItems);

  const lineItemsTotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const calculatedTotal = Math.round((totals.subtotal_after_discount + totals.vat_amount) * 100) / 100;

  return {
    vendor,
    invoice: {
      number: invoiceNumber,
      date: date || new Date().toISOString().split("T")[0],
    },
    line_items: lineItems,
    totals,
    validation: {
      line_items_total: Math.round(lineItemsTotal * 100) / 100,
      calculated_total: calculatedTotal,
      has_discount: totals.discount > 0,
      totals_match: Math.abs(totals.total - calculatedTotal) < 0.50,
    },
    raw_text: ocrText,
    confidence: 0.5,
    parsing_method: "regex",
  };
}

/**
 * Match vendor name against known vendors
 */
function matchKnownVendor(vendorName: string, ocrText: string): typeof KNOWN_VENDORS[0] | null {
  const searchText = (vendorName + " " + ocrText).toLowerCase();

  for (const vendor of KNOWN_VENDORS) {
    for (const pattern of vendor.patterns) {
      if (searchText.includes(pattern)) {
        return vendor;
      }
    }
  }

  return null;
}

/**
 * Extract vendor information from text lines
 */
function extractVendorFromText(lines: string[], ocrText: string): ParsedVendor {
  // Try to find a known vendor first
  const matchedVendor = matchKnownVendor("", ocrText);
  if (matchedVendor) {
    return {
      name: matchedVendor.name,
      address: matchedVendor.address,
      phone: matchedVendor.phone,
      tin: matchedVendor.tin,
    };
  }

  // Try to extract from first few lines
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    // Skip lines that look like dates, phone numbers, or addresses
    if (/^\d{3}[-\s]?\d{3}/.test(line)) continue;
    if (/^\d{1,2}[\/\-]\d{1,2}/.test(line)) continue;
    if (/^p\.?o\.?\s*box/i.test(line)) continue;

    if (line.length >= 3 && line.length <= 50 && /[a-zA-Z]/.test(line)) {
      return {
        name: cleanVendorName(line),
      };
    }
  }

  return { name: "Unknown Vendor" };
}

/**
 * Clean and format vendor name
 */
function cleanVendorName(name: string): string {
  return name
    .replace(/[^\w\s&'-]/g, "")
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Clean and format phone number
 */
function cleanPhone(phone: string | undefined): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  return phone;
}

/**
 * Validate and format date
 */
function validateDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null;

  // Check if already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return dateStr;
    }
  }

  return null;
}

/**
 * Extract date from OCR text
 */
function extractDate(text: string): string | null {
  const patterns = [
    // MM/DD/YYYY
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
    // YYYY-MM-DD
    /(\d{4})-(\d{2})-(\d{2})/,
    // DD/MM/YYYY
    /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      if (pattern.source.startsWith("(\\d{4})")) {
        // YYYY-MM-DD
        return match[0];
      } else {
        // MM/DD/YYYY or similar
        const [, first, second, year] = match;
        const fullYear = year.length === 2 ? `20${year}` : year;
        // Assume MM/DD/YYYY format (common in Bahamas)
        return `${fullYear}-${first.padStart(2, "0")}-${second.padStart(2, "0")}`;
      }
    }
  }

  return null;
}

/**
 * Extract invoice number from text
 */
function extractInvoiceNumber(text: string): string | undefined {
  const patterns = [
    /invoice[:\s#]*([A-Z0-9\-]+)/i,
    /inv[:\s#]*([A-Z0-9\-]+)/i,
    /receipt[:\s#]*([A-Z0-9\-]+)/i,
    /order[:\s#]*([A-Z0-9\-]+)/i,
    /([0-9]+-[0-9]+)/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return undefined;
}

/**
 * Clean item description
 */
function cleanDescription(desc: string): string {
  return desc
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^[\d\s]+/, "") // Remove leading numbers
    .trim();
}

/**
 * Extract line items using regex patterns
 */
function extractLineItems(lines: string[]): EnhancedLineItem[] {
  const items: EnhancedLineItem[] = [];
  const pricePattern = /\$?\s*(\d+[,.]?\d*\.?\d{0,2})\s*$/;
  const qtyPattern = /(\d+)\s*[@x]\s*\$?(\d+\.?\d*)/i;
  const skipKeywords = ["total", "subtotal", "sub total", "tax", "vat", "change", "cash", "card", "discount", "savings"];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();

    // Skip header/footer lines
    if (skipKeywords.some((k) => lowerLine.includes(k))) continue;
    if (lowerLine.includes("thank you")) continue;
    if (lowerLine.includes("receipt")) continue;

    // Look for price at end of line
    const priceMatch = line.match(pricePattern);
    if (!priceMatch) continue;

    const priceStr = priceMatch[1].replace(/,/g, "");
    const price = parseFloat(priceStr);
    if (isNaN(price) || price <= 0) continue;

    // Extract description
    let description = line.substring(0, priceMatch.index).trim();

    // Try to extract quantity
    let quantity = 1;
    let unitPrice = price;

    const qtyMatch = description.match(qtyPattern);
    if (qtyMatch) {
      quantity = parseInt(qtyMatch[1], 10) || 1;
      unitPrice = parseFloat(qtyMatch[2]) || price / quantity;
      description = description.replace(qtyPattern, "").trim();
    }

    // Look for product code
    let productCode: string | undefined;
    const codeMatch = description.match(/^(\d{4,})\s*/);
    if (codeMatch) {
      productCode = codeMatch[1];
      description = description.substring(codeMatch[0].length).trim();
    }

    // Clean up description
    description = cleanDescription(description);
    if (description.length < 2) continue;

    items.push({
      product_code: productCode,
      description,
      quantity,
      unit_price: unitPrice,
      total: price,
    });
  }

  return items;
}

/**
 * Extract totals from text (with discount support)
 */
function extractTotals(lines: string[], lineItems: EnhancedLineItem[]): ParsedTotals {
  let subtotal = 0;
  let discount = 0;
  let discountLabel: string | undefined;
  let vatAmount = 0;
  let total = 0;

  const extractAmount = (keywords: string[]): number => {
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      for (const keyword of keywords) {
        if (lowerLine.includes(keyword)) {
          const match = line.match(/\$?\s*-?\s*(\d+[,.]?\d*\.?\d{0,2})/);
          if (match) {
            return Math.abs(parseFloat(match[1].replace(/,/g, "")) || 0);
          }
        }
      }
    }
    return 0;
  };

  // Extract discount with label
  const discountKeywords = ["extra discount", "account discount", "promotional discount", "your savings", "discount"];
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    for (const keyword of discountKeywords) {
      if (lowerLine.includes(keyword)) {
        const match = line.match(/\$?\s*-?\s*(\d+[,.]?\d*\.?\d{0,2})/);
        if (match) {
          discount = Math.abs(parseFloat(match[1].replace(/,/g, "")) || 0);
          // Extract the label (capitalize first letter of each word)
          discountLabel = keyword.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
          break;
        }
      }
    }
    if (discount > 0) break;
  }

  subtotal = extractAmount(["subtotal", "sub total", "sub-total"]);
  vatAmount = extractAmount(["vat", "tax"]);
  total = extractAmount(["total", "grand total", "amount due"]);

  // Calculate missing values
  if (subtotal === 0 && lineItems.length > 0) {
    subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  }

  // Calculate subtotal after discount
  const subtotalAfterDiscount = subtotal - discount;

  if (vatAmount === 0 && subtotalAfterDiscount > 0) {
    vatAmount = Math.round(subtotalAfterDiscount * 0.10 * 100) / 100;
  }

  if (total === 0) {
    total = subtotalAfterDiscount + vatAmount;
  }

  return {
    subtotal,
    discount,
    discount_label: discountLabel,
    subtotal_after_discount: subtotalAfterDiscount,
    vat_rate: 0.10,
    vat_amount: vatAmount,
    total,
  };
}

/**
 * Main function to parse a receipt - tries AI first, falls back to regex
 */
export async function parseReceiptEnhanced(
  ocrText: string,
  useAI: boolean = true
): Promise<EnhancedParsedReceipt> {
  if (useAI && process.env.OPENAI_API_KEY) {
    try {
      return await parseReceiptWithAI(ocrText);
    } catch (error) {
      console.error("AI parsing failed, using regex fallback:", error);
    }
  }

  return parseReceiptWithRegex(ocrText);
}

/**
 * Get list of known vendors for autocomplete/matching
 */
export function getKnownVendors(): typeof KNOWN_VENDORS {
  return KNOWN_VENDORS;
}
