# Setting Up Google Apps Script Backend

## Steps to Connect Your Form to Google Sheets

### 1. Create a Google Sheet
1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new spreadsheet
3. Name it (e.g., "Form Responses")
4. Copy the Sheet ID from the URL (the long string between `/d/` and `/edit`)

### 2. Create Google Apps Script
1. In your Google Sheet, click **Extensions** → **Apps Script**
2. Delete any default code
3. Copy and paste the code from `docs/google-apps-script.js`
4. Replace `YOUR_GOOGLE_SHEET_ID_HERE` with your actual Sheet ID

### 3. Deploy as Web App
1. In Apps Script, click **Deploy** → **New deployment**
2. Click the gear icon ⚙️ → Select **Web app**
3. Configure:
   - **Description**: Form submission API
   - **Execute as**: Me
   - **Who has access**: Anyone
4. Click **Deploy**
5. **Authorize** the script (follow prompts)
6. Copy the **Web App URL** (looks like: `https://script.google.com/macros/s/.../exec`)

### 4. Update Your Frontend
1. Open `src/js/app.js`
2. Find line with `YOUR_GOOGLE_APPS_SCRIPT_URL_HERE`
3. Replace it with your Web App URL from step 3

### 5. Test
1. Open `index.html` in your browser
2. Fill out and submit the form
3. Check your Google Sheet - the data should appear

## Troubleshooting

**CORS Error**: Make sure you deployed as "Anyone" can access

**401 Error**: Re-authorize the script in Google Apps Script

**No data appearing**: Check the Sheet ID is correct in the script

## Alternative: Use FormSubmit.co (No Google Setup)

If you prefer a simpler solution without Google Apps Script:

```javascript
// In src/js/app.js, replace the fetch with:
const response = await fetch('https://formsubmit.co/your@email.com', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    body: JSON.stringify(data)
});
```

Visit [FormSubmit.co](https://formsubmit.co) for more options.
