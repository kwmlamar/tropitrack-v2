# Troubleshooting PDF Preview

## Steps to Debug the Blank PDF Issue

### 1. Check Browser Console
Open the browser developer console (F12) and look for:
- Any React errors
- React PDF rendering errors
- Network errors loading PDF data

### 2. Check the Console Logs
I've added logging to the preview page. Look for:
```
Estimate data: {...}
Line items: [...]
```

This will show if the data is being fetched correctly.

### 3. Common Causes of Blank PDF

#### A. Missing Required Fields
React PDF crashes silently if required fields are undefined/null:
- `client_name` - Now has fallback: `estimate.client_name || "N/A"`
- `subtotal` - Now has fallback: `estimate.subtotal || 0`
- `tax_rate` - Now has fallback: `estimate.tax_rate || 0`
- `overhead_markup_percent` - Now has fallback
- `profit_margin_percent` - Now has fallback

#### B. Invalid Date Values
If `valid_until` or `issue_date` is null/invalid:
- Check: Lines with `formatDate(estimate.valid_until)`
- Fixed with: `estimate.valid_until ? formatDate(estimate.valid_until) : "N/A"`

#### C. Invalid Calculations
If any math operations result in NaN:
- All percentage calculations now have `|| 0` fallbacks
- All subtotal calculations now have `|| 0` fallbacks

### 4. Test with Sample Data

Try creating a new estimate with ALL fields filled:
1. Go to Estimates → New Estimate
2. Fill in ALL fields (don't leave any optional fields empty)
3. Save and try to preview

### 5. Check React PDF Version
```bash
npm list @react-pdf/renderer
```

Should be a recent version that supports React 18.

### 6. Check if PDF Downloads Work
Try clicking "Download PDF" button:
- If download works but preview doesn't → PDFViewer issue
- If download also fails → PDF template has errors

### 7. Simplify PDF Template
Create a minimal test template:

```typescript
export function TestPDFTemplate() {
  return (
    <Document>
      <Page size="A4">
        <View>
          <Text>Test PDF - If you see this, React PDF works!</Text>
        </View>
      </Page>
    </Document>
  );
}
```

Replace the template temporarily to isolate if it's a template issue or viewer issue.

### 8. Check Network Tab
- Open Network tab in DevTools
- Filter by "XHR" or "Fetch"
- Look for the estimate/invoice data fetch
- Check if it returns valid JSON

## What I've Fixed So Far

1. ✅ Added `|| "N/A"` fallback for `client_name`
2. ✅ Added `|| 0` fallbacks for all numeric calculations
3. ✅ Added `|| 0` fallbacks for percentage fields
4. ✅ Added console logging to see fetched data
5. ✅ Wrapped PDFViewer in div

## Next Steps to Try

If still blank, please:
1. Open browser console
2. Navigate to estimate preview page
3. Copy and paste ANY errors shown
4. Copy and paste the console.log output showing the estimate data
5. Share those with me

This will help identify the exact issue!
