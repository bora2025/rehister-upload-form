// Google Apps Script - Deploy as Web App
// This script receives form data and saves it to Google Sheets and sends confirmation email
//
// SETUP CHECKLIST (required for email to work):
// 1. In Apps Script editor, run testEmail() manually first and grant all permissions
// 2. Deploy as Web App: Execute as "Me", Access "Anyone"
// 3. After any code change, deploy a NEW version (not update existing)
// 4. MailApp limit: 100 emails/day (free), 1500/day (Workspace)

// CONFIGURATION: replace with your actual Sheet ID and target sheet name
const CONFIG = {
  SHEET_ID: '1JQ8pBwlat2rCgCM9VpPnGrv2Op7jvha8T4L-4MKS33w',
  SHEET_NAME: 'Registrations',
  DRIVE_FOLDER_ID: '1oxA9viF7R_46gjog8oWb0Pnr6at05LJE'
};

function doPost(e) {
  var emailSent = false;
  var emailError = '';
  var uploadedFileUrl = '';
  var uploadedFileName = '';

  try {
    var rawBody = e.postData ? e.postData.contents : '';
    var data = {};
    var filesData = [];

    if (rawBody) {
      try {
        data = JSON.parse(rawBody);
      } catch (jsonError) {
        data = {};
      }
    }

    if (data.files && Array.isArray(data.files)) {
      filesData = data.files;
    } else if (data.studentIdCard && data.studentIdCard.data) {
      filesData = [data.studentIdCard];
    }

    Logger.log('Received data: ' + JSON.stringify(data));
    Logger.log('Files in payload: ' + filesData.length);

    const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
    var uploadedFileUrls = [];
    var uploadedFileNames = [];
    var fileErrors = [];

    for (var i = 0; i < filesData.length; i++) {
      try {
        var fileData = filesData[i];

        if (!fileData || !fileData.data) {
          fileErrors.push('File ' + i + ': missing base64 data');
          continue;
        }

        var mimeType = (fileData.mimeType || 'application/octet-stream').toLowerCase();
        if (ALLOWED_MIME_TYPES.indexOf(mimeType) === -1) {
          fileErrors.push('File ' + i + ': invalid type ' + mimeType);
          continue;
        }

        var decodedBytes = Utilities.base64Decode(fileData.data);
        if (!decodedBytes || decodedBytes.length === 0) {
          fileErrors.push('File ' + i + ': empty decoded data');
          continue;
        }
        if (decodedBytes.length > MAX_FILE_SIZE) {
          fileErrors.push('File ' + i + ': exceeds 5MB limit');
          continue;
        }

        var blob = Utilities.newBlob(decodedBytes, mimeType, fileData.name || 'student-id-card');

        var targetFolder = null;
        try {
          targetFolder = DriveApp.getFolderById(CONFIG.DRIVE_FOLDER_ID);
          Logger.log('Using target folder: ' + targetFolder.getName());
        } catch (folderError) {
          Logger.log('Could not access target folder, using Drive root: ' + folderError.toString());
          targetFolder = DriveApp.getRootFolder();
        }

        var savedFile = targetFolder.createFile(blob);
        var savedUrl = savedFile.getUrl();
        var savedName = savedFile.getName();
        uploadedFileUrls.push(savedUrl);
        uploadedFileNames.push(savedName);
        Logger.log('Student ID card saved to Drive: ' + savedName + ' | URL: ' + savedUrl);
      } catch (fileError) {
        var errMsg = 'Error saving student ID card ' + i + ': ' + fileError.toString();
        Logger.log(errMsg);
        fileErrors.push(errMsg);
      }
    }

    uploadedFileUrl = uploadedFileUrls.join(', ');
    uploadedFileName = uploadedFileNames.join(', ');

    var spreadsheet = SpreadsheetApp.openById(CONFIG.SHEET_ID);
    var sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
      sheet.appendRow(['Timestamp', 'Type', 'Name', 'Gender', 'Organization', 'Phone', 'Email', 'Email Sent', 'Student ID Card', 'File Link']);
    }

    // Duplicate prevention: skip if the same email already exists in the sheet
    var emailToCheck = (data.email || '').trim().toLowerCase();
    if (emailToCheck) {
      var emailColumn = sheet.getRange(2, 7, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
      for (var r = 0; r < emailColumn.length; r++) {
        if (String(emailColumn[r][0] || '').trim().toLowerCase() === emailToCheck) {
          Logger.log('Duplicate submission detected for email: ' + data.email);
          return ContentService
            .createTextOutput(JSON.stringify({
              status: 'duplicate',
              message: 'This email has already been registered.',
              email: data.email
            }))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }
    }

    if (data.email && data.email.trim() !== '') {
      try {
        sendConfirmationEmail(data, uploadedFileUrl);
        emailSent = true;
        Logger.log('Confirmation email sent to: ' + data.email);
      } catch (mailErr) {
        emailError = mailErr.toString();
        Logger.log('ERROR sending email: ' + emailError);
      }
    } else {
      emailError = 'No email address provided';
      Logger.log(emailError);
    }

    var fileLinkFormula = '';
    if (uploadedFileUrls.length > 0) {
      var links = uploadedFileUrls.map(function(url, index) {
        var label = uploadedFileNames[index] || 'View file';
        return '=HYPERLINK("' + url + '","' + label + '")';
      });
      fileLinkFormula = links.join(' & " | " & ');
    }

    sheet.appendRow([
      new Date(),
      data.type || '',
      data.name || '',
      data.gender || '',
      data.organization || '',
      data.phone || '',
      data.email || '',
      emailSent ? 'Yes' : ('No: ' + emailError),
      uploadedFileUrl || '',
      fileLinkFormula
    ]);

    Logger.log('Data saved to sheet');

    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Form submitted successfully',
        email_sent: emailSent,
        email_error: emailError || null,
        student_id_card: uploadedFileUrl || null,
        student_id_card_name: uploadedFileName || null,
        file_errors: fileErrors.length > 0 ? fileErrors : null
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('Error in doPost: ' + error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'error',
        message: error.toString(),
        email_sent: emailSent,
        email_error: emailError || null,
        student_id_card: uploadedFileUrl || null,
        student_id_card_name: uploadedFileName || null,
        file_errors: fileErrors.length > 0 ? fileErrors : null
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getFormValue(value) {
  if (value === undefined || value === null) {
    return '';
  }
  if (Array.isArray(value)) {
    return String(value[0] || '');
  }
  return String(value);
}

// Function to send confirmation email
function sendConfirmationEmail(data, uploadedFileUrl) {
  var subject = "ការចុះឈ្មោះជោគជ័យ - Registration Successful";
  var fileLine = uploadedFileUrl ? "<p>📎 Student ID Card uploaded: <a href='" + uploadedFileUrl + "'>View file</a></p>" : '';
  
  var htmlMessage = "<p>Hello " + data.name + ",</p>" +
                "<p style='color:green; font-weight:bold;'>✅ ការចុះឈ្មោះជោគជ័យ - Successful Registration!</p>" +
                "<p>Thank you for registering for the Competition Research. Your data has been received and recorded successfully.</p>" +
                "<p>Here's a copy of your submission:<br>" +
                "---------------------------------<br>" +
                "Type: " + data.type + "<br>" +
                "Name: " + data.name + "<br>" +
                "Gender: " + data.gender + "<br>" +
                "Organization: " + data.organization + "<br>" +
                "Phone: " + data.phone + "<br>" +
                "Email: " + data.email + "<br>" +
                "---------------------------------</p>" +
                fileLine +
                "<p>More Information:<br>" +
                "🔹 <img src='https://cdn-icons-png.flaticon.com/512/2111/2111646.png' width='12' height='12'> " +
                "<a href='https://t.me/motresearchcompetiton'>Telegram Channel</a><br>" +
                "🔹 <img src='https://cdn-icons-png.flaticon.com/512/733/733547.png' width='12' height='12'> " +
                "<a href='https://www.facebook.com/share/1Bh4GkZFYR/'>Facebook Page</a><br>" +
                "🔹 <img src='https://cdn-icons-png.flaticon.com/512/724/724664.png' width='12' height='12'> " +
                "<a href='tel:095676763'>095676763</a></p>" +
                "<p>📎 <strong>ដាក់ស្នើឯកសារស្រាវជ្រាវ / Submit your research document:</strong><br>" +
                "<a href='https://tourism-research-policy.com/upload'>ទម្រង់ផ្ញើឯកសារ - Ministry Of Tourism</a></p>" +
                "<p>We appreciate your interest in the Competition Research and will respond within 24-48 hours.</p>" +
                "<p>Regards,<br>Ministry Of Tourism<br>Admin Team</p>";
  
  MailApp.sendEmail({
    to: data.email,
    subject: subject,
    htmlBody: htmlMessage
  });
}

// Handle GET requests - returns API status and quota info
function doGet(e) {
  var quotaRemaining = -1;
  try {
    quotaRemaining = MailApp.getRemainingDailyQuota();
  } catch (err) {
    // MailApp not authorized yet
  }
  return ContentService
    .createTextOutput(JSON.stringify({
      status: 'success',
      message: 'API is working',
      mail_quota_remaining: quotaRemaining
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── TEST FUNCTION ────────────────────────────────────────────────────────────
// Run this MANUALLY from the Apps Script editor (▶ Run > testEmail) to:
//   1. Grant MailApp permission (first run will show an auth dialog)
//   2. Verify email delivery works before going live
function testEmail() {
  var testData = {
    type: 'student',
    name: 'Test User',
    gender: 'male',
    organization: 'Test Org',
    phone: '012345678',
    email: Session.getActiveUser().getEmail() // sends to the script owner's email
  };
  try {
    sendConfirmationEmail(testData);
    Logger.log('✅ Test email sent successfully to: ' + testData.email);
    Logger.log('Remaining daily quota: ' + MailApp.getRemainingDailyQuota());
  } catch (err) {
    Logger.log('❌ Test email FAILED: ' + err.toString());
  }
}
